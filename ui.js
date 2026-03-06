/* ============================================================
   ui.js — PID Tuning Simulator: UI Layer
   ============================================================
   Owns all DOM manipulation, Chart.js instances, and event
   wiring.  Reads from SimState (sim.js) and SCENARIOS.
   ============================================================ */

'use strict';

// ─── DOM References ──────────────────────────────────────────

const $plantSelect   = document.getElementById('plant-select');
const $speedSelect   = document.getElementById('speed-select');
const $chartWindow   = document.getElementById('chart-window');
const $pidViewToggle = document.getElementById('pid-view-toggle');

const $btnAuto   = document.getElementById('btn-auto');
const $btnManual = document.getElementById('btn-manual');

const $pidSliders   = document.getElementById('pid-sliders');
const $manualCtrl   = document.getElementById('manual-control');
const $manualLabel  = document.getElementById('manual-label');
const $sliderManual = document.getElementById('slider-manual');
const $valManual    = document.getElementById('val-manual');
const $manualUnit   = document.getElementById('manual-unit');

const $sliderKp = document.getElementById('slider-kp');
const $sliderKi = document.getElementById('slider-ki');
const $sliderKd = document.getElementById('slider-kd');
const $valKp    = document.getElementById('val-kp');
const $valKi    = document.getElementById('val-ki');
const $valKd    = document.getElementById('val-kd');
const $rangeKp  = document.getElementById('range-kp');
const $rangeKi  = document.getElementById('range-ki');
const $rangeKd  = document.getElementById('range-kd');

const $spLabel  = document.getElementById('sp-label');
const $spInput  = document.getElementById('sp-input');
const $spUnit   = document.getElementById('sp-unit');

const $btnStart   = document.getElementById('btn-start');
const $btnStep    = document.getElementById('btn-step');
const $btnDisturb = document.getElementById('btn-disturb');
const $btnReset   = document.getElementById('btn-reset');

const $noiseLabel  = document.getElementById('noise-label');
const $sliderNoise = document.getElementById('slider-noise');
const $valNoise    = document.getElementById('val-noise');
const $noiseUnit   = document.getElementById('noise-unit');

const $metricOvershoot      = document.getElementById('metric-overshoot');
const $metricSettling        = document.getElementById('metric-settling');
const $metricSSE             = document.getElementById('metric-sse');
const $metricOvershootLabel  = document.getElementById('metric-overshoot-label');
const $metricSettlingLabel   = document.getElementById('metric-settling-label');
const $metricSSELabel        = document.getElementById('metric-sse-label');

const $systemDescText   = document.getElementById('system-desc-text');
const $systemEquation   = document.getElementById('system-equation');
const $systemParamsBody = document.getElementById('system-params-body');

// Animation overlay & PID equation
const $animContainer     = document.getElementById('animation-container');
const $animOverlay       = document.getElementById('anim-overlay');
const $animOverlayContent = document.getElementById('anim-overlay-content');
const $pidEquation       = document.getElementById('pid-equation');
const $effortSrSummary   = document.getElementById('effort-sr-summary');

// ─── Assignment Mode DOM References ──────────────────────────

const $btnAssignmentMode   = document.getElementById('btn-assignment-mode');
const $assignmentOverlay   = document.getElementById('assignment-overlay');
const $inputVarA           = document.getElementById('input-var-a');
const $inputVarB           = document.getElementById('input-var-b');
const $selectAssignment    = document.getElementById('select-assignment');
const $goalsPreview        = document.getElementById('assignment-goals-preview');
const $btnStartAssignment  = document.getElementById('btn-start-assignment');
const $btnCancelAssignment = document.getElementById('btn-cancel-assignment');

const $successOverlay   = document.getElementById('success-overlay');
const $completionCode   = document.getElementById('completion-code');
const $btnCloseSuccess  = document.getElementById('btn-close-success');

const $assignmentBanner       = document.getElementById('assignment-banner');
const $bannerProblem          = document.getElementById('banner-problem');
const $bannerA                = document.getElementById('banner-a');
const $bannerB                = document.getElementById('banner-b');
const $bannerGoals            = document.getElementById('banner-goals');
const $btnExitAssignment      = document.getElementById('btn-exit-assignment');


// ─── Chart.js Setup ──────────────────────────────────────────

const chartFontColor = '#cdd6f4';
const gridColor = 'rgba(205,214,244,0.08)';

Chart.defaults.color = chartFontColor;
Chart.defaults.font.size = 11;

// --- Time-series chart ---
const timeCtx = document.getElementById('time-chart').getContext('2d');
const timeChart = new Chart(timeCtx, {
    type: 'line',
    data: {
        datasets: [
            {
                label: 'Setpoint',
                data: [],
                borderColor: '#f9e2af',
                borderWidth: 2,
                borderDash: [6, 3],
                pointRadius: 0,
                tension: 0,
                fill: false,
                yAxisID: 'y'
            },
            {
                label: 'Process Variable',
                data: [],
                borderColor: '#89b4fa',
                borderWidth: 2,
                pointRadius: 0,
                tension: 0.1,
                fill: false,
                yAxisID: 'y'
            },
            {
                label: 'Control Signal',
                data: [],
                borderColor: '#94e2d5',
                borderWidth: 1.5,
                pointRadius: 0,
                tension: 0.1,
                fill: false,
                yAxisID: 'yRight'
            },
            {
                label: 'True PV',
                data: [],
                borderColor: 'rgba(137,180,250,0.4)',
                borderWidth: 1.5,
                pointRadius: 0,
                tension: 0.1,
                fill: false,
                hidden: true,
                yAxisID: 'y'
            }
        ]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'nearest', intersect: false },
        scales: {
            x: {
                type: 'linear',
                title: { display: true, text: 'Time (s)' },
                grid: { color: gridColor },
                ticks: { maxTicksLimit: 10 }
            },
            y: {
                position: 'left',
                title: { display: true, text: '' },
                grid: { color: gridColor },
                suggestedMin: 0,
                suggestedMax: 100
            },
            yRight: {
                position: 'right',
                title: { display: true, text: 'Control Signal (%)' },
                grid: { drawOnChartArea: false },
                suggestedMin: 0,
                suggestedMax: 100
            }
        },
        plugins: {
            legend: { position: 'top', labels: { boxWidth: 12, padding: 8 } }
        }
    }
});

// --- Effort breakdown chart ---
const effortCtx = document.getElementById('effort-chart').getContext('2d');
const effortChart = new Chart(effortCtx, {
    type: 'bar',
    data: {
        labels: ['Bias', 'P', 'I', 'D'],
        datasets: [{
            label: 'PID Terms',
            data: [0, 0, 0, 0],
            backgroundColor: ['#fab387', '#f38ba8', '#89b4fa', '#a6e3a1'],
            borderRadius: 4,
            barPercentage: 0.6
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 80 },
        indexAxis: 'x',
        scales: {
            y: {
                title: { display: true, text: 'Contribution' },
                grid: { color: gridColor },
                suggestedMin: -50,
                suggestedMax: 50
            },
            x: { grid: { display: false } }
        },
        plugins: {
            legend: { display: false }
        }
    }
});


// ─── PID View Toggle State ───────────────────────────────────
let pidViewActive = false;

// Generic PID labels (used when PID View toggle is on)
const GENERIC_LABELS = {
    pvLabel: 'Process Variable', pvUnit: '',
    spLabel: 'Setpoint',         spUnit: '',
    outLabel: 'Control Output',  outUnit: '%',
    manualLabel: 'Manual Output',
    noiseLabel: 'Measurement Noise'
};


// ─── Label Application ──────────────────────────────────────

function applyLabels() {
    const cfg = SCENARIOS[SimState.activePlant];
    const labels = pidViewActive ? GENERIC_LABELS : cfg;

    // Setpoint area
    $spLabel.textContent = labels.spLabel;
    $spUnit.textContent  = pidViewActive ? '' : cfg.spUnit;

    // Time chart
    const spDatasetLabel = pidViewActive ? 'Setpoint' : cfg.spLabel;
    const pvDatasetLabel = pidViewActive ? 'Process Variable' : cfg.pvLabel;
    const uDatasetLabel  = pidViewActive ? 'Control Signal' : cfg.outLabel;
    timeChart.data.datasets[0].label = spDatasetLabel;
    timeChart.data.datasets[1].label = pvDatasetLabel;
    timeChart.data.datasets[2].label = uDatasetLabel;
    timeChart.data.datasets[3].label = pidViewActive
        ? 'True PV'
        : `True ${cfg.pvLabel}`;
    timeChart.options.scales.y.title.text = pidViewActive
        ? 'Process Variable'
        : `${cfg.pvLabel} (${cfg.pvUnit})`;
    timeChart.options.scales.yRight.title.text = pidViewActive
        ? 'Control Signal (%)'
        : `${cfg.outLabel} (${cfg.outUnit})`;

    // Y-axis ranges from scenario config
    timeChart.options.scales.y.suggestedMin = cfg.chartMin;
    timeChart.options.scales.y.suggestedMax = cfg.chartMax;
    timeChart.options.scales.yRight.suggestedMin = cfg.pidLimits.min;
    timeChart.options.scales.yRight.suggestedMax = cfg.pidLimits.max;

    // Manual slider
    $manualLabel.textContent = pidViewActive ? 'Manual Output' : cfg.manualLabel;
    $manualUnit.textContent  = pidViewActive ? '%' : cfg.outUnit;

    // Noise slider label
    $noiseLabel.textContent = pidViewActive ? 'Noise' : cfg.noiseLabel;

    // Metrics labels (already generic-enough, keep them)
    timeChart.update('none');

    // PID equation display
    renderPIDEquation();
}


// ─── System Description Panel ────────────────────────────────

function updateSystemDescription() {
    const cfg = SCENARIOS[SimState.activePlant];

    // Text description
    $systemDescText.textContent = cfg.systemDescription;

    // Equation (KaTeX)
    try {
        katex.render(cfg.equationLatex, $systemEquation, {
            displayMode: true,
            throwOnError: false
        });
    } catch (_e) {
        $systemEquation.textContent = cfg.equationLatex;
    }

    // Parameter table
    $systemParamsBody.innerHTML = '';
    cfg.parameterTable.forEach(row => {
        const tr = document.createElement('tr');
        // Render the symbol using KaTeX inline
        const tdSym = document.createElement('td');
        try {
            katex.render(row.symbol, tdSym, { throwOnError: false });
        } catch (_e) {
            tdSym.textContent = row.symbol;
        }
        const tdVal  = document.createElement('td');
        tdVal.textContent = row.value;
        const tdDesc = document.createElement('td');
        tdDesc.textContent = row.desc;
        tr.append(tdSym, tdVal, tdDesc);
        $systemParamsBody.appendChild(tr);
    });
}


// ─── Gain Slider Configuration ───────────────────────────────

function configureGainSliders() {
    const cfg = SCENARIOS[SimState.activePlant];

    function setupSlider(slider, valEl, rangeEl, gainCfg, key) {
        slider.min  = gainCfg.min;
        slider.max  = gainCfg.max;
        slider.step = gainCfg.step;
        slider.value = SimState[key];
        valEl.textContent = formatGain(Number(slider.value), gainCfg.step);
        rangeEl.textContent = `[${gainCfg.min} – ${gainCfg.max}]`;
    }

    setupSlider($sliderKp, $valKp, $rangeKp, cfg.gainRanges.Kp, 'Kp');
    setupSlider($sliderKi, $valKi, $rangeKi, cfg.gainRanges.Ki, 'Ki');
    setupSlider($sliderKd, $valKd, $rangeKd, cfg.gainRanges.Kd, 'Kd');
}

/** Format a gain value to match slider step precision. */
function formatGain(val, step) {
    if (step >= 1) return val.toFixed(0);
    const decimals = String(step).split('.')[1]?.length || 1;
    return val.toFixed(decimals);
}


// ─── Manual Control Config ───────────────────────────────────

function configureManualSlider() {
    const cfg = SCENARIOS[SimState.activePlant];
    $sliderManual.min = cfg.pidLimits.min;
    $sliderManual.max = cfg.pidLimits.max;
    $sliderManual.step = 0.5;
}


// ─── Setpoint Input Config ───────────────────────────────────

function configureSPInput() {
    const cfg = SCENARIOS[SimState.activePlant];
    $spInput.min  = cfg.spMin;
    $spInput.max  = cfg.spMax;
    $spInput.step = cfg.spUnit === 'deg' ? 1 : 0.5;
    $spInput.value = SimState.setpoint;
}

/** Sync the SP input field to match SimState.setpoint.
 *  Skips update when the input has focus so the user can type freely. */
function syncSPInput() {
    if (document.activeElement === $spInput) return;
    $spInput.value = SimState.setpoint;
}


// ─── Speed Select Sync ──────────────────────────────────────

function syncSpeedSelect() {
    $speedSelect.value = String(SimState.speedup);
}


// ─── Animation References ────────────────────────────────────

const $animScenes = {
    vat:       document.getElementById('anim-vat'),
    tractor:   document.getElementById('anim-tractor'),
    reservoir: document.getElementById('anim-reservoir'),
    drone:     document.getElementById('anim-drone')
};

// Vat elements
const $vatLiquid   = document.getElementById('vat-liquid');
const $vatHeater   = document.getElementById('vat-heater');
const $vatTherm    = document.getElementById('vat-therm');
const $vatWave1    = document.getElementById('vat-wave1');
const $vatWave2    = document.getElementById('vat-wave2');
const $vatWave3    = document.getElementById('vat-wave3');
const $vatTempLbl  = document.getElementById('vat-temp-label');

// Tractor elements
const $tractorBody       = document.getElementById('tractor-body');
const $tractorWheelL     = document.getElementById('tractor-wheel-l');
const $tractorWheelR     = document.getElementById('tractor-wheel-r');
const $tractorTarget     = document.getElementById('tractor-target');
const $tractorTargetLbl  = document.getElementById('tractor-target-label');
const $compassNeedle     = document.getElementById('compass-needle');
const $tractorHeadingLbl = document.getElementById('tractor-heading-label');

// Reservoir elements
const $reservoirWater     = document.getElementById('reservoir-water');
const $reservoirTarget    = document.getElementById('reservoir-target');
const $reservoirTargetLbl = document.getElementById('reservoir-target-lbl');
const $reservoirInflow    = document.getElementById('reservoir-inflow');
const $reservoirDrain     = document.getElementById('reservoir-drain');
const $reservoirLevelLbl  = document.getElementById('reservoir-level-label');

// Drone elements
const $droneBody      = document.getElementById('drone-body');
const $droneTarget     = document.getElementById('drone-target');
const $droneTargetLbl  = document.getElementById('drone-target-lbl');
const $droneFlame      = document.getElementById('drone-flame');
const $droneAltLbl     = document.getElementById('drone-alt-label');


// ─── Animation Toggling ──────────────────────────────────────

function showAnimation(plantId) {
    // Close overlay if open (scenario is changing)
    closeAnimOverlay();
    Object.entries($animScenes).forEach(([id, el]) => {
        if (id === plantId) el.classList.remove('hidden');
        else                el.classList.add('hidden');
    });
}


// ─── Vat Animation Update ────────────────────────────────────

function updateVatAnimation(pv, effort) {
    // Temperature range: 15–75°C → thermometer Y: 155 (bottom) to 55 (top)
    const tFrac = Math.max(0, Math.min(1, (pv - 15) / 60));
    const thermTop = 155 - tFrac * 100;   // SVG y of mercury top
    const thermH   = 155 - thermTop;
    $vatTherm.setAttribute('y', thermTop);
    $vatTherm.setAttribute('height', Math.max(2, thermH));

    // Liquid color — cooler = more blue/teal, hotter = more red-tinted
    const r = Math.round(148 + tFrac * 95);   // 148→243
    const g = Math.round(226 - tFrac * 100);  // 226→126
    const b = Math.round(213 - tFrac * 60);   // 213→153
    $vatLiquid.setAttribute('fill', `rgb(${r},${g},${b})`);
    $vatLiquid.setAttribute('opacity', 0.35 + tFrac * 0.2);

    // Heater glow intensity from control effort [0–100]
    const eFrac = Math.max(0, Math.min(1, effort / 100));
    $vatHeater.setAttribute('opacity', 0.1 + eFrac * 0.7);

    // Heat waves visibility
    const waveOp = eFrac * 0.6;
    [  $vatWave1, $vatWave2, $vatWave3 ].forEach(w => {
        w.style.setProperty('--wave-opacity', waveOp);
        w.setAttribute('opacity', waveOp);
    });

    // Temperature label
    $vatTempLbl.textContent = `${pv.toFixed(1)} °C`;

    // Update SVG aria-label for screen readers
    $animScenes.vat.setAttribute('aria-label',
        `Fermentation vat: temperature ${pv.toFixed(1)}°C, heater effort ${effort.toFixed(0)}%`);
}


// ─── Tractor Animation Update ────────────────────────────────

function updateTractorAnimation(heading, steeringAngle, targetHeading) {
    // Rotate tractor body to show heading
    $tractorBody.setAttribute('transform', `translate(150,100) rotate(${heading})`);

    // Rotate front wheels to show steering angle
    const wAngle = Math.max(-35, Math.min(35, steeringAngle));
    $tractorWheelL.setAttribute('transform', `rotate(${wAngle}, -19, -31)`);
    $tractorWheelR.setAttribute('transform', `rotate(${wAngle}, 19, -31)`);

    // Compass needle
    $compassNeedle.setAttribute('transform', `rotate(${heading}, 40, 40)`);

    // Target heading line
    const tRad = (targetHeading - 90) * Math.PI / 180;
    const tx = 150 + 90 * Math.cos(tRad);
    const ty = 100 + 90 * Math.sin(tRad);
    $tractorTarget.setAttribute('x2', tx);
    $tractorTarget.setAttribute('y2', ty);

    // Heading readout
    $tractorHeadingLbl.textContent = `${heading.toFixed(1)}°`;

    // Update SVG aria-label for screen readers
    $animScenes.tractor.setAttribute('aria-label',
        `Tractor heading: ${heading.toFixed(1)}°, target ${targetHeading.toFixed(1)}°`);
}


// ─── Reservoir Animation Update ──────────────────────────────

function updateReservoirAnimation(level, effort, targetLevel) {
    // Level [0–100] → water rect: tank is y=30..180 (height 150)
    const tankTop = 32;
    const tankBot = 178;
    const tankH = tankBot - tankTop;
    const lFrac = Math.max(0, Math.min(1, level / 100));
    const waterH = lFrac * tankH;
    const waterY = tankBot - waterH;
    $reservoirWater.setAttribute('y', waterY);
    $reservoirWater.setAttribute('height', Math.max(0, waterH));

    // Target level line
    const tFrac = Math.max(0, Math.min(1, targetLevel / 100));
    const targetY = tankBot - tFrac * tankH;
    $reservoirTarget.setAttribute('y1', targetY);
    $reservoirTarget.setAttribute('y2', targetY);
    $reservoirTargetLbl.setAttribute('y', targetY + 3);

    // Inflow stream — opacity/width scales with pump effort
    const eFrac = Math.max(0, Math.min(1, effort / 100));
    $reservoirInflow.setAttribute('opacity', eFrac * 0.7);
    $reservoirInflow.setAttribute('width', 4 + eFrac * 6);
    // Inflow stream should reach down to water surface
    const inflowH = Math.max(0, waterY - 35);
    $reservoirInflow.setAttribute('height', inflowH);

    // Drain stream — scales with √level (Torricelli)
    const drainFrac = Math.sqrt(lFrac);
    $reservoirDrain.setAttribute('opacity', drainFrac * 0.6);
    $reservoirDrain.setAttribute('width', 3 + drainFrac * 5);

    // Level label — position it in the middle of the water or just above if low
    const lblY = lFrac > 0.15 ? (waterY + waterH / 2 + 5) : (waterY - 5);
    $reservoirLevelLbl.setAttribute('y', lblY);
    $reservoirLevelLbl.textContent = `${level.toFixed(1)}%`;

    // Update SVG aria-label for screen readers
    $animScenes.reservoir.setAttribute('aria-label',
        `Water reservoir: level ${level.toFixed(1)}%, target ${targetLevel.toFixed(1)}%`);
}


// ─── Drone Animation Update ─────────────────────────────────

function updateDroneAnimation(altitude, effort, targetAlt) {
    // Altitude [0–25m] maps to SVG y: ground=185 to top=15
    const maxAlt = 25;
    const groundY = 185;
    const ceilingY = 15;
    const range = groundY - ceilingY;

    const aFrac = Math.max(0, Math.min(1, altitude / maxAlt));
    const droneY = groundY - aFrac * range;
    $droneBody.setAttribute('transform', `translate(150, ${droneY})`);

    // Target altitude line
    const tFrac = Math.max(0, Math.min(1, targetAlt / maxAlt));
    const targetY = groundY - tFrac * range;
    $droneTarget.setAttribute('y1', targetY);
    $droneTarget.setAttribute('y2', targetY);
    $droneTargetLbl.setAttribute('y', targetY + 3);
    $droneTargetLbl.textContent = `${targetAlt}m`;

    // Thrust flame — size and opacity from effort
    const eFrac = Math.max(0, Math.min(1, effort / 100));
    const flameH = 5 + eFrac * 20;
    $droneFlame.setAttribute('points', `-6,10 0,${10 + flameH} 6,10`);
    $droneFlame.setAttribute('opacity', eFrac * 0.8);
    // Flame color: low thrust → orange, high thrust → red
    const flameR = 243;
    const flameG = Math.round(139 - eFrac * 80);
    const flameB = Math.round(168 - eFrac * 80);
    $droneFlame.setAttribute('fill', `rgb(${flameR},${flameG},${flameB})`);

    // Altitude readout
    $droneAltLbl.textContent = `${altitude.toFixed(1)} m`;

    // Update SVG aria-label for screen readers
    $animScenes.drone.setAttribute('aria-label',
        `Drone altitude: ${altitude.toFixed(1)}m, target ${targetAlt}m`);
}


// ─── updateUI — called every simFrame ────────────────────────

window.updateUI = function updateUI() {
    const s = SimState;
    const cfg = SCENARIOS[s.activePlant];

    // --- Time-series chart ---
    const spData = [];
    const pvData = [];
    const uData  = [];
    for (let i = 0; i < s.history.length; i++) {
        const h = s.history[i];
        spData.push({ x: h.t, y: h.sp });
        pvData.push({ x: h.t, y: h.pv });
        uData.push({ x: h.t, y: h.u });
    }
    timeChart.data.datasets[0].data = spData;
    timeChart.data.datasets[1].data = pvData;
    timeChart.data.datasets[2].data = uData;

    // True PV trace (only shown when noise is active)
    const noiseActive = s.noiseLevel > 0;
    if (noiseActive) {
        const pvTrueData = [];
        for (let i = 0; i < s.history.length; i++) {
            const h = s.history[i];
            pvTrueData.push({ x: h.t, y: h.pvTrue });
        }
        timeChart.data.datasets[3].data = pvTrueData;
    } else {
        timeChart.data.datasets[3].data = [];
    }
    timeChart.data.datasets[3].hidden = !noiseActive;

    // --- Chart time window (x-axis range) ---
    const winSec = Number($chartWindow.value);   // 0 = All
    if (winSec > 0 && s.time > winSec) {
        timeChart.options.scales.x.min = s.time - winSec;
        timeChart.options.scales.x.max = s.time;
    } else {
        timeChart.options.scales.x.min = undefined;
        timeChart.options.scales.x.max = undefined;
    }

    timeChart.update('none');

    // --- Effort chart ---
    effortChart.data.datasets[0].data = [s.bias, s.pTerm, s.iTerm, s.dTerm];
    // Dynamic Y-axis to keep bars visible
    const maxTermAbs = Math.max(Math.abs(s.bias), Math.abs(s.pTerm), Math.abs(s.iTerm), Math.abs(s.dTerm), 1);
    const effortYRange = Math.ceil(maxTermAbs * 1.3);
    effortChart.options.scales.y.suggestedMin = -effortYRange;
    effortChart.options.scales.y.suggestedMax =  effortYRange;
    effortChart.update('none');

    // --- Effort chart screen-reader summary ---
    $effortSrSummary.textContent =
        `Bias: ${s.bias.toFixed(1)}, P: ${s.pTerm.toFixed(1)}, I: ${s.iTerm.toFixed(1)}, D: ${s.dTerm.toFixed(1)}`;

    // --- Setpoint display ---
    syncSPInput();

    // --- Performance metrics ---
    $metricOvershoot.textContent = s.peakOvershoot > 0
        ? `${s.peakOvershoot.toFixed(2)} ${cfg.pvUnit}`
        : '—';
    $metricSettling.textContent = s.settlingTime !== null
        ? `${s.settlingTime.toFixed(1)} s`
        : '—';
    $metricSSE.textContent = s.steadyStateError !== undefined
        ? `${s.steadyStateError.toFixed(2)} ${cfg.pvUnit}`
        : '—';

    // --- Manual slider value readout ---
    if (s.mode === 'manual') {
        $valManual.textContent = Number($sliderManual.value).toFixed(1);
    }

    // --- Start/Pause button label ---
    $btnStart.textContent = s.running ? '⏸ Pause' : '▶ Start';

    // --- Animation update ---
    switch (s.activePlant) {
        case 'vat':
            updateVatAnimation(s.processVariable, s.controlEffort);
            break;
        case 'tractor':
            updateTractorAnimation(s.processVariable, s.controlEffort, s.setpoint);
            break;
        case 'reservoir':
            updateReservoirAnimation(s.processVariable, s.controlEffort, s.setpoint);
            break;
        case 'drone':
            updateDroneAnimation(s.processVariable, s.controlEffort, s.setpoint);
            break;
    }

    // --- Assignment mode: goal tracking ---
    if (s.assignmentMode) {
        updateGoalBadges();
        if (checkAssignmentGoals()) {
            showSuccessModal(s.completionCode);
        }
    }
};


// ─── Scenario Switch ─────────────────────────────────────────

function handleScenarioChange(plantId) {
    stopSimulation();
    switchScenario(plantId);

    // Update all UI elements for the new scenario
    configureGainSliders();
    configureManualSlider();
    configureSPInput();
    syncSpeedSelect();
    updateSystemDescription();
    applyLabels();

    // Reset mode to auto
    setMode('auto');

    // Clear charts
    timeChart.data.datasets[0].data = [];
    timeChart.data.datasets[1].data = [];
    timeChart.data.datasets[2].data = [];
    timeChart.data.datasets[3].data = [];
    timeChart.data.datasets[3].hidden = true;
    timeChart.update('none');
    effortChart.data.datasets[0].data = [SimState.bias, 0, 0, 0];
    effortChart.update('none');

    // Reset noise slider
    $sliderNoise.value = 0;
    $valNoise.textContent = '0%';

    // Sync setpoint display
    syncSPInput();

    // Switch animation
    showAnimation(plantId);

    // Reset metrics display
    $metricOvershoot.textContent = '—';
    $metricSettling.textContent  = '—';
    $metricSSE.textContent       = '—';
}


// ─── Auto/Manual Mode ────────────────────────────────────────

function setMode(mode) {
    SimState.mode = mode;

    if (mode === 'auto') {
        $btnAuto.classList.add('active');
        $btnManual.classList.remove('active');
        $btnAuto.setAttribute('aria-checked', 'true');
        $btnManual.setAttribute('aria-checked', 'false');
        $pidSliders.classList.remove('hidden');
        $manualCtrl.classList.add('hidden');
    } else {
        $btnManual.classList.add('active');
        $btnAuto.classList.remove('active');
        $btnManual.setAttribute('aria-checked', 'true');
        $btnAuto.setAttribute('aria-checked', 'false');
        $pidSliders.classList.add('hidden');
        $manualCtrl.classList.remove('hidden');

        // Bumpless transfer: initialize manual slider to current control effort
        $sliderManual.value = SimState.controlEffort;
        SimState.manualOutput = SimState.controlEffort;
        $valManual.textContent = SimState.controlEffort.toFixed(1);
    }
}


// ─── Event Wiring ────────────────────────────────────────────

// Scenario selector
$plantSelect.addEventListener('change', () => {
    handleScenarioChange($plantSelect.value);
});

// Speed selector
$speedSelect.addEventListener('change', () => {
    SimState.speedup = Number($speedSelect.value);
});

// Chart time-window selector (no action needed — value read each frame in updateUI)

// PID View toggle
$pidViewToggle.addEventListener('change', () => {
    pidViewActive = $pidViewToggle.checked;
    applyLabels();
});

// Mode buttons
$btnAuto.addEventListener('click',   () => setMode('auto'));
$btnManual.addEventListener('click', () => setMode('manual'));

// Gain sliders
$sliderKp.addEventListener('input', () => {
    SimState.Kp = Number($sliderKp.value);
    const step = SCENARIOS[SimState.activePlant].gainRanges.Kp.step;
    $valKp.textContent = formatGain(SimState.Kp, step);
});
$sliderKi.addEventListener('input', () => {
    SimState.Ki = Number($sliderKi.value);
    const step = SCENARIOS[SimState.activePlant].gainRanges.Ki.step;
    $valKi.textContent = formatGain(SimState.Ki, step);
});
$sliderKd.addEventListener('input', () => {
    SimState.Kd = Number($sliderKd.value);
    const step = SCENARIOS[SimState.activePlant].gainRanges.Kd.step;
    $valKd.textContent = formatGain(SimState.Kd, step);
});

// Manual output slider
$sliderManual.addEventListener('input', () => {
    SimState.manualOutput = Number($sliderManual.value);
    $valManual.textContent = Number($sliderManual.value).toFixed(1);
});

// Noise slider
$sliderNoise.addEventListener('input', () => {
    const pct = Number($sliderNoise.value);
    SimState.noiseLevel = pct / 100;
    $valNoise.textContent = pct + '%';
});

// Setpoint input — user can type any value within scenario bounds
// 'input' fires on every keystroke/arrow for real-time updates while running;
// 'change' fires on Enter/blur for final clamping and display cleanup.
function _applySPFromInput(clampDisplay) {
    const cfg = SCENARIOS[SimState.activePlant];
    let val = parseFloat($spInput.value);
    if (isNaN(val)) return;                       // ignore incomplete typing
    val = Math.max(cfg.spMin, Math.min(cfg.spMax, val));
    if (clampDisplay) $spInput.value = val;        // snap display on commit
    SimState.setpoint = val;
    _resetMetrics();
}
$spInput.addEventListener('input',  () => _applySPFromInput(false));
$spInput.addEventListener('change', () => {
    _applySPFromInput(true);
    console.log(`[ui] Setpoint committed: ${SimState.setpoint}`);
});

// Action buttons
$btnStart.addEventListener('click', () => {
    if (SimState.running) {
        stopSimulation();
    } else {
        startSimulation();
    }
    $btnStart.textContent = SimState.running ? '⏸ Pause' : '▶ Start';
});

$btnStep.addEventListener('click', () => {
    stepSetpoint();
    syncSPInput();
});

$btnDisturb.addEventListener('click', () => {
    injectDisturbance();
});

$btnReset.addEventListener('click', () => {
    stopSimulation();
    resetSimulation();

    // Re-sync UI
    configureGainSliders();
    syncSpeedSelect();
    setMode('auto');

    // Clear charts
    timeChart.data.datasets[0].data = [];
    timeChart.data.datasets[1].data = [];
    timeChart.data.datasets[2].data = [];
    timeChart.data.datasets[3].data = [];
    timeChart.data.datasets[3].hidden = true;
    timeChart.update('none');
    effortChart.data.datasets[0].data = [SimState.bias, 0, 0, 0];
    effortChart.update('none');

    // Reset noise slider
    $sliderNoise.value = 0;
    $valNoise.textContent = '0%';

    $spInput.value = SimState.setpoint;
    $metricOvershoot.textContent = '—';
    $metricSettling.textContent  = '—';
    $metricSSE.textContent       = '—';
    $btnStart.textContent        = '▶ Start';
});


// ─── Assignment Mode Logic ──────────────────────────────────

/** Render goal preview in the setup modal for a given scenario. */
function renderGoalPreview(scenarioId) {
    const goals = ASSIGNMENT_GOALS[scenarioId];
    if (!goals) { $goalsPreview.innerHTML = ''; return; }

    let html = '<strong style="color:var(--teal);margin-bottom:0.3rem;display:block">Performance Goals</strong>';
    if (goals.maxOvershoot != null) {
        html += `<div class="goal-item"><span>Max Overshoot</span><span class="goal-val">≤ ${goals.maxOvershoot} ${goals.overshootUnit}</span></div>`;
    }
    if (goals.maxSSE != null) {
        html += `<div class="goal-item"><span>Max Steady-State Error</span><span class="goal-val">≤ ${goals.maxSSE} ${goals.sseUnit}</span></div>`;
    }
    if (goals.maxSettlingTime != null) {
        html += `<div class="goal-item"><span>Max Settling Time</span><span class="goal-val">≤ ${goals.maxSettlingTime} s</span></div>`;
    }
    $goalsPreview.innerHTML = html;
}

/** Validate A & B inputs and enable/disable the start button. */
function validateAssignmentInputs() {
    const a = parseInt($inputVarA.value, 10);
    const b = parseInt($inputVarB.value, 10);
    const valid = Number.isInteger(a) && a >= 1 && a <= 100
               && Number.isInteger(b) && b >= 1 && b <= 100;
    $btnStartAssignment.disabled = !valid;
}

/** Open the assignment setup modal. */
function openAssignmentModal() {
    stopSimulation();
    $assignmentOverlay.classList.remove('hidden');
    $inputVarA.value = '';
    $inputVarB.value = '';
    $btnStartAssignment.disabled = true;
    renderGoalPreview($selectAssignment.value);
    // Focus the first input for keyboard users
    setTimeout(() => $inputVarA.focus(), 50);
}

/** Close the assignment setup modal without starting. */
function closeAssignmentModal() {
    $assignmentOverlay.classList.add('hidden');
    $btnAssignmentMode.focus();
}

/** Activate assignment mode with the selected problem. */
function startAssignment() {
    const a = parseInt($inputVarA.value, 10);
    const b = parseInt($inputVarB.value, 10);
    const scenarioId = $selectAssignment.value;

    // Set SimState assignment fields
    SimState.assignmentMode = true;
    SimState.variableA = a;
    SimState.variableB = b;
    SimState.activeAssignment = scenarioId;
    SimState.goalsMet = false;
    SimState.goalsMetSince = null;
    SimState.completionCode = null;

    // Switch to the assigned scenario (resets sim)
    handleScenarioChange(scenarioId);
    $plantSelect.value = scenarioId;

    // Lock plant selector
    $plantSelect.disabled = true;

    // Close modal, show banner
    closeAssignmentModal();
    showAssignmentBanner(scenarioId, a, b);

    // Trigger a step so metrics can be evaluated
    stepSetpoint();
    syncSPInput();
}

/** Show the assignment banner at top of screen. */
function showAssignmentBanner(scenarioId, a, b) {
    const goals = ASSIGNMENT_GOALS[scenarioId];
    $bannerProblem.textContent = goals.label;
    $bannerA.textContent = a;
    $bannerB.textContent = b;

    // Build goal badges
    let badgeHtml = '';
    if (goals.maxOvershoot != null) {
        badgeHtml += `<span class="goal-badge unmet" id="badge-overshoot">Overshoot ≤ ${goals.maxOvershoot} ${goals.overshootUnit}</span>`;
    }
    if (goals.maxSSE != null) {
        badgeHtml += `<span class="goal-badge unmet" id="badge-sse">SSE ≤ ${goals.maxSSE} ${goals.sseUnit}</span>`;
    }
    if (goals.maxSettlingTime != null) {
        badgeHtml += `<span class="goal-badge unmet" id="badge-settling">Settling ≤ ${goals.maxSettlingTime} s</span>`;
    }
    $bannerGoals.innerHTML = badgeHtml;
    $assignmentBanner.classList.remove('hidden');
}

/** Update goal badge colors based on current metrics. */
function updateGoalBadges() {
    if (!SimState.assignmentMode) return;
    const goals = ASSIGNMENT_GOALS[SimState.activeAssignment];
    if (!goals) return;

    const badgeOvershoot = document.getElementById('badge-overshoot');
    const badgeSSE       = document.getElementById('badge-sse');
    const badgeSettling  = document.getElementById('badge-settling');

    if (badgeOvershoot) {
        const met = SimState.peakOvershoot <= goals.maxOvershoot;
        badgeOvershoot.classList.toggle('met', met);
        badgeOvershoot.classList.toggle('unmet', !met);
        badgeOvershoot.setAttribute('aria-label',
            `Overshoot ≤ ${goals.maxOvershoot} ${goals.overshootUnit}: ${met ? 'met' : 'not met'}`);
    }
    if (badgeSSE) {
        const met = SimState.steadyStateError !== undefined && SimState.steadyStateError <= goals.maxSSE;
        badgeSSE.classList.toggle('met', met);
        badgeSSE.classList.toggle('unmet', !met);
        badgeSSE.setAttribute('aria-label',
            `SSE ≤ ${goals.maxSSE} ${goals.sseUnit}: ${met ? 'met' : 'not met'}`);
    }
    if (badgeSettling) {
        const met = SimState.settlingTime !== null && SimState.settlingTime <= goals.maxSettlingTime;
        badgeSettling.classList.toggle('met', met);
        badgeSettling.classList.toggle('unmet', !met);
        badgeSettling.setAttribute('aria-label',
            `Settling ≤ ${goals.maxSettlingTime} s: ${met ? 'met' : 'not met'}`);
    }
}

/** Show the success modal with the completion code. */
function showSuccessModal(code) {
    $completionCode.textContent = code.toLocaleString();
    $successOverlay.classList.remove('hidden');
    setTimeout(() => $btnCloseSuccess.focus(), 50);
}

/** Exit assignment mode and return to exploration. */
function exitAssignmentMode() {
    stopSimulation();

    SimState.assignmentMode = false;
    SimState.variableA = null;
    SimState.variableB = null;
    SimState.activeAssignment = null;
    SimState.goalsMet = false;
    SimState.goalsMetSince = null;
    SimState.completionCode = null;

    // Unlock plant selector
    $plantSelect.disabled = false;

    // Hide banner
    $assignmentBanner.classList.add('hidden');

    // Reset current scenario
    handleScenarioChange($plantSelect.value);
}


// ─── Assignment Mode Event Wiring ────────────────────────────

$btnAssignmentMode.addEventListener('click', openAssignmentModal);
$btnCancelAssignment.addEventListener('click', closeAssignmentModal);
$btnStartAssignment.addEventListener('click', startAssignment);
$btnExitAssignment.addEventListener('click', exitAssignmentMode);
$btnCloseSuccess.addEventListener('click', () => {
    $successOverlay.classList.add('hidden');
    $btnStart.focus();
});

$inputVarA.addEventListener('input', validateAssignmentInputs);
$inputVarB.addEventListener('input', validateAssignmentInputs);
$selectAssignment.addEventListener('change', () => {
    renderGoalPreview($selectAssignment.value);
});

// Close modal on overlay click (outside the modal box)
$assignmentOverlay.addEventListener('click', (e) => {
    if (e.target === $assignmentOverlay) closeAssignmentModal();
});


// ─── Keyboard: Escape to close modals & overlay ─────────────

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (overlayActive) {
            closeAnimOverlay();
            $animContainer.focus();
        } else if (!$assignmentOverlay.classList.contains('hidden')) {
            closeAssignmentModal();
        } else if (!$successOverlay.classList.contains('hidden')) {
            $successOverlay.classList.add('hidden');
            $btnStart.focus();
        }
    }
});


// ─── Focus Trap for Modals ───────────────────────────────────

function trapFocus(modalOverlay) {
    modalOverlay.addEventListener('keydown', (e) => {
        if (e.key !== 'Tab') return;
        const focusable = modalOverlay.querySelectorAll(
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
            if (document.activeElement === first) {
                e.preventDefault();
                last.focus();
            }
        } else {
            if (document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
    });
}
trapFocus($assignmentOverlay);
trapFocus($successOverlay);


// ─── Animation Zoom Overlay ──────────────────────────────────

let overlayActive = false;

function openAnimOverlay() {
    if (overlayActive) return;
    // Find the active (non-hidden) SVG scene
    const activeSVG = Object.entries($animScenes)
        .find(([id]) => id === SimState.activePlant)?.[1];
    if (!activeSVG) return;
    // Move the live SVG into the overlay content
    $animOverlayContent.appendChild(activeSVG);
    $animOverlay.classList.remove('hidden');
    overlayActive = true;
    $animOverlayContent.focus();
}

function closeAnimOverlay() {
    if (!overlayActive) return;
    // Move the SVG back to the animation container
    const activeSVG = $animOverlayContent.querySelector('svg');
    if (activeSVG) $animContainer.appendChild(activeSVG);
    $animOverlay.classList.add('hidden');
    overlayActive = false;
}

$animContainer.addEventListener('click', openAnimOverlay);
$animContainer.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openAnimOverlay();
    }
});
$animOverlay.addEventListener('click', (e) => {
    // Close when clicking the backdrop (not the content box)
    if (e.target === $animOverlay) closeAnimOverlay();
});
// Also close if the content box itself is clicked (user clicks the animation)
$animOverlayContent.addEventListener('click', closeAnimOverlay);


// ─── PID Equation Rendering ──────────────────────────────────

function renderPIDEquation() {
    if (typeof katex === 'undefined') return;
    const cfg = SCENARIOS[SimState.activePlant];
    let pvName, spName, outName;
    if (pidViewActive) {
        pvName  = 'y(t)';
        spName  = 'r(t)';
        outName = 'u(t)';
    } else {
        pvName  = '\\text{' + cfg.pvLabel + '}';
        spName  = '\\text{' + cfg.spLabel + '}';
        outName = '\\text{' + cfg.outLabel + '}';
    }
    const errorLine = `e(t) = ${spName} - ${pvName}`;
    const pidLine   = `${outName} = K_p \\, e(t) \\;+\\; K_i \\!\\int e(t)\\,dt \\;+\\; K_d \\frac{de(t)}{dt}`;
    const combined  = `${errorLine} \\\\[4pt] ${pidLine}`;
    try {
        katex.render(combined, $pidEquation, {
            displayMode: true,
            throwOnError: false
        });
    } catch (_) { /* ignore render errors */ }
}


// ─── Initialization ──────────────────────────────────────────

(function init() {
    // Set dropdown to current scenario
    $plantSelect.value = SimState.activePlant;

    // Configure all UI for the default (vat) scenario
    configureGainSliders();
    configureManualSlider();
    configureSPInput();
    syncSpeedSelect();
    updateSystemDescription();
    applyLabels();

    $spInput.value = SimState.setpoint;

    // Show animation for the default scenario
    showAnimation(SimState.activePlant);

    // Set initial animation state
    updateVatAnimation(SimState.processVariable, 0);

    console.log('[ui] UI initialized.');
})();
