// Physics invariants and one end-to-end score for the imaging core. Run: node tests/core.test.js
const C = require('../src/core.js');
const { G } = C;
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) failed++; };
const rects = (list, base) => { const m = base ? base.slice() : new Uint8Array(G * G); for (const [x, y, w, h, v] of list) for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) m[((j % G + G) % G) * G + ((i % G + G) % G)] = v === 0 ? 0 : 1; return m; };
const k1 = 16 * 0.33 / 13.5;
const optics = (shape, sigma, z) => ({ r: 16 * k1, src: C.sourcePoints(shape, sigma), z, lambda: 13.5, n: 1, NA: 0.33 });

// 1. A fully clear mask images to intensity 1 everywhere.
{ const I = C.aerial(C.maskSpectrum(new Uint8Array(G * G).fill(1)), optics('conventional', 0.6, 0));
  let lo = Infinity, hi = -Infinity; for (const v of I) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  check('clear field normalises to 1', Math.abs(lo - 1) < 1e-5 && Math.abs(hi - 1) < 1e-5, `min ${lo.toFixed(7)} max ${hi.toFixed(7)}`); }

// 2. Folding +s/-s source points at best focus is exact, and the image is symmetric through focus.
{ const L = rects([[30, 20, 4, 24], [20, 30, 10, 4]]), spec = C.maskSpectrum(L);
  for (const shape of ['conventional', 'annular', 'dipole-x', 'dipole-y', 'quadrupole']) {
    const half = C.aerial(spec, optics(shape, 0.8, 0)), full = C.aerial(spec, optics(shape, 0.8, 1e-7));
    const p = C.aerial(spec, optics(shape, 0.8, 60)), q = C.aerial(spec, optics(shape, 0.8, -60));
    let d1 = 0, d2 = 0, d3 = 0;
    for (let i = 0; i < half.length; i++) { d1 = Math.max(d1, Math.abs(half[i] - full[i])); d2 = Math.max(d2, Math.abs(p[i] - q[i])); d3 = Math.max(d3, Math.abs(p[i] - half[i])); }
    check(`${shape}: folded source exact, focus symmetric, defocus matters`, d1 < 1e-5 && d2 < 1e-5 && d3 > 0.05, `fold ${d1.toExponential(1)}, ±z ${d2.toExponential(1)}, defocus Δ ${d3.toFixed(3)}`);
  } }

// 3. Level 1 (64 nm square): raw corner error 39.2% of CD; the 3 x 3 corner serif solution reaches 7.9%.
{ const target = rects([[24, 24, 16, 16]]), gauges = C.buildGauges(target, null), opt = optics('conventional', 0.6, 0);
  const dose = C.doseToSize(C.aerial(C.maskSpectrum(target), opt), { x: 32, y: 32, dir: 'h', w: 16 }, gauges), thr = C.T_RESIST / dose;
  const worst = mask => { const I = C.aerial(C.maskSpectrum(mask), opt); C.measureGauges(I, thr, gauges); return 25 * Math.max(...gauges.map(g => Math.abs(g.epe))); };
  const raw = worst(target), fixed = worst(rects([[22, 22, 3, 3], [39, 22, 3, 3], [22, 39, 3, 3], [39, 39, 3, 3]], target));
  check('level 1 dose-to-size', Math.abs(dose - 1.078) < 0.005, dose.toFixed(4));
  check('level 1 raw worst edge error ≈ 39.2% of CD', Math.abs(raw - 39.2) < 0.3, raw.toFixed(2) + '%');
  check('level 1 serif solution ≈ 7.9% of CD', Math.abs(fixed - 7.9) < 0.15, fixed.toFixed(2) + '%'); }

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
