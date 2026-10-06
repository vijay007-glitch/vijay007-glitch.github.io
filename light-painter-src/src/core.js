// Light Painter — imaging core (Abbe partially coherent imaging + threshold resist)
// Works in the browser (window.LPCore) and in Node (module.exports).
(function (root) {
  'use strict';
  const G = 64;            // design grid, cells per side
  const UPS = 2;           // sim pixels per cell
  const N = G * UPS;       // sim grid (128)
  const CD_CELLS = 4;      // a level's CD is 4 cells
  const T_RESIST = 0.3;    // resist threshold, fraction of clear-field intensity
  const LOG2N = Math.round(Math.log2(N));

  // ---------- FFT ----------
  const rev = new Uint16Array(N);
  for (let i = 0; i < N; i++) { let r = 0, x = i; for (let b = 0; b < LOG2N; b++) { r = (r << 1) | (x & 1); x >>= 1; } rev[i] = r; }
  const cosT = new Float64Array(N / 2), sinT = new Float64Array(N / 2);
  for (let i = 0; i < N / 2; i++) { cosT[i] = Math.cos(2 * Math.PI * i / N); sinT[i] = Math.sin(2 * Math.PI * i / N); }

  // in-place FFT of N contiguous values starting at off; inv=true -> +i exponent (unnormalised)
  function fft1(re, im, off, inv) {
    for (let i = 0; i < N; i++) {
      const j = rev[i];
      if (j > i) { const a = off + i, b = off + j; let t = re[a]; re[a] = re[b]; re[b] = t; t = im[a]; im[a] = im[b]; im[b] = t; }
    }
    const sgn = inv ? 1 : -1;
    for (let size = 2; size <= N; size <<= 1) {
      const half = size >> 1, step = N / size;
      for (let i = 0; i < N; i += size) {
        for (let j = 0; j < half; j++) {
          const k = j * step, wr = cosT[k], wi = sgn * sinT[k];
          const a = off + i + j, b = a + half;
          const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        }
      }
    }
  }

  const colRe = new Float64Array(N), colIm = new Float64Array(N);
  function fft2(re, im, inv) {
    for (let y = 0; y < N; y++) fft1(re, im, y * N, inv);
    for (let x = 0; x < N; x++) {
      for (let y = 0; y < N; y++) { colRe[y] = re[y * N + x]; colIm[y] = im[y * N + x]; }
      fft1(colRe, colIm, 0, inv);
      for (let y = 0; y < N; y++) { re[y * N + x] = colRe[y]; im[y * N + x] = colIm[y]; }
    }
  }

  // ---------- mask spectrum ----------
  const sincT = new Float64Array(N);
  for (let k = 0; k < N; k++) { const f = (k < N / 2 ? k : k - N) / N; sincT[k] = f === 0 ? 1 : Math.sin(Math.PI * f) / (Math.PI * f); }

  function maskSpectrum(mask) { // mask: Uint8Array G*G
    const re = new Float64Array(N * N), im = new Float64Array(N * N);
    for (let y = 0; y < N; y++) {
      const cy = y >> 1;
      for (let x = 0; x < N; x++) re[y * N + x] = mask[cy * G + (x >> 1)];
    }
    fft2(re, im, false);
    const s = 1 / (N * N);
    for (let ky = 0; ky < N; ky++) for (let kx = 0; kx < N; kx++) {
      const i = ky * N + kx, f = sincT[kx] * sincT[ky] * s;
      re[i] *= f; im[i] *= f;
    }
    return { re, im };
  }

  // ---------- illumination ----------
  // Point lists in sigma units (fraction of pupil radius). Sampling scales continuously with sigma.
  function sourcePoints(shape, sigma) {
    const pts = [];
    const add = (sx, sy, w) => pts.push({ sx, sy, w });
    if (shape === 'conventional') {
      const K = 3, ms = [1, 10, 16];
      for (let k = 0; k < K; k++) {
        const b0 = sigma * k / K, b1 = sigma * (k + 1) / K;
        const area = Math.PI * (b1 * b1 - b0 * b0);
        if (k === 0) { add(0, 0, area); continue; }
        const rho = (b0 + b1) / 2, m = ms[k];
        for (let j = 0; j < m; j++) { const th = 2 * Math.PI * (j + 0.5 * (k % 2)) / m; add(rho * Math.cos(th), rho * Math.sin(th), area / m); }
      }
    } else if (shape === 'annular') {
      const so = sigma, si = Math.max(0, sigma - 0.3), ms = [16, 20];
      for (let k = 0; k < 2; k++) {
        const b0 = si + (so - si) * k / 2, b1 = si + (so - si) * (k + 1) / 2;
        const area = Math.PI * (b1 * b1 - b0 * b0), rho = (b0 + b1) / 2, m = ms[k];
        for (let j = 0; j < m; j++) { const th = 2 * Math.PI * (j + 0.5 * k) / m; add(rho * Math.cos(th), rho * Math.sin(th), area / m); }
      }
    } else { // dipole-x, dipole-y, quadrupole
      const pr = 0.18, c = Math.max(pr, sigma - pr);
      let centers;
      if (shape === 'dipole-x') centers = [[c, 0], [-c, 0]];
      else if (shape === 'dipole-y') centers = [[0, c], [0, -c]];
      else { const d = c / Math.SQRT2; centers = [[d, d], [-d, d], [-d, -d], [d, -d]]; }
      for (const [cx, cy] of centers) {
        const a0 = Math.PI * Math.pow(pr * 0.45, 2), a1 = Math.PI * pr * pr - a0;
        add(cx, cy, a0);
        for (let j = 0; j < 6; j++) { const th = 2 * Math.PI * j / 6; add(cx + 0.68 * pr * Math.cos(th), cy + 0.68 * pr * Math.sin(th), a1 / 6); }
      }
    }
    const tot = pts.reduce((a, p) => a + p.w, 0);
    pts.forEach(p => { p.w /= tot; });
    return pts;
  }
  // fold +s/-s pairs together (valid at best focus for a real mask and a symmetric pupil)
  function halfSource(pts) {
    const out = [];
    for (const p of pts) {
      const m = out.find(q => Math.abs(q.sx + p.sx) < 1e-9 && Math.abs(q.sy + p.sy) < 1e-9 && !(Math.abs(q.sx) < 1e-12 && Math.abs(q.sy) < 1e-12));
      if (m) m.w += p.w; else out.push({ sx: p.sx, sy: p.sy, w: p.w });
    }
    return out;
  }

  // ---------- aerial image ----------
  const bufRe = new Float64Array(N * N), bufIm = new Float64Array(N * N);
  // opts: { r: pupil radius in bins, src: points, z: defocus nm, lambda, n, NA }
  function aerial(spec, opts, out) {
    out = out || new Float32Array(N * N);
    out.fill(0);
    const r = opts.r, defocus = opts.z && Math.abs(opts.z) > 1e-9;
    const src = defocus ? opts.src : halfSource(opts.src);
    const zl = defocus ? opts.z / opts.lambda : 0, n = opts.n || 1, NA = opts.NA;
    const rows = new Int32Array(N);
    for (const p of src) {
      const cx = -p.sx * r, cy = -p.sy * r;
      const y0 = Math.ceil(cy - r - 0.5), y1 = Math.floor(cy + r + 0.5);
      const x0 = Math.ceil(cx - r - 0.5), x1 = Math.floor(cx + r + 0.5);
      let nRows = 0;
      for (let ky = y0; ky <= y1; ky++) {
        const row = ((ky % N) + N) % N, gy = ky - cy;
        let any = false;
        for (let kx = x0; kx <= x1; kx++) {
          const gx = kx - cx, g = Math.sqrt(gx * gx + gy * gy);
          let a = r + 0.5 - g; if (a <= 0) continue; if (a > 1) a = 1;
          const idx = row * N + (((kx % N) + N) % N);
          let mr = spec.re[idx] * a, mi = spec.im[idx] * a;
          if (defocus) {
            let u = g / r; if (u > 1) u = 1;
            const ph = 2 * Math.PI * zl * (Math.sqrt(n * n - u * u * NA * NA) - n);
            const c = Math.cos(ph), s = Math.sin(ph);
            const t = mr * c - mi * s; mi = mr * s + mi * c; mr = t;
          }
          bufRe[idx] = mr; bufIm[idx] = mi; any = true;
        }
        if (any) rows[nRows++] = row;
      }
      for (let k = 0; k < nRows; k++) fft1(bufRe, bufIm, rows[k] * N, true);
      const w = p.w;
      for (let x = 0; x < N; x++) {
        colRe.fill(0); colIm.fill(0);
        for (let k = 0; k < nRows; k++) { const y = rows[k], i = y * N + x; colRe[y] = bufRe[i]; colIm[y] = bufIm[i]; }
        fft1(colRe, colIm, 0, true);
        for (let y = 0; y < N; y++) out[y * N + x] += w * (colRe[y] * colRe[y] + colIm[y] * colIm[y]);
      }
      for (let k = 0; k < nRows; k++) { const o = rows[k] * N; bufRe.fill(0, o, o + N); bufIm.fill(0, o, o + N); }
    }
    return out;
  }

  // ---------- sampling helpers ----------
  // intensity at cell coordinates (xc, yc), bilinear, periodic
  function sampleCell(I, xc, yc) {
    let x = xc * UPS - 0.5, y = yc * UPS - 0.5;
    const fx = Math.floor(x), fy = Math.floor(y), tx = x - fx, ty = y - fy;
    const x0 = ((fx % N) + N) % N, y0 = ((fy % N) + N) % N, x1 = (x0 + 1) % N, y1 = (y0 + 1) % N;
    return (I[y0 * N + x0] * (1 - tx) + I[y0 * N + x1] * tx) * (1 - ty) + (I[y1 * N + x0] * (1 - tx) + I[y1 * N + x1] * tx) * ty;
  }

  // ---------- target geometry: gauges ----------
  function tget(t, x, y) { return t[(((y % G) + G) % G) * G + (((x % G) + G) % G)]; }
  function inRois(rois, x, y) {
    if (!rois) return true;
    return rois.some(r => x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3]);
  }
  function buildGauges(target, rois) {
    const segs = [];
    // vertical edges at x=i between cells i-1 and i
    for (let i = 0; i < G; i++) {
      for (const inside of [1, -1]) { // inside=1: inside is cell i (normal -x); inside=-1: inside is cell i-1 (normal +x)
        let j = 0;
        while (j < G) {
          const isEdge = jj => { const a = tget(target, i - 1, jj), b = tget(target, i, jj); return inside === 1 ? (b && !a) : (a && !b); };
          if (!isEdge(j)) { j++; continue; }
          const j0 = j; while (j < G && isEdge(j)) j++;
          const inX = inside === 1 ? i : i - 1;
          segs.push({ x: i, y: j0, tx: 0, ty: 1, L: j - j0, nx: inside === 1 ? -1 : 1, ny: 0,
            convex0: !tget(target, inX, j0 - 1), convex1: !tget(target, inX, j) });
        }
      }
    }
    // horizontal edges at y=j between cells j-1 and j
    for (let j = 0; j < G; j++) {
      for (const inside of [1, -1]) {
        let i = 0;
        while (i < G) {
          const isEdge = ii => { const a = tget(target, ii, j - 1), b = tget(target, ii, j); return inside === 1 ? (b && !a) : (a && !b); };
          if (!isEdge(i)) { i++; continue; }
          const i0 = i; while (i < G && isEdge(i)) i++;
          const inY = inside === 1 ? j : j - 1;
          segs.push({ x: i0, y: j, tx: 1, ty: 0, L: i - i0, nx: 0, ny: inside === 1 ? -1 : 1,
            convex0: !tget(target, i0 - 1, inY), convex1: !tget(target, i, inY) });
        }
      }
    }
    const gauges = [];
    for (const s of segs) {
      let us;
      if (s.L <= 5) us = [s.L / 2];
      else { const m = Math.floor((s.L - 2) / 2) + 1; us = []; for (let k = 0; k < m; k++) us.push(1 + k * (s.L - 2) / (m - 1)); }
      for (const u of us) {
        const px = s.x + s.tx * u, py = s.y + s.ty * u;
        let kind = 'edge';
        if (s.L >= G) kind = 'edge';
        else if (s.L <= 5 && s.convex0 && s.convex1) kind = 'line end';
        else if (u <= 1.5) kind = s.convex0 ? 'corner' : 'inner corner';
        else if (s.L - u <= 1.5) kind = s.convex1 ? 'corner' : 'inner corner';
        gauges.push({ x: px, y: py, nx: s.nx, ny: s.ny, kind, scored: inRois(rois, px, py) });
      }
    }
    return gauges;
  }

  const EPE_RANGE = 4; // cells
  function measureGauges(I, thr, gauges) {
    const step = 0.125, nS = Math.round(2 * EPE_RANGE / step) + 1;
    for (const g of gauges) {
      let best = null, prev = null, prevT = 0, eAt0 = 0;
      const mid = (nS - 1) >> 1;
      for (let k = 0; k < nS; k++) {
        const t = -EPE_RANGE + k * step;
        const e = sampleCell(I, g.x + g.nx * t, g.y + g.ny * t) - thr;
        if (k === mid) eAt0 = e;
        if (prev !== null && prev > 0 && e <= 0) {
          const tc = prevT + step * prev / (prev - e);
          if (best === null || Math.abs(tc) < Math.abs(best)) best = tc;
        }
        prev = e; prevT = t;
      }
      // no printed edge in range: either the space is filled (overprint) or the feature is gone
      if (best === null) best = eAt0 > 0 ? EPE_RANGE : -EPE_RANGE;
      g.epe = best;
    }
    return gauges;
  }

  // width of the printed feature along a cut through (ax, ay) — cells
  function measureWidth(I, thr, ax, ay, dir) {
    const dx = dir === 'h' ? 1 : 0, dy = dir === 'h' ? 0 : 1;
    if (sampleCell(I, ax, ay) <= thr) return 0;
    let w = 0;
    for (const sgn of [1, -1]) {
      let prev = sampleCell(I, ax, ay) - thr, t = 0, found = 16;
      for (let k = 1; k <= 256; k++) {
        const tt = k * 0.0625, e = sampleCell(I, ax + sgn * dx * tt, ay + sgn * dy * tt) - thr;
        if (e <= 0) { found = t + 0.0625 * prev / (prev - e); break; }
        prev = e; t = tt;
      }
      w += found;
    }
    return w;
  }

  function doseToSize(I, anchor, gauges) {
    let lo = 0.2, hi = 8;
    const f = d => {
      const thr = T_RESIST / d;
      if (anchor) return measureWidth(I, thr, anchor.x, anchor.y, anchor.dir) - anchor.w;
      measureGauges(I, thr, gauges);
      const sc = gauges.filter(g => g.scored); if (!sc.length) return 0;
      return sc.reduce((a, g) => a + g.epe, 0) / sc.length;
    };
    for (let it = 0; it < 40; it++) { const m = Math.sqrt(lo * hi); if (f(m) > 0) hi = m; else lo = m; }
    return Math.sqrt(lo * hi);
  }

  // ---------- per-pixel maps ----------
  function targetPx(target) {
    const t = new Uint8Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) t[y * N + x] = target[(y >> 1) * G + (x >> 1)];
    return t;
  }
  function coverage(I, thr, out) {
    out = out || new Float32Array(N * N);
    for (let y = 0; y < N; y++) {
      const ym = ((y - 1 + N) % N) * N, yp = ((y + 1) % N) * N, yo = y * N;
      for (let x = 0; x < N; x++) {
        const xm = (x - 1 + N) % N, xp = (x + 1) % N;
        const gx = (I[yo + xp] - I[yo + xm]) / 2, gy = (I[yp + x] - I[ym + x]) / 2;
        const d = (I[yo + x] - thr) / (Math.sqrt(gx * gx + gy * gy) + 1e-6);
        out[yo + x] = d >= 0.5 ? 1 : d <= -0.5 ? 0 : 0.5 + d;
      }
    }
    return out;
  }

  // periodic 4-connected labelling of a binary map
  function label(bin) {
    const lab = new Int32Array(N * N).fill(-1), comps = [];
    const stack = new Int32Array(N * N);
    for (let s = 0; s < N * N; s++) {
      if (!bin[s] || lab[s] >= 0) continue;
      const id = comps.length; let sp = 0, area = 0, sx = 0, sy = 0;
      stack[sp++] = s; lab[s] = id;
      const x0 = s % N, y0 = (s / N) | 0;
      while (sp) {
        const i = stack[--sp], x = i % N, y = (i / N) | 0; area++;
        // unwrap relative to seed for a sane centroid
        let ux = x - x0; if (ux > N / 2) ux -= N; if (ux < -N / 2) ux += N;
        let uy = y - y0; if (uy > N / 2) uy -= N; if (uy < -N / 2) uy += N;
        sx += ux; sy += uy;
        const nb = [y * N + (x + 1) % N, y * N + (x - 1 + N) % N, ((y + 1) % N) * N + x, ((y - 1 + N) % N) * N + x];
        for (const j of nb) if (bin[j] && lab[j] < 0) { lab[j] = id; stack[sp++] = j; }
      }
      comps.push({ area, cx: x0 + sx / area, cy: y0 + sy / area });
    }
    return { lab, comps };
  }

  // defect check. Returns list of {type, x, y} in cell coords.
  function defects(I, thr, tpx) {
    const pbin = new Uint8Array(N * N);
    for (let i = 0; i < N * N; i++) pbin[i] = I[i] > thr ? 1 : 0;
    const P = label(pbin), T = label(tpx);
    const nP = P.comps.length, nT = T.comps.length;
    const ov = new Map(); // key p*1e4+t -> count
    const outside = P.comps.map(() => ({ n: 0, sx: 0, sy: 0 }));
    const missedT = T.comps.map(() => ({ n: 0, sx: 0, sy: 0 }));
    for (let i = 0; i < N * N; i++) {
      const p = P.lab[i], t = T.lab[i];
      if (p >= 0 && t >= 0) { const k = p * 10000 + t; ov.set(k, (ov.get(k) || 0) + 1); }
      else if (p >= 0) { const o = outside[p]; o.n++; o.sx += i % N; o.sy += (i / N) | 0; }
      else if (t >= 0) { const o = missedT[t]; o.n++; o.sx += i % N; o.sy += (i / N) | 0; }
    }
    const toCell = (x, y) => ({ x: (x + 0.5) / UPS, y: (y + 0.5) / UPS });
    const out = [];
    const pOf = Array.from({ length: nT }, () => []), tOf = Array.from({ length: nP }, () => []);
    for (const [k, c] of ov) { const p = Math.floor(k / 10000), t = k % 10000; if (c >= 3) { pOf[t].push({ p, c }); tOf[p].push({ t, c }); } }
    for (let t = 0; t < nT; t++) {
      const tc = T.comps[t], tot = pOf[t].reduce((a, q) => a + q.c, 0);
      if (tot < 0.25 * tc.area) out.push({ type: 'missing', ...toCell(tc.cx, tc.cy) });
      else if (pOf[t].filter(q => q.c >= Math.max(3, 0.04 * tc.area)).length >= 2) {
        const m = missedT[t]; out.push({ type: 'break', ...toCell(m.n ? m.sx / m.n : tc.cx, m.n ? m.sy / m.n : tc.cy) });
      }
    }
    for (let p = 0; p < nP; p++) {
      const pc = P.comps[p];
      if (tOf[p].length >= 2) { const o = outside[p]; out.push({ type: 'bridge', ...toCell(o.n ? o.sx / o.n : pc.cx, o.n ? o.sy / o.n : pc.cy) }); }
      else if (tOf[p].length === 0 && pc.area >= 3) out.push({ type: 'stray', ...toCell(pc.cx, pc.cy) });
    }
    return out;
  }

  // ---------- auto OPC (greedy, error-driven cell flipping) ----------
  function opcStep(mask, target, cov, tpx, allowed) {
    // per-cell score = mean (target - print) over a 4x4 px window centred on the cell
    const score = new Float32Array(G * G);
    for (let cy = 0; cy < G; cy++) for (let cx = 0; cx < G; cx++) {
      let s = 0;
      for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 2; dx++) {
        const x = (cx * 2 + dx + N) % N, y = (cy * 2 + dy + N) % N, i = y * N + x;
        s += tpx[i] - cov[i];
      }
      score[cy * G + cx] = s / 16;
    }
    const m = (x, y) => mask[(((y % G) + G) % G) * G + (((x % G) + G) % G)];
    const cand = [];
    let maxS = 0;
    for (let cy = 0; cy < G; cy++) for (let cx = 0; cx < G; cx++) {
      const i = cy * G + cx; if (!allowed[i]) continue;
      const on = mask[i], s = score[i];
      if (!on && s > 0) {
        let nb = false; for (let dy = -1; dy <= 1 && !nb; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && m(cx + dx, cy + dy)) { nb = true; break; }
        if (nb) { cand.push([i, s]); maxS = Math.max(maxS, s); }
      } else if (on && s < 0) {
        const edge = !m(cx + 1, cy) || !m(cx - 1, cy) || !m(cx, cy + 1) || !m(cx, cy - 1);
        if (edge) { cand.push([i, s]); maxS = Math.max(maxS, -s); }
      }
    }
    const th = Math.max(0.1, 0.55 * maxS);
    let flips = 0;
    const next = mask.slice();
    for (const [i, s] of cand) if (Math.abs(s) >= th) { next[i] = mask[i] ? 0 : 1; flips++; }
    return { mask: next, flips };
  }
  // cells OPC may touch: within 3 cells outside the target, and the target's outer 1-cell skin
  function opcAllowed(target) {
    const a = new Uint8Array(G * G);
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
      const i = y * G + x;
      if (target[i]) {
        a[i] = (!tget(target, x + 1, y) || !tget(target, x - 1, y) || !tget(target, x, y + 1) || !tget(target, x, y - 1)) ? 1 : 0;
      } else {
        let near = false;
        for (let dy = -3; dy <= 3 && !near; dy++) for (let dx = -3; dx <= 3; dx++) if (tget(target, x + dx, y + dy)) { near = true; break; }
        a[i] = near ? 1 : 0;
      }
    }
    return a;
  }

  const api = { G, UPS, N, CD_CELLS, T_RESIST, EPE_RANGE, fft2, maskSpectrum, sourcePoints, halfSource, aerial, sampleCell,
    buildGauges, measureGauges, measureWidth, doseToSize, targetPx, coverage, label, defects, opcStep, opcAllowed };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LPCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
