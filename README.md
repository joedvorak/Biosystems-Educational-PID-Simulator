# PID Tuning Simulator

An interactive browser-based PID controller simulator for **BAE 305 — Engineering Analysis** at the University of Kentucky.

## Overview

Tune proportional (P), integral (I), and derivative (D) gains on four real-world-inspired plants and observe how each term affects the closed-loop response in real time.

### Scenarios

| Scenario | Plant Type | Key Lesson |
|---|---|---|
| **Fermentation Vat** | 1st-order (self-regulating) | Integral action eliminates steady-state error |
| **Tractor Heading** | Pure integrator | Integral action can *destabilize* an integrating plant |
| **Water Reservoir** | Nonlinear 1st-order (Torricelli) | Gain-scheduling motivation; nonlinear dynamics |
| **Drone Altitude** | 2nd-order with gravity | All three PID terms play distinct roles |

### Features

- **Exploration & Assignment modes** — free-form tuning or graded challenges
- **Manual mode** — students act as the controller before seeing PID in action
- **Live animation** — each scenario has a dynamic visual (heater glow, tractor turning, water level, drone flight)
- **Effort decomposition chart** — bar chart showing Bias + P + I + D contributions
- **PID equation overlay** — live KaTeX-rendered equation with current gain values
- **Measurement noise slider** — demonstrates why derivative control is fragile
- **Time acceleration** — 1× to 500× speed for slow processes
- **Deterministic grading codes** — unique per-student verification for Canvas

## Usage

Open **index.html** in any modern browser (Chrome, Firefox, Safari, Edge).

An internet connection is required for the Chart.js and KaTeX CDN dependencies.

## Files

| File | Purpose |
|---|---|
| `index.html` | Main application page |
| `sim.js` | Simulation engine, PID controller, plant models, grading |
| `ui.js` | UI, Chart.js integration, animations |
| `style.css` | Catppuccin dark theme styling |

## License

For educational use in BAE 305 at the University of Kentucky.
