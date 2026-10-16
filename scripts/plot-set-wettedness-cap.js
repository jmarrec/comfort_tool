/*
Plots the root function used by comf.cooling_effect, to visualize the SET discontinuity at the critical skin
wettedness (WCRIT) cap, see issue #102.

  f(x) = SET(elevated air speed) - SET(still air, ta - x, tr - x)

The cooling effect is the root of f. When the skin wettedness cap switches on and off between the minutes
of the simulation, f jumps between two branches and has many sign changes ("comb").

Usage:
  node scripts/plot-set-wettedness-cap.js [--ta 34] [--tr 34] [--v 0.2] [--rh 70] [--met 1.1] [--clo 0.5]
                                          [--xmax 1.5] [--out set-wettedness-cap.svg]

Writes an SVG file (no dependencies). Run it before and after a change to comfort-models.js to compare.
*/

const fs = require("fs");
const { comf } = require("../static/js/comfort-models");

function parseArgs(argv) {
  const args = { ta: 34, tr: 34, v: 0.2, rh: 70, met: 1.1, clo: 0.5, xmax: 1.5, out: "set-wettedness-cap.svg" };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, "");
    if (!(key in args)) throw new Error(`Unknown argument: ${argv[i]}`);
    args[key] = key === "out" ? argv[i + 1] : parseFloat(argv[i + 1]);
  }
  return args;
}

const a = parseArgs(process.argv.slice(2));
const position = "standing";

// Same calls as comf.cooling_effect
const setElevated = comf.pierceSET(a.ta, a.tr, a.v, a.rh, a.met, a.clo, 0, false, true, 90, position).set;
const f = (x) =>
  setElevated -
  comf.pierceSET(a.ta - x, a.tr - x, comf.still_air_threshold, a.rh, a.met, a.clo, 0, false, true, 90, position).set;
const ce = comf.cooling_effect(a.ta, a.tr, a.v, a.rh, a.met, a.clo, 0, position);

function sample(x0, x1, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    pts.push([x, f(x)]);
  }
  return pts;
}

const full = sample(0, a.xmax, 3000);

let signChanges = 0;
let maxStep = 0;
let combStart = null;
let combEnd = null;
for (let i = 1; i < full.length; i++) {
  const step = Math.abs(full[i][1] - full[i - 1][1]);
  if (full[i][1] < 0 !== full[i - 1][1] < 0) signChanges++;
  if (step > 0.05) {
    combStart = combStart === null ? full[i - 1][0] : combStart;
    combEnd = full[i][0];
  }
  maxStep = Math.max(maxStep, step);
}

// Zoom on the jumps if there are any, otherwise around the cooling effect
const zoomRange = combStart === null ? [ce - 0.1, ce + 0.1] : [combStart - 0.02, combEnd + 0.02];
const zoom = sample(Math.max(0, zoomRange[0]), zoomRange[1], 4000);

// ---- SVG helpers
const W = 900;
const panelH = 300;
const margin = { left: 70, right: 20, top: 40, bottom: 45 };

function panel(pts, yOffset, title) {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const pad = 0.05 * (Math.max(...ys) - Math.min(...ys) || 1);
  const y0 = Math.min(...ys, 0) - pad;
  const y1 = Math.max(...ys, 0) + pad;
  const pw = W - margin.left - margin.right;
  const ph = panelH - margin.top - margin.bottom;
  const sx = (x) => margin.left + ((x - x0) / (x1 - x0)) * pw;
  const sy = (y) => yOffset + margin.top + ((y1 - y) / (y1 - y0)) * ph;

  const parts = [];
  parts.push(`<text x="${W / 2}" y="${yOffset + 22}" text-anchor="middle" font-size="14">${title}</text>`);
  parts.push(
    `<rect x="${margin.left}" y="${yOffset + margin.top}" width="${pw}" height="${ph}" fill="none" stroke="#999"/>`
  );
  for (let i = 0; i <= 5; i++) {
    const x = x0 + ((x1 - x0) * i) / 5;
    const y = y0 + ((y1 - y0) * i) / 5;
    parts.push(`<text x="${sx(x)}" y="${yOffset + panelH - margin.bottom + 16}" text-anchor="middle" font-size="11">${x.toFixed(2)}</text>`);
    parts.push(`<text x="${margin.left - 6}" y="${sy(y) + 4}" text-anchor="end" font-size="11">${y.toFixed(2)}</text>`);
  }
  parts.push(`<line x1="${margin.left}" x2="${margin.left + pw}" y1="${sy(0)}" y2="${sy(0)}" stroke="#000" stroke-width="0.8"/>`);
  if (ce >= x0 && ce <= x1) {
    parts.push(
      `<line x1="${sx(ce)}" x2="${sx(ce)}" y1="${yOffset + margin.top}" y2="${yOffset + margin.top + ph}" stroke="#d62728" stroke-dasharray="5,4"/>`
    );
  }
  const d = pts.map((p, i) => `${i ? "L" : "M"}${sx(p[0]).toFixed(2)},${sy(p[1]).toFixed(2)}`).join("");
  parts.push(`<path d="${d}" fill="none" stroke="#1f77b4" stroke-width="0.8"/>`);
  parts.push(`<text x="${W / 2}" y="${yOffset + panelH - 8}" text-anchor="middle" font-size="12">x = cooling effect candidate [°C]</text>`);
  parts.push(
    `<text transform="translate(16,${yOffset + margin.top + ph / 2}) rotate(-90)" text-anchor="middle" font-size="12">f(x) [°C]</text>`
  );
  return parts.join("\n");
}

const inputs = `ta=${a.ta} °C, tr=${a.tr} °C, v=${a.v} m/s, rh=${a.rh} %, met=${a.met}, clo=${a.clo}`;
const svg = [
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${2 * panelH + 30}" font-family="sans-serif">`,
  `<rect width="100%" height="100%" fill="white"/>`,
  panel(full, 0, `f(x) = SET(v) - SET(still air, ta - x, tr - x); ${inputs}`),
  panel(zoom, panelH, `Zoom; dashed red: comf.cooling_effect() = ${ce.toFixed(3)} °C`),
  `<text x="${W / 2}" y="${2 * panelH + 20}" text-anchor="middle" font-size="12">${signChanges} sign changes, max |f(x + dx) - f(x)| = ${maxStep.toFixed(3)} °C for dx = ${(a.xmax / 3000).toFixed(4)} °C</text>`,
  `</svg>`,
].join("\n");

fs.writeFileSync(a.out, svg);
console.log(`${inputs}`);
console.log(`cooling_effect = ${ce.toFixed(3)} °C, ${signChanges} sign changes, max step ${maxStep.toFixed(3)} °C`);
console.log(`Wrote ${a.out}`);
