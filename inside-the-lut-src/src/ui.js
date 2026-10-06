/* ================= UI ================= */
(function () {
'use strict';
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t <= 0 ? 0 : t >= 1 ? 1 : 1 - Math.pow(1 - t, 3);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const mqRM = matchMedia('(prefers-reduced-motion: reduce)');
let RM = mqRM.matches;
try { mqRM.addEventListener('change', e => { RM = e.matches; }); } catch (e) { /* old Safari */ }
const MONO = '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
const DISP = '"Archivo", "Arial Narrow", system-ui, sans-serif';
const font = (sz, w = 400, fam = MONO) => `${w} ${sz}px ${fam}`;
const fmtT = T => T <= 0 ? '0' : T >= 10 ? T.toFixed(0) : T >= 1 ? T.toFixed(1) : T >= 0.1 ? T.toFixed(2) : T.toFixed(3);
const ns = v => v.toFixed(2);

const EXAMPLES = [
  { id: 'add4', label: '4-bit adder', src: `// 4-bit ripple adder\nmodule add4(input  [3:0] a, b,\n            input        cin,\n            output [3:0] s,\n            output       cout);\n  assign {cout, s} = a + b + cin;\nendmodule\n` },
  { id: 'maj', label: 'Majority vote', src: `// Majority of three: 1 when two or more inputs are 1\ny = a&b | b&c | a&c\n` },
  { id: 'six', label: 'Six inputs, one LUT', src: `// Any function of six inputs fits in one LUT6.\n// e'f means (not e) and f\ny = (a ^ b) & (c | ~d) | e'f\n` },
  { id: 'mux', label: '8:1 mux', src: `// 8:1 multiplexer. A 4:1 mux uses exactly\n// six inputs, so it fills one LUT6.\nmodule mux8(input  [7:0] d,\n            input  [2:0] sel,\n            output       y);\n  assign y = d[sel];\nendmodule\n` },
  { id: 'par', label: '12-bit parity', src: `// Parity of 12 bits needs more than one LUT\nmodule parity12(input [11:0] d, output p);\n  assign p = ^d;\nendmodule\n` },
  { id: 'cmp', label: '8-bit compare', src: `// Unsigned 8-bit comparator\nmodule cmp8(input  [7:0] a, b,\n            output lt, eq, gt);\n  assign lt = a < b;\n  assign eq = a == b;\n  assign gt = a > b;\nendmodule\n` },
  { id: 'add8', label: '8-bit adder', src: `// 8-bit adder: a bigger board for the race\nmodule add8(input  [7:0] a, b,\n            output [8:0] s);\n  assign s = a + b;\nendmodule\n` },
];

const STAGES = [
  { id: 'synth', n: '1', name: 'Synthesis' },
  { id: 'map', n: '2', name: 'LUT mapping' },
  { id: 'place', n: '3', name: 'Placement' },
  { id: 'route', n: '4', name: 'Routing' },
  { id: 'time', n: '5', name: 'Timing' },
  { id: 'race', n: 'vs', name: 'Race', race: true },
];
const SPEEDS = [0.01, 0.025, 0.05, 0.09, 0.14, 0.21, 0.3, 0.42, 0.6, 1];
const TMIN = 0.01, TMAX = 300;
const T2v = T => T <= TMIN ? 0 : Math.round(1000 * Math.log(T / TMIN) / Math.log(TMAX / TMIN));
const v2T = v => TMIN * Math.pow(TMAX / TMIN, v / 1000);
const RACE_MS = 40000;

/* ---------- colors ---------- */
let C = {};
const hexRgb = h => {
  h = (h || '').trim();
  if (h[0] === '#') { if (h.length === 4) h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3]; return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  const m = h.match(/\d+/g); return m ? m.slice(0, 3).map(Number) : [128, 128, 128];
};
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mixRgb = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
function readColors() {
  const cs = getComputedStyle(document.documentElement);
  const g = n => cs.getPropertyValue(n).trim() || '#888888';
  C = {};
  for (const n of ['bg', 'panel', 'view', 'tile', 'ink', 'ink-2', 'ink-3', 'rule', 'rule-2', 'copper', 'logic', 'sram', 'hot', 'amber', 'on-k']) {
    const key = n.replace('-', ''); C[key] = g('--' + n); C[key + '_'] = hexRgb(C[key]);
  }
  C.k = []; C.k_ = [];
  for (let i = 1; i <= 8; i++) { const v = g('--k' + i); C.k.push(v); C.k_.push(hexRgb(v)); }
}
const lutColor = i => C.k[i % 8];
const lutRgb = i => C.k_[i % 8];
function heatRgb(r) {
  if (r <= 0) return C.rule_;
  if (r < 0.6) return mixRgb(C.rule_, C.amber_, r / 0.6);
  if (r <= 1) return mixRgb(C.amber_, C.hot_, (r - 0.6) / 0.4 * 0.55);
  return C.hot_;
}

/* ---------- canvas ---------- */
const cv = $('cv'); const ctx = cv.getContext('2d');
const chart = $('chart'); const cctx = chart.getContext('2d');
let VW = 800, VH = 520, lastW = 0;
function sizeCanvas(force) {
  const w = Math.max(260, Math.round($('view').clientWidth));
  if (!force && w === lastW) return; lastW = w;
  const h = w > 640 ? clamp(Math.round(w * 0.64), 420, 640) : clamp(Math.round(w * 1.22), 400, 580);
  VW = w; VH = h;
  const r = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(w * r); cv.height = Math.round(h * r); cv.style.height = h + 'px';
  ctx.setTransform(r, 0, 0, r, 0, 0);
  ST.geomKey = '';
  sizeChart();
  kick();
}
function sizeChart() {
  const w = Math.max(200, Math.round(chart.clientWidth || 260)); const h = 118;
  const r = Math.min(2, window.devicePixelRatio || 1);
  chart.width = Math.round(w * r); chart.height = Math.round(h * r);
  cctx.setTransform(r, 0, 0, r, 0, 0); chart._w = w; chart._h = h;
}

/* ---------- state ---------- */
const ST = {
  R: null, stage: 'synth', anim: null, animDone: null, flowToken: 0,
  selLut: 0, lutAddr: 0,
  P: null, ann: null, annRunning: false, speed: 8, autoCool: true, rng: rngOf(11),
  placeVer: 0, routedVer: -1, W: 4, RT: null, TM: null, TMi: null,
  showWires: true, showHeat: true, ideal: false,
  disp: null, hover: -1, drag: null, sel: -1,
  race: null, raceRes: null, raceP0: null,
  layout: null, geomKey: '', geom: null,
  lastReadout: 0,
};

function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) || 1; }

function compileSource(src) {
  const S = synthesize(src); const M = mapLuts(S); const D = buildPlaceDesign(S, M);
  const rng = rngOf(hashStr(src));
  const P0 = randomPlacement(D, rng); const P = clonePlacement(P0);
  const randCost = totalHPWL(D, P0);
  const A = annealFully(D, P, rng);
  let Wmin = 0, RT = null;
  for (let W = 1; W <= 12; W++) { const rt = routeDesign(D, P, W, 32); if (rt.ok) { Wmin = W; RT = rt; break; } }
  if (!RT) { Wmin = 12; RT = routeDesign(D, P, 12); }
  return { src, S, M, D, P0, P, A, Wmin, RT, rng, randCost };
}

function applyCompile(R) {
  ST.R = R; ST.rng = R.rng; ST.P = R.P; ST.ann = R.A; ST.ann.auto = ST.autoCool; ST.annRunning = false;
  ST.W = R.Wmin; ST.RT = R.RT; ST.placeVer = 0; ST.routedVer = 0;
  retime();
  let best = 0; R.M.luts.forEach((l, i) => { if (l.k > R.M.luts[best].k) best = i; });
  ST.selLut = best; ST.lutAddr = 0;
  ST.layout = null; ST.geomKey = '';
  ST.race = null; ST.raceRes = null; ST.raceP0 = null; ST.drag = null; ST.hover = -1; ST.sel = -1;
  snapDisp(ST.P);
  updateSummary();
}
function retime() {
  const R = ST.R; ST.TM = analyzeTiming(R.S, R.M, R.D, ST.RT); ST.TMi = analyzeTiming(R.S, R.M, R.D, ST.RT, true);
}
function reroute() {
  const R = ST.R; ST.RT = routeDesign(R.D, ST.P, ST.W); ST.routedVer = ST.placeVer; retime();
}
function snapDisp(P) {
  const D = ST.R.D; const S = D.fab.sites; ST.disp = new Float32Array(D.cells.length * 2);
  D.cells.forEach((c, i) => { ST.disp[2 * i] = S[P.pos[i]].x; ST.disp[2 * i + 1] = S[P.pos[i]].y; });
}
function boardP() { return ST.stage === 'race' && (ST.race || ST.raceRes) ? (ST.race ? ST.race.user : ST.raceRes.user) : ST.stage === 'race' && ST.raceP0 ? ST.raceP0 : ST.P; }

/* ---------- source editor ---------- */
const srcEl = $('src');
let checkTimer = 0;
function showError(e) { $('srcErr').textContent = e ? (e.message || String(e)) : ''; }
function liveCheck() {
  const src = srcEl.value;
  $('modeTag').textContent = /\bmodule\b/.test(stripComments(src)) ? 'Verilog' : 'Boolean';
  try { synthesize(src); showError(null); } catch (e) { showError(e); }
  try { localStorage.setItem('inside-the-lut-src', src); } catch (e) { /* storage unavailable */ }
}
srcEl.addEventListener('input', () => { clearTimeout(checkTimer); checkTimer = setTimeout(liveCheck, 450); markExample(); });
srcEl.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); playFlow(); }
  if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); const s = srcEl.selectionStart, en = srcEl.selectionEnd; srcEl.setRangeText('  ', s, en, 'end'); }
});
if (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) $('kbdHint').textContent = '⌘ ↵';
function markExample() { document.querySelectorAll('.ex').forEach(b => b.setAttribute('aria-pressed', String(EXAMPLES[+b.dataset.i].src === srcEl.value))); }
$('examples').innerHTML = EXAMPLES.map((ex, i) => `<button type="button" class="ex" data-i="${i}" aria-pressed="false">${esc(ex.label)}</button>`).join('');
$('examples').addEventListener('click', e => {
  const b = e.target.closest('.ex'); if (!b) return;
  srcEl.value = EXAMPLES[+b.dataset.i].src; markExample(); liveCheck(); tryCompile(true);
});
$('goBtn').addEventListener('click', () => playFlow());

function tryCompile(keepStage) {
  let R;
  try { R = compileSource(srcEl.value); } catch (e) { showError(e); return false; }
  showError(null); stopFlow();
  applyCompile(R);
  setStage(keepStage ? ST.stage : 'synth', { animate: false });
  return true;
}

function updateSummary() {
  const R = ST.R; if (!R) return;
  const cells = [[R.S.pis.length, 'inputs'], [R.S.pos.length, 'outputs'], [R.S.gates.length, 'gates'], [R.M.luts.length, R.M.luts.length === 1 ? 'LUT' : 'LUTs']];
  $('summary').innerHTML = cells.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('');
}

/* ---------- stage rail ---------- */
function stageStatus(id) {
  const R = ST.R; if (!R) return '';
  switch (id) {
    case 'synth': return `${R.S.gates.length} gates`;
    case 'map': return `${R.M.luts.length} LUT${R.M.luts.length === 1 ? '' : 's'}`;
    case 'place': return `${ST.ann ? Math.round(ST.ann.cost) : '–'} tiles`;
    case 'route': return ST.routedVer === ST.placeVer ? (ST.RT.ok ? `W ${ST.W} · routed` : `W ${ST.W} · ${ST.RT.over} over`) : `W ${ST.W} · pending`;
    case 'time': return ST.routedVer === ST.placeVer ? `${ns(ST.TM.total)} ns` : 'pending';
    case 'race': return ST.raceRes ? `${ST.raceRes.you} vs ${ST.raceRes.bot}` : ST.race ? 'racing' : 'vs annealer';
  }
  return '';
}
function renderRail() {
  $('rail').innerHTML = STAGES.map(s => `<button type="button" class="step${s.race ? ' race' : ''}" data-s="${s.id}"${s.id === ST.stage ? ' aria-current="step"' : ''}><span class="n">${s.n}</span><span class="nm">${esc(s.name)}</span><span class="st" id="st-${s.id}">${esc(stageStatus(s.id))}</span></button>`).join('');
}
function updateRailStatus() { for (const s of STAGES) { const el = $('st-' + s.id); if (el) el.textContent = stageStatus(s.id); } }
$('rail').addEventListener('click', e => {
  const b = e.target.closest('.step'); if (!b || !ST.R) return;
  stopFlow(); setStage(b.dataset.s, { animate: true });
});

/* ---------- stage switching and animation ---------- */
function setStage(id, { animate = false } = {}) {
  if (ST.stage === 'race' && id !== 'race' && ST.race) endRace(true);
  if (id !== 'place' && ST.annRunning) ST.annRunning = false;
  ST.anim = null; if (ST.animDone) { const d = ST.animDone; ST.animDone = null; d(); }
  ST.stage = id; ST.drag = null; ST.hover = -1; ST.sel = -1;
  if ((id === 'route' || id === 'time') && ST.routedVer !== ST.placeVer) reroute();
  if (id === 'race' && !ST.race && !ST.raceRes) { ST.raceP0 = randomPlacement(ST.R.D, rngOf((Date.now() & 0xffffff) + 3)); }
  const P = boardP(); if (P) snapDispSoft(P);
  $('view').style.touchAction = (id === 'place' || id === 'race') ? 'none' : 'pan-y';
  renderRail(); buildControls(); updateReadout(true);
  if (animate) startStageAnim(id); else kick();
}
function snapDispSoft(P) { if (!ST.disp || ST.disp.length !== ST.R.D.cells.length * 2) snapDisp(P); }
function startAnim(kind, dur, extra = {}) { ST.anim = { kind, t0: performance.now(), dur: RM ? 0 : dur, ...extra }; kick(); }
function animP(now) { const a = ST.anim; if (!a) return 1; return a.dur <= 0 ? 1 : clamp((now - a.t0) / (a.dur * 1000), 0, 1); }
function startStageAnim(id) {
  const R = ST.R;
  switch (id) {
    case 'synth': startAnim('synth', clamp(0.34 * (R.S.depth + 2), 1.4, 4.2)); break;
    case 'map': { const n = R.M.luts.length; const per = clamp(6 / n, 0.4, 2.2); startAnim('map', per * n, { per, n }); break; }
    case 'place': scrambleAndAnneal(); break;
    case 'route': routeAnimStart(); break;
    case 'time': startAnim('time', 3.8); break;
    default: kick();
  }
}
function routeAnimStart() {
  const k = ST.RT.iters.length; const d1 = 1.8; const per = k > 1 ? clamp(3.4 / (k - 1), 0.16, 0.55) : 0;
  startAnim('route', d1 + per * (k - 1) + 0.25, { d1, per, k });
}
function animFinished() {
  const a = ST.anim; ST.anim = null;
  if (a && a.kind === 'map') { ST.selLut = Math.min(ST.R.M.luts.length - 1, ST.selLut); buildControls(); }
  updateReadout(true);
  const d = ST.animDone; ST.animDone = null; if (d) d();
}
function waitAnim() { return new Promise(res => { ST.animDone = res; }); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
function stopFlow() { ST.flowToken++; }
async function playFlow() {
  if (!tryCompile(false)) return;
  const tok = ++ST.flowToken;
  for (const s of ['synth', 'map', 'place', 'route', 'time']) {
    if (tok !== ST.flowToken) return;
    setStage(s, { animate: false });
    const p = waitAnim(); startStageAnim(s);
    if (s === 'place' && RM) { /* annealing still runs, just without gliding */ }
    await p;
    if (tok !== ST.flowToken) return;
    await sleep(RM ? 150 : 650);
  }
}

/* ---------- placement / annealing ---------- */
function scrambleAndAnneal() {
  const D = ST.R.D;
  ST.P = randomPlacement(D, ST.rng); ST.placeVer++;
  ST.ann = new Annealer(D, ST.P, ST.rng); ST.ann.auto = ST.autoCool; ST.ann.initT();
  ST.annRunning = true; syncControls(); updateReadout(true); kick();
}
function annealDone() {
  ST.annRunning = false; syncControls(); updateReadout(true); updateRailStatus();
  const d = ST.animDone; ST.animDone = null; if (d) d();
}

/* ---------- race ---------- */
function startRace() {
  const D = ST.R.D;
  const P0 = ST.raceP0 || randomPlacement(D, rngOf(Date.now() & 0xffffff));
  const rng = rngOf((Date.now() & 0xffffff) ^ 0x5bd1e995);
  const bot = clonePlacement(P0), user = clonePlacement(P0);
  const probe = new Annealer(D, clonePlacement(P0), rngOf(17)); probe.initT();
  const ann = new Annealer(D, bot, rng); ann.auto = false; ann.rlim = D.fab.G;
  const T0 = probe.T, Tend = 0.02, steps = 70, M = Math.round(ann.mpt * 1.3);
  ST.race = { P0, user, bot, ann, T0, Tend, steps, M, total: steps * M, done: 0, t0: performance.now(), userMoves: 0, userCost: totalHPWL(D, user), start: totalHPWL(D, P0), hist: [], lastSample: 0 };
  ST.raceRes = null; ST.sel = -1; snapDisp(user);
  buildControls(); updateReadout(true); renderRail(); kick();
}
function tickRace(now) {
  const r = ST.race; if (!r) return false;
  const el = now - r.t0; const frac = clamp(el / RACE_MS, 0, 1);
  const target = Math.floor(frac * r.total); const A = r.ann;
  while (r.done < target) {
    const k = Math.floor(r.done / r.M);
    A.T = k >= r.steps - 1 ? 0 : r.T0 * Math.pow(r.Tend / r.T0, k / (r.steps - 1));
    A.tryMove(); if (++A.inT >= A.mpt) A.endT();
    r.done++;
  }
  if (now - r.lastSample > 250 || frac >= 1) { r.hist.push({ t: el, you: r.userCost, bot: A.cost }); r.lastSample = now; }
  if (frac >= 1) { endRace(false); return false; }
  return true;
}
function endRace(abandon) {
  const r = ST.race; if (!r) return;
  ST.race = null;
  if (abandon) { ST.raceRes = null; ST.raceP0 = null; return; }
  ST.raceRes = { you: r.userCost, bot: Math.round(r.ann.cost), moves: r.userMoves, botMoves: r.done, user: r.user, botP: r.bot, start: r.start, hist: r.hist };
  buildControls(); updateReadout(true); updateRailStatus(); kick();
}
function adoptPlacement(P) {
  ST.P = clonePlacement(P); ST.placeVer++;
  ST.ann = new Annealer(ST.R.D, ST.P, ST.rng); ST.ann.T = 0; ST.ann.frozen = true; ST.ann.history = [{ cost: ST.ann.cost, T: 0, acc: 0 }];
  ST.raceRes = null; ST.raceP0 = null;
  snapDisp(ST.P);
  setStage('route', { animate: true });
}

/* ---------- controls ---------- */
function buildControls() {
  const c = $('controls'); const R = ST.R; if (!R) { c.innerHTML = ''; return; }
  const s = ST.stage;
  if (s === 'synth') {
    c.innerHTML = `<button class="btn" type="button" id="cReplay">Replay synthesis</button><span class="hint">Inputs sit on the left; each column is one more gate of logic depth.</span>`;
  } else if (s === 'map') {
    const L = R.M.luts[ST.selLut];
    const pins = range(6).map(i => {
      const leaf = L.leaves[i];
      const nm = leaf === undefined ? 'unused' : esc(leafLabel(leaf));
      const v = (ST.lutAddr >> i) & 1;
      return `<button type="button" class="pin" data-i="${i}" aria-pressed="${leaf !== undefined && v ? 'true' : 'false'}"${leaf === undefined ? ' disabled' : ''} title="Toggle input I${i}"><b>I${i}</b>${nm}${leaf === undefined ? '' : ' = ' + v}</button>`;
    }).join('');
    c.innerHTML = `<button class="btn" type="button" id="cReplay">Replay the fill</button>
      <span class="ctl"><button class="btn" type="button" id="cPrev" aria-label="Previous LUT">‹</button><span class="val" id="cLutName" style="min-width:5.5em;text-align:center">${esc(L.name)} of ${R.M.luts.length}</span><button class="btn" type="button" id="cNext" aria-label="Next LUT">›</button></span>
      <span class="sep"></span><span class="pins" id="cPins" aria-label="LUT inputs">${pins}</span>`;
  } else if (s === 'place') {
    c.innerHTML = `<button class="btn primary" type="button" id="cAnneal">Anneal from random</button>
      <button class="btn" type="button" id="cPause">${ST.annRunning ? 'Pause' : 'Resume'}</button>
      <label class="ctl wide">Temperature <input type="range" id="cT" min="0" max="1000" value="${T2v(ST.ann.T)}"><output id="cTv">${fmtT(ST.ann.T)}</output></label>
      <label class="ctl"><input type="checkbox" id="cAuto"${ST.autoCool ? ' checked' : ''}> Auto-cool</label>
      <label class="ctl">Speed <input type="range" id="cSpeed" min="1" max="10" value="${ST.speed}"></label>`;
  } else if (s === 'route') {
    c.innerHTML = `<label class="ctl wide">Channel width <input type="range" id="cW" min="1" max="12" value="${ST.W}"><output id="cWv">W = ${ST.W}</output></label>
      <span class="hint">Smallest that routes: ${R.Wmin}</span>
      <button class="btn" type="button" id="cRoute">Route again</button>
      <label class="ctl"><input type="checkbox" id="cHeat"${ST.showHeat ? ' checked' : ''}> Heat map</label>
      <label class="ctl"><input type="checkbox" id="cWires"${ST.showWires ? ' checked' : ''}> Wires</label>`;
  } else if (s === 'time') {
    c.innerHTML = `<button class="btn" type="button" id="cTrace">Trace the critical path</button>
      <span class="seg" role="group" aria-label="Wire delay"><button type="button" id="cReal" aria-pressed="${!ST.ideal}">Real wires</button><button type="button" id="cIdeal" aria-pressed="${ST.ideal}">Wires cost 0 ns</button></span>`;
  } else if (s === 'race') {
    if (ST.race) c.innerHTML = `<button class="btn" type="button" id="cGiveUp">Give up</button><span class="hint">Drag a cell onto another site to move it; dropping on an occupied site swaps them.</span>`;
    else if (ST.raceRes) c.innerHTML = `<button class="btn primary" type="button" id="cStart">Race again</button><button class="btn" type="button" id="cMine">Route my layout</button><button class="btn" type="button" id="cBots">Route the annealer's layout</button>`;
    else c.innerHTML = `<button class="btn primary" type="button" id="cStart">Start the race</button><span class="hint">Same scrambled start for both of you. Shorter total wire wins.</span>`;
  }
}
function syncControls() {
  if (ST.stage === 'place' && ST.ann) {
    const t = $('cT'); if (t && document.activeElement !== t) t.value = T2v(ST.ann.T);
    const tv = $('cTv'); if (tv) tv.textContent = fmtT(ST.ann.T);
    const p = $('cPause'); if (p) { p.textContent = ST.annRunning ? 'Pause' : 'Resume'; p.disabled = !ST.annRunning && ST.ann.frozen; }
  }
}
$('controls').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || !ST.R) return;
  stopFlow();
  const R = ST.R;
  switch (b.id) {
    case 'cReplay': startStageAnim(ST.stage); break;
    case 'cPrev': case 'cNext': ST.anim = null; ST.selLut = (ST.selLut + (b.id === 'cNext' ? 1 : R.M.luts.length - 1)) % R.M.luts.length; ST.lutAddr = 0; buildControls(); updateReadout(true); kick(); break;
    case 'cAnneal': scrambleAndAnneal(); break;
    case 'cPause': if (ST.annRunning) ST.annRunning = false; else if (!ST.ann.frozen) ST.annRunning = true; syncControls(); kick(); break;
    case 'cRoute': routeAnimStart(); break;
    case 'cTrace': startAnim('time', 3.8); break;
    case 'cReal': case 'cIdeal': ST.ideal = b.id === 'cIdeal'; buildControls(); updateReadout(true); startAnim('time', 3.8); break;
    case 'cStart': ST.raceP0 = ST.raceRes ? randomPlacement(R.D, rngOf((Date.now() & 0xffffff) + 9)) : ST.raceP0; ST.raceRes = null; startRace(); break;
    case 'cGiveUp': endRace(true); ST.raceP0 = randomPlacement(R.D, rngOf((Date.now() & 0xffffff) + 5)); snapDisp(ST.raceP0); buildControls(); updateReadout(true); renderRail(); kick(); break;
    case 'cMine': adoptPlacement(ST.raceRes.user); break;
    case 'cBots': adoptPlacement(ST.raceRes.botP); break;
  }
  if (b.classList.contains('pin') && !b.disabled) {
    ST.anim = null; ST.lutAddr ^= (1 << +b.dataset.i); buildControls(); updateReadout(true); kick();
  }
});
$('controls').addEventListener('input', e => {
  const t = e.target; if (!ST.R) return;
  if (t.id === 'cT') { const T = v2T(+t.value); ST.ann.setT(t.value === '0' ? 0 : T); ST.annRunning = true; $('cTv').textContent = fmtT(ST.ann.T); syncControls(); updateReadout(true); kick(); }
  if (t.id === 'cSpeed') ST.speed = +t.value;
  if (t.id === 'cAuto') { ST.autoCool = t.checked; ST.ann.auto = t.checked; if (t.checked) { ST.ann.frozen = false; } kick(); updateReadout(true); }
  if (t.id === 'cW') { ST.W = +t.value; $('cWv').textContent = 'W = ' + ST.W; }
  if (t.id === 'cHeat') { ST.showHeat = t.checked; kick(); }
  if (t.id === 'cWires') { ST.showWires = t.checked; kick(); }
});
$('controls').addEventListener('change', e => {
  if (e.target.id === 'cW' && ST.R) { stopFlow(); reroute(); updateRailStatus(); routeAnimStart(); updateReadout(true); }
});

/* ---------- readout ---------- */
const STAGE_TEXT = {
  synth: ['Stage 1 of 5', 'Synthesis', 'Your text becomes a netlist of small gates. Constants fold away and identical gates merge before any FPGA resource is involved.'],
  map: ['Stage 2 of 5', 'LUT mapping', 'The mapper cuts the gate network into cones with at most six inputs. Each cone is evaluated for all 64 input combinations, and the 64 answers are written into the LUT\'s configuration memory.'],
  place: ['Stage 3 of 5', 'Placement', 'Each LUT gets a logic site and each port gets a pad. Simulated annealing swaps cells at random: it always keeps a shorter layout, and keeps a longer one with a probability that shrinks as the temperature falls.'],
  route: ['Stage 4 of 5', 'Routing', 'Every net needs a path along the channels between tiles, and each channel segment holds W wire tracks. PathFinder routes all nets, raises the price of overfull channels, and repeats until no track is shared.'],
  time: ['Stage 5 of 5', 'Timing', 'Static timing analysis adds up the delay along every path from an input pad to an output pad. The slowest one, the critical path, sets how fast the design can run.'],
  race: ['Challenge', 'Race the annealer', 'Place the cells yourself. You and the annealer start from the same scrambled layout, and the annealer gets 40 seconds. The shorter total wirelength wins.'],
};
function metric(label, value, cls = '', big = false, small = '') {
  return `<div${big ? ' class="big"' : ''}><dt>${esc(label)}</dt><dd${cls ? ` class="${cls}"` : ''}>${value}${small ? `<small>${small}</small>` : ''}</dd></div>`;
}
function leafLabel(leaf) {
  const R = ST.R; const g = R.S.g;
  if (g.nodes[leaf].type === 'PI') return g.nodes[leaf].name;
  const l = R.M.lutOf.get(leaf); return l ? l.name : R.S.names.get(leaf);
}
function updateReadout(force) {
  const now = performance.now(); if (!force && now - ST.lastReadout < 180) return; ST.lastReadout = now;
  const R = ST.R; if (!R) return;
  const s = ST.stage; const [num, title, lede] = STAGE_TEXT[s];
  $('stageNum').textContent = num; $('stageTitle').textContent = title; $('stageLede').textContent = lede;
  let m = '', extra = '', insight = '', showChart = false;
  if (s === 'synth') {
    const S = R.S; const ct = S.counts;
    m = metric('Gates', S.gates.length) + metric('Logic depth', S.depth, '', false, ' gates') +
      metric('Inputs', S.pis.length) + metric('Outputs', S.pos.length);
    const types = ['AND', 'OR', 'XOR', 'NOT', 'MUX'].filter(t => ct[t]).map(t => `${t} ${ct[t]}`).join(' · ');
    const lines = S.gates.map(id => { const n = S.g.nodes[id]; return `<b>${S.names.get(id)}</b> = ${n.type}(${n.ins.map(f => esc(S.names.get(f))).join(', ')})`; });
    S.pos.forEach(p => lines.push(`<span class="cu">${esc(p.name)}</span> = ${esc(S.names.get(p.node))}`));
    extra = `<div class="label" style="margin-bottom:6px">Netlist${types ? ' · ' + types : ''}</div><pre class="list">${lines.join('\n') || 'No gates: the outputs are wired straight to inputs or constants.'}</pre>`;
    insight = `The longest chain is <span class="lg">${S.depth} gate${S.depth === 1 ? '' : 's'}</span> deep. On an FPGA that number matters less than you'd think: the next stage packs whole chains of gates into a single lookup table.`;
  } else if (s === 'map') {
    const M = R.M; const L = M.luts[ST.selLut];
    const avgK = M.luts.reduce((a, l) => a + l.k, 0) / M.luts.length;
    m = metric('LUTs', M.luts.length) + metric('LUT depth', M.depth, '', false, M.depth === 1 ? ' level' : ' levels') +
      metric('Inputs used', avgK.toFixed(1), '', false, ' of 6 avg') + metric('Gates absorbed', R.S.gates.length, '', false, M.dup ? ` · ${M.dup} copied` : '');
    const v = L.bits[ST.lutAddr];
    extra = `<div class="lutcard"><div><b>${esc(L.name)}</b> computes${L.drives.length ? ` <b>${esc(L.drives.join(', '))}</b>` : ''}</div><div>${esc(L.eq)}</div><div>INIT = <b>${L.init}</b></div><div>inputs: ${L.leaves.map((f, i) => `I${i}=${esc(leafLabel(f))}`).join(' ') || 'none (constant)'}</div><div>read address ${ST.lutAddr} → O = <b>${v}</b></div></div>`;
    const cone = L.cone.length;
    insight = `${esc(L.name)} replaces <span class="lg">${cone} gate${cone === 1 ? '' : 's'}</span>, but there are no gates inside it. It is <span class="sr">64 bits of SRAM</span> and a tree of 2:1 multiplexers. The inputs only choose which bit to read. FPGA logic is really memory.`;
  } else if (s === 'place') {
    const A = ST.ann; const acc = A.lastAcc;
    m = metric('Wirelength', Math.round(A.cost), 'cu', true, ` tiles · ${R.randCost} at random`) +
      metric('Temperature', fmtT(A.T)) + metric('Accepted', Math.round(acc * 100) + '%') +
      metric('Moves tried', A.moves.toLocaleString()) + metric('Move range', Math.max(1, Math.round(A.rlim)), '', false, ' tiles');
    showChart = true;
    const st = A.frozen ? 'frozen' : A.T <= 0 ? 'quench' : acc > 0.6 ? 'hot' : acc > 0.15 ? 'cool' : 'cold';
    insight = {
      hot: `Hot. ${Math.round(acc * 100)}% of moves are accepted, including bad ones, so whole regions of the layout churn. That is how annealing escapes a poor arrangement.`,
      cool: `Cooling. Bad moves are accepted less often, and the move range shrinks so cells only hop between nearby sites.`,
      cold: `Nearly frozen. Almost only improving moves get through now; the layout is settling into its final shape.`,
      quench: `Final quench at zero temperature: only moves that shorten the wires are kept.`,
      frozen: `Frozen at ${Math.round(A.cost)} tiles of wire bounding box, ${Math.round(100 - 100 * A.cost / Math.max(1, R.randCost))}% shorter than the random start. Drag the temperature up to melt it, or drag a cell to try a move yourself.`,
    }[st];
    if (!ST.autoCool) insight = `Auto-cool is off, so the temperature stays where you put it. High values keep the layout scrambled; values near zero freeze it wherever it happens to be.`;
  } else if (s === 'route') {
    const RT = ST.RT; const last = RT.iters[RT.iters.length - 1];
    m = metric('Overused channels', RT.over, RT.over ? 'bad' : 'cu', true, RT.ok ? ' · legal' : ' · not routable') +
      metric('Channel width', 'W = ' + RT.W) + metric('Iterations', RT.iters.length) +
      metric('Wire segments', last.used) + metric('Busiest channel', `${last.peak}/${RT.W}`, last.peak > RT.W ? 'bad' : '');
    showChart = true;
    insight = RT.ok
      ? (RT.W === R.Wmin ? `At W = ${RT.W} the routing just fits. The hot channels are where nets compete for the same tracks; one fewer track and some net would have nowhere to go.` : `With ${RT.W} tracks per channel there is room to spare. Slide down toward W = ${R.Wmin} and watch PathFinder negotiate.`)
      : `Not routable at W = ${RT.W}. After ${RT.iters.length} rounds of negotiation, ${RT.over} channel segment${RT.over === 1 ? ' still carries' : 's still carry'} more nets than tracks. Widen the channel or improve the placement.`;
  } else if (s === 'time') {
    const T = ST.ideal ? ST.TMi : ST.TM; const Tr = ST.TM;
    const fab = Tr.route + Tr.logic;
    m = metric('Critical path', ns(T.total), 'cu', true, ' ns, pad to pad') +
      metric('Routing', ns(T.route), 'cu', false, ' ns') + metric('LUTs', ns(T.logic), 'lg', false, ' ns') +
      metric('I/O buffers', ns(T.io), '', false, ' ns') + metric('LUT levels', T.levels);
    const ends = T.ends.slice(0, 12).map(e => `${esc(e.name).padEnd(8)} ${ns(e.t)} ns`).join('\n');
    extra = `<div class="label" style="margin-bottom:6px">Arrival at each output</div><pre class="list">${ends}</pre>` +
      (ST.RT.ok ? '' : `<p class="hint" style="color:var(--hot);margin-top:8px">Routing still has overused channels, so these numbers are optimistic.</p>`);
    insight = ST.ideal
      ? `With free wires this path would take ${ns(ST.TMi.total)} ns instead of ${ns(ST.TM.total)} ns. The difference is the price of distance on the chip.`
      : `Inside the fabric, wires take <span class="cu">${ns(Tr.route)} ns</span> and LUTs take <span class="lg">${ns(Tr.logic)} ns</span>. The signal spends ${Math.round(100 * Tr.route / Math.max(0.001, fab))}% of its time travelling between LUTs. On FPGAs, wire delay usually dominates.`;
  } else if (s === 'race') {
    const r = ST.race, res = ST.raceRes;
    if (r) {
      const left = Math.max(0, RACE_MS - (performance.now() - r.t0)) / 1000;
      m = metric('Your wirelength', r.userCost, 'cu', false, ' tiles') + metric('Annealer', Math.round(r.ann.cost), '', false, ' tiles') +
        metric('Time left', left.toFixed(0), '', false, ' s') + metric('Your moves', r.userMoves);
      insight = `Highlighted lines are the nets attached to the cell you're holding. Put each LUT near the pads and LUTs it talks to.`;
    } else if (res) {
      const diff = res.bot - res.you;
      m = metric('Result', diff > 0 ? 'You win' : diff === 0 ? 'Tie' : 'Annealer wins', diff >= 0 ? 'lg' : 'cu', true) +
        metric('You', res.you, '', false, ' tiles') + metric('Annealer', res.bot, '', false, ' tiles') +
        metric('Your moves', res.moves) + metric('Its moves', res.botMoves.toLocaleString());
      insight = diff > 0 ? `You beat it by ${diff} tile${diff === 1 ? '' : 's'}. Real tools face thousands of cells, which is why they still rely on annealing and analytic placers.` : `The annealer tried ${res.botMoves.toLocaleString()} moves against your ${res.moves}. Route either layout to see how placement quality carries through to congestion and delay.`;
    } else {
      m = metric('Start', ST.raceP0 ? totalHPWL(R.D, ST.raceP0) : '–', '', false, ' tiles') + metric('Cells', R.D.cells.length) + metric('Nets', R.D.nets.length) + metric('Time', '40', '', false, ' s');
      insight = `Total wirelength is the sum of each net's bounding box, half its perimeter in tiles. Short boxes mean short wires.`;
    }
    showChart = !!(r || res);
  }
  $('metrics').innerHTML = m; $('extra').innerHTML = extra; $('insight').innerHTML = insight;
  chart.hidden = !showChart;
  if (showChart) { if (!chart._w || Math.abs(chart._w - chart.clientWidth) > 2) sizeChart(); drawChart(); }
  updateRailStatus();
}

/* ---------- chart ---------- */
function drawChart() {
  const w = chart._w || 260, h = chart._h || 118; const g = cctx;
  g.clearRect(0, 0, w, h);
  const pad = { l: 34, r: 8, t: 10, b: 18 };
  const x0 = pad.l, x1 = w - pad.r, y0 = pad.t, y1 = h - pad.b;
  g.font = font(10); g.textBaseline = 'middle';
  const axis = (lo, hi, label) => {
    g.strokeStyle = C.rule2; g.lineWidth = 1;
    for (let i = 0; i <= 2; i++) { const y = Math.round(lerp(y1, y0, i / 2)) + 0.5; g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); }
    g.fillStyle = C.ink3; g.textAlign = 'right';
    g.fillText(String(Math.round(hi)), x0 - 5, y0); g.fillText(String(Math.round(lo)), x0 - 5, y1);
    g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillText(label, x0, h - 3); g.textBaseline = 'middle';
  };
  const line = (pts, col, fill) => {
    if (!pts.length) return;
    g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
    if (fill) { g.save(); g.lineTo(pts[pts.length - 1][0], y1); g.lineTo(pts[0][0], y1); g.closePath(); g.fillStyle = rgba(hexRgb(col), 0.12); g.fill(); g.restore(); g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); }
    g.strokeStyle = col; g.lineWidth = 1.6; g.lineJoin = 'round'; g.stroke();
    const [ex, ey] = pts[pts.length - 1]; g.fillStyle = col; g.beginPath(); g.arc(ex, ey, 3, 0, Math.PI * 2); g.fill();
  };
  if (ST.stage === 'place') {
    const H = ST.ann.history; if (!H.length) return;
    let lo = Infinity, hi = -Infinity; H.forEach(p => { lo = Math.min(lo, p.cost); hi = Math.max(hi, p.cost); });
    lo = Math.floor(lo * 0.95); hi = Math.ceil(hi * 1.02); if (hi === lo) hi = lo + 1;
    axis(lo, hi, 'wirelength per temperature step');
    const n = Math.max(2, H.length);
    line(H.map((p, i) => [lerp(x0, x1, i / (n - 1)), lerp(y1, y0, (p.cost - lo) / (hi - lo))]), C.copper, true);
  } else if (ST.stage === 'route') {
    const I = ST.RT.iters; const hi = Math.max(1, ...I.map(i => i.over));
    axis(0, hi, 'overused channels per iteration');
    const bw = Math.min(18, (x1 - x0) / I.length - 2);
    I.forEach((it, i) => {
      const x = x0 + (i + 0.5) * (x1 - x0) / I.length - bw / 2; const hh = (y1 - y0) * it.over / hi;
      g.fillStyle = it.over ? C.hot : C.logic; g.fillRect(x, y1 - Math.max(2, hh), bw, Math.max(2, hh));
    });
  } else if (ST.stage === 'race') {
    const H = ST.race ? ST.race.hist : ST.raceRes ? ST.raceRes.hist : []; if (!H.length) return;
    let lo = Infinity, hi = -Infinity; H.forEach(p => { lo = Math.min(lo, p.you, p.bot); hi = Math.max(hi, p.you, p.bot); });
    lo = Math.floor(lo * 0.95); hi = Math.ceil(hi * 1.02); if (hi === lo) hi = lo + 1;
    axis(lo, hi, 'you (copper) vs annealer (grey)');
    const X = t => lerp(x0, x1, t / RACE_MS), Y = v => lerp(y1, y0, (v - lo) / (hi - lo));
    line(H.map(p => [X(p.t), Y(p.bot)]), C.ink3, false);
    line(H.map(p => [X(p.t), Y(p.you)]), C.copper, false);
  }
}

/* ---------- schematic layout ---------- */
function getLayout() {
  if (ST.layout) return ST.layout;
  const S = ST.R.S, g = S.g; const ncol = S.depth + 2;
  const items = []; const byNode = new Map(); const cols = Array.from({ length: ncol }, () => []);
  const put = it => { items.push(it); cols[it.col].push(it); return it; };
  S.pis.forEach(p => byNode.set(p.node, put({ kind: 'pi', node: p.node, label: p.name, col: 0 })));
  const usedC = new Set(); for (const id of S.gates) for (const f of g.nodes[id].ins) if (f < 2) usedC.add(f);
  for (const p of S.pos) if (p.node < 2) usedC.add(p.node);
  for (const c of usedC) byNode.set(c, put({ kind: 'const', node: c, label: String(c), col: 0 }));
  for (const id of S.gates) byNode.set(id, put({ kind: 'gate', node: id, type: g.nodes[id].type, col: S.level[id] }));
  S.pos.forEach((p, i) => put({ kind: 'po', node: p.node, label: p.name, col: ncol - 1, idx: i }));
  for (const it of items) { it.ins = it.kind === 'gate' ? g.nodes[it.node].ins.map(f => byNode.get(f)) : it.kind === 'po' ? [byNode.get(it.node)] : []; it.outs = []; }
  for (const it of items) for (const s of it.ins) s.outs.push(it);
  const norm = col => col.forEach((it, i) => it.o = (i + 0.5) / col.length);
  cols.forEach(norm);
  for (let r = 0; r < 5; r++) {
    for (let c = 1; c < ncol; c++) { cols[c].forEach(it => it.key = it.ins.length ? it.ins.reduce((a, s) => a + s.o, 0) / it.ins.length : it.o); cols[c].sort((a, b) => a.key - b.key); norm(cols[c]); }
    for (let c = ncol - 2; c >= 0; c--) { cols[c].forEach(it => it.key = it.outs.length ? it.outs.reduce((a, s) => a + s.o, 0) / it.outs.length : it.o); cols[c].sort((a, b) => a.key - b.key); norm(cols[c]); }
  }
  cols.forEach(col => col.forEach((it, i) => { it.row = i; it.cnt = col.length; }));
  ST.layout = { items, cols, ncol, maxRows: Math.max(...cols.map(c => c.length)), byNode };
  return ST.layout;
}
function schemGeom(L, rect) {
  const key = `${ST.stage}|${rect.x}|${rect.y}|${rect.w}|${rect.h}`;
  if (ST.geomKey === key && ST.geom) return ST.geom;
  const labW = clamp(rect.w * 0.11, 34, 64);
  const x0 = rect.x + labW, x1 = rect.x + rect.w - labW;
  const colW = L.ncol > 1 ? (x1 - x0) / (L.ncol - 1) : 0;
  const rowH = rect.h / Math.max(1, L.maxRows);
  const gw = clamp(Math.min(colW * 0.46, rowH * 1.2), 7, 40);
  const gh = clamp(Math.min(rowH * 0.78, gw * 0.86), 6, 32);
  for (const it of L.items) {
    it.x = L.ncol > 1 ? x0 + it.col * colW : (x0 + x1) / 2;
    it.y = rect.y + rect.h / 2 + (it.row - (it.cnt - 1) / 2) * rowH;
  }
  const bub = Math.max(1.4, gw * 0.08);
  const outPt = it => {
    if (it.kind === 'pi') return [it.x + 6, it.y];
    if (it.kind === 'const') return [it.x + 5, it.y];
    if (it.type === 'NOT') return [it.x + gw * 0.22 + 2 * bub, it.y];
    return [it.x + gw / 2, it.y];
  };
  const inPt = (it, k) => {
    if (it.kind === 'po') return [it.x - 6, it.y];
    const n = it.ins.length;
    if (it.type === 'NOT') return [it.x - gw * 0.36, it.y];
    if (it.type === 'MUX') return k === 0 ? [it.x, it.y + gh * 0.38] : [it.x - gw / 2, it.y + (k === 1 ? -1 : 1) * gh * 0.24];
    const back = (it.type === 'OR' || it.type === 'XOR') ? gw * 0.1 : 0;
    return [it.x - gw / 2 + back, it.y - gh / 2 + gh * (k + 1) / (n + 1)];
  };
  const wires = [];
  for (const it of L.items) it.ins.forEach((src, k) => {
    const [sx, sy] = outPt(src), [tx, ty] = inPt(it, k);
    const sel = it.type === 'MUX' && k === 0;
    const dx = Math.max(10, (tx - sx) * 0.5);
    const c1 = [sx + dx, sy], c2 = sel ? [tx, ty + Math.max(14, gh)] : [tx - dx, ty];
    const pts = []; const NS = 16;
    for (let i = 0; i <= NS; i++) {
      const t = i / NS, u = 1 - t;
      pts.push([u * u * u * sx + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * tx, u * u * u * sy + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * ty]);
    }
    wires.push({ from: src, to: it, k, pts });
  });
  ST.geomKey = key; ST.geom = { gw, gh, rowH, colW, wires, bub, labW };
  return ST.geom;
}
function drawGate(type, x, y, w, h, bub) {
  const x0 = x - w / 2, x1 = x + w / 2, y0 = y - h / 2, y1 = y + h / 2;
  const p = new Path2D(); let extra = null, bubble = null;
  switch (type) {
    case 'AND': { const r = h / 2; const xf = Math.max(x0, x1 - r); p.moveTo(x0, y0); p.lineTo(xf, y0); p.arc(xf, y, r, -Math.PI / 2, Math.PI / 2); p.lineTo(x0, y1); p.closePath(); break; }
    case 'OR': case 'XOR': {
      const xb = type === 'XOR' ? x0 + w * 0.12 : x0;
      p.moveTo(xb, y0); p.quadraticCurveTo(xb + (x1 - xb) * 0.6, y0, x1, y); p.quadraticCurveTo(xb + (x1 - xb) * 0.6, y1, xb, y1); p.quadraticCurveTo(xb + w * 0.2, y, xb, y0); p.closePath();
      if (type === 'XOR') { extra = new Path2D(); extra.moveTo(x0, y0); extra.quadraticCurveTo(x0 + w * 0.2, y, x0, y1); }
      break;
    }
    case 'NOT': { const xl = x - w * 0.36, xt = x + w * 0.22; p.moveTo(xl, y0 + h * 0.08); p.lineTo(xt, y); p.lineTo(xl, y1 - h * 0.08); p.closePath(); bubble = new Path2D(); bubble.arc(xt + bub, y, bub, 0, Math.PI * 2); break; }
    case 'MUX': p.moveTo(x0, y0); p.lineTo(x1, y0 + h * 0.22); p.lineTo(x1, y1 - h * 0.22); p.lineTo(x0, y1); p.closePath(); break;
  }
  return { p, extra, bubble };
}
function polyPartial(pts, frac) {
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  const n = pts.length - 1; const end = frac * n;
  for (let i = 1; i <= n; i++) {
    if (i <= end) ctx.lineTo(pts[i][0], pts[i][1]);
    else { const t = end - (i - 1); if (t > 0) ctx.lineTo(lerp(pts[i - 1][0], pts[i][0], t), lerp(pts[i - 1][1], pts[i][1], t)); break; }
  }
  ctx.stroke();
}
function drawSchem(rect, opts = {}) {
  const L = getLayout(); const G = schemGeom(L, rect); const R = ST.R;
  const reveal = opts.reveal === undefined ? Infinity : opts.reveal;
  const lutMode = !!opts.luts; const sel = lutMode ? R.M.luts[ST.selLut] : null;
  const inCone = new Set(sel ? sel.cone : []); const leafSet = new Set(sel ? sel.leaves : []);
  if (sel && sel.root >= 2) inCone.add(sel.root);
  const fsz = clamp(G.rowH * 0.5, 8, 11.5);
  // wires
  ctx.lineCap = 'round';
  for (const w of G.wires) {
    const lev = w.to.col;
    const frac = reveal === Infinity ? 1 : clamp((reveal - lev + 0.6) / 0.7, 0, 1);
    if (frac <= 0) continue;
    let col = C.ink3, a = 0.9, lw = 1.1;
    if (lutMode) {
      const intoCone = w.to.kind === 'gate' && inCone.has(w.to.node);
      if (intoCone) { col = lutColor(sel.idx); a = 1; lw = 1.6; } else a = 0.32;
    }
    ctx.globalAlpha = a; ctx.strokeStyle = col; ctx.lineWidth = lw;
    polyPartial(w.pts, frac);
  }
  ctx.globalAlpha = 1;
  // items
  for (const it of L.items) {
    const ap = reveal === Infinity ? 1 : clamp((reveal - it.col) / 0.5, 0, 1);
    if (ap <= 0) continue;
    const sc = 0.55 + 0.45 * ease(ap);
    ctx.globalAlpha = ap;
    if (it.kind === 'gate') {
      let fill = C.panel, stroke = C.ink2, lw = 1.3;
      if (lutMode) {
        const owners = R.M.gateLut.get(it.node) || [];
        const own = owners.length ? owners[0] : -1;
        if (inCone.has(it.node)) { fill = rgba(lutRgb(sel.idx), 0.38); stroke = lutColor(sel.idx); lw = 1.8; }
        else if (own >= 0) { fill = rgba(lutRgb(own), 0.16); stroke = rgba(lutRgb(own), 0.55); }
        else { stroke = C.ink3; }
        if (!inCone.has(it.node)) ctx.globalAlpha = ap * 0.75;
      }
      const sh = drawGate(it.type, it.x, it.y, G.gw * sc, G.gh * sc, G.bub);
      ctx.fillStyle = fill; ctx.fill(sh.p); ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.stroke(sh.p);
      if (sh.extra) ctx.stroke(sh.extra);
      if (sh.bubble) { ctx.fillStyle = C.view; ctx.fill(sh.bubble); ctx.stroke(sh.bubble); }
    } else if (it.kind === 'pi' || it.kind === 'po') {
      const isPo = it.kind === 'po'; const w = 11, h = 8; const x = isPo ? it.x - 6 : it.x - 5;
      ctx.beginPath(); ctx.moveTo(x, it.y - h / 2); ctx.lineTo(x + w - 4, it.y - h / 2); ctx.lineTo(x + w, it.y); ctx.lineTo(x + w - 4, it.y + h / 2); ctx.lineTo(x, it.y + h / 2); ctx.closePath();
      ctx.fillStyle = isPo ? C.ink : C.ink2; ctx.fill();
      ctx.font = font(fsz, 500); ctx.textBaseline = 'middle'; ctx.fillStyle = C.ink2;
      ctx.textAlign = isPo ? 'left' : 'right';
      ctx.fillText(it.label, isPo ? x + w + 4 : x - 4, it.y + 0.5);
      if (lutMode && !isPo && leafSet.has(it.node)) leafTag(it.x + 7, it.y, sel.leaves.indexOf(it.node));
    } else if (it.kind === 'const') {
      ctx.strokeStyle = C.ink3; ctx.lineWidth = 1; ctx.strokeRect(it.x - 5, it.y - 5, 10, 10);
      ctx.font = font(9, 600); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = C.ink2; ctx.fillText(it.label, it.x, it.y + 0.5);
    }
    ctx.globalAlpha = 1;
  }
  if (lutMode && reveal === Infinity) {
    // leaf tags on LUT-root leaves (outputs of other LUTs)
    for (const it of L.items) if (it.kind === 'gate' && leafSet.has(it.node)) leafTag(it.x + G.gw / 2 + 3, it.y, sel.leaves.indexOf(it.node));
    // LUT name labels at roots
    ctx.font = font(clamp(fsz, 9, 11), 600); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    for (const l of R.M.luts) {
      const it = L.byNode.get(l.root); if (!it || it.kind !== 'gate') continue;
      ctx.fillStyle = l.idx === ST.selLut ? lutColor(l.idx) : rgba(lutRgb(l.idx), 0.7);
      ctx.fillText(l.name, it.x, it.y - G.gh / 2 - 3);
    }
    // bounding box of selected cone
    if (sel && sel.cone.length) {
      let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
      for (const id of sel.cone) { const it = L.byNode.get(id); if (!it) continue; bx0 = Math.min(bx0, it.x - G.gw / 2); bx1 = Math.max(bx1, it.x + G.gw / 2); by0 = Math.min(by0, it.y - G.gh / 2); by1 = Math.max(by1, it.y + G.gh / 2); }
      const pd = 7; ctx.setLineDash([4, 3]); ctx.strokeStyle = lutColor(sel.idx); ctx.lineWidth = 1.2;
      roundRect(bx0 - pd, by0 - pd - 12, bx1 - bx0 + 2 * pd, by1 - by0 + 2 * pd + 12, 5); ctx.stroke(); ctx.setLineDash([]);
    }
  }
  return G;
}
function leafTag(x, y, i) {
  if (i < 0) return;
  ctx.font = font(9, 600); const t = 'I' + i; const w = ctx.measureText(t).width + 6;
  ctx.fillStyle = C.sram; roundRect(x, y - 7, w, 13, 3); ctx.fill();
  ctx.fillStyle = C.onk; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(t, x + 3, y + 0.5);
}
function roundRect(x, y, w, h, r) {
  ctx.beginPath(); r = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function caption(text, x = 14, y = 22, col) {
  ctx.font = font(10.5, 500); ctx.fillStyle = col || C.ink3; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  try { ctx.letterSpacing = '1px'; } catch (e) { /* unsupported */ }
  ctx.fillText(text.toUpperCase(), x, y);
  try { ctx.letterSpacing = '0px'; } catch (e) { /* unsupported */ }
}

/* ---------- LUT internals ---------- */
function drawLutCore(rect, lut, { revealed = 64, writeAddr = -1, readAddr = 0 } = {}) {
  const k = lut.k; const narrow = rect.w < 560;
  const labW = clamp(rect.w * 0.2, 70, 128);
  const x0 = rect.x + labW, x1 = rect.x + rect.w - 6; const cw = (x1 - x0) / 64;
  const col = lutColor(lut.idx);
  // header
  ctx.textBaseline = 'alphabetic';
  ctx.font = font(13, 700, DISP); ctx.fillStyle = col; ctx.textAlign = 'left';
  ctx.fillText(lut.name, rect.x, rect.y + 13);
  const nw = ctx.measureText(lut.name).width;
  ctx.font = font(11, 500); ctx.fillStyle = C.ink2;
  ctx.fillText(narrow ? `LUT6 · ${k} of 6 inputs` : `LUT6 · ${k} of 6 inputs used${lut.drives.length ? ' · drives ' + lut.drives.join(', ') : ''}`, rect.x + nw + 8, rect.y + 13);
  let hy = rect.y + 13;
  ctx.font = font(11, 600);
  const init = 'INIT = ' + lut.init;
  if (narrow) { hy += 16; ctx.textAlign = 'left'; ctx.fillStyle = C.ink; ctx.fillText(init, rect.x, hy); }
  else { ctx.textAlign = 'right'; ctx.fillStyle = C.ink; ctx.fillText(init, x1, hy); }
  // SRAM strip
  const sy = hy + 12; const sh = clamp(cw * 1.7, 12, 22);
  ctx.font = font(10, 500); ctx.textAlign = 'right'; ctx.fillStyle = C.ink3; ctx.textBaseline = 'middle';
  ctx.fillText('SRAM bits', x0 - 8, sy + sh / 2);
  const used = 1 << k;
  for (let i = 0; i < 64; i++) {
    const x = x0 + i * cw; const on = i < revealed;
    const fade = i >= used ? 0.45 : 1;
    if (on) {
      ctx.globalAlpha = fade;
      if (lut.bits[i]) { ctx.fillStyle = C.sram; ctx.fillRect(x + 0.5, sy, cw - 1, sh); }
      else { ctx.fillStyle = C.panel; ctx.fillRect(x + 0.5, sy, cw - 1, sh); ctx.strokeStyle = C.rule; ctx.lineWidth = 1; ctx.strokeRect(x + 1, sy + 0.5, cw - 2, sh - 1); }
      if (cw >= 9) { ctx.font = font(Math.min(10, cw * 0.9), 600); ctx.textAlign = 'center'; ctx.fillStyle = lut.bits[i] ? C.onk : C.ink3; ctx.fillText(lut.bits[i] ? '1' : '0', x + cw / 2, sy + sh / 2 + 0.5); }
    } else {
      ctx.globalAlpha = 0.6; ctx.strokeStyle = C.rule2; ctx.lineWidth = 1; ctx.strokeRect(x + 1, sy + 0.5, cw - 2, sh - 1);
    }
    ctx.globalAlpha = 1;
  }
  for (let i = 8; i < 64; i += 8) { ctx.strokeStyle = C.ink3; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.moveTo(x0 + i * cw, sy - 3); ctx.lineTo(x0 + i * cw, sy + sh + 3); ctx.stroke(); ctx.globalAlpha = 1; }
  ctx.font = font(9); ctx.fillStyle = C.ink3; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let i = 0; i < 64; i += 8) ctx.fillText(String(i), x0 + (i + 0.5) * cw, sy + sh + 4);
  if (used < 64 && revealed >= 64) { const t = `bits ${used}–63 repeat bits 0–${used - 1}`; ctx.textAlign = 'left'; if (x0 + used * cw + 2 + ctx.measureText(t).width < x1) ctx.fillText(t, x0 + used * cw + 2, sy + sh + 15); }
  // cursor
  const cur = writeAddr >= 0 ? writeAddr : readAddr;
  if (cur >= 0) {
    const cx = x0 + (cur + 0.5) * cw;
    ctx.strokeStyle = writeAddr >= 0 ? C.copper : C.ink; ctx.lineWidth = 2; ctx.strokeRect(x0 + cur * cw - 0.5, sy - 2, cw + 1, sh + 4);
    if (writeAddr >= 0) { ctx.fillStyle = C.copper; ctx.beginPath(); ctx.moveTo(cx - 4, sy - 9); ctx.lineTo(cx + 4, sy - 9); ctx.lineTo(cx, sy - 3); ctx.closePath(); ctx.fill(); }
  }
  // mux tree
  const ty0 = sy + sh + 30; const ty1 = rect.y + rect.h - 42;
  const lv = L => ty0 + (L + 1) * (ty1 - ty0) / 6 - (ty1 - ty0) / 12;
  const nx = (L, j) => x0 + (j + 0.5) * (1 << (L + 1)) * cw;
  const addr = writeAddr >= 0 ? writeAddr : readAddr;
  ctx.lineWidth = 1; ctx.strokeStyle = C.rule;
  ctx.beginPath();
  for (let L = 0; L < 6; L++) {
    const n = 64 >> (L + 1); const y = lv(L);
    for (let j = 0; j < n; j++) {
      const x = nx(L, j);
      for (const c of [2 * j, 2 * j + 1]) {
        const cx = L === 0 ? x0 + (c + 0.5) * cw : nx(L - 1, c); const cy = L === 0 ? sy + sh : lv(L - 1) + 3;
        ctx.moveTo(cx, cy); ctx.lineTo(x, y - 3);
      }
    }
  }
  ctx.stroke();
  // active path
  ctx.strokeStyle = writeAddr >= 0 ? C.copper : C.sram; ctx.lineWidth = 2.2; ctx.beginPath();
  let px = x0 + (addr + 0.5) * cw, py = sy + sh;
  ctx.moveTo(px, py);
  for (let L = 0; L < 6; L++) { const x = nx(L, addr >> (L + 1)), y = lv(L); ctx.lineTo(x, y - 3); ctx.moveTo(x, y + 3); px = x; py = y; }
  ctx.lineTo(px, ty1 + 6); ctx.stroke();
  // mux glyphs and level labels
  for (let L = 0; L < 6; L++) {
    const n = 64 >> (L + 1); const y = lv(L); const span = (1 << (L + 1)) * cw;
    const mw = clamp(span * 0.42, 3, 18), mh = clamp(5 + L, 5, 11);
    const act = addr >> (L + 1);
    for (let j = 0; j < n; j++) {
      const x = nx(L, j);
      ctx.beginPath(); ctx.moveTo(x - mw / 2, y - mh / 2); ctx.lineTo(x + mw / 2, y - mh / 2); ctx.lineTo(x + mw * 0.3, y + mh / 2); ctx.lineTo(x - mw * 0.3, y + mh / 2); ctx.closePath();
      ctx.fillStyle = j === act ? (writeAddr >= 0 ? C.copper : C.sram) : C.panel; ctx.fill();
      ctx.strokeStyle = j === act ? (writeAddr >= 0 ? C.copper : C.sram) : C.ink3; ctx.lineWidth = 1; ctx.stroke();
    }
    const leaf = lut.leaves[L]; const b = (addr >> L) & 1;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.font = font(10.5, 600); ctx.fillStyle = leaf === undefined ? C.ink3 : C.ink;
    const nm = leaf === undefined ? 'unused' : leafLabel(leaf);
    const txt = `I${L} ${nm.length > 9 ? nm.slice(0, 8) + '…' : nm}` + (leaf === undefined ? '' : ` = ${b}`);
    ctx.globalAlpha = leaf === undefined ? 0.6 : 1; ctx.fillText(txt, x0 - 8, y); ctx.globalAlpha = 1;
  }
  // output
  const ox = nx(5, 0); const v = lut.bits[addr];
  const shown = writeAddr >= 0 ? (writeAddr < revealed ? v : null) : v;
  ctx.font = font(12, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = writeAddr >= 0 ? C.copper : C.sram;
  ctx.fillText(`O = ${shown === null ? '…' : shown}`, ox, ty1 + 9);
  // write narration
  if (writeAddr >= 0) {
    const ins = lut.leaves.map((f, i) => `${leafLabel(f)}=${(writeAddr >> i) & 1}`).join(' ');
    ctx.font = font(10.5, 500); ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = C.ink2;
    const msg = `writing bit ${writeAddr}: ${ins || 'constant'} → ${lut.bits[writeAddr]}`;
    const maxc = Math.max(20, Math.floor(rect.w / 6.6));
    ctx.fillText(msg.length > maxc ? msg.slice(0, maxc - 1) + '…' : msg, rect.x, ty1 + 26);
  } else {
    ctx.font = font(10.5, 500); ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = C.ink3;
    ctx.fillText('click a bit, or toggle I0–I5 below, to read the LUT', rect.x, ty1 + 26);
  }
  return { x0, cw, sy, sh };
}

/* ---------- fabric drawing ---------- */
function fabGeom(rect, G, pad) {
  const pitch = Math.max(8, Math.floor(Math.min((rect.w - 2 * pad) / G, (rect.h - 2 * pad) / G)));
  const ox = Math.round(rect.x + (rect.w - pitch * G) / 2), oy = Math.round(rect.y + (rect.h - pitch * G) / 2);
  return { pitch, ox, oy, G, cx: x => ox + (x + 0.5) * pitch, cy: y => oy + (y + 0.5) * pitch, px: i => ox + i * pitch, py: j => oy + j * pitch };
}
function drawFabricBase(F, fab, inset) {
  for (const s of fab.sites) {
    const x = F.px(s.x), y = F.py(s.y);
    if (s.kind === 'clb') {
      const d = F.pitch * inset; ctx.fillStyle = C.tile; roundRect(x + d, y + d, F.pitch - 2 * d, F.pitch - 2 * d, Math.min(4, F.pitch * 0.08)); ctx.fill();
      ctx.strokeStyle = C.rule2; ctx.lineWidth = 1; ctx.stroke();
    } else {
      const d = F.pitch * 0.3; ctx.strokeStyle = C.rule; ctx.lineWidth = 1; ctx.setLineDash([2, 2]);
      ctx.strokeRect(x + d + 0.5, y + d + 0.5, F.pitch - 2 * d - 1, F.pitch - 2 * d - 1); ctx.setLineDash([]);
    }
  }
}
function cellPx(F, i, P) {
  if (P) { const s = ST.R.D.fab.sites[P.pos[i]]; return [F.cx(s.x), F.cy(s.y)]; }
  return [F.cx(ST.disp[2 * i]), F.cy(ST.disp[2 * i + 1])];
}
function drawCells(F, P, opts = {}) {
  const D = ST.R.D; const G = F.G; const fsz = clamp(F.pitch * 0.27, 7.5, 11.5);
  D.cells.forEach((c, i) => {
    let [x, y] = cellPx(F, i, opts.exact ? P : null);
    if (ST.drag && ST.drag.cell === i && ST.drag.moved) { x = ST.drag.x; y = ST.drag.y; }
    const dim = opts.dimCell && !opts.dimCell(i);
    ctx.globalAlpha = dim ? 0.28 : 1;
    if (c.kind === 'lut') {
      const s = F.pitch * 0.62; ctx.fillStyle = lutColor(c.lut); roundRect(x - s / 2, y - s / 2, s, s, Math.min(5, s * 0.14)); ctx.fill();
      if (ST.sel === i || ST.hover === i || (ST.drag && ST.drag.cell === i)) { ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.stroke(); }
      if (F.pitch >= 20) { ctx.font = font(fsz, 600); ctx.fillStyle = C.onk; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(c.label, x, y + 0.5); }
    } else {
      const s = F.pitch * 0.36; ctx.fillStyle = c.kind === 'in' ? C.ink2 : C.ink;
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
      if (ST.sel === i || ST.hover === i || (ST.drag && ST.drag.cell === i)) { ctx.strokeStyle = C.copper; ctx.lineWidth = 2; ctx.strokeRect(x - s / 2 - 2, y - s / 2 - 2, s + 4, s + 4); }
      // label outside the ring
      const tx = (x - F.ox) / F.pitch, ty = (y - F.oy) / F.pitch;
      ctx.font = font(fsz, 500); ctx.fillStyle = C.ink2;
      let lx = x, ly = y; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (ty < 1) { ly = F.oy - 6; ctx.textBaseline = 'bottom'; }
      else if (ty > G - 1) { ly = F.oy + G * F.pitch + 6; ctx.textBaseline = 'top'; }
      else if (tx < 1) { lx = F.ox - 6; ctx.textAlign = 'right'; }
      else if (tx > G - 1) { lx = F.ox + G * F.pitch + 6; ctx.textAlign = 'left'; }
      else { ly = y - s; ctx.textBaseline = 'bottom'; }
      ctx.fillText(c.label, lx, ly);
      // direction mark
      ctx.fillStyle = C.view; ctx.font = font(Math.max(7, s * 0.7), 700); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (s >= 9) ctx.fillText(c.kind === 'in' ? '›' : '‹', x, y + 0.5);
    }
    ctx.globalAlpha = 1;
  });
}
function drawFlylines(F, P, focus) {
  const D = ST.R.D;
  const focusNets = new Set(focus >= 0 ? D.cellNets[focus] : []);
  for (let pass = 0; pass < 2; pass++) {
    D.nets.forEach((n, ni) => {
      const hot = focusNets.has(ni); if ((pass === 1) !== hot) return;
      const [dx, dy] = cellPx(F, n.driver);
      ctx.strokeStyle = hot ? C.copper : C.ink3; ctx.globalAlpha = hot ? 0.95 : (focus >= 0 ? 0.18 : 0.42); ctx.lineWidth = hot ? 1.8 : 1;
      ctx.beginPath();
      for (const s of n.sinks) { const [sx, sy] = cellPx(F, s); ctx.moveTo(dx, dy); ctx.lineTo(sx, sy); }
      ctx.stroke();
      if (hot) {
        let x0 = dx, x1 = dx, y0 = dy, y1 = dy;
        for (const s of n.sinks) { const [sx, sy] = cellPx(F, s); x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy); }
        ctx.setLineDash([3, 3]); ctx.lineWidth = 1; ctx.globalAlpha = 0.6; ctx.strokeRect(x0 - 3, y0 - 3, x1 - x0 + 6, y1 - y0 + 6); ctx.setLineDash([]);
      }
    });
  }
  ctx.globalAlpha = 1;
}

/* ---------- routing drawing ---------- */
function segEnds(F, s) { const sg = ST.R.D.rrg.seg[s]; return [F.px(sg.x0), F.py(sg.y0), F.px(sg.x1), F.py(sg.y1), sg.h]; }
function drawRouting(F, RT, routes, occ, nVisible, opts = {}) {
  const D = ST.R.D; const R = D.rrg; const W = RT.W;
  const gap = F.pitch * 0.36;
  // heat overlay
  if (ST.showHeat && !opts.noHeat) {
    const G = F.G; const off = drawRouting.off || (drawRouting.off = document.createElement('canvas'));
    off.width = G; off.height = G; const oc = off.getContext('2d'); const img = oc.createImageData(G, G);
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
      const ps = R.pins(x, y); let sum = 0, mx = 0; for (const s of ps) { const r = occ[s] / W; sum += r; mx = Math.max(mx, r); }
      const r = 0.5 * (sum / 4) + 0.5 * mx; const c = heatRgb(r); const a = r <= 0 ? 0 : clamp(0.08 + 0.34 * Math.min(1.2, r), 0, 0.46);
      const k = (y * G + x) * 4; img.data[k] = c[0]; img.data[k + 1] = c[1]; img.data[k + 2] = c[2]; img.data[k + 3] = Math.round(a * 255);
    }
    oc.putImageData(img, 0, 0);
    ctx.save(); ctx.imageSmoothingEnabled = true; ctx.globalAlpha = opts.dim ? 0.35 : 0.85;
    ctx.drawImage(off, F.ox, F.oy, F.pitch * G, F.pitch * G); ctx.restore();
  }
  // channel bars
  for (let s = 0; s < R.S; s++) {
    const o = occ[s]; if (!o) continue;
    const [ax, ay, bx, by] = segEnds(F, s); const r = o / W;
    ctx.strokeStyle = rgba(heatRgb(r), opts.dim ? 0.3 : 0.6); ctx.lineWidth = 1.5 + Math.min(1, r) * Math.max(1.5, gap * 0.22) + (r > 1 ? 2 : 0);
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  }
  // wires
  if (ST.showWires && !opts.noWires) {
    const cnt = new Int16Array(R.S); const trackOf = new Map();
    const tg = Math.min(gap * 0.85 / Math.max(1, W), 4.5);
    const order = RT.order;
    const shown = order.slice(0, nVisible);
    for (const ni of shown) { const r = routes[ni]; if (!r) continue; const m = new Map(); for (const s of r.segs) m.set(s, cnt[s]++); trackOf.set(ni, m); }
    const offOf = (s, t) => (t - (Math.min(occ[s], 999) - 1) / 2) * tg;
    for (const ni of shown) {
      const r = routes[ni]; if (!r) continue; const m = trackOf.get(ni);
      const pt = (s, cornerX, cornerY) => { const sg = R.seg[s]; const o = offOf(s, m.get(s)); return sg.h ? [cornerX, cornerY + o] : [cornerX + o, cornerY]; };
      ctx.globalAlpha = opts.dim ? 0.22 : 0.95;
      for (const pass of [0, 1]) for (const s of r.segs) {
        const t = m.get(s);
        ctx.strokeStyle = pass ? (t >= W ? C.hot : C.copper) : C.view; ctx.lineWidth = pass ? 1.2 : 2.8;
        const [ax, ay, bx, by, h] = segEnds(F, s); const o = offOf(s, t);
        ctx.beginPath(); if (h) { ctx.moveTo(ax, ay + o); ctx.lineTo(bx, by + o); } else { ctx.moveTo(ax + o, ay); ctx.lineTo(bx + o, by); } ctx.stroke();
      }
      ctx.lineWidth = 1.2;
      // joins at corners
      ctx.strokeStyle = C.copper; ctx.beginPath();
      for (const [sc, si] of r.sinks) {
        const p = si.path;
        for (let k = 1; k < p.length; k++) {
          const a = R.seg[p[k - 1]], b = R.seg[p[k]];
          let cx, cy;
          if ((a.x0 === b.x0 && a.y0 === b.y0) || (a.x0 === b.x1 && a.y0 === b.y1)) { cx = a.x0; cy = a.y0; } else { cx = a.x1; cy = a.y1; }
          const X = F.px(cx), Y = F.py(cy); const A = pt(p[k - 1], X, Y), B = pt(p[k], X, Y);
          ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]);
        }
        // pin stubs
        const [sx, sy] = cellPx(F, sc, ST.P); const last = p[p.length - 1]; const [ax, ay, bx, by] = segEnds(F, last);
        ctx.moveTo(sx, sy); ctx.lineTo((ax + bx) / 2, (ay + by) / 2);
        if (p.length) { const first = p[0]; const [fx, fy, gx, gy] = segEnds(F, first); const net = D.nets[ni]; const [dx, dy] = cellPx(F, net.driver, ST.P); ctx.moveTo(dx, dy); ctx.lineTo((fx + gx) / 2, (fy + gy) / 2); }
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

/* ---------- critical path geometry ---------- */
function pathPolyline(F, el) {
  const R = ST.R.D.rrg; const P = ST.P;
  const pts = [cellPx(F, el.from, P)];
  const segs = el.segs || [];
  if (segs.length) {
    const mid = s => { const [ax, ay, bx, by] = segEnds(F, s); return [(ax + bx) / 2, (ay + by) / 2]; };
    pts.push(mid(segs[0]));
    for (let k = 1; k < segs.length; k++) {
      const a = R.seg[segs[k - 1]], b = R.seg[segs[k]];
      let cx, cy; if ((a.x0 === b.x0 && a.y0 === b.y0) || (a.x0 === b.x1 && a.y0 === b.y1)) { cx = a.x0; cy = a.y0; } else { cx = a.x1; cy = a.y1; }
      pts.push([F.px(cx), F.py(cy)]);
    }
    pts.push(mid(segs[segs.length - 1]));
  }
  pts.push(cellPx(F, el.to, P));
  return pts;
}
function polyLen(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; }
function polyAt(pts, f) {
  const total = polyLen(pts); let want = f * total;
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); if (want <= l || i === pts.length - 1) { const t = l ? clamp(want / l, 0, 1) : 0; return [lerp(pts[i - 1][0], pts[i][0], t), lerp(pts[i - 1][1], pts[i][1], t)]; } want -= l; }
  return pts[pts.length - 1];
}

/* ---------- stage renderers ---------- */
function renderSynth(now) {
  const S = ST.R.S; const rect = { x: 14, y: 40, w: VW - 28, h: VH - 54 };
  caption(`Gate netlist · ${S.gates.length} gates · depth ${S.depth}`);
  let reveal; if (ST.anim && ST.anim.kind === 'synth') { reveal = ease(animP(now)) * (S.depth + 2.2); }
  if (!S.gates.length && !S.pos.length) return;
  drawSchem(rect, { reveal });
  if (ST.anim && ST.anim.kind === 'synth' && animP(now) >= 1) animFinished();
}
function renderMap(now) {
  const R = ST.R; const n = R.M.luts.length;
  let revealed = 64, writeAddr = -1;
  if (ST.anim && ST.anim.kind === 'map') {
    const p = animP(now); const a = ST.anim;
    const idx = Math.min(n - 1, Math.floor(p * n)); const local = clamp(p * n - idx, 0, 1);
    if (ST.selLut !== idx) { ST.selLut = idx; ST.lutAddr = 0; buildControls(); updateReadout(true); }
    revealed = Math.floor(ease(Math.min(1, local / 0.92)) * 64); writeAddr = revealed >= 64 ? -1 : revealed;
    if (p >= 1) { revealed = 64; writeAddr = -1; animFinished(); }
    void a;
  }
  const narrow = VW < 560;
  const topH = Math.round((VH - 40) * (narrow ? 0.36 : 0.4));
  caption(`Gate netlist cut into ${n} LUT cone${n === 1 ? '' : 's'}`);
  drawSchem({ x: 14, y: 46, w: VW - 28, h: topH - 12 }, { luts: true });
  const ly = 40 + topH + 10;
  ctx.strokeStyle = C.rule2; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(14, ly - 6); ctx.lineTo(VW - 14, ly - 6); ctx.stroke();
  ST.lutGeom = drawLutCore({ x: 14, y: ly + 4, w: VW - 28, h: VH - ly - 12 }, R.M.luts[ST.selLut], { revealed, writeAddr, readAddr: ST.lutAddr });
}
function fabRect() { return { x: 10, y: 34, w: VW - 20, h: VH - 44 }; }
const fabPad = () => VW < 560 ? 34 : 28;
function renderPlace(now) {
  const D = ST.R.D; const F = fabGeom(fabRect(), D.fab.G, fabPad()); ST.fab = F;
  caption(VW < 560 ? `${D.fab.N}×${D.fab.N} logic sites` : `Fabric · ${D.fab.N}×${D.fab.N} logic sites · ${D.fab.io.length} I/O pads`);
  const A = ST.ann;
  ctx.font = font(11, 600); ctx.textAlign = 'right'; ctx.fillStyle = C.copper; ctx.textBaseline = 'alphabetic';
  ctx.fillText(`${Math.round(A.cost)} tiles`, VW - 14, 22);
  ctx.fillStyle = C.ink3; const tw = ctx.measureText(`${Math.round(A.cost)} tiles`).width;
  ctx.font = font(10.5, 500); ctx.fillText(`T ${fmtT(A.T)}   ·   `, VW - 14 - tw, 22);
  drawFabricBase(F, D.fab, 0.17);
  const focus = ST.drag ? ST.drag.cell : ST.sel >= 0 ? ST.sel : ST.hover;
  drawFlylines(F, ST.P, focus);
  drawCells(F, ST.P);
}
function renderRoute(now) {
  const D = ST.R.D; const RT = ST.RT; const F = fabGeom(fabRect(), D.fab.G, fabPad()); ST.fab = F;
  let occ = RT.occ, routes = RT.routes, nVis = D.nets.length, itLabel = RT.iters.length, over = RT.over;
  if (ST.anim && ST.anim.kind === 'route') {
    const a = ST.anim; const t = (now - a.t0) / 1000; const p = animP(now);
    if (RM || p >= 1) { animFinished(); }
    else if (t < a.d1) {
      const it = RT.iters[0]; routes = it.routes; nVis = Math.floor(clamp(t / (a.d1 * 0.92), 0, 1) * D.nets.length);
      occ = new Int16Array(D.rrg.S); for (const ni of RT.order.slice(0, nVis)) { const r = routes[ni]; if (r) for (const s of r.segs) occ[s]++; }
      itLabel = 1; over = 0; for (let s = 0; s < occ.length; s++) if (occ[s] > RT.W) over++;
    } else {
      const idx = a.k <= 1 ? 0 : Math.min(a.k - 1, Math.floor((t - a.d1) / a.per));
      const it = RT.iters[idx];
      occ = it.occ; routes = it.routes; itLabel = it.it; over = it.over;
    }
  }
  caption(VW < 560 ? `W = ${RT.W} · iteration ${itLabel}` : `Channels · W = ${RT.W} tracks · iteration ${itLabel}`);
  ctx.font = font(11, 600); ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = over ? C.hot : C.logic;
  ctx.fillText(over ? `${over} overused` : 'no overuse', VW - 14, 22);
  drawFabricBase(F, D.fab, 0.2);
  drawRouting(F, RT, routes, occ, nVis);
  drawCells(F, ST.P, { exact: true });
  // legend, only where it clears the fabric
  const lx = 14, ly = VH - 14; const lw = Math.min(150, VW * 0.3);
  if (F.oy + F.G * F.pitch + 30 > ly - 18 && F.ox < lx + lw + 40) return;
  const grd = ctx.createLinearGradient(lx, 0, lx + lw, 0);
  [0, 0.3, 0.6, 0.8, 1].forEach(v => grd.addColorStop(v * 0.85, rgba(heatRgb(v), 1))); grd.addColorStop(1, C.hot);
  ctx.fillStyle = grd; ctx.fillRect(lx, ly - 6, lw, 5);
  ctx.font = font(9.5); ctx.fillStyle = C.ink3; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText('empty', lx, ly - 9);
  ctx.textAlign = 'right'; ctx.fillText('full → over', lx + lw, ly - 9);
}
function renderTime(now) {
  const D = ST.R.D; const RT = ST.RT; const T = ST.ideal ? ST.TMi : ST.TM; const Tr = ST.TM;
  const barH = 74; const F = fabGeom({ x: 10, y: 34, w: VW - 20, h: VH - 44 - barH }, D.fab.G, fabPad()); ST.fab = F;
  caption(VW < 560 ? `Critical path · ${ns(T.total)} ns` : `Critical path · ${T.crit ? T.crit.name : ''} · ${ns(T.total)} ns`);
  drawFabricBase(F, D.fab, 0.2);
  drawRouting(F, RT, RT.routes, RT.occ, D.nets.length, { dim: true, noHeat: true });
  const onPath = new Set(T.path.filter(e => e.kind !== 'net').map(e => e.cell));
  drawCells(F, ST.P, { exact: true, dimCell: i => onPath.has(i) });
  // path polylines
  const els = T.path.map(e => e.kind === 'net' ? { ...e, pts: pathPolyline(F, e) } : e);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const e of els) if (e.kind === 'net') {
    ctx.strokeStyle = C.copper; ctx.lineWidth = 3.2; ctx.globalAlpha = ST.ideal ? 0.35 : 1;
    ctx.beginPath(); e.pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); ctx.globalAlpha = 1;
  }
  // pulse
  const p = ST.anim && ST.anim.kind === 'time' ? animP(now) : 1;
  if (ST.anim && ST.anim.kind === 'time' && p >= 1) animFinished();
  const tau = p * T.total; let acc = 0; let pos = null;
  for (const e of els) {
    const t0 = acc, t1 = acc + e.d; acc = t1;
    if (tau <= t1 || e === els[els.length - 1]) {
      const f = e.d > 0 ? clamp((tau - t0) / e.d, 0, 1) : 1;
      if (e.kind === 'net') pos = polyAt(e.pts, f); else pos = cellPx(F, e.cell, ST.P);
      break;
    }
  }
  // arrival labels at path cells
  let tt = 0; ctx.font = font(10, 600); ctx.textBaseline = 'bottom'; ctx.textAlign = 'center';
  for (const e of els) {
    tt += e.d;
    if (e.kind === 'lut' || e.kind === 'obuf') {
      if (tt > tau + 1e-9 && p < 1) continue;
      const [x, y] = cellPx(F, e.cell, ST.P); const lab = ns(tt) + ' ns';
      const w = ctx.measureText(lab).width + 8; const yy = y - F.pitch * 0.36 - 3;
      ctx.fillStyle = C.view; ctx.globalAlpha = 0.9; ctx.fillRect(x - w / 2, yy - 13, w, 13); ctx.globalAlpha = 1;
      ctx.fillStyle = e.kind === 'lut' ? C.logic : C.ink; ctx.fillText(lab, x, yy);
    }
  }
  if (pos && p < 1) {
    const [x, y] = pos;
    const g = ctx.createRadialGradient(x, y, 0, x, y, 16); g.addColorStop(0, rgba(C.copper_, 0.55)); g.addColorStop(1, rgba(C.copper_, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.copper; ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill();
  }
  // time bar
  const bx0 = 16, bx1 = VW - 16, by = VH - barH + 18, bh = 18;
  const scale = (bx1 - bx0) / Math.max(0.001, Math.max(Tr.total, T.total));
  ctx.font = font(10, 500); ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillStyle = C.ink3;
  ctx.fillText('DELAY ALONG THE PATH', bx0, by - 5);
  if (ST.ideal) { ctx.setLineDash([3, 3]); ctx.strokeStyle = C.ink3; ctx.lineWidth = 1; ctx.strokeRect(bx0 + 0.5, by + 0.5, Tr.total * scale - 1, bh - 1); ctx.setLineDash([]); }
  let x = bx0;
  for (const e of els) {
    const w = e.d * scale; if (w <= 0) continue;
    ctx.fillStyle = e.kind === 'net' ? C.copper : e.kind === 'lut' ? C.logic : C.ink3;
    ctx.fillRect(x, by, Math.max(1, w - 1), bh);
    if (w > 30) {
      const lab = e.kind === 'net' ? `${e.hops} seg` : e.kind === 'lut' ? D.cells[e.cell].label : e.kind === 'ibuf' ? 'in' : 'out';
      ctx.font = font(9.5, 600); ctx.fillStyle = e.kind === 'ibuf' || e.kind === 'obuf' ? C.view : C.onk; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(lab, x + w / 2, by + bh / 2 + 0.5);
    }
    x += w;
  }
  ctx.font = font(9.5); ctx.fillStyle = C.ink3; ctx.textBaseline = 'top'; ctx.textAlign = 'center';
  const maxT = Math.max(Tr.total, T.total); const step = maxT > 6 ? 1 : 0.5;
  for (let t = 0; t <= maxT + 1e-9; t += step) { const xx = bx0 + t * scale; ctx.fillRect(xx, by + bh + 1, 1, 4); ctx.fillText(t.toFixed(step < 1 ? 1 : 0), xx, by + bh + 6); }
  ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillStyle = C.ink; ctx.font = font(11, 700); ctx.fillText(`${ns(T.total)} ns`, bx1, by - 4);
  if (p < 1) { const cx = bx0 + tau * scale; ctx.fillStyle = C.ink; ctx.fillRect(cx - 1, by - 4, 2, bh + 8); }
  // legend chips
  const leg = [['wire', C.copper], ['LUT', C.logic], ['I/O', C.ink3]]; let lxx = bx0 + 160; ctx.textBaseline = 'bottom'; ctx.textAlign = 'left'; ctx.font = font(10, 500);
  if (VW > 420) for (const [l, c] of leg) { ctx.fillStyle = c; ctx.fillRect(lxx, by - 13, 8, 8); ctx.fillStyle = C.ink2; ctx.fillText(l, lxx + 11, by - 4); lxx += ctx.measureText(l).width + 26; }
}
function renderRace(now) {
  const D = ST.R.D; const F = fabGeom({ x: 10, y: 44, w: VW - 20, h: VH - 54 }, D.fab.G, fabPad()); ST.fab = F;
  const r = ST.race, res = ST.raceRes; const P = boardP();
  drawFabricBase(F, D.fab, 0.17);
  const focus = ST.drag ? ST.drag.cell : ST.sel >= 0 ? ST.sel : ST.hover;
  drawFlylines(F, P, focus);
  drawCells(F, P);
  // HUD
  const you = r ? r.userCost : res ? res.you : totalHPWL(D, P);
  const bot = r ? Math.round(r.ann.cost) : res ? res.bot : null;
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  ctx.font = font(10, 500); ctx.fillStyle = C.ink3; ctx.fillText('YOU', 14, 18);
  ctx.font = font(20, 700, DISP); ctx.fillStyle = C.copper; ctx.fillText(String(you), 14, 38);
  const yw = Math.max(44, ctx.measureText(String(you)).width + 22);
  if (bot !== null) {
    ctx.font = font(10, 500); ctx.fillStyle = C.ink3; ctx.fillText('ANNEALER', 14 + yw, 18);
    ctx.font = font(20, 700, DISP); ctx.fillStyle = C.ink2; ctx.fillText(String(bot), 14 + yw, 38);
  }
  if (r) {
    const left = Math.max(0, RACE_MS - (now - r.t0)); const fr = left / RACE_MS;
    ctx.textAlign = 'right'; ctx.font = font(20, 700, DISP); ctx.fillStyle = C.ink; ctx.fillText((left / 1000).toFixed(1) + ' s', VW - 14, 38);
    ctx.fillStyle = C.rule2; ctx.fillRect(VW - 134, 44, 120, 3); ctx.fillStyle = C.copper; ctx.fillRect(VW - 134, 44, 120 * fr, 3);
    // mini annealer board
    const mw = clamp(VW * 0.2, 70, 130);
    if (F.ox + F.G * F.pitch + 44 > VW - mw - 12) return;
    const mF = fabGeom({ x: VW - mw - 12, y: 54, w: mw, h: mw }, D.fab.G, 0);
    ctx.globalAlpha = 0.95; ctx.fillStyle = C.view; ctx.fillRect(mF.ox - 4, mF.oy - 4, mF.pitch * mF.G + 8, mF.pitch * mF.G + 8); ctx.globalAlpha = 1;
    ctx.strokeStyle = C.rule; ctx.lineWidth = 1; ctx.strokeRect(mF.ox - 3.5, mF.oy - 3.5, mF.pitch * mF.G + 7, mF.pitch * mF.G + 7);
    ctx.strokeStyle = C.ink3; ctx.globalAlpha = 0.35; ctx.beginPath();
    for (const n of D.nets) { const s0 = D.fab.sites[r.bot.pos[n.driver]]; for (const sk of n.sinks) { const s1 = D.fab.sites[r.bot.pos[sk]]; ctx.moveTo(mF.cx(s0.x), mF.cy(s0.y)); ctx.lineTo(mF.cx(s1.x), mF.cy(s1.y)); } }
    ctx.stroke(); ctx.globalAlpha = 1;
    D.cells.forEach((c, i) => { const s = D.fab.sites[r.bot.pos[i]]; const sz = c.kind === 'lut' ? mF.pitch * 0.6 : mF.pitch * 0.35; ctx.fillStyle = c.kind === 'lut' ? lutColor(c.lut) : C.ink2; ctx.fillRect(mF.cx(s.x) - sz / 2, mF.cy(s.y) - sz / 2, sz, sz); });
    ctx.font = font(9.5, 500); ctx.fillStyle = C.ink3; ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText("annealer's board", VW - 12, mF.oy + mF.pitch * mF.G + 6);
  } else if (res) {
    const diff = res.bot - res.you;
    const msg = diff > 0 ? 'You win' : diff === 0 ? 'Tie' : 'The annealer wins';
    const sub = diff === 0 ? `Both at ${res.you} tiles` : `by ${Math.abs(diff)} tile${Math.abs(diff) === 1 ? '' : 's'} of wire · ${res.moves} moves vs ${res.botMoves.toLocaleString()}`;
    banner(msg, sub, diff >= 0 ? C.logic : C.copper);
  } else {
    banner('Ready when you are', 'Press Start, then drag cells to shorten the wires', C.ink);
  }
}
function banner(title, sub, col) {
  ctx.font = font(22, 800, DISP); const w1 = ctx.measureText(title).width; ctx.font = font(11.5, 500); const w2 = ctx.measureText(sub).width;
  const w = Math.min(VW - 40, Math.max(w1, w2) + 40), h = 70, x = (VW - w) / 2, y = VH / 2 - h / 2;
  ctx.globalAlpha = 0.94; ctx.fillStyle = C.view; roundRect(x, y, w, h, 6); ctx.fill(); ctx.globalAlpha = 1;
  ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.font = font(22, 800, DISP); ctx.fillStyle = col; ctx.fillText(title, VW / 2, y + 32);
  ctx.font = font(11.5, 500); ctx.fillStyle = C.ink2; ctx.fillText(sub, VW / 2, y + 52, w - 20);
}

/* ---------- frame loop ---------- */
let raf = 0;
function kick() { if (!raf) raf = requestAnimationFrame(frame); }
function frame(now) {
  raf = 0; if (!ST.R) return;
  let more = false;
  if (ST.stage === 'place' && ST.annRunning && !ST.drag) {
    const A = ST.ann; A.auto = ST.autoCool;
    A.step(Math.max(1, Math.round(A.mpt * SPEEDS[ST.speed - 1])));
    ST.placeVer++;
    if (A.frozen) annealDone();
    syncControls(); updateReadout(false); more = true;
  }
  if (ST.stage === 'race' && ST.race) { more = tickRace(now) || more; updateReadout(false); }
  // glide cells toward their sites
  const P = boardP();
  if (P && ST.disp && (ST.stage === 'place' || ST.stage === 'race')) {
    const S = ST.R.D.fab.sites; const k = RM ? 1 : 0.28;
    for (let i = 0; i < ST.R.D.cells.length; i++) {
      const s = S[P.pos[i]]; const dx = s.x - ST.disp[2 * i], dy = s.y - ST.disp[2 * i + 1];
      if (Math.abs(dx) > 0.002 || Math.abs(dy) > 0.002) { ST.disp[2 * i] += dx * k; ST.disp[2 * i + 1] += dy * k; more = true; }
      else { ST.disp[2 * i] = s.x; ST.disp[2 * i + 1] = s.y; }
    }
  }
  if (ST.anim) more = true;
  render(now);
  if (ST.anim) more = true;
  if (more) kick();
}
function render(now) {
  ctx.save(); ctx.clearRect(0, 0, VW, VH); ctx.fillStyle = C.view; ctx.fillRect(0, 0, VW, VH);
  try {
    switch (ST.stage) {
      case 'synth': renderSynth(now); break;
      case 'map': renderMap(now); break;
      case 'place': renderPlace(now); break;
      case 'route': renderRoute(now); break;
      case 'time': renderTime(now); break;
      case 'race': renderRace(now); break;
    }
  } catch (e) { console.error(e); }
  ctx.restore();
}

/* ---------- pointer interaction ---------- */
function evPt(e) { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
function hitCell(x, y) {
  const F = ST.fab; if (!F) return -1; const D = ST.R.D; let best = -1, bd = Infinity;
  D.cells.forEach((c, i) => {
    const [cx, cy] = cellPx(F, i); const half = c.kind === 'lut' ? F.pitch * 0.36 : F.pitch * 0.34;
    const d = Math.max(Math.abs(x - cx), Math.abs(y - cy)); if (d <= half && d < bd) { bd = d; best = i; }
  });
  return best;
}
function siteAt(x, y) {
  const F = ST.fab; if (!F) return -1; const tx = Math.floor((x - F.ox) / F.pitch), ty = Math.floor((y - F.oy) / F.pitch);
  if (tx < 0 || ty < 0 || tx >= F.G || ty >= F.G) return -1; return ST.R.D.fab.at[ty * F.G + tx];
}
function canEdit() { return ST.stage === 'place' || (ST.stage === 'race' && ST.race); }
function editP() { return ST.stage === 'race' ? ST.race.user : ST.P; }
function doMove(c, s) {
  const D = ST.R.D; const site = D.fab.sites[s]; const kind = D.cells[c].kind;
  if (!site || (kind === 'lut') !== (site.kind === 'clb')) return false;
  const P = editP(); if (P.pos[c] === s) return false;
  placeSwap(P, c, s);
  if (ST.stage === 'race') { ST.race.userCost = totalHPWL(D, P); ST.race.userMoves++; }
  else { ST.ann.recalc(); ST.placeVer++; ST.ann.history.push({ cost: ST.ann.cost, T: ST.ann.T, acc: ST.ann.lastAcc }); updateRailStatus(); }
  updateReadout(true); return true;
}
cv.addEventListener('pointerdown', e => {
  if (!ST.R) return; const [x, y] = evPt(e);
  if (ST.stage === 'map') { mapClick(x, y); return; }
  if (ST.stage === 'race' && !ST.race) return;
  if (!canEdit()) return;
  const c = hitCell(x, y);
  if (c >= 0) {
    ST.drag = { cell: c, x, y, sx: x, sy: y, moved: false }; cv.setPointerCapture(e.pointerId); e.preventDefault(); kick(); return;
  }
  if (ST.sel >= 0) { const s = siteAt(x, y); if (s >= 0 && doMove(ST.sel, s)) { ST.sel = -1; kick(); return; } }
  ST.sel = -1; kick();
});
cv.addEventListener('pointermove', e => {
  if (!ST.R) return; const [x, y] = evPt(e);
  if (ST.drag) { ST.drag.x = x; ST.drag.y = y; if (Math.hypot(x - ST.drag.sx, y - ST.drag.sy) > 4) ST.drag.moved = true; kick(); return; }
  if (ST.stage === 'place' || ST.stage === 'race') {
    const c = hitCell(x, y); if (c !== ST.hover) { ST.hover = c; kick(); }
    cv.style.cursor = c >= 0 && canEdit() ? 'grab' : 'default';
  } else if (ST.stage === 'map') {
    cv.style.cursor = mapHit(x, y) ? 'pointer' : 'default';
  } else cv.style.cursor = 'default';
});
const endDrag = e => {
  if (!ST.drag) return; const d = ST.drag; ST.drag = null;
  const [x, y] = evPt(e);
  if (d.moved) { const s = siteAt(x, y); if (s >= 0) doMove(d.cell, s); ST.sel = -1; }
  else if (ST.sel >= 0 && ST.sel !== d.cell) {
    const P = editP(); const t = P.pos[d.cell]; const a = ST.sel; ST.sel = -1;
    if ((ST.R.D.cells[a].kind === 'lut') === (ST.R.D.cells[d.cell].kind === 'lut')) doMove(a, t); else ST.sel = d.cell;
  } else ST.sel = ST.sel === d.cell ? -1 : d.cell;
  kick();
};
cv.addEventListener('pointerup', endDrag);
cv.addEventListener('pointercancel', () => { ST.drag = null; kick(); });
cv.addEventListener('pointerleave', () => { if (!ST.drag && ST.hover >= 0) { ST.hover = -1; kick(); } });
function mapHit(x, y) {
  const g = ST.lutGeom; if (g && y >= g.sy - 4 && y <= g.sy + g.sh + 4 && x >= g.x0 && x <= g.x0 + 64 * g.cw) return { bit: clamp(Math.floor((x - g.x0) / g.cw), 0, 63) };
  const L = ST.layout, G = ST.geom; if (!L || !G) return null;
  for (const it of L.items) if (it.kind === 'gate' && Math.abs(x - it.x) <= G.gw / 2 + 2 && Math.abs(y - it.y) <= G.gh / 2 + 2) return { gate: it.node };
  return null;
}
function mapClick(x, y) {
  const h = mapHit(x, y); if (!h) return; stopFlow(); ST.anim = null;
  if (h.bit !== undefined) { ST.lutAddr = h.bit; }
  else {
    const owners = ST.R.M.gateLut.get(h.gate) || []; if (!owners.length) return;
    const i = owners.indexOf(ST.selLut); ST.selLut = owners[(i + 1) % owners.length]; ST.lutAddr = 0;
  }
  buildControls(); updateReadout(true); kick();
}

/* ---------- theme + resize ---------- */
function onTheme() { readColors(); kick(); if (!chart.hidden) drawChart(); }
try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', onTheme); } catch (e) { /* old Safari */ }
new MutationObserver(onTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
new ResizeObserver(() => sizeCanvas(false)).observe($('view'));
window.addEventListener('resize', () => { sizeChart(); if (!chart.hidden) drawChart(); });

/* ---------- boot ---------- */
function boot(data) {
  readColors();
  let src = data && data.src;
  if (!src) { try { src = localStorage.getItem('inside-the-lut-src'); } catch (e) { src = null; } }
  srcEl.value = src || EXAMPLES[0].src;
  markExample(); liveCheck();
  if (!tryCompile(false)) { srcEl.value = EXAMPLES[0].src; markExample(); liveCheck(); tryCompile(false); }
  if (data && data.stage && STAGES.some(s => s.id === data.stage) && data.stage !== 'race') setStage(data.stage, { animate: false });
  sizeCanvas(true);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { ST.geomKey = ''; kick(); });
}
const hot = window.claude && window.claude.hot;
if (hot && hot.snapshot) { try { hot.snapshot(() => ({ src: srcEl.value, stage: ST.stage })); } catch (e) { /* ignore */ } }
if (hot && hot.ready) hot.ready(boot); else boot(hot && hot.data ? hot.data : {});
})();
