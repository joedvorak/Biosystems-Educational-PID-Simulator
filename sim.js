/* ============================================================
   sim.js — PID Tuning Simulator: Core Simulation Engine
   ============================================================
   Owns all simulation state and math.
   No DOM dependencies — can be tested entirely from the console.

   Exports (global):
     SimState           — single source-of-truth state object
     SCENARIOS          — per-scenario configuration
     PIDController      — reusable PID class
     VatPlant, TractorHeadingPlant, ReservoirPlant, DronePlant
     startSimulation(), stopSimulation(), resetSimulation()
   ============================================================ */

'use strict';

// ─── PID Controller ──────────────────────────────────────────
// Positional form, discrete integration, conditional anti-windup,
// derivative-on-error (intentional kick for teaching).

class PIDController {
    /**
     * @param {number} outputMin  Lower clamp for control output
     * @param {number} outputMax  Upper clamp for control output
     */
    constructor(outputMin = 0, outputMax = 100) {
        this.outputMin = outputMin;
        this.outputMax = outputMax;
        this.integral = 0;
        this.prevError = 0;
        this.firstRun = true;
    }

    /**
     * Compute one PID step.
     * @returns {{ output: number, pTerm: number, iTerm: number, dTerm: number }}
     */
    compute(setpoint, pv, dt, Kp, Ki, Kd) {
        const error = setpoint - pv;

        // Proportional
        const pTerm = Kp * error;

        // Integral (accumulated before clamping check)
        const candidateIntegral = this.integral + Ki * error * dt;

        // Derivative (on error — produces derivative kick, intentional)
        let dTerm = 0;
        if (this.firstRun) {
            this.firstRun = false;
        } else {
            dTerm = Kd * (error - this.prevError) / dt;
        }

        // Raw output
        const rawOutput = pTerm + candidateIntegral + dTerm;

        // Anti-windup: conditional integration
        let output;
        if (rawOutput > this.outputMax) {
            output = this.outputMax;
            // Only freeze integral if error would make saturation worse
            if (error > 0) {
                // Don't accept this integration step
            } else {
                this.integral = candidateIntegral;
            }
        } else if (rawOutput < this.outputMin) {
            output = this.outputMin;
            if (error < 0) {
                // Don't accept this integration step
            } else {
                this.integral = candidateIntegral;
            }
        } else {
            output = rawOutput;
            this.integral = candidateIntegral;
        }

        this.prevError = error;

        return {
            output,
            pTerm,
            iTerm: this.integral,
            dTerm
        };
    }

    /** Reset integral accumulator and derivative history. */
    reset() {
        this.integral = 0;
        this.prevError = 0;
        this.firstRun = true;
    }
}


// ─── Plant Models ────────────────────────────────────────────
// Each plant implements: update(u, dt), reset(), getState()

// --- Scenario 1: Fermentation Vat (first-order thermal) ---
class VatPlant {
    constructor() {
        // Physical parameters
        this.m = 5.0;           // kg
        this.cp = 4180;         // J/(kg·°C)
        this.Pmax = 500;        // W
        this.UA = 10;           // W/°C
        this.Tamb = 20;         // °C

        // Derived
        this.tau = (this.m * this.cp) / this.UA;           // 2090 s
        this.K = this.Pmax / (100 * this.UA);              // 0.5 °C/%

        // State
        this.T = this.Tamb;     // start at ambient
    }

    get pv() { return this.T; }
    set pv(v) { this.T = v; }

    /**
     * Forward Euler: dT/dt = (K·u − (T − Tamb)) / τ
     */
    update(u, dt) {
        const dTdt = (this.K * u - (this.T - this.Tamb)) / this.tau;
        this.T += dTdt * dt;
        return this.T;
    }

    reset() {
        this.T = this.Tamb;
    }

    /**
     * Set plant to steady-state at the given setpoint.
     * @returns {number} u_eq — the equilibrium control effort
     */
    setToEquilibrium(sp) {
        this.T = sp;
        // At steady state: 0 = K·u - (T - Tamb) / τ  →  u = (T - Tamb) / K
        return (sp - this.Tamb) / this.K;
    }

    getState() {
        return { temperature: this.T };
    }
}


// --- Scenario 2: Tractor Heading (kinematic bicycle) ---
class TractorHeadingPlant {
    constructor() {
        this.v = 3.0;       // m/s forward speed
        this.L = 2.5;       // m wheelbase
        this.theta = 0;     // degrees
    }

    get pv() { return this.theta; }
    set pv(v) { this.theta = v; }

    /**
     * Forward Euler:
     *   dθ/dt = (v/L) · tan(δ_rad) · (180/π)
     *   where δ_rad = u · π/180
     */
    update(u, dt) {
        const steeringRad = u * Math.PI / 180;
        const headingRateDeg = (this.v / this.L) * Math.tan(steeringRad) * (180 / Math.PI);
        this.theta += headingRateDeg * dt;
        return this.theta;
    }

    reset() {
        this.theta = 0;
    }

    /**
     * Set plant to steady-state at the given setpoint.
     * @returns {number} u_eq — the equilibrium control effort
     */
    setToEquilibrium(sp) {
        this.theta = sp;
        // At steady state the heading is constant → no steering needed
        return 0;
    }

    getState() {
        return { heading: this.theta };
    }
}


// --- Scenario 3: Water Reservoir (Torricelli drain) ---
class ReservoirPlant {
    constructor() {
        // Physical parameters
        this.A = 0.50;                          // m²  tank cross-section
        this.H = 2.0;                           // m   tank height
        this.d_o = 0.015;                       // m   orifice diameter (1.5 cm)
        this.a_o = Math.PI * (this.d_o / 2) ** 2;  // m²  orifice area
        this.Cd = 0.61;                         // discharge coefficient
        this.Qmax = 1.0e-3;                     // m³/s  (1.0 L/s)
        this.g = 9.81;                          // m/s²

        // Derived drain parameter: k_d = C_d · a_o · √(2g)
        this.k_d = this.Cd * this.a_o * Math.sqrt(2 * this.g);

        // Normalized coefficients (L in % of full, u in %)
        // dL/dt = α·u − β·√L
        this.alpha = (100 * this.Qmax) / (100 * this.A * this.H);   // 1.0e-3  %/s per %
        this.beta = (100 * this.k_d * Math.sqrt(this.H / 100)) / (this.A * this.H);

        // State: level as % of full tank [0, 100]
        this.L = 0;
    }

    get pv() { return this.L; }
    set pv(v) { this.L = Math.max(0, Math.min(100, v)); }

    /**
     * Forward Euler: dL/dt = α·u − β·√L
     */
    update(u, dt) {
        const dLdt = this.alpha * u - this.beta * Math.sqrt(Math.max(this.L, 0));
        this.L += dLdt * dt;
        this.L = Math.max(0, Math.min(100, this.L));   // clamp
        return this.L;
    }

    reset() {
        this.L = 0;
    }

    /**
     * Set plant to steady-state at the given setpoint.
     * @returns {number} u_eq — the equilibrium control effort
     */
    setToEquilibrium(sp) {
        this.L = Math.max(0, Math.min(100, sp));
        // At steady state: 0 = α·u - β·√L  →  u = (β·√L) / α
        return (this.beta * Math.sqrt(Math.max(this.L, 0))) / this.alpha;
    }

    getState() {
        return {
            level: this.L,
            height_m: this.L / 100 * this.H
        };
    }
}


// --- Scenario 4: Drone Altitude (Newton's 2nd law) ---
class DronePlant {
    constructor() {
        this.m = 1.5;       // kg
        this.Tmax = 30;     // N  max thrust
        this.g = 9.81;      // m/s²
        this.c = 0.5;       // N·s/m  drag coefficient

        // State
        this.h = 0;         // altitude (m)
        this.vel = 0;       // vertical velocity (m/s)
    }

    get pv() { return this.h; }
    set pv(v) { this.h = Math.max(0, v); }

    /**
     * Forward Euler (two states):
     *   dv/dt = (Tmax/(100·m))·u − g − (c/m)·v
     *   dh/dt = v
     *   Ground constraint: h ≥ 0
     */
    update(u, dt) {
        const accel = (this.Tmax / (100 * this.m)) * u - this.g - (this.c / this.m) * this.vel;
        this.vel += accel * dt;
        this.h += this.vel * dt;

        // Ground constraint
        if (this.h < 0) {
            this.h = 0;
            this.vel = Math.max(0, this.vel);  // zero out downward velocity
        }

        return this.h;
    }

    reset() {
        this.h = 0;
        this.vel = 0;
    }

    /**
     * Set plant to steady-state at the given setpoint.
     * @returns {number} u_eq — the equilibrium control effort
     */
    setToEquilibrium(sp) {
        this.h = Math.max(0, sp);
        this.vel = 0;
        // At steady state (hovering): 0 = (Tmax/(100·m))·u - g  →  u = (m·g/Tmax)·100
        return (this.m * this.g / this.Tmax) * 100;
    }

    getState() {
        return {
            altitude: this.h,
            velocity: this.vel,
            hoverThrust: (100 * this.m * this.g) / this.Tmax   // ~49.1%
        };
    }
}


// ─── Scenario Configuration ──────────────────────────────────

const SCENARIOS = {
    vat: {
        name: 'Fermentation Vat',
        pvLabel: 'Broth Temperature',   pvUnit: '°C',
        spLabel: 'Target Temperature',  spUnit: '°C',
        outLabel: 'Heater Power',       outUnit: '%',
        manualLabel: 'Heater Dial',
        noiseLabel: 'Thermocouple Noise', noiseMax: 1.0,
        chartMin: 15, chartMax: 75,
        defaultSP: 37, stepSP: 54,
        spMin: 20, spMax: 70,
        pidLimits: { min: 0, max: 100 },
        defaultSpeedup: 200,
        gainRanges: {
            Kp: { min: 0, max: 20,  step: 0.1  },
            Ki: { min: 0, max: 0.05, step: 0.001 },
            Kd: { min: 0, max: 500,  step: 1    }
        },
        PlantClass: VatPlant,
        systemDescription:
            'A 5-liter laboratory bioreactor cultures Saccharomyces cerevisiae (baker\'s yeast) for bioethanol production. '
          + 'An electric heating jacket supplies thermal energy to the well-stirred broth. '
          + 'Heat is continuously lost through the vessel walls to the surrounding lab air (Newton\'s law of cooling).',
        equationLatex: 'm c_p \\frac{dT}{dt} = P_{\\max} \\cdot \\frac{u}{100} - UA \\cdot (T - T_{\\text{amb}})',
        parameterTable: [
            { symbol: 'm',        value: '5.0 kg',          desc: 'Broth mass' },
            { symbol: 'c_p',      value: '4180 J/(kg·°C)',  desc: 'Specific heat' },
            { symbol: 'P_max',    value: '500 W',           desc: 'Max heater power' },
            { symbol: 'UA',       value: '10 W/°C',         desc: 'Heat loss coefficient' },
            { symbol: 'T_amb',    value: '20 °C',           desc: 'Ambient temperature' },
            { symbol: 'τ',        value: '2090 s (≈ 35 min)', desc: 'Thermal time constant' },
            { symbol: 'K',        value: '0.50 °C/%',       desc: 'Process gain' }
        ]
    },
    tractor: {
        name: 'Tractor Heading',
        pvLabel: 'Compass Heading',     pvUnit: 'deg',
        spLabel: 'Target Heading',      spUnit: 'deg',
        outLabel: 'Steering Angle',     outUnit: 'deg',
        manualLabel: 'Steering Wheel',
        noiseLabel: 'GPS Noise',         noiseMax: 3.0,
        chartMin: -60, chartMax: 60,
        defaultSP: 0, stepSP: 30,
        spMin: -60, spMax: 60,
        pidLimits: { min: -35, max: 35 },
        defaultSpeedup: 1,
        gainRanges: {
            Kp: { min: 0, max: 5, step: 0.05 },
            Ki: { min: 0, max: 1, step: 0.01 },
            Kd: { min: 0, max: 2, step: 0.05 }
        },
        PlantClass: TractorHeadingPlant,
        systemDescription:
            'An agricultural tractor drives through a field at 3 m/s (≈ 6.7 mph). '
          + 'An auto-steer system controls the front-wheel steering angle to maintain a desired compass heading. '
          + 'The tractor follows the kinematic bicycle model — a standard simplification from vehicle dynamics.',
        equationLatex: '\\frac{d\\theta}{dt} = \\frac{v}{L} \\tan(\\delta)',
        parameterTable: [
            { symbol: 'v',    value: '3.0 m/s',  desc: 'Forward speed' },
            { symbol: 'L',    value: '2.5 m',     desc: 'Wheelbase' },
            { symbol: 'δ_max', value: '±35°',     desc: 'Steering limit' }
        ]
    },
    reservoir: {
        name: 'Water Reservoir',
        pvLabel: 'Water Level',         pvUnit: '% full',
        spLabel: 'Target Level',        spUnit: '% full',
        outLabel: 'Pump Speed',         outUnit: '%',
        manualLabel: 'Pump Dial',
        noiseLabel: 'Level Sensor Noise', noiseMax: 5.0,
        chartMin: 0, chartMax: 100,
        defaultSP: 50, stepSP: 70,
        spMin: 0, spMax: 95,
        pidLimits: { min: 0, max: 100 },
        defaultSpeedup: 200,
        gainRanges: {
            Kp: { min: 0, max: 20,  step: 0.1  },
            Ki: { min: 0, max: 0.05, step: 0.001 },
            Kd: { min: 0, max: 500,  step: 1    }
        },
        PlantClass: ReservoirPlant,
        systemDescription:
            'A 1000-liter holding tank buffers water for an agricultural drip irrigation system. '
          + 'A variable-speed centrifugal pump fills the tank from a well. Water drains continuously from a bottom valve '
          + 'following Torricelli\'s law: outflow depends on √h (a consequence of Bernoulli\'s equation).',
        equationLatex: 'A \\frac{dh}{dt} = \\frac{Q_{\\max} \\cdot u}{100} - C_d \\, a_o \\sqrt{2 g h}',
        parameterTable: [
            { symbol: 'A',     value: '0.50 m²',   desc: 'Tank cross-section' },
            { symbol: 'H',     value: '2.0 m',      desc: 'Tank height' },
            { symbol: 'd_o',   value: '1.5 cm',     desc: 'Drain orifice diameter' },
            { symbol: 'C_d',   value: '0.61',       desc: 'Discharge coefficient' },
            { symbol: 'Q_max', value: '1.0 L/s',    desc: 'Max pump flow' },
            { symbol: 'α',     value: '1.0×10⁻³ %/s per %',  desc: 'Normalized inflow coefficient' },
            { symbol: 'β',     value: '6.76×10⁻³ %/s per √%', desc: 'Normalized drain coefficient' }
        ]
    },
    drone: {
        name: 'Drone Altitude',
        pvLabel: 'Altitude',            pvUnit: 'm',
        spLabel: 'Target Altitude',     spUnit: 'm',
        outLabel: 'Motor Thrust',       outUnit: '%',
        manualLabel: 'Throttle Stick',
        noiseLabel: 'Altimeter Noise',   noiseMax: 1.0,
        chartMin: 0, chartMax: 25,
        defaultSP: 10, stepSP: 20,
        spMin: 0, spMax: 25,
        pidLimits: { min: 0, max: 100 },
        defaultSpeedup: 1,
        gainRanges: {
            Kp: { min: 0, max: 20, step: 0.1 },
            Ki: { min: 0, max: 5,  step: 0.01 },
            Kd: { min: 0, max: 20, step: 0.1 }
        },
        PlantClass: DronePlant,
        systemDescription:
            'A 1.5 kg quadcopter UAV is used for agricultural field scouting. '
          + 'The PID controller adjusts total motor thrust to achieve and maintain a hovering altitude. '
          + 'The drone must constantly fight gravity (~49% thrust to hover). Drag provides a small amount of natural damping.',
        equationLatex: 'm \\frac{d^2 h}{dt^2} = \\frac{T_{\\max} \\cdot u}{100} - mg - c \\frac{dh}{dt}',
        parameterTable: [
            { symbol: 'm',     value: '1.5 kg',       desc: 'Drone mass' },
            { symbol: 'T_max', value: '30 N',          desc: 'Max thrust' },
            { symbol: 'g',     value: '9.81 m/s²',     desc: 'Gravity' },
            { symbol: 'c',     value: '0.5 N·s/m',     desc: 'Drag coefficient' },
            { symbol: 'u_hover', value: '49.1%',       desc: 'Hover thrust' }
        ]
    }
};


// ─── Simulation State ────────────────────────────────────────

const SimState = {
    // Timing
    time: 0,
    dt: 0.05,
    speedup: 1,

    // Active scenario
    activePlant: 'vat',

    // PID gains (initial defaults — overwritten when scenario loads)
    Kp: 1.0,
    Ki: 0.0,
    Kd: 0.0,

    // Mode
    mode: 'auto',       // 'auto' | 'manual'
    manualOutput: 0,

    // Setpoint (initialized from scenario config)
    setpoint: 37,

    // Operating-point bias (equilibrium control effort for the initial SP)
    // Separated from PID integral so P-only control shows proper offset
    bias: 0,

    // Measurement noise (0–1 slider fraction; actual σ = noiseLevel * cfg.noiseMax)
    noiseLevel: 0,

    // Process state (written by sim, read by UI)
    processVariable: 20,
    controlEffort: 0,
    pTerm: 0,
    iTerm: 0,
    dTerm: 0,

    // Performance metrics
    peakOvershoot: 0,
    settlingTime: null,
    steadyStateError: 0,
    _stepStartTime: 0,
    _stepSP: null,
    _settled: false,

    // Data buffers for charts (arrays of { t, pv, sp, u } objects)
    history: [],
    maxHistoryLen: 2000,

    // Grading (Phase 4)
    assignmentMode: false,
    variableA: null,
    variableB: null,
    activeAssignment: null,   // e.g. 'vat', 'tractor', etc.
    goalsMet: false,
    goalsMetSince: null,      // timestamp (SimState.time) when goals first met continuously
    completionCode: null,     // set when goals confirmed after debounce

    // Running state
    running: false,
    _intervalId: null
};


// ─── Internal references ─────────────────────────────────────

let _plant = null;
let _pid = null;


// ─── Gaussian Noise (Box–Muller transform) ──────────────────

function _gaussianRandom() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}


// ─── Simulation Step (single dt sub-step) ────────────────────

function simStep() {
    const s = SimState;
    const dt = s.dt;
    const cfg = SCENARIOS[s.activePlant];

    // ── Measurement noise ──
    // Add noise to the *measured* PV that the PID controller sees.
    // The true plant state (_plant.pv) is unaffected.
    const sigma = s.noiseLevel * cfg.noiseMax;
    const noise = sigma > 0 ? sigma * _gaussianRandom() : 0;
    const measuredPV = _plant.pv + noise;

    // Determine control effort
    let u;
    if (s.mode === 'manual') {
        u = s.manualOutput;
    } else {
        const result = _pid.compute(s.setpoint, measuredPV, dt, s.Kp, s.Ki, s.Kd);
        // Add operating-point bias: total output = bias + PID correction
        // Bias sustains the initial SP; PID provides corrections around it.
        // With P-only (Ki=0), the controller cannot compensate for the
        // difference between old and new equilibrium → visible SSE.
        u = s.bias + result.output;
        s.pTerm = result.pTerm;
        s.iTerm = result.iTerm;
        s.dTerm = result.dTerm;
    }

    // Clamp to scenario-specific actuator limits
    const limits = cfg.pidLimits;
    u = Math.max(limits.min, Math.min(limits.max, u));
    s.controlEffort = u;

    // Update plant
    _plant.update(u, dt);
    s.processVariable = _plant.pv;

    // Advance time
    s.time += dt;

    // Update performance metrics
    _updateMetrics();
}


// ─── Performance Metrics ─────────────────────────────────────

function _updateMetrics() {
    const s = SimState;
    const pv = s.processVariable;
    const sp = s.setpoint;
    const error = pv - sp;

    // Steady-state error (absolute)
    s.steadyStateError = Math.abs(error);

    // Peak overshoot (positive excursion above setpoint, in PV units)
    if (error > s.peakOvershoot) {
        s.peakOvershoot = error;
    }

    // Settling time: PV within ±2% of step size, permanently
    if (s._stepSP !== null) {
        const stepSize = Math.abs(s._stepSP - s._stepStartPV);
        if (stepSize > 0) {
            const band = 0.02 * stepSize;
            const within = Math.abs(error) <= band;
            if (!within) {
                s._settled = false;
                s._settleCandidate = null;
            } else if (!s._settled) {
                if (s._settleCandidate === null) {
                    s._settleCandidate = s.time;
                }
                // Mark settled after 2 s of continuous in-band
                if (s.time - s._settleCandidate >= 2.0) {
                    s._settled = true;
                    s.settlingTime = s._settleCandidate - s._stepStartTime;
                }
            }
        }
    }
}

/** Reset performance metrics (called on setpoint step or sim reset). */
function _resetMetrics() {
    const s = SimState;
    s.peakOvershoot = 0;
    s.settlingTime = null;
    s.steadyStateError = 0;
    s._stepStartTime = s.time;
    s._stepStartPV = s.processVariable;
    s._stepSP = s.setpoint;
    s._settled = false;
    s._settleCandidate = null;
}


// ─── Simulation Frame (with time acceleration) ───────────────

function simFrame() {
    const s = SimState;
    const n = s.speedup;
    for (let i = 0; i < n; i++) {
        simStep();
    }

    // Record one history point per frame (not per sub-step).
    // At high speedups this prevents the buffer from churning
    // through thousands of points per second and keeps the full
    // response visible on the chart.
    const cfg = SCENARIOS[s.activePlant];
    const sigma = s.noiseLevel * cfg.noiseMax;
    s.history.push({
        t:      s.time,
        pv:     _plant.pv + (sigma > 0 ? sigma * _gaussianRandom() : 0),
        pvTrue: _plant.pv,
        sp:     s.setpoint,
        u:      s.controlEffort
    });
    if (s.history.length > s.maxHistoryLen) {
        s.history.shift();
    }

    // Notify UI (may be a no-op until Phase 2 connects)
    if (typeof window.updateUI === 'function') {
        window.updateUI();
    }
}


// ─── Public Control Functions ────────────────────────────────

/**
 * Initialize and start the simulation loop.
 */
function startSimulation() {
    if (SimState.running) return;

    SimState.running = true;
    SimState._intervalId = setInterval(simFrame, SimState.dt * 1000);

    console.log(`[sim] Started: ${SCENARIOS[SimState.activePlant].name} @ ${SimState.speedup}× speed`);
}

/**
 * Pause the simulation (preserves state).
 */
function stopSimulation() {
    if (!SimState.running) return;
    clearInterval(SimState._intervalId);
    SimState._intervalId = null;
    SimState.running = false;
    console.log('[sim] Stopped');
}

/**
 * Reset plant, PID, state, and metrics to initial conditions.
 */
function resetSimulation() {
    const wasRunning = SimState.running;
    stopSimulation();

    _initScenario(SimState.activePlant);

    if (wasRunning) {
        startSimulation();
    }
    console.log('[sim] Reset');
}

/**
 * Switch to a different scenario by plant ID.
 * @param {string} plantId  One of 'vat', 'tractor', 'reservoir', 'drone'
 */
function switchScenario(plantId) {
    if (!(plantId in SCENARIOS)) {
        console.error(`[sim] Unknown scenario: ${plantId}`);
        return;
    }
    const wasRunning = SimState.running;
    stopSimulation();

    SimState.activePlant = plantId;
    _initScenario(plantId);

    if (wasRunning) {
        startSimulation();
    }
    console.log(`[sim] Switched to: ${SCENARIOS[plantId].name}`);
}

/**
 * Apply a setpoint step: toggle between defaultSP and stepSP.
 */
function stepSetpoint() {
    const cfg = SCENARIOS[SimState.activePlant];
    if (SimState.setpoint === cfg.defaultSP) {
        SimState.setpoint = cfg.stepSP;
    } else {
        SimState.setpoint = cfg.defaultSP;
    }
    _resetMetrics();
    console.log(`[sim] Setpoint stepped to ${SimState.setpoint}`);
}

/**
 * Inject a one-time disturbance by directly offsetting the plant's PV.
 * The magnitude is scenario-appropriate so the disturbance is visible
 * but recoverable by a well-tuned controller.
 */
const DISTURBANCE_MAG = {
    vat:       5,     // +5 °C
    tractor:  10,     // +10 deg heading
    reservoir: -10,   // -10 % level
    drone:    -3      // -3 m altitude
};

function injectDisturbance() {
    const id = SimState.activePlant;
    const mag = DISTURBANCE_MAG[id] || 0;

    // Directly perturb plant internal state
    if (id === 'vat') {
        _plant.T += mag;
    } else if (id === 'tractor') {
        _plant.theta += mag;   // stored in degrees
    } else if (id === 'reservoir') {
        _plant.L = Math.max(0, Math.min(100, _plant.L + mag));
    } else if (id === 'drone') {
        _plant.h = Math.max(0, _plant.h + mag);
    }

    // Sync PV
    SimState.processVariable = _plant.pv;
    console.log(`[sim] Disturbance injected: ${mag > 0 ? '+' : ''}${mag} ${SCENARIOS[id].pvUnit}`);
}


// ─── Internal Initialization ─────────────────────────────────

function _initScenario(plantId) {
    const cfg = SCENARIOS[plantId];

    // Create fresh plant
    _plant = new cfg.PlantClass();

    // Initialize plant at equilibrium for the default setpoint
    const u_eq = _plant.setToEquilibrium(cfg.defaultSP);

    // Create PID with limits relative to the bias, so the PID correction
    // range maps exactly to the available actuator headroom above/below u_eq.
    // This ensures anti-windup works correctly with the bias offset.
    _pid = new PIDController(cfg.pidLimits.min - u_eq, cfg.pidLimits.max - u_eq);

    // The bias provides the operating-point control effort.
    // The PID integral starts at 0 — no pre-loading.
    // This means P-only control will show proper steady-state offset
    // after a setpoint step (because bias sustains the OLD SP, not the new one).

    // Reset state
    SimState.time = 0;
    SimState.speedup = cfg.defaultSpeedup;
    SimState.setpoint = cfg.defaultSP;
    SimState.bias = u_eq;
    SimState.noiseLevel = 0;
    SimState.processVariable = _plant.pv;
    SimState.controlEffort = u_eq;
    SimState.pTerm = 0;
    SimState.iTerm = 0;
    SimState.dTerm = 0;
    SimState.mode = 'auto';
    SimState.manualOutput = u_eq;
    SimState.Kp = 0;
    SimState.Ki = 0;
    SimState.Kd = 0;
    SimState.history = [];
    SimState.goalsMet = false;
    SimState.goalsMetSince = null;
    SimState.completionCode = null;

    _resetMetrics();
}

// Initialize default scenario on load
_initScenario(SimState.activePlant);


// ─── Console Helpers ─────────────────────────────────────────
// Expose for Phase 1 verification via browser console.

window.SimState = SimState;
window.SCENARIOS = SCENARIOS;
window.PIDController = PIDController;
window.VatPlant = VatPlant;
window.TractorHeadingPlant = TractorHeadingPlant;
window.ReservoirPlant = ReservoirPlant;
window.DronePlant = DronePlant;
window.startSimulation = startSimulation;
window.stopSimulation = stopSimulation;
window.resetSimulation = resetSimulation;
window.switchScenario = switchScenario;
window.stepSetpoint = stepSetpoint;
window.injectDisturbance = injectDisturbance;
window.simStep = simStep;
window._initScenario = _initScenario;
window._resetMetrics = _resetMetrics;

console.log('[sim] Engine loaded. Try: startSimulation(), SimState, switchScenario("drone")');


// ─── Assignment Goals & Grading (Phase 4) ────────────────────

/**
 * Per-scenario performance goals for assignment mode.
 * See 03_grading_logic.md for physical justifications.
 */
const ASSIGNMENT_GOALS = {
    vat: {
        label: 'Problem 1: Fermentation Vat',
        maxOvershoot: 3.0,       // °C above SP
        maxSSE: 0.5,             // °C
        maxSettlingTime: null,   // not constrained (slow system, use 25×)
        overshootUnit: '°C',
        sseUnit: '°C'
    },
    tractor: {
        label: 'Problem 2: Tractor Heading',
        maxOvershoot: 5.0,       // degrees
        maxSSE: null,            // not constrained
        maxSettlingTime: 10,     // seconds
        overshootUnit: '°',
        sseUnit: '°'
    },
    reservoir: {
        label: 'Problem 3: Water Reservoir',
        maxOvershoot: 15.0,      // % of step (absolute % level)
        maxSSE: 2.0,             // %
        maxSettlingTime: null,   // not constrained
        overshootUnit: '%',
        sseUnit: '%'
    },
    drone: {
        label: 'Problem 4: Drone Altitude',
        maxOvershoot: 2.0,       // meters
        maxSSE: 0.5,             // meters
        maxSettlingTime: 30,     // seconds
        overshootUnit: 'm',
        sseUnit: 'm'
    }
};

/**
 * Grading constants — change each semester.
 * Must match the Canvas Formula Question.
 */
const GRADE_C1 = 17;
const GRADE_C2 = 31;
const GRADE_C3 = 42;

/** Compute completion code from Canvas variables A, B. */
function computeCode(A, B) {
    return A * GRADE_C1 + B * GRADE_C2 + GRADE_C3;
}

/** Check if current metrics meet the assignment goals. */
function checkGoals(scenarioId, metrics) {
    const goals = ASSIGNMENT_GOALS[scenarioId];
    if (!goals) return false;

    let met = true;

    if (goals.maxOvershoot != null) {
        met = met && metrics.peakOvershoot <= goals.maxOvershoot;
    }
    if (goals.maxSSE != null) {
        met = met && metrics.steadyStateError !== undefined
            && metrics.steadyStateError <= goals.maxSSE;
    }
    if (goals.maxSettlingTime != null) {
        met = met && metrics.settlingTime !== null
            && metrics.settlingTime <= goals.maxSettlingTime;
    }

    return met;
}

/**
 * Called from simFrame each tick when assignment mode is active.
 * Implements 2-second debounce before confirming success.
 * Returns true when completion should be triggered.
 */
const GOAL_DEBOUNCE_TIME = 2.0; // seconds of sim time

function checkAssignmentGoals() {
    const s = SimState;
    if (!s.assignmentMode || !s.activeAssignment) return false;
    if (s.completionCode !== null) return false; // already completed

    // Need at least one step-setpoint event to evaluate against
    if (s._stepSP === null) return false;

    const met = checkGoals(s.activeAssignment, {
        peakOvershoot: s.peakOvershoot,
        steadyStateError: s.steadyStateError,
        settlingTime: s.settlingTime
    });

    if (met) {
        if (s.goalsMetSince === null) {
            s.goalsMetSince = s.time;
        }
        if (s.time - s.goalsMetSince >= GOAL_DEBOUNCE_TIME) {
            s.goalsMet = true;
            s.completionCode = computeCode(s.variableA, s.variableB);
            return true; // trigger success
        }
    } else {
        s.goalsMetSince = null;
        s.goalsMet = false;
    }

    return false;
}


// Export Phase 4 items
window.ASSIGNMENT_GOALS = ASSIGNMENT_GOALS;
window.computeCode = computeCode;
window.checkGoals = checkGoals;
window.checkAssignmentGoals = checkAssignmentGoals;