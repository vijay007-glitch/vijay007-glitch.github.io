const C = require('./src/core.js');
const EX = {
  maj: `// Majority of three\ny = a&b | b&c | a&c`,
  six: `y = (a ^ b) & (c | ~d) | e'f`,
  mux: `module mux8(input [7:0] d, input [2:0] sel, output y);\n assign y = d[sel];\nendmodule`,
  add4: `module add4(input  [3:0] a, b,\n input cin,\n output [3:0] s,\n output cout);\n  assign {cout, s} = a + b + cin;\nendmodule`,
  par: `module parity12(input [11:0] d, output p);\n assign p = ^d;\nendmodule`,
  cmp: `module cmp8(input [7:0] a, b, output lt, eq, gt);\n assign lt = a < b;\n assign eq = a == b;\n assign gt = a > b;\nendmodule`,
  add8: `module add8(input [7:0] a, b, output [8:0] s);\n assign s = a + b;\nendmodule`,
  multi: `t = a & b\ny = t | c\nz = t ^ d`,
  sop: `F = A'B + AC'`,
};
function evalGates(S, inBits) {
  const g = S.g; const v = new Uint8Array(g.nodes.length); v[1] = 1;
  S.pis.forEach((p, i) => v[p.node] = inBits[i]);
  for (let id = 2; id < g.nodes.length; id++) {
    const n = g.nodes[id]; if (n.type === 'PI') continue;
    const a = v[n.ins[0]], b = v[n.ins[1]];
    v[id] = n.type === 'NOT' ? 1 - a : n.type === 'AND' ? a & b : n.type === 'OR' ? a | b : n.type === 'XOR' ? a ^ b : (a ? v[n.ins[2]] : b);
  }
  return S.pos.map(p => v[p.node]);
}
function evalLuts(S, M, inBits) {
  const val = new Map(); S.pis.forEach((p, i) => val.set(p.node, inBits[i])); val.set(0, 0); val.set(1, 1);
  for (const l of M.luts) { let addr = 0; l.leaves.forEach((f, j) => addr |= val.get(f) << j); val.set(l.root, l.bits[addr]); }
  return S.pos.map(p => val.get(p.node));
}
for (const [k, src] of Object.entries(EX)) {
  const t0 = Date.now();
  const R = C.compileAll(src);
  const { S, M, D, P, RT, TM, A } = R;
  const n = S.pis.length; let bad = 0; const trials = n <= 12 ? (1 << n) : 3000;
  for (let t = 0; t < trials; t++) {
    const bits = n <= 12 ? S.pis.map((_, i) => (t >> i) & 1) : S.pis.map(() => Math.random() < 0.5 ? 1 : 0);
    const a = evalGates(S, bits), b = evalLuts(S, M, bits);
    if (a.join() !== b.join()) bad++;
    // functional reference
    if (k === 'add4') { const av = bits[0] | bits[1] << 1 | bits[2] << 2 | bits[3] << 3, bv = bits[4] | bits[5] << 1 | bits[6] << 2 | bits[7] << 3, c = bits[8]; const s = av + bv + c; const out = a.reduce((x, y, i) => x | (y << i), 0); if (out !== s) bad++; }
    if (k === 'add8') { const av = bits.slice(0, 8).reduce((x, y, i) => x | y << i, 0), bv = bits.slice(8, 16).reduce((x, y, i) => x | y << i, 0); const out = a.reduce((x, y, i) => x | (y << i), 0); if (out !== av + bv) bad++; }
    if (k === 'cmp') { const av = bits.slice(0, 8).reduce((x, y, i) => x | y << i, 0), bv = bits.slice(8, 16).reduce((x, y, i) => x | y << i, 0); if (a[0] !== +(av < bv) || a[1] !== +(av === bv) || a[2] !== +(av > bv)) bad++; }
    if (k === 'mux') { const sel = bits[8] | bits[9] << 1 | bits[10] << 2; if (a[0] !== bits[sel]) bad++; }
    if (k === 'par') { if (a[0] !== bits.reduce((x, y) => x ^ y, 0)) bad++; }
    if (k === 'maj') { if (a[0] !== +(bits[0] + bits[1] + bits[2] >= 2)) bad++; }
  }
  console.log(k.padEnd(6), 'pis', n, 'pos', S.pos.length, 'gates', S.gates.length, JSON.stringify(S.counts), 'depth', S.depth,
    '| LUTs', M.luts.length, 'ks', M.luts.map(l => l.k).join(''), 'lutdepth', M.depth,
    '| N', D.fab.N, 'nets', D.nets.length, 'hpwl', A.cost, 'temps', A.history.length,
    '| W', RT.W, 'iters', RT.iters.length, 'over', RT.over, 'used', RT.used,
    '| crit', TM.total.toFixed(2), 'logic', TM.logic.toFixed(2), 'route', TM.route.toFixed(2), 'io', TM.io.toFixed(2),
    '| BAD', bad, '|', Date.now() - t0, 'ms');
}
console.log(C.compileAll(EX.add4).M.luts.map(l => `${l.name} ${l.init} ${l.eq} -> ${l.drives}`).join('\n'));
// error cases
for (const s of ['y = a &', 'module m(input a, output y); assign y = a * a; endmodule', 'module m(input a, output y); always @* y = a; endmodule', 'y = a & y', 'module m(input a, output y); assign y = b; endmodule', 'y = a 2']) {
  try { C.compileAll(s); console.log('NO ERROR for', s); } catch (e) { console.log('ERR:', e.message); }
}
