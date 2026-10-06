(function () {
  'use strict';
  const C = window.LPCore, G = C.G, N = C.N;
  const $ = id => document.getElementById(id);

  // ---------- constants ----------
  const TOOLS = {
    arf: { key: 'arf', label: 'ArF immersion', short: 'ArF-i', lambda: 193, n: 1.44, naMin: 0.75, naMax: 1.35, presets: [1.35], defNA: 1.35 },
    euv: { key: 'euv', label: 'EUV', short: 'EUV', lambda: 13.5, n: 1.0, naMin: 0.25, naMax: 0.6, presets: [0.33, 0.55], defNA: 0.33 },
  };
  const SHAPES = [
    ['conventional', 'Conventional'], ['annular', 'Annular'], ['dipole-x', 'Dipole X'],
    ['dipole-y', 'Dipole Y'], ['quadrupole', 'Quadrupole'],
  ];
  const SHAPE_NAME = Object.fromEntries(SHAPES);
  const K1_MIN = 0.10, K1_MAX = 1.0;
  const VIEW = { x0: 8, y0: 8, n: 48 }; // visible window of the 64-cell periodic field
  const VPC = { // instrument colours (same in both themes)
    bg: '#0f1116', grid: 'rgba(255,255,255,0.05)', gridCD: 'rgba(255,255,255,0.10)', open: '#f3e2b8',
    target: '#7cc8ff', print: '#ffad2a', ok: '#3cd29b', warn: '#f2c94c', bad: '#ff6b6b', muted: 'rgba(225,229,236,0.55)',
    text: '#e1e5ec', roiShade: 'rgba(0,0,0,0.42)',
  };

  const LEVELS = [
    { id: 'corner', name: 'Corner rounding', rects: [[24, 24, 16, 16]], anchor: { x: 32, y: 32, dir: 'h', w: 16 },
      brief: 'A projection lens is a low-pass filter. It cannot pass the high spatial frequencies a sharp corner needs, so every corner of this 64 nm square prints round. Paint small square serifs on the outer corners to push extra light into them.',
      hint: 'Pick the 3-cell brush and click the cell just diagonally outside each corner. Each serif then covers the corner cell plus two cells outside it.', par: 3 },
    { id: 'lineend', name: 'Line-end pullback', rects: [[30, 18, 4, 28]], anchor: { x: 32, y: 32, dir: 'h', w: 4 },
      brief: 'The end of a line only gets light from one side, so it prints short and thin. Lengthen the ends, or widen them into hammerheads, until the printed tip reaches the dashed target.',
      hint: 'Extend each end by one cell, then add one cell on each side of the last two rows, a small hammerhead. Extending by two cells alone gets two stars.', par: 3 },
    { id: 'elbow', name: 'The elbow', rects: [[22, 18, 4, 26], [22, 40, 22, 4]], anchor: { x: 24, y: 28, dir: 'h', w: 4 },
      brief: 'A bend fails two opposite ways. The outer corner starves and rounds off while the inner corner floods and fills in. Add a serif outside, cut a notch inside, and fix both free line ends.',
      hint: 'Fix both free ends as in level 2 and put a level-1 serif on the outer corner. For the inner corner, erase the three cells of each inside edge that touch the corner.', par: 2 },
    { id: 'tips', name: 'Tip to tip', rects: [[30, 10, 4, 20], [30, 34, 4, 20]], anchor: { x: 32, y: 16, dir: 'h', w: 4 }, rois: [[26, 20, 12, 24]],
      brief: 'Two line ends face each other across a one-CD gap. Push the tips back out to the target without letting them touch. If they bridge, the two wires short together. Only the shaded window is scored.',
      hint: 'Do not lengthen the tips: two extra rows close the gap. Paint a one-cell bar along both sides of each tip instead, five cells long: alongside the last four rows and one cell into the gap.', par: 2 },
    { id: 'isodense', name: 'Iso–dense bias', rects: [[12, 0, 4, 64], [20, 0, 4, 64], [28, 0, 4, 64], [46, 0, 4, 64]], anchor: { x: 22, y: 32, dir: 'h', w: 4 }, rois: [[19, 0, 6, 64], [45, 0, 6, 64]], shape: 'annular', sigma: 0.85,
      brief: 'Annular light makes the dense lines crisp, and the dose is set so the middle one prints on size. The lone line on the right comes out thin because it has no neighbours to share light with. Bias it wider, or add thin assist bars (SRAFs) that help it print without printing themselves.',
      hint: 'Paint a bar three cells wide down each side of the lone line, leaving a three-cell gap. It sits just under the print threshold; two-cell bars are safer and still earn two stars.', par: 3 },
    { id: 'staple', name: 'The staple', rects: [[24, 20, 4, 24], [32, 20, 4, 24], [24, 20, 12, 4]], anchor: { x: 26, y: 34, dir: 'h', w: 4 },
      brief: 'A U-turn with a one-CD slot. The outer corners round, the free feet pull back, and the closed end of the slot floods with light and fills in. Everything at once.',
      hint: 'Top corners: L-shaped serifs, three cells along each outside edge. Slot: erase the bar row above it and three cells down each wall. Feet: extend one row, add a four-cell bar on each outer side and one cell at each inner corner. Last, erase one wall cell five rows up from the bottom on each side.', par: 2 },
  ];
  const LEVEL_OPTICS = { tool: 'euv', NA: 0.33, cd: 16 };

  // Verified solutions (best clean, manufacturable masks found). Cells are [x, y, w, h] to add, or [x, y, w, h, 0] to erase.
  // pct = worst edge error as % of CD, measured with the level's own optics and dose.
  const SOLUTIONS = [
    { pct: 7.9, stars: 3, crop: [19, 19, 26, 26],
      why: 'A corner loses light from three sides, and the lens cannot pass the fine detail a sharp corner needs. A serif adds the missing light right where the print rounds off.',
      steps: [
        { t: 'Serif on each outer corner: a 3 × 3 block centred on the cell just diagonally outside the corner. It overlaps the corner cell and sticks out two cells.', s: 'With the 3-cell brush this is one click per corner.', c: [[22, 22, 3, 3], [39, 22, 3, 3], [22, 39, 3, 3], [39, 39, 3, 3]] },
      ] },
    { pct: 8.8, stars: 3, crop: [24, 14, 16, 36],
      why: 'A line end only gets light from one side, so it prints short and narrow. Lengthening it pushes the tip back out; widening the last rows keeps the tip from pinching.',
      steps: [
        { t: 'Extend each end by one full-width row.', c: [[30, 17, 4, 1], [30, 46, 4, 1]] },
        { t: 'Add one cell on each side of the last two rows: a small hammerhead.', s: 'Extending by two rows alone earns two stars.', c: [[29, 18, 1, 2], [34, 18, 1, 2], [29, 44, 1, 2], [34, 44, 1, 2]] },
      ] },
    { pct: 14.2, stars: 2, crop: [17, 14, 31, 34],
      why: 'Outer corners and free ends starve, so they get extra mask. The inner corner gets light from both arms and floods, so it gets less: an anti-serif.',
      steps: [
        { t: 'Top end: extend one row and add one cell on each side of the last two rows, as in level 2.', c: [[22, 17, 4, 1], [21, 18, 1, 2], [26, 18, 1, 2]] },
        { t: 'Right end: the same fix, turned sideways.', c: [[44, 40, 1, 4], [42, 39, 2, 1], [42, 44, 2, 1]] },
        { t: 'Outer corner: a 3 × 3 serif, as in level 1.', c: [[20, 42, 3, 3]] },
        { t: 'Inner corner: erase the three cells of each inside edge that touch the corner.', s: 'This bite is the new move. Without it the corner fills in by more than a third of a CD.', c: [[25, 37, 1, 3, 0], [26, 40, 3, 1, 0]] },
      ] },
    { pct: 11.5, stars: 2, crop: [24, 19, 16, 26],
      why: 'Both tips pull back, but the gap is only one CD wide, so anything that moves a tip toward the other risks a bridge. Light is added beside the tips instead of in front of them.',
      steps: [
        { t: 'Leave the tips the length they are.', s: 'Two extra rows on each tip close the gap and short the wires together.', c: [] },
        { t: 'Paint a one-cell bar along both sides of each tip, five cells long: beside the last four rows and one cell into the gap.', c: [[29, 26, 1, 5], [34, 26, 1, 5], [29, 33, 1, 5], [34, 33, 1, 5]] },
      ] },
    { pct: 3.5, stars: 3, crop: [9, 20, 50, 24],
      why: 'The dose is set so the dense lines print on size. The lone line has no neighbours scattering light toward it, so it prints thin. Assist bars stand in for the missing neighbours without printing themselves.',
      steps: [
        { t: 'Paint an assist bar three cells wide down each side of the lone line, leaving a three-cell gap. The bars run the full height of the field.', s: 'They peak about 5% under the print threshold. If they start to print, make them two cells wide: still two stars.', c: [[40, 0, 3, 64], [53, 0, 3, 64]] },
      ] },
    { pct: 14.1, stars: 2, crop: [19, 15, 22, 34],
      why: 'Every earlier trick at once: serifs on the outer corners, an anti-serif where the slot meets the bar, and line-end fixes on both feet. The last trim balances the slot walls.',
      steps: [
        { t: 'Top outer corners: L-shaped serifs, three cells along each outside edge.', c: [[23, 20, 1, 3], [24, 19, 3, 1], [36, 20, 1, 3], [33, 19, 3, 1]] },
        { t: 'Slot end: erase the bar row directly above the slot and the top three cells of each slot wall.', c: [[28, 23, 4, 1, 0], [27, 24, 1, 3, 0], [32, 24, 1, 3, 0]] },
        { t: 'Feet: extend each one row, add a four-cell bar on each outer side and one cell at each inner bottom corner.', c: [[24, 44, 4, 1], [32, 44, 4, 1], [23, 40, 1, 4], [36, 40, 1, 4], [28, 43, 1, 1], [31, 43, 1, 1]] },
        { t: 'Trim one slot-wall cell five rows up from the bottom, on each side.', c: [[27, 39, 1, 1, 0], [32, 39, 1, 1, 0]] },
      ] },
  ];

  const PRESETS = {
    dense: { rects: [0, 1, 2, 3, 4, 5].map(i => [12 + 8 * i, 12, 4, 40]), anchor: { x: 30, y: 32, dir: 'h', w: 4 } },
    contacts: { rects: [19, 29, 39].flatMap(y => [19, 29, 39].map(x => [x, y, 5, 5])), anchor: { x: 31.5, y: 31.5, dir: 'h', w: 5 } },
    logic: { rects: [[8, 9, 48, 5], [8, 50, 48, 5], [14, 19, 4, 26], [24, 19, 4, 11], [24, 34, 4, 11], [24, 30, 10, 4], [34, 19, 4, 26], [44, 19, 4, 26]], anchor: { x: 16, y: 38, dir: 'h', w: 4 } },
    letters: { rects: [[14, 18, 4, 28], [14, 42, 14, 4], [34, 18, 4, 28], [34, 18, 14, 4], [44, 18, 4, 16], [34, 30, 14, 4]], anchor: { x: 16, y: 30, dir: 'h', w: 4 } },
    blank: { rects: [], anchor: null },
  };

  // ---------- state ----------
  const S = {
    mode: 'puzzle', level: 0,
    tool: 'euv', NA: 0.33, cd: 16, shape: 'conventional', sigma: 0.6, dose: 1, focus: 0,
    mask: new Uint8Array(G * G), target: null, tpx: null, gauges: null, rois: null, anchor: null,
    paint: true, brush: 1, view: 'resist', pickMode: false, assisted: false,
    spec: null, maskDirty: true, I: new Float32Array(N * N), thr: C.T_RESIST, defects: [],
    hover: null, highlight: null, busy: false,
  };
  const undo = [];
  let srcCache = { key: '', pts: null };
  let bossung = null, sweepGen = 0, sweepTimer = 0;
  const sweepBuf = new Float32Array(N * N), zeroBuf = new Float32Array(N * N);

  const T = () => TOOLS[S.tool];
  const k1 = () => S.cd * S.NA / T().lambda;
  const cellNm = () => S.cd / C.CD_CELLS;
  const zR = () => { const t = T(); return t.lambda / (2 * (t.n - Math.sqrt(t.n * t.n - S.NA * S.NA))); };
  function srcPts() {
    const key = S.shape + '|' + S.sigma.toFixed(3);
    if (srcCache.key !== key) srcCache = { key, pts: C.sourcePoints(S.shape, S.sigma) };
    return srcCache.pts;
  }
  function optics(z) { const t = T(); return { r: 16 * k1(), src: srcPts(), z, lambda: t.lambda, n: t.n, NA: S.NA }; }
  function rects(list) {
    const m = new Uint8Array(G * G);
    for (const [x, y, w, h] of list) for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) m[((j % G + G) % G) * G + ((i % G + G) % G)] = 1;
    return m;
  }
  const fmt = (v, d = 1) => (Math.round(v * 10 ** d) / 10 ** d).toFixed(d);
  const signed = (v, d = 1) => (v > 0.05 ? '+' : v < -0.05 ? '−' : '') + fmt(Math.abs(v), d);

  // ---------- persistence (per-viewer convenience) ----------
  const STORE = 'lightpainter.v1.stars';
  let best = [0, 0, 0, 0, 0, 0];
  try { const s = JSON.parse(localStorage.getItem(STORE) || 'null'); if (Array.isArray(s)) best = LEVELS.map((_, i) => s[i] | 0); } catch (e) { /* storage unavailable */ }
  function saveBest() { try { localStorage.setItem(STORE, JSON.stringify(best)); } catch (e) { /* ignore */ } }

  // ---------- target / level setup ----------
  function setTarget(t, rois, anchor) {
    S.target = t; S.rois = rois || null; S.anchor = anchor ? { ...anchor } : null;
    if (t && t.some(v => v)) { S.tpx = C.targetPx(t); S.gauges = C.buildGauges(t, S.rois); }
    else { S.target = null; S.tpx = null; S.gauges = null; }
  }
  function imageAtBestFocus() {
    if (S.maskDirty) { S.spec = C.maskSpectrum(S.mask); S.maskDirty = false; }
    return C.aerial(S.spec, optics(0), zeroBuf);
  }
  function doseToSize() {
    if (!S.anchor && !S.gauges) return;
    const I0 = imageAtBestFocus();
    S.dose = Math.min(2.5, Math.max(0.4, C.doseToSize(I0, S.anchor, S.gauges)));
  }
  function loadLevel(i) {
    const L = LEVELS[i];
    S.mode = 'puzzle'; S.level = i; S.assisted = false; S.pickMode = false; S.highlight = null;
    const t = rects(L.rects);
    setTarget(t, L.rois, L.anchor);
    S.mask = t.slice(); S.maskDirty = true;
    applyLevelOptics();
    S.focus = 0;
    doseToSize();
    S.levelDose = S.dose;
    undo.length = 0;
    syncAll();
  }
  function applyLevelOptics() {
    const L = LEVELS[S.level];
    S.tool = LEVEL_OPTICS.tool; S.NA = LEVEL_OPTICS.NA; S.cd = LEVEL_OPTICS.cd;
    S.shape = L.shape || 'conventional'; S.sigma = L.sigma || 0.6;
  }
  function opticsMatch() {
    if (S.mode !== 'puzzle') return true;
    const L = LEVELS[S.level];
    return S.tool === LEVEL_OPTICS.tool && Math.abs(S.NA - LEVEL_OPTICS.NA) < 0.004 && Math.abs(S.cd - LEVEL_OPTICS.cd) < 0.06 &&
      S.shape === (L.shape || 'conventional') && Math.abs(S.sigma - (L.sigma || 0.6)) < 0.004;
  }
  function loadPreset(name) {
    const P = PRESETS[name];
    S.mode = 'sandbox'; S.assisted = false; S.pickMode = false; S.highlight = null;
    const t = rects(P.rects);
    setTarget(P.rects.length ? t : null, null, P.anchor);
    S.mask = t.slice(); S.maskDirty = true; S.focus = 0;
    if (S.anchor) doseToSize(); else S.dose = 1;
    undo.length = 0;
    syncAll();
  }

  // ---------- simulation loop ----------
  let rafPending = false;
  function invalidate() { if (!rafPending) { rafPending = true; requestAnimationFrame(() => { rafPending = false; compute(); }); } }
  function compute() {
    if (S.maskDirty) { S.spec = C.maskSpectrum(S.mask); S.maskDirty = false; }
    C.aerial(S.spec, optics(S.focus), S.I);
    S.thr = C.T_RESIST / S.dose;
    if (S.gauges) C.measureGauges(S.I, S.thr, S.gauges);
    S.defects = S.tpx ? C.defects(S.I, S.thr, S.tpx) : [];
    renderMask(); renderWafer(); renderReadout(); renderStatus();
    scheduleSweep();
  }

  // ---------- scoring ----------
  function score() {
    if (!S.gauges) return null;
    const sc = S.gauges.filter(g => g.scored);
    if (!sc.length) return null;
    let worst = sc[0], ss = 0;
    for (const g of sc) { ss += g.epe * g.epe; if (Math.abs(g.epe) > Math.abs(worst.epe)) worst = g; }
    const rms = Math.sqrt(ss / sc.length);
    const pct = 100 * Math.abs(worst.epe) / C.CD_CELLS;
    const nDef = S.defects.length;
    const stars = nDef ? 0 : pct <= 10.0001 ? 3 : pct <= 15.0001 ? 2 : pct <= 25.0001 ? 1 : 0;
    return { worst, rms, pct, stars, nDef, sc };
  }
  const sevOf = pct => pct <= 10 ? 'ok' : pct <= 25 ? 'warn' : 'bad';

  // ---------- canvases ----------
  const maskCv = $('maskCanvas'), waferCv = $('waferCanvas'), bossCv = $('bossung'), pupilCv = $('pupil');
  const dpr = () => Math.min(2, window.devicePixelRatio || 1);
  function fitCanvas(cv) {
    const r = cv.getBoundingClientRect();
    const w = Math.max(64, Math.round(r.width * dpr())), h = Math.max(40, Math.round(r.height * dpr()));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; return true; }
    return false;
  }
  const ro = new ResizeObserver(() => {
    const a = fitCanvas(maskCv), b = fitCanvas(waferCv), c = fitCanvas(bossCv);
    if (a) renderMask(); if (b) renderWafer(); if (c) drawBossung();
  });
  [maskCv, waferCv, bossCv].forEach(c => ro.observe(c));

  function tget(t, x, y) { return t[(((y % G) + G) % G) * G + (((x % G) + G) % G)]; }
  function outline(ctx, t, s, color, lw, dash) {
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.setLineDash(dash || []); ctx.beginPath();
    for (let i = 0; i < G; i++) {
      let j = 0;
      while (j < G) {
        if (tget(t, i - 1, j) === tget(t, i, j)) { j++; continue; }
        const j0 = j; while (j < G && tget(t, i - 1, j) !== tget(t, i, j)) j++;
        ctx.moveTo(i * s, j0 * s); ctx.lineTo(i * s, j * s);
      }
    }
    for (let j = 0; j < G; j++) {
      let i = 0;
      while (i < G) {
        if (tget(t, i, j - 1) === tget(t, i, j)) { i++; continue; }
        const i0 = i; while (i < G && tget(t, i, j - 1) !== tget(t, i, j)) i++;
        ctx.moveTo(i0 * s, j * s); ctx.lineTo(i * s, j * s);
      }
    }
    ctx.stroke(); ctx.restore();
  }
  // marching squares on the sim grid (periodic), drawn in cell units * s
  function contour(ctx, I, thr, s, color, lw) {
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.beginPath();
    const P = (x, y) => [((x + 0.5) / 2) * s, ((y + 0.5) / 2) * s];
    const seg = (a, b) => { const p = P(a[0], a[1]), q = P(b[0], b[1]); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); };
    for (let y = -1; y < N; y++) {
      const y0 = (y + N) % N, y1 = (y + 1) % N;
      for (let x = -1; x < N; x++) {
        const x0 = (x + N) % N, x1 = (x + 1) % N;
        const a = I[y0 * N + x0] - thr, b = I[y0 * N + x1] - thr, c = I[y1 * N + x1] - thr, d = I[y1 * N + x0] - thr;
        const idx = (a > 0 ? 1 : 0) | (b > 0 ? 2 : 0) | (c > 0 ? 4 : 0) | (d > 0 ? 8 : 0);
        if (idx === 0 || idx === 15) continue;
        const Tp = () => [x + a / (a - b), y], Rp = () => [x + 1, y + b / (b - c)], Bp = () => [x + d / (d - c), y + 1], Lp = () => [x, y + a / (a - d)];
        switch (idx) {
          case 1: case 14: seg(Lp(), Tp()); break;
          case 2: case 13: seg(Tp(), Rp()); break;
          case 3: case 12: seg(Lp(), Rp()); break;
          case 4: case 11: seg(Rp(), Bp()); break;
          case 6: case 9: seg(Tp(), Bp()); break;
          case 7: case 8: seg(Lp(), Bp()); break;
          case 5: if (a + b + c + d > 0) { seg(Tp(), Rp()); seg(Lp(), Bp()); } else { seg(Lp(), Tp()); seg(Rp(), Bp()); } break;
          case 10: if (a + b + c + d > 0) { seg(Lp(), Tp()); seg(Rp(), Bp()); } else { seg(Tp(), Rp()); seg(Lp(), Bp()); } break;
        }
      }
    }
    ctx.stroke(); ctx.restore();
  }
  function roiShade(ctx, s, W) {
    if (!S.rois) return;
    ctx.save(); ctx.fillStyle = VPC.roiShade; ctx.beginPath(); ctx.rect(0, 0, W, W);
    for (const [x, y, w, h] of S.rois) ctx.rect(x * s, y * s, w * s, h * s);
    ctx.fill('evenodd'); ctx.restore();
  }
  function scaleBar(ctx, s, W) {
    const field = VIEW.n * cellNm(), target = field * 0.22;
    const p = Math.pow(10, Math.floor(Math.log10(target)));
    const L = [1, 2, 5, 10].map(m => m * p).reduce((a, v) => Math.abs(v - target) < Math.abs(a - target) ? v : a);
    const px = L / cellNm() * s, d = dpr(), x0 = 12 * d, y0 = W - 12 * d;
    ctx.save();
    ctx.fillStyle = 'rgba(10,12,16,0.72)'; ctx.fillRect(x0 - 6 * d, y0 - 22 * d, px + 12 * d + 44 * d, 28 * d);
    ctx.strokeStyle = VPC.text; ctx.lineWidth = 2 * d; ctx.beginPath();
    ctx.moveTo(x0, y0 - 4 * d); ctx.lineTo(x0, y0); ctx.lineTo(x0 + px, y0); ctx.lineTo(x0 + px, y0 - 4 * d); ctx.stroke();
    ctx.fillStyle = VPC.text; ctx.font = `500 ${11 * d}px "IBM Plex Mono", monospace`; ctx.textBaseline = 'alphabetic';
    ctx.fillText(`${L >= 1 ? L : L.toFixed(1)} nm`, x0 + px + 6 * d, y0 + 1 * d);
    ctx.restore();
  }

  function renderMask() {
    const ctx = maskCv.getContext('2d'), W = maskCv.width, s = W / VIEW.n, d = dpr(), F = G * s;
    ctx.fillStyle = VPC.bg; ctx.fillRect(0, 0, W, W);
    ctx.save(); ctx.translate(-Math.round(VIEW.x0 * s), -Math.round(VIEW.y0 * s));
    if (s >= 4) {
      ctx.lineWidth = 1; ctx.strokeStyle = VPC.grid; ctx.beginPath();
      for (let i = 1; i < G; i++) if (i % 4) { const p = Math.round(i * s) + 0.5; ctx.moveTo(p, 0); ctx.lineTo(p, F); ctx.moveTo(0, p); ctx.lineTo(F, p); }
      ctx.stroke(); ctx.strokeStyle = VPC.gridCD; ctx.beginPath();
      for (let i = 4; i < G; i += 4) { const p = Math.round(i * s) + 0.5; ctx.moveTo(p, 0); ctx.lineTo(p, F); ctx.moveTo(0, p); ctx.lineTo(F, p); }
      ctx.stroke();
    }
    // openings, merged per row-run
    ctx.fillStyle = VPC.open;
    for (let y = 0; y < G; y++) {
      let x = 0;
      while (x < G) {
        if (!S.mask[y * G + x]) { x++; continue; }
        const x0 = x; while (x < G && S.mask[y * G + x]) x++;
        const X0 = Math.round(x0 * s), X1 = Math.round(x * s), Y0 = Math.round(y * s), Y1 = Math.round((y + 1) * s);
        ctx.fillRect(X0, Y0, X1 - X0, Y1 - Y0);
      }
    }
    // OPC additions / removals vs target
    if (S.target) {
      ctx.fillStyle = 'rgba(255,173,42,0.55)';
      for (let i = 0; i < G * G; i++) if (S.mask[i] && !S.target[i]) { const x = i % G, y = (i / G) | 0; ctx.fillRect(Math.round(x * s), Math.round(y * s), Math.round((x + 1) * s) - Math.round(x * s), Math.round((y + 1) * s) - Math.round(y * s)); }
    }
    roiShade(ctx, s, F);
    if (S.target) outline(ctx, S.target, s, VPC.target, 1.5 * d, [4 * d, 3 * d]);
    contour(ctx, S.I, S.thr, s, VPC.print, 1.6 * d);
    if (S.anchor) drawAnchor(ctx, s, d);
    if (S.hover && !S.busy) {
      const b = S.brush, o = Math.floor((b - 1) / 2);
      ctx.save(); ctx.strokeStyle = S.pickMode ? VPC.target : (S.paint ? '#ffffff' : VPC.bad); ctx.lineWidth = 1.5 * d;
      ctx.strokeRect((S.hover.x - (S.pickMode ? 0 : o)) * s + 0.5, (S.hover.y - (S.pickMode ? 0 : o)) * s + 0.5, (S.pickMode ? 1 : b) * s - 1, (S.pickMode ? 1 : b) * s - 1);
      ctx.restore();
    }
    ctx.restore();
    scaleBar(ctx, s, W);
  }
  function drawAnchor(ctx, s, d) {
    const a = S.anchor, h = a.dir === 'h';
    const x0 = (h ? a.x - a.w / 2 : a.x) * s, y0 = (h ? a.y : a.y - a.w / 2) * s;
    const x1 = (h ? a.x + a.w / 2 : a.x) * s, y1 = (h ? a.y : a.y + a.w / 2) * s;
    ctx.save(); ctx.strokeStyle = VPC.target; ctx.fillStyle = VPC.target; ctx.lineWidth = 1.2 * d; ctx.setLineDash([2 * d, 2 * d]);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.setLineDash([]);
    const tk = 5 * d;
    ctx.beginPath();
    if (h) { ctx.moveTo(x0, y0 - tk); ctx.lineTo(x0, y0 + tk); ctx.moveTo(x1, y1 - tk); ctx.lineTo(x1, y1 + tk); }
    else { ctx.moveTo(x0 - tk, y0); ctx.lineTo(x0 + tk, y0); ctx.moveTo(x1 - tk, y1); ctx.lineTo(x1 + tk, y1); }
    ctx.stroke();
    ctx.font = `600 ${10 * d}px "IBM Plex Mono", monospace`; ctx.textBaseline = 'bottom';
    ctx.fillText('CD', (h ? x1 : x1) + 4 * d, (h ? y1 : y1) - 2 * d);
    ctx.restore();
  }

  // inferno-like LUT for the aerial image
  const LUT = (() => {
    const stops = [[0, [0, 0, 4]], [0.13, [27, 12, 65]], [0.25, [74, 12, 107]], [0.38, [120, 28, 109]], [0.5, [165, 44, 96]], [0.63, [207, 68, 70]], [0.75, [237, 105, 37]], [0.88, [251, 155, 6]], [1, [252, 255, 164]]];
    const lut = new Uint8ClampedArray(256 * 3);
    for (let i = 0; i < 256; i++) {
      const t = i / 255; let k = 0; while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
      const [t0, c0] = stops[k], [t1, c1] = stops[k + 1], f = (t - t0) / (t1 - t0);
      for (let c = 0; c < 3; c++) lut[i * 3 + c] = c0[c] + (c1[c] - c0[c]) * f;
    }
    return lut;
  })();
  let off = null, offCtx = null, offImg = null;
  function renderWafer() {
    const ctx = waferCv.getContext('2d'), W = waferCv.width, d = dpr();
    const R = Math.min(W, 640);
    if (!off || off.width !== R) { off = document.createElement('canvas'); off.width = off.height = R; offCtx = off.getContext('2d'); offImg = offCtx.createImageData(R, R); }
    const px = offImg.data, I = S.I, thr = S.thr, tg = S.target, aerialView = S.view === 'aerial';
    const sc = VIEW.n / R;
    for (let Y = 0; Y < R; Y++) {
      const yc = VIEW.y0 + (Y + 0.5) * sc, sy = yc * 2 - 0.5, fy = Math.floor(sy), ty = sy - fy;
      const y0 = ((fy % N) + N) % N, y1 = (y0 + 1) % N, cy = ((yc | 0) % G + G) % G;
      for (let X = 0; X < R; X++) {
        const xc = VIEW.x0 + (X + 0.5) * sc, sx = xc * 2 - 0.5, fx = Math.floor(sx), tx = sx - fx;
        const x0 = ((fx % N) + N) % N, x1 = (x0 + 1) % N;
        const v = (I[y0 * N + x0] * (1 - tx) + I[y0 * N + x1] * tx) * (1 - ty) + (I[y1 * N + x0] * (1 - tx) + I[y1 * N + x1] * tx) * ty;
        const o = (Y * R + X) * 4;
        let r, g, b;
        if (aerialView) {
          const li = Math.max(0, Math.min(255, (Math.pow(Math.max(0, v) / 1.1, 0.7) * 255) | 0)); r = LUT[li * 3]; g = LUT[li * 3 + 1]; b = LUT[li * 3 + 2];
        } else {
          const printed = v > thr, inT = tg ? tg[cy * G + (((xc | 0) % G + G) % G)] : printed;
          if (printed) {
            const f = Math.min(1, (v - thr) / (0.9 * thr + 0.05));
            if (inT) { r = 214 + 32 * f; g = 136 + 52 * f; b = 34 + 44 * f; }
            else { r = 196 + 30 * f; g = 92 + 20 * f; b = 210 + 20 * f; } // printed where it should not: violet
          } else {
            const glow = Math.min(1, v / thr); const gl = glow * glow * 46;
            r = 24 + gl * 0.9; g = 28 + gl * 0.55; b = 36 + gl * 0.2;
            if (inT && (((X + Y) / (R / 160)) | 0) % 4 < 2) { r = 150; g = 46; b = 52; } // missing: red hatch
          }
        }
        px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = 255;
      }
    }
    offCtx.putImageData(offImg, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.drawImage(off, 0, 0, W, W);
    const s = W / VIEW.n;
    ctx.save(); ctx.translate(-VIEW.x0 * s, -VIEW.y0 * s);
    roiShade(ctx, s, G * s);
    if (aerialView) contour(ctx, I, thr, s, '#ffffff', 1.4 * d);
    if (S.target) outline(ctx, S.target, s, VPC.target, 1.4 * d, [4 * d, 3 * d]);
    if (!aerialView && S.gauges) drawGauges(ctx, s, d);
    drawDefects(ctx, s, d);
    if (S.highlight) {
      ctx.save(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2 * d; ctx.beginPath(); ctx.arc(S.highlight.x * s, S.highlight.y * s, 4.5 * s, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    ctx.restore();
    scaleBar(ctx, s, W);
    renderLegend();
  }
  function drawGauges(ctx, s, d) {
    ctx.save(); ctx.lineCap = 'round';
    for (const g of S.gauges) {
      const pct = 100 * Math.abs(g.epe) / C.CD_CELLS;
      const col = !g.scored ? 'rgba(225,229,236,0.25)' : VPC[sevOf(pct)];
      const x0 = g.x * s, y0 = g.y * s, x1 = (g.x + g.nx * g.epe) * s, y1 = (g.y + g.ny * g.epe) * s;
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2.2 * d;
      if (Math.abs(g.epe) * s > 1.5 * d) { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
      ctx.beginPath(); ctx.arc(x0, y0, 1.8 * d, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  const DEFECT_LABEL = { bridge: 'BRIDGE', break: 'BREAK', missing: 'MISSING', stray: 'STRAY PRINT' };
  function drawDefects(ctx, s, d) {
    if (!S.defects.length) return;
    ctx.save(); ctx.font = `600 ${10 * d}px "IBM Plex Mono", monospace`; ctx.textBaseline = 'middle';
    for (const f of S.defects) {
      const x = f.x * s, y = f.y * s;
      ctx.strokeStyle = VPC.bad; ctx.lineWidth = 2 * d; ctx.setLineDash([3 * d, 2 * d]);
      ctx.beginPath(); ctx.arc(x, y, Math.max(14 * d, 3.5 * s), 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      const label = DEFECT_LABEL[f.type], tw = ctx.measureText(label).width + 10 * d;
      const bx0 = VIEW.x0 * s, bx1 = (VIEW.x0 + VIEW.n) * s, by0 = VIEW.y0 * s;
      const lx = Math.min(bx1 - tw - 4 * d, Math.max(bx0 + 4 * d, x - tw / 2)), ly = Math.max(by0 + 10 * d, y - Math.max(14 * d, 3.5 * s) - 10 * d);
      ctx.fillStyle = VPC.bad; ctx.fillRect(lx, ly - 8 * d, tw, 16 * d);
      ctx.fillStyle = '#1a0606'; ctx.fillText(label, lx + 5 * d, ly);
    }
    ctx.restore();
  }
  function renderLegend() {
    const el = $('legend');
    const html = S.view === 'aerial'
      ? `<span><i style="background:linear-gradient(90deg,#000004,#781c6d,#ed6925,#fcffa4)"></i>intensity 0 → 1.1 × clear field</span><span><i style="background:#fff"></i>print threshold</span>`
      : `<span><i style="background:#e2a03c"></i>printed</span><span><i style="background:#962e34"></i>missing</span><span><i style="background:#c862d2"></i>extra</span><span><i style="background:${VPC.target}"></i>target</span><span><i style="background:${VPC.ok}"></i><i style="background:${VPC.warn};margin-left:-3px"></i><i style="background:${VPC.bad};margin-left:-3px"></i>edge-error gauges</span>`;
    if (el.innerHTML !== html) el.innerHTML = html;
  }

  // ---------- readout ----------
  const KIND_LABEL = (k, e) => {
    if (k === 'line end') return e < 0 ? 'Line-end pullback' : 'Line-end overshoot';
    if (k === 'corner') return e < 0 ? 'Corner rounding' : 'Corner bulge';
    if (k === 'inner corner') return e > 0 ? 'Inner-corner fill-in' : 'Inner-corner undercut';
    return e < 0 ? 'Edge printing inside' : 'Edge printing outside';
  };
  function renderReadout() {
    const sc = score(), cn = cellNm();
    const starEls = $('stars').children;
    const stars = sc ? sc.stars : 0;
    for (let i = 0; i < 3; i++) starEls[i].className = i < stars ? 'on' : '';
    $('stars').setAttribute('aria-label', `${stars} of 3 stars`);
    const match = opticsMatch();
    $('mismatch').hidden = match || S.mode !== 'puzzle';
    const tol = [25, 15, 10].map(p => fmt(p / 100 * S.cd, 1));
    $('specLine').textContent = sc ? `Spec: ★ ≤ ${tol[0]} nm · ★★ ≤ ${tol[1]} nm · ★★★ ≤ ${tol[2]} nm worst edge error, and no bridges, breaks or stray prints.` : '';

    // edits vs target
    if (S.target) {
      let add = 0, rem = 0; for (let i = 0; i < G * G; i++) { if (S.mask[i] && !S.target[i]) add++; else if (!S.mask[i] && S.target[i]) rem++; }
      $('mCells').textContent = `+${add} −${rem}`; $('mCellsSub').textContent = 'cells added / removed';
    } else { let n = 0; for (let i = 0; i < G * G; i++) n += S.mask[i]; $('mCells').textContent = String(n); $('mCellsSub').textContent = 'open cells'; }

    const hot = $('hotspots');
    if (!sc) {
      $('mWorst').textContent = '–'; $('mWorstSub').textContent = ''; $('mRms').textContent = '–'; $('mRmsSub').textContent = '';
      $('verdictMain').textContent = 'No target to score';
      $('verdictSub').textContent = 'Paint a pattern, then press “Set mask as target”. Its edges become the gauges you correct against.';
      hot.innerHTML = '<li><span class="dot" style="background:var(--line)"></span><span class="what">Hotspots appear once a target is set.</span><span></span></li>';
      return;
    }
    const w = sc.worst;
    $('mWorst').textContent = `${signed(w.epe * cn)} nm`;
    $('mWorst').className = 'c-' + sevOf(sc.pct);
    $('mWorstSub').textContent = `${Math.round(sc.pct)}% of CD · ${w.kind}`;
    $('mRms').textContent = `${fmt(sc.rms * cn)} nm`; $('mRms').className = '';
    $('mRmsSub').textContent = `${sc.sc.length} gauges`;

    let main, sub;
    if (sc.nDef) {
      const f = S.defects[0];
      main = { bridge: 'Bridge: two features merged.', break: 'Break: a feature pinched in two.', missing: 'A feature failed to print.', stray: 'Stray print: light printed where nothing should be.' }[f.type];
      sub = f.type === 'stray' ? 'Assist features must stay below the print threshold. Make them thinner or move them away.' : f.type === 'bridge' ? 'On a chip this is a short circuit. Pull the corrections back from the gap.' : 'Raise the dose or widen the feature on the mask.';
    } else if (stars === 0) {
      main = `Not in spec yet. Worst error ${signed(w.epe * cn)} nm at a ${w.kind}.`;
      sub = w.epe < 0 ? 'Negative means the print falls short of the target edge: add mask area near it.' : 'Positive means the print spills past the target edge: remove mask area near it.';
    } else if (stars === 3) { main = 'Production-grade OPC.'; sub = 'Every gauge is within 10% of CD. Real tools do this for about 10¹⁰ edges per chip.'; }
    else if (stars === 2) { main = 'In spec, with margin.'; sub = `Bring the worst gauge under ${tol[2]} nm for three stars.`; }
    else { main = 'In spec.'; sub = `Bring the worst gauge under ${tol[1]} nm for two stars.`; }
    if (S.assisted) sub = (S.assisted === 'solution' ? 'Solution loaded for reference. ' : 'Auto-OPC result, for reference. ') + 'Stars are not recorded until you press Reset. ' + sub;
    $('verdictMain').textContent = main; $('verdictSub').textContent = sub;

    if (S.mode === 'puzzle' && match && !S.assisted && stars > best[S.level]) { best[S.level] = stars; saveBest(); renderLevels(); }

    // hotspot list: defects first, then the worst gauge of each kind
    const items = S.defects.map(f => ({ sev: 'bad', title: DEFECT_LABEL[f.type][0] + DEFECT_LABEL[f.type].slice(1).toLowerCase(), sub: 'defect', v: '!', x: f.x, y: f.y }));
    const byKind = new Map();
    for (const g of sc.sc) { const k = g.kind + (g.epe < 0 ? '-' : '+'); if (!byKind.has(k) || Math.abs(g.epe) > Math.abs(byKind.get(k).epe)) byKind.set(k, g); }
    [...byKind.values()].sort((a, b) => Math.abs(b.epe) - Math.abs(a.epe)).forEach(g => {
      const pct = 100 * Math.abs(g.epe) / C.CD_CELLS;
      if (pct < 2.5) return;
      items.push({ sev: sevOf(pct), title: KIND_LABEL(g.kind, g.epe), sub: `${Math.round(pct)}% of CD`, v: `${signed(g.epe * cn)} nm`, x: g.x, y: g.y });
    });
    if (!items.length) items.push({ sev: 'ok', title: 'All edges on target', sub: 'every gauge within 2.5% of CD', v: '✓' });
    hot.innerHTML = items.slice(0, 6).map((it, i) => `<li data-i="${i}"><span class="dot sev-${it.sev}"></span><span class="what">${it.title}<small>${it.sub}</small></span><span class="v c-${it.sev}">${it.v}</span></li>`).join('');
    hot._items = items;
  }
  $('hotspots').addEventListener('pointerover', e => {
    const li = e.target.closest('li'); if (!li || !$('hotspots')._items) return;
    const it = $('hotspots')._items[+li.dataset.i]; if (!it || it.x === undefined) return;
    S.highlight = { x: it.x, y: it.y }; renderWafer();
  });
  $('hotspots').addEventListener('pointerleave', () => { if (S.highlight) { S.highlight = null; renderWafer(); } });

  function renderStatus() {
    const t = T();
    $('status').innerHTML = `<span class="${S.tool === 'euv' ? 'euv' : ''}"><b>${t.short}</b> ${t.lambda} nm</span><span>NA <b>${fmt(S.NA, 2)}</b></span><span>k1 <b>${fmt(k1(), 2)}</b></span><span>CD <b>${fmt(S.cd, 1)} nm</b></span><span>${SHAPE_NAME[S.shape].toLowerCase()} σ <b>${fmt(S.sigma, 2)}</b></span><span>dose <b>${fmt(S.dose, 2)}×</b></span><span>focus <b>${Math.round(S.focus)} nm</b></span>`;
  }

  // ---------- Bossung sweep ----------
  function scheduleSweep() { clearTimeout(sweepTimer); sweepGen++; const gen = sweepGen; sweepTimer = setTimeout(() => runSweep(gen), 260); }
  function runSweep(gen) {
    if (!S.anchor) { bossung = null; drawBossung(); updateDof(); return; }
    const a = S.anchor, zr = zR(), K = 12, dz = zr / 4, doses = [0.95, 1, 1.05];
    const pts = []; let k = 0;
    const spec = S.spec, opt0 = optics(0);
    const step = () => {
      if (gen !== sweepGen) return;
      const z = k * dz;
      const I = C.aerial(spec, { ...opt0, z }, sweepBuf);
      pts.push({ z, w: doses.map(m => C.measureWidth(I, C.T_RESIST / (S.dose * m), a.x, a.y, a.dir) * cellNm()) });
      k++;
      if (k <= K) setTimeout(step, 0);
      else { bossung = { pts, target: a.w * cellNm(), zmax: K * dz }; drawBossung(); updateDof(); }
    };
    step();
  }
  function computeDof() {
    if (!bossung) return null;
    const { pts, target } = bossung;
    const err = p => Math.abs(p.w[1] - target) / target;
    if (err(pts[0]) > 0.1) return { dof: 0, open: false };
    for (let i = 1; i < pts.length; i++) {
      const e0 = err(pts[i - 1]), e1 = err(pts[i]);
      if (e1 > 0.1) { const z = pts[i - 1].z + (pts[i].z - pts[i - 1].z) * (0.1 - e0) / (e1 - e0); return { dof: 2 * z, open: false }; }
    }
    return { dof: 2 * pts[pts.length - 1].z, open: true };
  }
  function updateDof() {
    const r = computeDof();
    if (!r) { $('dofOut').textContent = '–'; $('dofSub').textContent = S.mode === 'sandbox' ? 'Press “Pick CD site” and click a feature to plot CD through focus.' : 'depth of focus'; return; }
    $('dofOut').textContent = r.dof === 0 ? '0 nm' : `${r.open ? '> ' : ''}${Math.round(r.dof)} nm`;
    $('dofSub').textContent = r.dof === 0
      ? `No window: the CD site is already more than 10% off ${fmt(bossung.target, 1)} nm at best focus. Try Dose to size.`
      : `depth of focus: CD at the site stays within ±10% of ${fmt(bossung.target, 1)} nm. Rayleigh unit λ/NA² = ${Math.round(T().lambda / (S.NA * S.NA))} nm.`;
  }
  function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  function drawBossung() {
    const cv = bossCv, ctx = cv.getContext('2d'), W = cv.width, H = cv.height, d = dpr();
    ctx.clearRect(0, 0, W, H);
    const fg = cssVar('--fg'), muted = cssVar('--muted'), line = cssVar('--line'), acc = cssVar('--accent'), ok = cssVar('--ok');
    const padL = 38 * d, padR = 10 * d, padT = 10 * d, padB = 24 * d;
    const pw = W - padL - padR, ph = H - padT - padB;
    ctx.font = `400 ${10 * d}px "IBM Plex Mono", monospace`;
    if (!bossung) {
      ctx.fillStyle = muted; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(S.anchor ? 'sweeping focus…' : 'no CD site set', W / 2, H / 2);
      return;
    }
    const { pts, target, zmax } = bossung;
    const yLo = target * 0.5, yHi = target * 1.5;
    const X = z => padL + (z + zmax) / (2 * zmax) * pw, Y = v => padT + (1 - (Math.max(yLo, Math.min(yHi, v)) - yLo) / (yHi - yLo)) * ph;
    // spec band
    ctx.fillStyle = ok; ctx.globalAlpha = 0.12; ctx.fillRect(padL, Y(target * 1.1), pw, Y(target * 0.9) - Y(target * 1.1)); ctx.globalAlpha = 1;
    // DOF window
    const r = computeDof();
    if (r && r.dof > 0) { ctx.fillStyle = acc; ctx.globalAlpha = 0.14; ctx.fillRect(X(-r.dof / 2), padT, X(r.dof / 2) - X(-r.dof / 2), ph); ctx.globalAlpha = 1; }
    // axes + grid
    ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.beginPath();
    ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + ph); ctx.lineTo(padL + pw, padT + ph); ctx.stroke();
    ctx.fillStyle = muted; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (const v of [yLo, target, yHi]) { ctx.fillText(fmt(v, v < 10 ? 1 : 0), padL - 5 * d, Y(v)); }
    ctx.setLineDash([2 * d, 3 * d]); ctx.beginPath(); ctx.moveTo(padL, Y(target)); ctx.lineTo(padL + pw, Y(target)); ctx.stroke(); ctx.setLineDash([]);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const raw = zmax / 2, p10 = Math.pow(10, Math.floor(Math.log10(raw)));
    const stepZ = [1, 2, 2.5, 5, 10].map(m => m * p10).find(v => v >= raw * 0.8) || 10 * p10;
    for (let z = -Math.floor(zmax / stepZ) * stepZ; z <= zmax + 1e-6; z += stepZ) ctx.fillText(String(Math.round(z)), X(z), padT + ph + 5 * d);
    ctx.save(); ctx.translate(9 * d, padT + ph / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('CD nm', 0, 0); ctx.restore();
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText('focus nm', padL + pw, padT + ph - 3 * d);
    // curves (mirror: image is symmetric through focus)
    const curve = (idx, color, lw, alpha) => {
      ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.globalAlpha = alpha; ctx.beginPath();
      const seq = [...pts.slice(1).reverse().map(p => ({ z: -p.z, w: p.w[idx] })), ...pts.map(p => ({ z: p.z, w: p.w[idx] }))];
      let pen = false;
      for (const p of seq) { const x = X(p.z), y = Y(p.w); if (p.w <= 0.01) { pen = false; continue; } if (!pen) { ctx.moveTo(x, y); pen = true; } else ctx.lineTo(x, y); }
      ctx.stroke(); ctx.restore();
    };
    curve(0, fg, 1.2 * d, 0.35); curve(2, fg, 1.2 * d, 0.35); curve(1, acc, 2.2 * d, 1);
    // current focus marker
    const fz = Math.max(-zmax, Math.min(zmax, S.focus));
    ctx.strokeStyle = fg; ctx.lineWidth = 1.2 * d; ctx.beginPath(); ctx.moveTo(X(fz), padT); ctx.lineTo(X(fz), padT + ph); ctx.stroke();
    ctx.fillStyle = muted; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('dose ±5%', padL + 6 * d, padT + 3 * d);
  }

  // ---------- pupil diagram ----------
  function drawPupil() {
    const cv = pupilCv, ctx = cv.getContext('2d'), W = cv.width, c = W / 2, R = W / 2 - 10;
    const fg = cssVar('--fg'), muted = cssVar('--muted'), line = cssVar('--line'), acc = cssVar('--accent'), surf = cssVar('--surface-2');
    ctx.clearRect(0, 0, W, W);
    ctx.fillStyle = surf; ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = muted; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(c - R, c); ctx.lineTo(c + R, c); ctx.moveTo(c, c - R); ctx.lineTo(c, c + R); ctx.stroke();
    ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(c, c, R * S.sigma, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    const pts = srcPts(), maxW = Math.max(...pts.map(p => p.w));
    ctx.fillStyle = acc;
    for (const p of pts) { ctx.beginPath(); ctx.arc(c + p.sx * R, c - p.sy * R, 3 + 5 * Math.sqrt(p.w / maxW), 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = fg; ctx.font = '600 20px "IBM Plex Mono", monospace'; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText('NA', W - 6, 4);
  }
  const SHAPE_ICON = {
    conventional: '<circle cx="9" cy="9" r="4.5" fill="currentColor"/>',
    annular: '<circle cx="9" cy="9" r="5.2" fill="none" stroke="currentColor" stroke-width="2.4"/>',
    'dipole-x': '<circle cx="4.6" cy="9" r="2.2" fill="currentColor"/><circle cx="13.4" cy="9" r="2.2" fill="currentColor"/>',
    'dipole-y': '<circle cx="9" cy="4.6" r="2.2" fill="currentColor"/><circle cx="9" cy="13.4" r="2.2" fill="currentColor"/>',
    quadrupole: '<circle cx="5.6" cy="5.6" r="1.9" fill="currentColor"/><circle cx="12.4" cy="5.6" r="1.9" fill="currentColor"/><circle cx="5.6" cy="12.4" r="1.9" fill="currentColor"/><circle cx="12.4" cy="12.4" r="1.9" fill="currentColor"/>',
  };
  $('shapeSeg').innerHTML = SHAPES.map(([k, n]) => `<button role="radio" data-shape="${k}" aria-checked="false"><svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="8" fill="none" stroke="currentColor" stroke-opacity="0.45"/>${SHAPE_ICON[k]}</svg>${n}</button>`).join('');

  // ---------- trade-off table ----------
  function renderTrade() {
    const rows = [['ArF-i 1.35', 193, 1.35, 'arf'], ['EUV 0.33', 13.5, 0.33, 'euv'], ['High-NA 0.55', 13.5, 0.55, 'euv']];
    const isStd = rows.some(r => r[3] === S.tool && Math.abs(r[2] - S.NA) < 0.004);
    if (!isStd) rows.push([`Yours ${fmt(S.NA, 2)}`, T().lambda, S.NA, S.tool]);
    const maxR = Math.max(...rows.map(r => r[1] / r[2])), maxD = Math.max(...rows.map(r => r[1] / r[2] / r[2]));
    const grp = (fn, max, d) => rows.map(([n, l, na, tk]) => {
      const v = fn(l, na), cur = tk === S.tool && Math.abs(na - S.NA) < 0.004;
      return `<div class="trow ${tk}${cur ? ' cur' : ''}"><span>${n}</span><span class="track"><i style="width:${(100 * v / max).toFixed(1)}%"></i></span><b>${fmt(v, d)} nm</b></div>`;
    }).join('');
    $('tradeRes').innerHTML = grp((l, na) => l / na, maxR, 1);
    $('tradeDof').innerHTML = grp((l, na) => l / na / na, maxD, 0);
    $('tradeNote').textContent = 'EUV 0.33 → 0.55 NA: features 1.67× finer, focus budget 2.78× shallower.';
  }

  // ---------- controls ----------
  function setRadio(groupId, attr, value) {
    for (const b of $(groupId).querySelectorAll('button')) b.setAttribute(b.getAttribute('role') === 'radio' ? 'aria-checked' : 'aria-pressed', String(b.dataset[attr] === String(value)));
  }
  let noteTimer = 0;
  function showNote(text, bad) {
    const n = $('toolNote'); n.textContent = text; n.className = 'note' + (bad ? ' bad' : ''); n.hidden = false;
    clearTimeout(noteTimer); noteTimer = setTimeout(() => { n.hidden = true; }, 6000);
  }
  // keep the physical feature size while the optics change; clamp k1 into range
  function holdCD(prevK1, reason) {
    const t = T(), lna = t.lambda / S.NA;
    let k = S.cd * S.NA / t.lambda, clamped = '';
    if (k > K1_MAX) { k = K1_MAX; clamped = ' (capped at k1 = 1.00, the pattern is far above the resolution limit)'; }
    if (k < K1_MIN) { k = K1_MIN; clamped = ' (held at the k1 = 0.10 floor)'; }
    const cd0 = S.cd; S.cd = k * lna;
    if (reason && Math.abs(k - prevK1) > 0.005) {
      const txt = clamped ? `k1 ${fmt(prevK1, 2)} → ${fmt(k, 2)}${clamped}; CD now ${fmt(S.cd, 1)} nm.` : `Same ${fmt(cd0, 1)} nm feature: k1 ${fmt(prevK1, 2)} → ${fmt(k, 2)}.` + (k < 0.25 ? ' That is below the 0.25 single-exposure limit, so expect it to blur out.' : '');
      showNote(txt, k < 0.25);
    }
  }
  function syncControls() {
    const t = T();
    setRadio('modeSeg', 'mode', S.mode);
    setRadio('toolSeg', 'tool', S.tool);
    const na = $('na'); na.min = t.naMin; na.max = t.naMax; na.value = S.NA; $('naOut').textContent = fmt(S.NA, 2);
    $('naChips').innerHTML = t.presets.map(p => `<button class="chip" data-na="${p}" aria-pressed="${Math.abs(p - S.NA) < 0.004}">${p.toFixed(2)}${S.tool === 'euv' ? (p === 0.55 ? ' High-NA' : ' NXE') : ' immersion'}</button>`).join('');
    $('k1').value = k1(); $('k1Out').textContent = fmt(k1(), 2);
    $('cdOut').textContent = `${fmt(S.cd, 1)} nm`; $('lnaOut').textContent = `${fmt(t.lambda / S.NA, 1)} nm`;
    $('cellNm').textContent = `1 cell = ${fmt(cellNm(), 2)} nm`;
    setRadio('shapeSeg', 'shape', S.shape);
    $('sigma').value = S.sigma; $('sigmaOut').textContent = fmt(S.sigma, 2);
    $('dose').value = S.dose; $('doseOut').textContent = `${fmt(S.dose, 2)}×`;
    const fr = Math.round(2.5 * zR() / 5) * 5; const f = $('focus'); f.min = -fr; f.max = fr;
    S.focus = Math.max(-fr, Math.min(fr, S.focus)); f.value = S.focus; $('focusOut').textContent = `${Math.round(S.focus)} nm`;
    $('zrNote').textContent = `Rayleigh unit ≈ ${Math.round(zR())} nm`;
    setRadio('paintSeg', 'paint', S.paint ? 1 : 0);
    setRadio('brushSeg', 'b', S.brush);
    setRadio('viewSeg', 'view', S.view);
    $('pickSite').setAttribute('aria-pressed', String(S.pickMode));
    $('undoBtn').disabled = !undo.length;
    $('opcBtn').disabled = !S.target;
    drawPupil(); renderTrade();
  }
  function renderLevels() {
    $('levels').innerHTML = LEVELS.map((L, i) => `<button class="lvl" data-l="${i}" aria-current="${S.mode === 'puzzle' && S.level === i}"><span class="n">${i + 1}</span><span class="nm">${L.name}</span><span class="st" aria-label="${best[i]} of 3 stars">${[0, 1, 2].map(k => `<span class="${k < best[i] ? 'on' : ''}">★</span>`).join('')}</span></button>`).join('');
  }
  function renderBrief() {
    const puzzle = S.mode === 'puzzle';
    $('sandboxTools').hidden = puzzle;
    $('briefActions').hidden = !puzzle;
    $('levels').hidden = !puzzle;
    if (puzzle) {
      const L = LEVELS[S.level];
      $('lvlName').textContent = `${S.level + 1} · ${L.name}`;
      $('lvlBrief').textContent = L.brief;
      $('lvlGoal').textContent = `Goal: worst edge error ≤ 25% of CD (${fmt(0.25 * LEVEL_OPTICS.cd, 1)} nm) with no defects. Par: ${'★'.repeat(L.par)} with clean shapes${L.par < 3 ? '. Three stars needs scattered single-cell dust a mask shop would reject' : ''}. Dashed blue is the target; amber cells are your corrections.`;
      $('lvlHint').textContent = L.hint; $('lvlHint').hidden = true; $('hintBtn').textContent = 'Show hint';
      setSolution(false);
      $('nextBtn').disabled = S.level >= LEVELS.length - 1;
    } else {
      $('lvlName').textContent = 'Sandbox';
      $('lvlBrief').textContent = 'Load a preset or paint your own pattern. Change wavelength, NA, k1, illumination and focus freely. To score corrections, press “Set mask as target”, then edit the mask.';
      $('lvlGoal').textContent = 'Right-drag or switch to Erase to remove cells. Pick a CD site to get a Bossung plot for any feature.';
      $('lvlHint').hidden = true;
      setSolution(false);
    }
  }
  function syncAll() { syncControls(); renderLevels(); renderBrief(); invalidate(); }

  // mode
  $('modeSeg').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || S.busy) return;
    if (b.dataset.mode === 'puzzle' && S.mode !== 'puzzle') loadLevel(S.level);
    if (b.dataset.mode === 'sandbox' && S.mode !== 'sandbox') loadPreset($('preset').value);
  });
  $('levels').addEventListener('click', e => { const b = e.target.closest('.lvl'); if (b && !S.busy) loadLevel(+b.dataset.l); });
  // ---------- solution reveal ----------
  const solCv = $('solCanvas');
  let solHot = -1;
  function setSolution(open) {
    $('solution').hidden = !open;
    $('solBtn').setAttribute('aria-expanded', String(open));
    $('solBtn').textContent = open ? 'Hide solution' : 'Show solution';
    if (open) renderSolution();
  }
  function solutionMask(i) {
    const m = rects(LEVELS[i].rects);
    for (const st of SOLUTIONS[i].steps) for (const [x, y, w, h, v] of st.c) for (let j = y; j < y + h; j++) for (let k = x; k < x + w; k++) m[(((j % G) + G) % G) * G + (((k % G) + G) % G)] = v === 0 ? 0 : 1;
    return m;
  }
  function renderSolution() {
    const i = S.level, sol = SOLUTIONS[i];
    const nm = sol.pct / 100 * LEVEL_OPTICS.cd;
    $('solResult').textContent = `${'★'.repeat(sol.stars)} · worst edge error ${fmt(nm, 1)} nm (${fmt(sol.pct, 1)}% of CD) · no defects`;
    $('solWhy').textContent = sol.why;
    $('solSteps').innerHTML = sol.steps.map((st, k) => `<li tabindex="0" data-k="${k}">${st.t}${st.s ? `<small>${st.s}</small>` : ''}</li>`).join('');
    solHot = -1;
    drawSolution();
  }
  function drawSolution() {
    const i = S.level, sol = SOLUTIONS[i], [x0, y0, cw, ch] = sol.crop;
    const target = rects(LEVELS[i].rects), mask = solutionMask(i);
    const box = Math.min(300, Math.max(180, ($('solution').clientWidth || 600) - 40));
    const cell = Math.max(5, Math.floor(Math.min(box / cw, 300 / ch)));
    const W = cw * cell, H = ch * cell, d = dpr();
    solCv.style.width = W + 'px'; solCv.style.height = H + 'px';
    solCv.width = Math.round(W * d); solCv.height = Math.round(H * d);
    const ctx = solCv.getContext('2d'); ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.fillStyle = VPC.bg; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = VPC.grid; ctx.lineWidth = 1; ctx.beginPath();
    for (let k = 1; k < cw; k++) { const p = k * cell + 0.5; ctx.moveTo(p, 0); ctx.lineTo(p, H); }
    for (let k = 1; k < ch; k++) { const p = k * cell + 0.5; ctx.moveTo(0, p); ctx.lineTo(W, p); }
    ctx.stroke();
    const at = (m, x, y) => m[(((y % G) + G) % G) * G + (((x % G) + G) % G)];
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const gx = x0 + x, gy = y0 + y, t = at(target, gx, gy), m = at(mask, gx, gy), px = x * cell, py = y * cell;
      if (m && t) { ctx.fillStyle = VPC.open; ctx.fillRect(px, py, cell, cell); }
      else if (m) { ctx.fillStyle = VPC.print; ctx.fillRect(px, py, cell, cell); }
      else if (t) {
        ctx.fillStyle = '#2a1416'; ctx.fillRect(px, py, cell, cell);
        ctx.save(); ctx.beginPath(); ctx.rect(px, py, cell, cell); ctx.clip();
        ctx.strokeStyle = VPC.bad; ctx.lineWidth = 1.5; ctx.beginPath();
        for (let o = -cell; o < cell; o += 4) { ctx.moveTo(px + o, py + cell); ctx.lineTo(px + o + cell, py); }
        ctx.stroke(); ctx.restore();
      }
    }
    // target outline
    ctx.save(); ctx.translate(-x0 * cell, -y0 * cell);
    outline(ctx, target, cell, VPC.target, 1.5, [4, 3]);
    ctx.restore();
    // highlighted step
    if (solHot >= 0) {
      ctx.save(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 3;
      for (const [x, y, w, h] of sol.steps[solHot].c) {
        const cx = Math.max(x, x0), cy = Math.max(y, y0), ex = Math.min(x + w, x0 + cw), ey = Math.min(y + h, y0 + ch);
        if (ex > cx && ey > cy) ctx.strokeRect((cx - x0) * cell + 1, (cy - y0) * cell + 1, (ex - cx) * cell - 2, (ey - cy) * cell - 2);
      }
      ctx.restore();
    }
    // scale: one CD
    ctx.save(); ctx.fillStyle = 'rgba(10,12,16,0.75)'; ctx.fillRect(4, H - 22, 4 * cell + 52, 18);
    ctx.strokeStyle = VPC.text; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(9, H - 10); ctx.lineTo(9 + 4 * cell, H - 10); ctx.stroke();
    ctx.fillStyle = VPC.text; ctx.font = '500 10px "IBM Plex Mono", monospace'; ctx.textBaseline = 'middle';
    ctx.fillText('1 CD', 14 + 4 * cell, H - 12); ctx.restore();
  }
  const stepOf = e => { const li = e.target.closest && e.target.closest('li[data-k]'); return li ? +li.dataset.k : -1; };
  const hotStep = k => {
    if (k === solHot) return; solHot = k;
    for (const li of $('solSteps').children) li.classList.toggle('on', +li.dataset.k === k);
    drawSolution();
  };
  $('solSteps').addEventListener('pointerover', e => hotStep(stepOf(e)));
  $('solSteps').addEventListener('pointerleave', () => hotStep(-1));
  $('solSteps').addEventListener('focusin', e => hotStep(stepOf(e)));
  $('solSteps').addEventListener('focusout', () => hotStep(-1));
  $('solSteps').addEventListener('click', e => hotStep(stepOf(e)));
  $('solBtn').addEventListener('click', () => setSolution($('solution').hidden));
  $('solApply').addEventListener('click', () => {
    if (S.busy || S.mode !== 'puzzle') return;
    pushUndo();
    S.mask = solutionMask(S.level); S.maskDirty = true; S.assisted = 'solution';
    if (!opticsMatch() || S.dose !== S.levelDose || S.focus !== 0) { applyLevelOptics(); S.dose = S.levelDose; S.focus = 0; syncControls(); }
    invalidate();
  });
  let solW = 0;
  new ResizeObserver(() => { const w = $('solution').clientWidth; if (!$('solution').hidden && w !== solW) { solW = w; drawSolution(); } }).observe($('solution'));

  $('hintBtn').addEventListener('click', () => { const h = $('lvlHint'); h.hidden = !h.hidden; $('hintBtn').textContent = h.hidden ? 'Show hint' : 'Hide hint'; });
  $('nextBtn').addEventListener('click', () => { if (S.level < LEVELS.length - 1 && !S.busy) loadLevel(S.level + 1); });
  $('restoreBtn').addEventListener('click', () => { applyLevelOptics(); syncControls(); invalidate(); });
  $('preset').addEventListener('change', e => loadPreset(e.target.value));
  $('setTarget').addEventListener('click', () => {
    if (!S.mask.some(v => v)) { $('verdictMain').textContent = 'Nothing to use as a target'; $('verdictSub').textContent = 'Paint some openings first.'; return; }
    const keepAnchor = S.anchor;
    setTarget(S.mask.slice(), null, keepAnchor && S.mask[Math.floor(keepAnchor.y) * G + Math.floor(keepAnchor.x)] ? keepAnchor : null);
    S.assisted = false; syncControls(); invalidate();
  });
  $('pickSite').addEventListener('click', () => { S.pickMode = !S.pickMode; syncControls(); renderMask(); });

  $('toolSeg').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.dataset.tool === S.tool) return;
    const pk = k1(); S.tool = b.dataset.tool; S.NA = T().defNA; S.focus = 0; holdCD(pk, true); syncControls(); invalidate();
  });
  $('na').addEventListener('input', e => { const pk = k1(); S.NA = +e.target.value; holdCD(pk, true); syncControls(); invalidate(); });
  $('naChips').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; const pk = k1(); S.NA = +b.dataset.na; holdCD(pk, true); syncControls(); invalidate(); });
  $('k1').addEventListener('input', e => { S.cd = +e.target.value * T().lambda / S.NA; $('toolNote').hidden = true; syncControls(); invalidate(); });
  $('shapeSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; S.shape = b.dataset.shape; syncControls(); invalidate(); });
  $('sigma').addEventListener('input', e => { S.sigma = +e.target.value; syncControls(); invalidate(); });
  $('dose').addEventListener('input', e => { S.dose = +e.target.value; $('doseOut').textContent = `${fmt(S.dose, 2)}×`; invalidate(); });
  $('dtsBtn').addEventListener('click', () => { doseToSize(); syncControls(); invalidate(); });
  $('focus').addEventListener('input', e => { S.focus = +e.target.value; $('focusOut').textContent = `${Math.round(S.focus)} nm`; invalidate(); });
  $('paintSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; S.paint = b.dataset.paint === '1'; syncControls(); });
  $('brushSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; S.brush = +b.dataset.b; syncControls(); });
  $('viewSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; S.view = b.dataset.view; syncControls(); renderWafer(); });

  // ---------- editing ----------
  function pushUndo() { undo.push({ mask: S.mask.slice(), assisted: S.assisted }); if (undo.length > 60) undo.shift(); $('undoBtn').disabled = false; }
  function doUndo() { if (!undo.length || S.busy) return; const u = undo.pop(); S.mask = u.mask; S.assisted = u.assisted; S.maskDirty = true; $('undoBtn').disabled = !undo.length; invalidate(); }
  $('undoBtn').addEventListener('click', doUndo);
  $('resetBtn').addEventListener('click', () => { if (S.busy) return; pushUndo(); S.mask = S.target ? S.target.slice() : new Uint8Array(G * G); S.maskDirty = true; S.assisted = false; invalidate(); });
  $('clearBtn').addEventListener('click', () => { if (S.busy) return; pushUndo(); S.mask = new Uint8Array(G * G); S.maskDirty = true; S.assisted = false; invalidate(); });

  function cellAt(e) {
    const r = maskCv.getBoundingClientRect();
    const fx = Math.floor((e.clientX - r.left) / r.width * VIEW.n), fy = Math.floor((e.clientY - r.top) / r.height * VIEW.n);
    return { x: VIEW.x0 + Math.max(0, Math.min(VIEW.n - 1, fx)), y: VIEW.y0 + Math.max(0, Math.min(VIEW.n - 1, fy)) };
  }
  function brushAt(c, erase) {
    const b = S.brush, o = Math.floor((b - 1) / 2); let ch = false;
    for (let dy = 0; dy < b; dy++) for (let dx = 0; dx < b; dx++) {
      const x = c.x - o + dx, y = c.y - o + dy; if (x < 0 || y < 0 || x >= G || y >= G) continue;
      const i = y * G + x, v = erase ? 0 : 1; if (S.mask[i] !== v) { S.mask[i] = v; ch = true; }
    }
    return ch;
  }
  let stroke = null;
  maskCv.addEventListener('pointerdown', e => {
    if (S.busy) return;
    e.preventDefault();
    const c = cellAt(e);
    if (S.pickMode) { pickSite(c); return; }
    maskCv.setPointerCapture(e.pointerId);
    pushUndo();
    stroke = { erase: !S.paint || e.button === 2 || e.shiftKey, last: c, changed: false };
    if (brushAt(c, stroke.erase)) { stroke.changed = true; S.maskDirty = true; invalidate(); }
  });
  maskCv.addEventListener('pointermove', e => {
    const c = cellAt(e);
    const moved = !S.hover || S.hover.x !== c.x || S.hover.y !== c.y;
    S.hover = c;
    if (stroke) {
      // Bresenham from last cell to this one
      let x0 = stroke.last.x, y0 = stroke.last.y; const x1 = c.x, y1 = c.y;
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let err = dx + dy, ch = false;
      for (;;) { if (brushAt({ x: x0, y: y0 }, stroke.erase)) ch = true; if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
      stroke.last = c;
      if (ch) { stroke.changed = true; S.maskDirty = true; invalidate(); return; }
    }
    if (moved && !rafPending) renderMask();
  });
  const endStroke = () => { if (stroke && !stroke.changed) { undo.pop(); $('undoBtn').disabled = !undo.length; } stroke = null; };
  maskCv.addEventListener('pointerup', endStroke);
  maskCv.addEventListener('pointercancel', endStroke);
  maskCv.addEventListener('pointerleave', () => { if (!stroke) { S.hover = null; renderMask(); } });
  maskCv.addEventListener('contextmenu', e => e.preventDefault());

  function pickSite(c) {
    const ref = S.target || S.mask;
    S.pickMode = false;
    if (!ref[c.y * G + c.x]) { showNote('Pick a cell inside a feature to set the CD site.', true); syncControls(); renderMask(); return; }
    const run = (dx, dy) => { let a = 0, b = 0; while (a < G && ref[(c.y - dy * (a + 1) + G) % G * G + (c.x - dx * (a + 1) + G) % G]) a++; while (b < G && ref[(c.y + dy * (b + 1)) % G * G + (c.x + dx * (b + 1)) % G]) b++; return { lo: a, hi: b, w: a + b + 1 }; };
    const h = run(1, 0), v = run(0, 1);
    const useH = h.w <= v.w, r = useH ? h : v;
    S.anchor = useH ? { x: c.x - r.lo + r.w / 2, y: c.y + 0.5, dir: 'h', w: r.w } : { x: c.x + 0.5, y: c.y - r.lo + r.w / 2, dir: 'v', w: r.w };
    showNote(`CD site set: ${fmt(r.w * cellNm(), 1)} nm ${useH ? 'wide' : 'tall'} feature. The Bossung plot now tracks it.`);
    syncControls(); invalidate();
  }

  document.addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); doUndo(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'b' || e.key === 'B') { S.paint = true; syncControls(); }
    else if (e.key === 'e' || e.key === 'E') { S.paint = false; syncControls(); }
    else if (['1', '2', '3'].includes(e.key)) { S.brush = +e.key; syncControls(); }
  });

  // ---------- auto OPC ----------
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  $('opcBtn').addEventListener('click', async () => {
    if (!S.target || S.busy) return;
    S.busy = true; $('opcBtn').disabled = true; $('opcBtn').textContent = 'Running…';
    pushUndo();
    const allowed = C.opcAllowed(S.target);
    let mask = S.mask.slice(), bestRun = null;
    const delay = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 140;
    for (let it = 0; it < 16; it++) {
      S.mask = mask; S.maskDirty = true; S.assisted = 'opc'; compute();
      const sc = score(); const J = Math.abs(sc.worst.epe) + 0.5 * sc.rms + 5 * S.defects.length;
      if (!bestRun || J < bestRun.J - 1e-6) bestRun = { J, mask: mask.slice() };
      const st = C.opcStep(mask, S.target, C.coverage(S.I, S.thr), S.tpx, allowed);
      if (!st.flips) break;
      mask = st.mask;
      await sleep(delay);
    }
    S.mask = bestRun.mask; S.maskDirty = true; compute();
    S.busy = false; $('opcBtn').textContent = 'Auto-OPC'; syncControls();
  });

  // theme changes repaint the token-coloured canvases
  const repaintThemed = () => { drawPupil(); drawBossung(); };
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', repaintThemed); } catch (e) { /* old browsers */ }
  new MutationObserver(repaintThemed).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { renderMask(); renderWafer(); drawBossung(); drawPupil(); });

  // ---------- boot ----------
  fitCanvas(maskCv); fitCanvas(waferCv); fitCanvas(bossCv);
  loadLevel(0);
  window.__LP = { S, loadLevel, loadPreset, score, compute };
})();
