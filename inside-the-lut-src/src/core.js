/* ================= CORE: parse -> synth -> map -> place -> route -> timing ================= */
const K_LUT = 6;

class SrcError extends Error {
  constructor(msg, line) { super(line ? `Line ${line}: ${msg}` : msg); this.line = line; }
}

function stripComments(s) { return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ''); }
const range = n => Array.from({ length: n }, (_, i) => i);

/* ---------- tokenizer ---------- */
const V_KW = new Set(['module', 'endmodule', 'input', 'output', 'inout', 'wire', 'reg', 'logic', 'assign', 'always', 'always_comb', 'always_ff', 'initial', 'begin', 'end', 'parameter', 'localparam', 'function', 'task', 'generate', 'integer', 'genvar']);
const V_OPS = ['~^', '^~', '~&', '~|', '&&', '||', '==', '!=', '<=', '>=', '<<', '>>', '~', '!', '&', '|', '^', '+', '-', '*', '/', '%', '?', ':', '(', ')', '[', ']', '{', '}', '=', ';', ',', '<', '>', '#', '@', '.'];
const B_OPS = ['||', '&&', '~', '!', '¬', '&', '|', '^', '⊕', '+', '*', '·', '.', "'", '’', '(', ')', '=', ';', ','];

function bigToBits(v, w) { const b = []; for (let i = 0; i < w; i++) { b.push(Number((v >> BigInt(i)) & 1n)); } return b; }
function bitsValue(bits) { let v = 0; for (let i = bits.length - 1; i >= 0; i--) v = v * 2 + bits[i]; return v; }

function tokenize(src, mode) {
  const toks = []; const n = src.length; let i = 0, line = 1;
  const ops = mode === 'verilog' ? V_OPS : B_OPS;
  while (i < n) {
    const c = src[i];
    if (c === '\n') { if (mode === 'bool') toks.push({ t: 'nl', v: 'line break', line }); line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === ' ') { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line++; i++; } i += 2; continue; }
    if (mode === 'bool' && c === '#') { while (i < n && src[i] !== '\n') i++; continue; }
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1; while (j < n && /[A-Za-z0-9_$]/.test(src[j])) j++;
      const v = src.slice(i, j);
      toks.push({ t: (mode === 'verilog' && V_KW.has(v)) ? 'kw' : 'id', v, line }); i = j; continue;
    }
    if (/[0-9]/.test(c) || (mode === 'verilog' && c === "'" && /[sSbBoOdDhH]/.test(src[i + 1] || ''))) {
      const rest = src.slice(i);
      if (mode === 'verilog') {
        const m = /^(?:(\d[\d_]*)\s*)?'([sS]?)([bBoOdDhH])\s*([0-9a-fA-FxXzZ_?]+)/.exec(rest);
        if (m) {
          const base = m[3].toLowerCase(); const digits = m[4].replace(/_/g, '');
          if (/[xXzZ?]/.test(digits)) throw new SrcError("x and z values aren't supported here; use 0 or 1", line);
          let val;
          try { val = BigInt(base === 'b' ? '0b' + digits : base === 'o' ? '0o' + digits : base === 'h' ? '0x' + digits : digits); }
          catch (e) { throw new SrcError(`Can't read the number ${m[0]}`, line); }
          const w = m[1] ? parseInt(m[1].replace(/_/g, ''), 10) : (base === 'd' ? Math.max(1, val.toString(2).length) : digits.length * ({ b: 1, o: 3, h: 4 })[base]);
          if (!(w >= 1 && w <= 64)) throw new SrcError('Numbers wider than 64 bits aren\'t supported', line);
          const bits = bigToBits(val, w);
          toks.push({ t: 'num', bits, value: bitsValue(bits), line }); i += m[0].length; continue;
        }
        const d = /^\d[\d_]*/.exec(rest);
        const val = BigInt(d[0].replace(/_/g, ''));
        const bits = bigToBits(val, Math.max(1, val.toString(2).length));
        toks.push({ t: 'num', bits, value: Number(val), line }); i += d[0].length; continue;
      } else {
        const d = /^\d+/.exec(rest);
        if (d[0] !== '0' && d[0] !== '1') throw new SrcError(`Only 0 and 1 work as constants; found ${d[0]}`, line);
        toks.push({ t: 'num', bits: [Number(d[0])], value: Number(d[0]), line }); i += d[0].length; continue;
      }
    }
    let matched = null;
    for (const op of ops) if (src.startsWith(op, i)) { matched = op; break; }
    if (!matched) throw new SrcError(`Unexpected character '${c}'`, line);
    toks.push({ t: 'op', v: matched, line }); i += matched.length;
  }
  toks.push({ t: 'eof', v: 'end of input', line });
  return toks;
}

class TP {
  constructor(toks) { this.toks = toks; this.i = 0; }
  peek(o = 0) { return this.toks[Math.min(this.i + o, this.toks.length - 1)]; }
  next() { const t = this.toks[Math.min(this.i, this.toks.length - 1)]; this.i++; return t; }
  is(v) { const t = this.peek(); return (t.t === 'op' || t.t === 'kw') && t.v === v; }
  accept(v) { if (this.is(v)) { this.i++; return true; } return false; }
  expect(v) { const t = this.peek(); if (!this.is(v)) throw new SrcError(`Expected '${v}' but found '${t.v}'`, t.line); return this.next(); }
  expectId() { const t = this.peek(); if (t.t !== 'id') throw new SrcError(`Expected a signal name but found '${t.v}'`, t.line); return this.next(); }
}

/* ---------- Verilog expressions ---------- */
const V_BIN = { '||': 1, '&&': 2, '|': 3, '^': 4, '~^': 4, '^~': 4, '&': 5, '==': 6, '!=': 6, '<': 7, '<=': 7, '>': 7, '>=': 7, '<<': 8, '>>': 8, '+': 9, '-': 9, '*': 10, '/': 10, '%': 10 };
const V_UN = new Set(['~', '!', '&', '|', '^', '~&', '~|', '~^', '^~', '-', '+']);
function vExpr(p) { return vTern(p); }
function vTern(p) {
  const c = vBin(p, 1);
  if (p.is('?')) { const t = p.next(); const a = vExpr(p); p.expect(':'); const b = vTern(p); return { k: 'tern', c, a, b, line: t.line }; }
  return c;
}
function vBin(p, min) {
  let left = vUnary(p);
  for (;;) {
    const t = p.peek(); if (t.t !== 'op') break;
    const pr = V_BIN[t.v]; if (pr === undefined || pr < min) break;
    p.next(); const right = vBin(p, pr + 1);
    left = { k: 'bin', op: t.v, a: left, b: right, line: t.line };
  }
  return left;
}
function vUnary(p) {
  const t = p.peek();
  if (t.t === 'op' && V_UN.has(t.v)) { p.next(); return { k: 'un', op: t.v, a: vUnary(p), line: t.line }; }
  return vPrimary(p);
}
function vPrimary(p) {
  const t = p.peek();
  if (t.t === 'num') { p.next(); return { k: 'num', bits: t.bits, value: t.value, line: t.line }; }
  if (t.t === 'id') {
    p.next();
    if (p.accept('[')) {
      const a = vExpr(p);
      if (p.accept(':')) { const b = vExpr(p); p.expect(']'); return { k: 'part', name: t.v, msb: a, lsb: b, line: t.line }; }
      p.expect(']'); return { k: 'bit', name: t.v, idx: a, line: t.line };
    }
    return { k: 'id', name: t.v, line: t.line };
  }
  if (p.accept('(')) { const e = vExpr(p); p.expect(')'); return e; }
  if (p.accept('{')) {
    const first = vExpr(p);
    if (p.is('{')) {
      p.next(); const parts = [vExpr(p)]; while (p.accept(',')) parts.push(vExpr(p));
      p.expect('}'); p.expect('}'); return { k: 'rep', n: first, parts, line: t.line };
    }
    const parts = [first]; while (p.accept(',')) parts.push(vExpr(p));
    p.expect('}'); return { k: 'cat', parts, line: t.line };
  }
  if (t.t === 'kw') throw new SrcError(`'${t.v}' can't appear inside an expression`, t.line);
  if (t.t === 'eof') throw new SrcError('The expression stops before it is complete', t.line);
  throw new SrcError(`Unexpected '${t.v}' in expression`, t.line);
}
function constEval(e) {
  if (!e) return null;
  switch (e.k) {
    case 'num': return e.value;
    case 'un': { const a = constEval(e.a); if (a === null) return null; if (e.op === '-') return -a; if (e.op === '+') return a; return null; }
    case 'bin': {
      const a = constEval(e.a), b = constEval(e.b); if (a === null || b === null) return null;
      switch (e.op) { case '+': return a + b; case '-': return a - b; case '*': return a * b; case '/': return b ? Math.trunc(a / b) : null; case '<<': return a << b; case '>>': return a >> b; default: return null; }
    }
    default: return null;
  }
}

function parseVerilog(src) {
  const p = new TP(tokenize(src, 'verilog'));
  const decls = new Map(); const inputs = [], outputs = [], wires = [], assigns = [];
  const portNames = [];
  const parseRange = () => {
    const t = p.expect('['); const a = constEval(vExpr(p)); p.expect(':'); const b = constEval(vExpr(p)); p.expect(']');
    if (a === null || b === null) throw new SrcError('Vector ranges need constant numbers, like [3:0]', t.line);
    if (Math.abs(a - b) + 1 > 64) throw new SrcError('Vectors wider than 64 bits aren\'t supported', t.line);
    return { msb: a, lsb: b };
  };
  const declare = (tok, kind, rng) => {
    const name = tok.v;
    const d = { name, kind, msb: rng ? rng.msb : 0, lsb: rng ? rng.lsb : 0, vector: !!rng, line: tok.line };
    d.width = Math.abs(d.msb - d.lsb) + 1;
    if (decls.has(name)) {
      const old = decls.get(name);
      if (old.kind === 'port') { old.kind = kind; Object.assign(old, d); (kind === 'input' ? inputs : kind === 'output' ? outputs : wires).push(old); return; }
      if (kind === 'wire' && (old.kind === 'output' || old.kind === 'input')) return; // "output y; wire y;" is legal
      throw new SrcError(`'${name}' is declared twice`, tok.line);
    }
    decls.set(name, d);
    (kind === 'input' ? inputs : kind === 'output' ? outputs : wires).push(d);
  };
  const dirKind = () => {
    const t = p.next();
    if (t.v === 'inout') throw new SrcError('inout ports aren\'t supported; use input or output', t.line);
    if (p.is('reg')) throw new SrcError('reg needs an always block, which this page doesn\'t simulate. Use wire with assign.', p.peek().line);
    if (p.is('wire') || p.is('logic')) p.next();
    return t.v;
  };
  p.expect('module'); p.expectId();
  if (p.is('#')) throw new SrcError('Module parameters aren\'t supported', p.peek().line);
  if (p.accept('(')) {
    if (!p.accept(')')) {
      let dir = null, rng = null;
      for (;;) {
        if (p.is('input') || p.is('output') || p.is('inout')) { dir = dirKind(); rng = p.is('[') ? parseRange() : null; }
        const id = p.expectId();
        if (dir) declare(id, dir, rng); else { portNames.push(id); decls.set(id.v, { name: id.v, kind: 'port', line: id.line }); }
        if (p.accept(',')) continue;
        p.expect(')'); break;
      }
    }
  }
  p.expect(';');
  for (;;) {
    const t = p.peek();
    if (t.t === 'eof') throw new SrcError('Missing endmodule', t.line);
    if (p.accept('endmodule')) break;
    if (p.is('input') || p.is('output') || p.is('inout')) {
      const dir = dirKind(); const rng = p.is('[') ? parseRange() : null;
      do { declare(p.expectId(), dir, rng); } while (p.accept(','));
      p.expect(';'); continue;
    }
    if (p.is('wire') || p.is('logic')) {
      p.next(); const rng = p.is('[') ? parseRange() : null;
      do {
        const id = p.expectId(); declare(id, 'wire', rng);
        if (p.accept('=')) assigns.push({ lhs: { k: 'id', name: id.v, line: id.line }, rhs: vExpr(p), line: id.line });
      } while (p.accept(','));
      p.expect(';'); continue;
    }
    if (p.accept('assign')) {
      do {
        const lhs = vPrimary(p); const eq = p.expect('=');
        assigns.push({ lhs, rhs: vExpr(p), line: eq.line });
      } while (p.accept(','));
      p.expect(';'); continue;
    }
    if (p.is('always') || p.is('always_comb') || p.is('always_ff') || p.is('initial'))
      throw new SrcError(`${t.v} blocks aren't supported. Describe the logic with assign statements.`, t.line);
    if (p.is('reg')) throw new SrcError('reg needs an always block, which this page doesn\'t simulate. Use wire with assign.', t.line);
    if (p.is('parameter') || p.is('localparam')) throw new SrcError('Parameters aren\'t supported; write the numbers directly', t.line);
    if (t.t === 'id') throw new SrcError(`Submodule instances like '${t.v} …' aren't supported; keep it to one module`, t.line);
    throw new SrcError(`Unexpected '${t.v}'`, t.line);
  }
  for (const id of portNames) { const d = decls.get(id.v); if (d.kind === 'port') throw new SrcError(`Port '${id.v}' needs an input or output declaration`, id.line); }
  if (!inputs.length && !outputs.length) throw new SrcError('The module has no ports');
  if (!outputs.length) throw new SrcError('The module needs at least one output');
  return { mode: 'verilog', inputs, outputs, wires, assigns };
}

/* ---------- Boolean expressions ---------- */
function parseBool(src) {
  const toks = tokenize(src, 'bool');
  const stmts = []; let cur = []; let depth = 0;
  const operandEnd = t => t && (t.t === 'id' || t.t === 'num' || (t.t === 'op' && (t.v === ')' || t.v === "'" || t.v === '’')));
  const binStart = t => t && t.t === 'op' && ['|', '||', '+', '&', '&&', '*', '·', '.', '^', '⊕', '='].includes(t.v);
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.t === 'eof') break;
    if (t.t === 'op' && t.v === '(') depth++;
    if (t.t === 'op' && t.v === ')') depth--;
    if ((t.t === 'nl' && depth <= 0) || (t.t === 'op' && t.v === ';')) {
      if (t.t === 'nl') {
        const prev = cur[cur.length - 1]; let j = i + 1; while (toks[j] && toks[j].t === 'nl') j++;
        if (prev && (!operandEnd(prev) || binStart(toks[j]))) continue;
      }
      if (cur.length) stmts.push(cur); cur = []; depth = 0; continue;
    }
    if (t.t === 'nl') continue;
    cur.push(t);
  }
  if (cur.length) stmts.push(cur);
  if (!stmts.length) throw new SrcError('Type an expression, for example  y = a & b | c');
  const B = op => (a, b, line) => ({ k: 'bin', op, a, b, line });
  const AND = B('&'), OR = B('|'), XOR = B('^');
  const bExpr = p => bOr(p);
  const bOr = p => { let l = bXor(p); while (p.is('|') || p.is('||') || p.is('+')) { const t = p.next(); l = OR(l, bXor(p), t.line); } return l; };
  const bXor = p => { let l = bAnd(p); while (p.is('^') || p.is('⊕')) { const t = p.next(); l = XOR(l, bAnd(p), t.line); } return l; };
  const bAnd = p => {
    let l = bUn(p);
    for (;;) {
      if (p.is('&') || p.is('&&') || p.is('*') || p.is('·') || p.is('.')) { const t = p.next(); l = AND(l, bUn(p), t.line); continue; }
      const t = p.peek();
      if (t.t === 'id' || t.t === 'num' || (t.t === 'op' && ['(', '~', '!', '¬'].includes(t.v))) { l = AND(l, bUn(p), t.line); continue; }
      break;
    }
    return l;
  };
  const bUn = p => {
    if (p.is('~') || p.is('!') || p.is('¬')) { const t = p.next(); return { k: 'un', op: '~', a: bUn(p), line: t.line }; }
    let e = bPrim(p);
    while (p.is("'") || p.is('’')) { const t = p.next(); e = { k: 'un', op: '~', a: e, line: t.line }; }
    return e;
  };
  const bPrim = p => {
    const t = p.peek();
    if (t.t === 'id') { p.next(); return { k: 'id', name: t.v, line: t.line }; }
    if (t.t === 'num') { p.next(); return { k: 'num', bits: t.bits, value: t.value, line: t.line }; }
    if (p.accept('(')) { const e = bExpr(p); p.expect(')'); return e; }
    if (t.t === 'eof') throw new SrcError('The expression stops before it is complete', t.line);
    throw new SrcError(`Unexpected '${t.v}' in expression`, t.line);
  };
  const assigns = []; const assigned = new Map(); let unnamed = 0;
  for (let st of stmts) {
    if (st[0].t === 'id' && st[0].v === 'assign') st = st.slice(1);
    let name, line = st[0] ? st[0].line : 1, body = st;
    if (st.length >= 2 && st[0].t === 'id' && st[1].t === 'op' && st[1].v === '=') { name = st[0].v; body = st.slice(2); }
    else { unnamed++; name = unnamed === 1 ? 'F' : 'F' + unnamed; }
    if (!body.length) throw new SrcError(`Nothing after '=' for ${name}`, line);
    if (assigned.has(name)) throw new SrcError(`${name} is assigned twice`, line);
    const p = new TP(body.concat([{ t: 'eof', v: 'end of line', line }]));
    const rhs = bExpr(p);
    if (p.peek().t !== 'eof') throw new SrcError(`Unexpected '${p.peek().v}'`, p.peek().line);
    assigns.push({ lhs: { k: 'id', name, line }, rhs, line }); assigned.set(name, true);
  }
  const used = new Set(); const order = [];
  const walk = e => {
    if (!e) return;
    if (e.k === 'id') { used.add(e.name); if (!order.includes(e.name)) order.push(e.name); return; }
    walk(e.a); walk(e.b); walk(e.c);
  };
  assigns.forEach(a => walk(a.rhs));
  const sc = name => ({ name, msb: 0, lsb: 0, width: 1, vector: false });
  const inputs = order.filter(n => !assigned.has(n)).map(sc);
  const outputs = assigns.map(a => a.lhs.name).filter(n => !used.has(n)).map(sc);
  const wires = assigns.map(a => a.lhs.name).filter(n => used.has(n)).map(sc);
  if (!outputs.length) throw new SrcError('Every assigned signal is also read somewhere, so nothing is left as an output. Check for a loop like y = a & y.');
  return { mode: 'bool', inputs, outputs, wires, assigns };
}

function parseSource(src) {
  return /\bmodule\b/.test(stripComments(src)) ? parseVerilog(src) : parseBool(src);
}

/* ---------- gate graph with structural hashing ---------- */
class Graph {
  constructor() { this.nodes = [{ type: 'C0', ins: [] }, { type: 'C1', ins: [] }]; this.h = new Map(); }
  add(type, ins) {
    const key = type + ':' + ins.join(',');
    let id = this.h.get(key); if (id !== undefined) return id;
    id = this.nodes.length; this.nodes.push({ type, ins }); this.h.set(key, id); return id;
  }
  pi(name) { const id = this.nodes.length; this.nodes.push({ type: 'PI', ins: [], name }); return id; }
  compl(a, b) { const na = this.nodes[a], nb = this.nodes[b]; return (na.type === 'NOT' && na.ins[0] === b) || (nb.type === 'NOT' && nb.ins[0] === a); }
  not(a) { if (a === 0) return 1; if (a === 1) return 0; const n = this.nodes[a]; if (n.type === 'NOT') return n.ins[0]; return this.add('NOT', [a]); }
  and(a, b) { if (a === 0 || b === 0) return 0; if (a === 1) return b; if (b === 1) return a; if (a === b) return a; if (this.compl(a, b)) return 0; if (a > b) [a, b] = [b, a]; return this.add('AND', [a, b]); }
  or(a, b) { if (a === 1 || b === 1) return 1; if (a === 0) return b; if (b === 0) return a; if (a === b) return a; if (this.compl(a, b)) return 1; if (a > b) [a, b] = [b, a]; return this.add('OR', [a, b]); }
  xor(a, b) { if (a === 0) return b; if (b === 0) return a; if (a === 1) return this.not(b); if (b === 1) return this.not(a); if (a === b) return 0; if (this.compl(a, b)) return 1; if (a > b) [a, b] = [b, a]; return this.add('XOR', [a, b]); }
  mux(s, d0, d1) {
    if (s === 0) return d0; if (s === 1) return d1; if (d0 === d1) return d0;
    if (d0 === 0 && d1 === 1) return s; if (d0 === 1 && d1 === 0) return this.not(s);
    if (d0 === 0) return this.and(s, d1); if (d1 === 0) return this.and(this.not(s), d0);
    if (d1 === 1) return this.or(s, d0); if (d0 === 1) return this.or(this.not(s), d1);
    if (s === d1) return this.or(s, d0); if (s === d0) return this.and(s, d1);
    return this.add('MUX', [s, d0, d1]);
  }
}

const ext = (a, w) => a.length >= w ? a.slice(0, w) : a.concat(Array(w - a.length).fill(0));
function reduceTree(fn, a) {
  if (!a.length) return 0; let lvl = a.slice();
  while (lvl.length > 1) { const nx = []; for (let i = 0; i < lvl.length; i += 2) nx.push(i + 1 < lvl.length ? fn(lvl[i], lvl[i + 1]) : lvl[i]); lvl = nx; }
  return lvl[0];
}
function adder(g, a, b, cin) {
  const w = Math.max(a.length, b.length); a = ext(a, w); b = ext(b, w);
  const s = []; let c = cin;
  for (let i = 0; i < w; i++) { const p = g.xor(a[i], b[i]); s.push(g.xor(p, c)); c = g.or(g.and(a[i], b[i]), g.and(c, p)); }
  s.push(c); return s;
}

function bitName(s, k) {
  if (!s.vector) return s.name;
  const idx = s.msb >= s.lsb ? s.lsb + k : s.lsb - k;
  return `${s.name}[${idx}]`;
}
function posOf(s, idx, line) {
  const p = s.msb >= s.lsb ? idx - s.lsb : s.lsb - idx;
  if (p < 0 || p >= s.width) throw new SrcError(`Index ${idx} is outside ${s.name}[${s.msb}:${s.lsb}]`, line);
  return p;
}

function elaborate(P) {
  const g = new Graph(); const sigs = new Map(); const pis = [];
  for (const d of P.inputs) {
    const s = { ...d, kind: 'input', bits: [] };
    for (let k = 0; k < s.width; k++) { const nm = bitName(s, k); const id = g.pi(nm); s.bits.push(id); pis.push({ name: nm, node: id }); }
    sigs.set(s.name, s);
  }
  for (const d of P.outputs) sigs.set(d.name, { ...d, kind: 'output', drivers: Array(d.width).fill(null) });
  for (const d of P.wires) if (!sigs.has(d.name)) sigs.set(d.name, { ...d, kind: 'wire', drivers: Array(d.width).fill(null) });
  const look = (name, line) => { const s = sigs.get(name); if (!s) throw new SrcError(`'${name}' isn't declared`, line); return s; };
  const A = P.assigns;
  const lbits = lv => {
    switch (lv.k) {
      case 'id': {
        let s = sigs.get(lv.name);
        if (!s) { s = { name: lv.name, msb: 0, lsb: 0, width: 1, vector: false, kind: 'wire', drivers: [null] }; sigs.set(lv.name, s); }
        return range(s.width).map(pos => ({ s, pos }));
      }
      case 'bit': {
        const s = look(lv.name, lv.line); const ci = constEval(lv.idx);
        if (ci === null) throw new SrcError('Assignments need a constant bit index', lv.line);
        return [{ s, pos: posOf(s, ci, lv.line) }];
      }
      case 'part': {
        const s = look(lv.name, lv.line); const a = constEval(lv.msb), b = constEval(lv.lsb);
        if (a === null || b === null) throw new SrcError('Part selects need constant bounds', lv.line);
        const pa = posOf(s, a, lv.line), pb = posOf(s, b, lv.line); const lo = Math.min(pa, pb), hi = Math.max(pa, pb);
        return range(hi - lo + 1).map(k => ({ s, pos: lo + k }));
      }
      case 'cat': { const out = []; for (const part of lv.parts.slice().reverse()) out.push(...lbits(part)); return out; }
      default: throw new SrcError('This left-hand side can\'t be assigned', lv.line);
    }
  };
  A.forEach((a, ai) => {
    a.lb = lbits(a.lhs);
    a.lb.forEach(({ s, pos }, k) => {
      if (s.kind === 'input') throw new SrcError(`Input ${s.name} can't be assigned`, a.line);
      if (s.drivers[pos]) throw new SrcError(`${bitName(s, pos)} is assigned twice`, a.line);
      s.drivers[pos] = { ai, k };
    });
  });
  const st = new Uint8Array(A.length); const vals = [];
  const evalAssign = ai => {
    if (st[ai] === 2) return;
    if (st[ai] === 1) throw new SrcError(`Combinational loop: ${A[ai].lb.map(x => bitName(x.s, x.pos)).slice(0, 2).join(', ')} feeds back into itself`, A[ai].line);
    st[ai] = 1; const v = ev(A[ai].rhs); vals[ai] = ext(v, A[ai].lb.length); st[ai] = 2;
  };
  const sigBit = (s, pos, line) => {
    if (s.kind === 'input') return s.bits[pos];
    const d = s.drivers[pos];
    if (!d) throw new SrcError(`${bitName(s, pos)} is read but never assigned`, line);
    evalAssign(d.ai); return vals[d.ai][d.k];
  };
  const sel = (bits, s) => {
    let lvl = bits.slice();
    for (let k = 0; k < s.length; k++) {
      const nx = []; for (let i = 0; i < Math.max(1, Math.ceil(lvl.length / 2)); i++) nx.push(g.mux(s[k], lvl[2 * i] ?? 0, lvl[2 * i + 1] ?? 0));
      lvl = nx;
    }
    return lvl[0] ?? 0;
  };
  const orR = a => reduceTree((x, y) => g.or(x, y), a);
  const andR = a => a.length ? reduceTree((x, y) => g.and(x, y), a) : 1;
  const xorR = a => reduceTree((x, y) => g.xor(x, y), a);
  const bw = (a, b, f) => { const w = Math.max(a.length, b.length); a = ext(a, w); b = ext(b, w); return a.map((x, i) => f(x, b[i])); };
  const carryGE = (a, b) => { const w = Math.max(a.length, b.length); return adder(g, ext(a, w), ext(b, w).map(x => g.not(x)), 1)[w]; };
  const ev = e => {
    switch (e.k) {
      case 'num': return e.bits.slice();
      case 'id': { const s = look(e.name, e.line); return range(s.width).map(k => sigBit(s, k, e.line)); }
      case 'bit': {
        const s = look(e.name, e.line); const ci = constEval(e.idx);
        if (ci !== null) return [sigBit(s, posOf(s, ci, e.line), e.line)];
        if (s.msb < s.lsb || s.lsb !== 0) throw new SrcError(`A variable index needs ${s.name} declared as [n:0]`, e.line);
        return [sel(range(s.width).map(k => sigBit(s, k, e.line)), ev(e.idx))];
      }
      case 'part': {
        const s = look(e.name, e.line); const a = constEval(e.msb), b = constEval(e.lsb);
        if (a === null || b === null) throw new SrcError('Part selects need constant bounds', e.line);
        const pa = posOf(s, a, e.line), pb = posOf(s, b, e.line); const lo = Math.min(pa, pb), hi = Math.max(pa, pb);
        return range(hi - lo + 1).map(k => sigBit(s, lo + k, e.line));
      }
      case 'cat': { const out = []; for (const part of e.parts.slice().reverse()) out.push(...ev(part)); return out; }
      case 'rep': {
        const n = constEval(e.n); if (n === null || n < 0 || n > 64) throw new SrcError('Replication needs a constant count', e.line);
        const one = []; for (const part of e.parts.slice().reverse()) one.push(...ev(part));
        let out = []; for (let i = 0; i < n; i++) out = out.concat(one); return out;
      }
      case 'un': {
        const a = ev(e.a);
        switch (e.op) {
          case '~': return a.map(x => g.not(x));
          case '!': return [g.not(orR(a))];
          case '&': return [andR(a)]; case '|': return [orR(a)]; case '^': return [xorR(a)];
          case '~&': return [g.not(andR(a))]; case '~|': return [g.not(orR(a))];
          case '~^': case '^~': return [g.not(xorR(a))];
          case '+': return a;
          case '-': return adder(g, a.map(x => g.not(x)), [], 1).slice(0, a.length);
        }
        break;
      }
      case 'bin': {
        const a = ev(e.a), b = ev(e.b);
        switch (e.op) {
          case '&': return bw(a, b, (x, y) => g.and(x, y));
          case '|': return bw(a, b, (x, y) => g.or(x, y));
          case '^': return bw(a, b, (x, y) => g.xor(x, y));
          case '~^': case '^~': return bw(a, b, (x, y) => g.not(g.xor(x, y)));
          case '&&': return [g.and(orR(a), orR(b))];
          case '||': return [g.or(orR(a), orR(b))];
          case '==': return [andR(bw(a, b, (x, y) => g.not(g.xor(x, y))))];
          case '!=': return [g.not(andR(bw(a, b, (x, y) => g.not(g.xor(x, y)))))];
          case '<': return [g.not(carryGE(a, b))];
          case '>=': return [carryGE(a, b)];
          case '>': return [g.not(carryGE(b, a))];
          case '<=': return [carryGE(b, a)];
          case '+': return adder(g, a, b, 0);
          case '-': { const w = Math.max(a.length, b.length) + 1; return adder(g, ext(a, w), ext(b, w).map(x => g.not(x)), 1).slice(0, w); }
          case '<<': case '>>': {
            const n = constEval(e.b); if (n === null || n < 0) throw new SrcError('Shift amounts need to be constants', e.line);
            if (e.op === '<<') return Array(n).fill(0).concat(a);
            return a.slice(n).concat(Array(Math.min(n, a.length)).fill(0)).slice(0, a.length);
          }
          case '*': case '/': case '%': throw new SrcError(`'${e.op}' isn't supported. Build arithmetic from + and - instead.`, e.line);
        }
        break;
      }
      case 'tern': {
        const c = orR(ev(e.c)); const a = ev(e.a), b = ev(e.b); const w = Math.max(a.length, b.length);
        const A2 = ext(a, w), B2 = ext(b, w); return range(w).map(i => g.mux(c, B2[i], A2[i]));
      }
    }
    throw new SrcError('Unsupported expression', e.line);
  };
  const pos = [];
  const outSigs = P.outputs.map(d => sigs.get(d.name));
  for (const s of outSigs) for (let k = 0; k < s.width; k++) {
    if (!s.drivers[k]) throw new SrcError(`Output ${bitName(s, k)} has no driver`, s.line);
    pos.push({ name: bitName(s, k), node: sigBit(s, k, s.line) });
  }
  for (let ai = 0; ai < A.length; ai++) evalAssign(ai); // surface errors in unused assigns too
  return { g, pis, pos };
}

function analyzeNet(g, pos) {
  const N = g.nodes.length; const live = new Uint8Array(N); const st = pos.map(p => p.node);
  while (st.length) { const id = st.pop(); if (live[id]) continue; live[id] = 1; for (const f of g.nodes[id].ins) st.push(f); }
  const gates = []; for (let id = 2; id < N; id++) if (live[id] && g.nodes[id].type !== 'PI') gates.push(id);
  const level = new Int32Array(N);
  for (const id of gates) { let m = 0; for (const f of g.nodes[id].ins) m = Math.max(m, level[f]); level[id] = m + 1; }
  const depth = pos.reduce((m, p) => Math.max(m, level[p.node]), 0);
  const counts = {}; for (const id of gates) { const t = g.nodes[id].type; counts[t] = (counts[t] || 0) + 1; }
  const fan = new Int32Array(N);
  for (const id of gates) for (const f of g.nodes[id].ins) fan[f]++;
  for (const p of pos) fan[p.node]++;
  const names = new Map(); names.set(0, "1'b0"); names.set(1, "1'b1");
  for (const n of g.nodes.keys()) if (g.nodes[n].type === 'PI') names.set(n, g.nodes[n].name);
  gates.forEach((id, i) => names.set(id, 'g' + (i + 1)));
  return { live, gates, level, depth, counts, fan, names };
}

function synthesize(src) {
  const P = parseSource(src);
  const { g, pis, pos } = elaborate(P);
  if (pis.length > 64) throw new SrcError(`${pis.length} input bits is more than this page handles (64)`);
  const A = analyzeNet(g, pos);
  if (A.gates.length > 900) throw new SrcError(`This design needs ${A.gates.length} gates; keep it under 900 so the page stays responsive`);
  return { mode: P.mode, g, pis, pos, ...A };
}

/* ---------- LUT mapping ---------- */
function evalCone(g, root, leafVal) {
  const memo = new Map(leafVal);
  const ev = id => {
    if (memo.has(id)) return memo.get(id);
    if (id === 0) return 0; if (id === 1) return 1;
    const n = g.nodes[id]; let v;
    switch (n.type) {
      case 'NOT': v = 1 - ev(n.ins[0]); break;
      case 'AND': v = ev(n.ins[0]) & ev(n.ins[1]); break;
      case 'OR': v = ev(n.ins[0]) | ev(n.ins[1]); break;
      case 'XOR': v = ev(n.ins[0]) ^ ev(n.ins[1]); break;
      case 'MUX': v = ev(n.ins[0]) ? ev(n.ins[2]) : ev(n.ins[1]); break;
      default: throw new Error('cone escaped its leaves at ' + id);
    }
    memo.set(id, v); return v;
  };
  return ev(root);
}

function mapLuts(S, K = K_LUT) {
  const g = S.g; const N = g.nodes.length;
  const isGate = id => id > 1 && g.nodes[id].type !== 'PI';
  const poDriven = new Set(S.pos.map(p => p.node));
  const root = new Uint8Array(N); const cut = new Array(N);
  for (const id of S.gates) {
    const n = g.nodes[id];
    const contrib = f => g.nodes[f].type === 'PI' ? [f] : (f < 2 ? [] : (root[f] ? [f] : cut[f]));
    let c;
    for (;;) {
      const set = new Set(); for (const f of n.ins) for (const x of contrib(f)) set.add(x);
      if (set.size <= K) { c = set; break; }
      let best = -1, bs = -1;
      for (const f of n.ins) if (isGate(f) && !root[f] && cut[f].length > bs) { bs = cut[f].length; best = f; }
      if (best < 0) throw new Error('mapping failed');
      root[best] = 1;
    }
    cut[id] = [...c].sort((a, b) => a - b);
    if (poDriven.has(id)) root[id] = 1;
  }
  const used = new Set(); const st = [];
  for (const p of S.pos) if (isGate(p.node)) st.push(p.node);
  while (st.length) { const r = st.pop(); if (used.has(r)) continue; used.add(r); for (const l of cut[r]) if (isGate(l)) st.push(l); }
  const roots = [...used].sort((a, b) => a - b);
  for (const p of S.pos) if (p.node < 2 && !roots.includes(p.node)) roots.unshift(p.node);
  const luts = roots.map((r, i) => {
    const leaves = r < 2 ? [] : cut[r];
    const bits = new Uint8Array(64); const cone = new Set();
    if (r >= 2) {
      const lset = new Set(leaves); const stk = [r];
      while (stk.length) { const id = stk.pop(); if (lset.has(id) || id < 2 || cone.has(id)) continue; cone.add(id); for (const f of g.nodes[id].ins) stk.push(f); }
    }
    for (let addr = 0; addr < 64; addr++) {
      if (r < 2) { bits[addr] = r; continue; }
      const lv = new Map(); leaves.forEach((l, j) => lv.set(l, (addr >> j) & 1));
      bits[addr] = evalCone(g, r, lv);
    }
    return { idx: i, name: 'L' + (i + 1), root: r, leaves, bits, cone: [...cone].sort((a, b) => a - b), k: leaves.length };
  });
  const lutOf = new Map(luts.map(l => [l.root, l]));
  for (const l of luts) { let m = 0; for (const f of l.leaves) if (lutOf.has(f)) m = Math.max(m, lutOf.get(f).level); l.level = m + 1; }
  const gateLut = new Map();
  for (const l of luts) for (const id of l.cone) { if (!gateLut.has(id)) gateLut.set(id, []); gateLut.get(id).push(l.idx); }
  let dup = 0; for (const v of gateLut.values()) if (v.length > 1) dup++;
  for (const l of luts) {
    l.init = initHex(l.bits);
    l.drives = S.pos.filter(p => p.node === l.root).map(p => p.name);
    l.eq = coneExpr(g, l, S.names, lutOf);
  }
  return { luts, lutOf, gateLut, dup, depth: luts.reduce((m, l) => Math.max(m, l.level), 0) };
}
function initHex(bits) {
  let s = '';
  for (let nib = 15; nib >= 0; nib--) { const v = bits[nib * 4] | (bits[nib * 4 + 1] << 1) | (bits[nib * 4 + 2] << 2) | (bits[nib * 4 + 3] << 3); s += v.toString(16).toUpperCase(); if (nib % 4 === 0 && nib) s += '_'; }
  return "64'h" + s;
}
function leafName(g, id, names, lutOf) { return lutOf.has(id) && g.nodes[id].type !== 'PI' ? lutOf.get(id).name : names.get(id); }
function coneExpr(g, l, names, lutOf) {
  if (l.root < 2) return String(l.root);
  const lset = new Set(l.leaves); let budget = 160;
  const pr = (id, top) => {
    if (budget <= 0) return '…';
    if (lset.has(id)) { const s = leafName(g, id, names, lutOf); budget -= s.length; return s; }
    if (id < 2) return String(id);
    const n = g.nodes[id]; budget -= 3;
    const wrap = s => top ? s : `(${s})`;
    switch (n.type) {
      case 'NOT': return '~' + pr(n.ins[0], false);
      case 'AND': return wrap(pr(n.ins[0], false) + ' & ' + pr(n.ins[1], false));
      case 'OR': return wrap(pr(n.ins[0], false) + ' | ' + pr(n.ins[1], false));
      case 'XOR': return wrap(pr(n.ins[0], false) + ' ^ ' + pr(n.ins[1], false));
      case 'MUX': return wrap(pr(n.ins[0], false) + ' ? ' + pr(n.ins[2], false) + ' : ' + pr(n.ins[1], false));
    }
    return '?';
  };
  const s = pr(l.root, true);
  return budget <= 0 ? s.slice(0, 160) + '…' : s;
}

/* ---------- fabric and placement ---------- */
const MAX_N = 14;
function makeFabric(nLut, nIO) {
  const N = Math.max(3, Math.ceil(Math.sqrt(nLut * 1.8)), Math.ceil(nIO / 4));
  if (N > MAX_N) throw new SrcError(`This design needs ${nLut} LUTs and ${nIO} pins, more than the ${MAX_N}×${MAX_N} fabric on this page holds. Try a smaller module.`);
  const G = N + 2; const sites = []; const clb = [], io = []; const at = new Int32Array(G * G).fill(-1);
  for (let y = 1; y <= N; y++) for (let x = 1; x <= N; x++) { at[y * G + x] = sites.length; clb.push(sites.length); sites.push({ kind: 'clb', x, y }); }
  const ring = [];
  for (let x = 1; x <= N; x++) ring.push([x, 0, 'top']);
  for (let y = 1; y <= N; y++) ring.push([N + 1, y, 'right']);
  for (let x = N; x >= 1; x--) ring.push([x, N + 1, 'bottom']);
  for (let y = N; y >= 1; y--) ring.push([0, y, 'left']);
  for (const [x, y, side] of ring) { at[y * G + x] = sites.length; io.push(sites.length); sites.push({ kind: 'io', x, y, side }); }
  return { N, G, sites, clb, io, at };
}

function buildPlaceDesign(S, M) {
  const cells = []; const drvCell = new Map();
  S.pis.forEach(pi => { drvCell.set(pi.node, cells.length); cells.push({ kind: 'in', label: pi.name, node: pi.node }); });
  M.luts.forEach(l => { l.cell = cells.length; drvCell.set(l.root, cells.length); cells.push({ kind: 'lut', label: l.name, lut: l.idx }); });
  const poCell = [];
  S.pos.forEach(po => { poCell.push(cells.length); cells.push({ kind: 'out', label: po.name, node: po.node }); });
  const byDrv = new Map();
  const addSink = (node, sink) => {
    const dc = drvCell.get(node); if (dc === undefined) throw new Error('no driver for node ' + node);
    if (!byDrv.has(dc)) byDrv.set(dc, { driver: dc, sinks: [], name: cells[dc].label });
    const n = byDrv.get(dc); if (!n.sinks.includes(sink)) n.sinks.push(sink);
  };
  M.luts.forEach(l => l.leaves.forEach(leaf => addSink(leaf, l.cell)));
  S.pos.forEach((po, i) => addSink(po.node, poCell[i]));
  const nets = [...byDrv.values()];
  const cellNets = cells.map(() => []);
  nets.forEach((n, i) => { cellNets[n.driver].push(i); n.sinks.forEach(s => cellNets[s].push(i)); });
  const netOfDriver = new Map(nets.map((n, i) => [n.driver, i]));
  const nLut = M.luts.length, nIO = S.pis.length + S.pos.length;
  if (nLut > 160) throw new SrcError(`This design maps to ${nLut} LUTs; the page tops out at 160`);
  const fab = makeFabric(nLut, nIO);
  return { cells, nets, cellNets, netOfDriver, drvCell, fab, rrg: makeRRG(fab.G) };
}

function rngOf(seed) {
  let a = seed >>> 0;
  return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function shuffle(arr, rng) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }

function randomPlacement(D, rng) {
  const pos = new Int32Array(D.cells.length); const occ = new Int32Array(D.fab.sites.length).fill(-1);
  const clb = shuffle(D.fab.clb.slice(), rng), io = shuffle(D.fab.io.slice(), rng);
  let ci = 0, ii = 0;
  D.cells.forEach((c, i) => { const s = c.kind === 'lut' ? clb[ci++] : io[ii++]; pos[i] = s; occ[s] = i; });
  return { pos, occ };
}
function clonePlacement(P) { return { pos: P.pos.slice(), occ: P.occ.slice() }; }

function netHPWL(D, P, ni) {
  const net = D.nets[ni]; const S = D.fab.sites;
  let s = S[P.pos[net.driver]]; let x0 = s.x, x1 = s.x, y0 = s.y, y1 = s.y;
  for (const c of net.sinks) { s = S[P.pos[c]]; if (s.x < x0) x0 = s.x; if (s.x > x1) x1 = s.x; if (s.y < y0) y0 = s.y; if (s.y > y1) y1 = s.y; }
  return (x1 - x0) + (y1 - y0);
}
function totalHPWL(D, P) { let c = 0; for (let i = 0; i < D.nets.length; i++) c += netHPWL(D, P, i); return c; }

/* swap or move cell c to site s; returns undo info */
function placeSwap(P, c, s) {
  const from = P.pos[c]; const other = P.occ[s];
  P.pos[c] = s; P.occ[s] = c;
  if (other >= 0) { P.pos[other] = from; P.occ[from] = other; } else P.occ[from] = -1;
  return { c, from, s, other };
}
function undoSwap(P, u) {
  P.pos[u.c] = u.from; P.occ[u.from] = u.c;
  if (u.other >= 0) { P.pos[u.other] = u.s; P.occ[u.s] = u.other; } else P.occ[u.s] = -1;
}

class Annealer {
  constructor(D, P, rng) {
    this.D = D; this.P = P; this.rng = rng;
    this.nc = new Float64Array(D.nets.length); this.recalc();
    this.T = 1; this.rlim = D.fab.G; this.att = 0; this.acc = 0; this.moves = 0; this.accepted = 0;
    this.mpt = Math.max(24, Math.round(Math.pow(D.cells.length, 4 / 3)));
    this.inT = 0; this.frozen = false; this.quench = false; this.auto = true; this.lastAcc = 1;
    this.history = []; this.mark = new Int32Array(D.nets.length); this.stamp = 1;
  }
  recalc() { this.cost = 0; for (let i = 0; i < this.D.nets.length; i++) { this.nc[i] = netHPWL(this.D, this.P, i); this.cost += this.nc[i]; } }
  pickTarget(c) {
    const D = this.D, F = D.fab, site = F.sites[this.P.pos[c]], r = Math.max(1, Math.round(this.rlim)), rng = this.rng;
    if (site.kind === 'clb') {
      for (let t = 0; t < 10; t++) {
        const x = Math.min(F.N, Math.max(1, site.x + Math.floor(rng() * (2 * r + 1)) - r));
        const y = Math.min(F.N, Math.max(1, site.y + Math.floor(rng() * (2 * r + 1)) - r));
        if (x !== site.x || y !== site.y) return F.at[y * F.G + x];
      }
      return -1;
    }
    for (let t = 0; t < 16; t++) {
      const s = F.io[Math.floor(rng() * F.io.length)]; const ss = F.sites[s];
      if (ss === site) continue;
      if (Math.max(Math.abs(ss.x - site.x), Math.abs(ss.y - site.y)) <= r + 1 || t > 12) return s;
    }
    return -1;
  }
  delta(c, s, commitIf) {
    const P = this.P, D = this.D; const other = P.occ[s];
    const st = ++this.stamp; const aff = [];
    for (const n of D.cellNets[c]) if (this.mark[n] !== st) { this.mark[n] = st; aff.push(n); }
    if (other >= 0) for (const n of D.cellNets[other]) if (this.mark[n] !== st) { this.mark[n] = st; aff.push(n); }
    let old = 0; for (const n of aff) old += this.nc[n];
    const u = placeSwap(P, c, s);
    const nw = aff.map(n => netHPWL(D, P, n)); let neu = 0; for (const v of nw) neu += v;
    const d = neu - old;
    if (commitIf(d)) { aff.forEach((n, i) => this.nc[n] = nw[i]); this.cost += d; return { ok: true, d }; }
    undoSwap(P, u); return { ok: false, d };
  }
  tryMove() {
    const n = this.D.cells.length; if (!n) return;
    const c = Math.floor(this.rng() * n); const s = this.pickTarget(c);
    this.moves++; this.att++;
    if (s < 0) return;
    const T = this.T; const rng = this.rng;
    const r = this.delta(c, s, d => d <= 0 || (T > 0 && rng() < Math.exp(-d / T)));
    if (r.ok) { this.acc++; this.accepted++; }
  }
  initT() {
    const n = Math.max(40, this.D.cells.length * 3); const costs = [];
    this.rlim = this.D.fab.G;
    for (let i = 0; i < n; i++) {
      const c = Math.floor(this.rng() * this.D.cells.length); const s = this.pickTarget(c);
      if (s >= 0) this.delta(c, s, () => true);
      costs.push(this.cost);
    }
    const m = costs.reduce((a, b) => a + b, 0) / costs.length;
    const sd = Math.sqrt(costs.reduce((a, b) => a + (b - m) * (b - m), 0) / costs.length);
    this.T = Math.max(0.5, 20 * sd); this.T0 = this.T;
    this.frozen = false; this.quench = false; this.history = [{ cost: this.cost, T: this.T, acc: 1 }];
    this.att = 0; this.acc = 0; this.inT = 0; this.moves = 0; this.accepted = 0;
  }
  endT() {
    const a = this.att ? this.acc / this.att : 0; this.lastAcc = a;
    if (this.quench) { this.frozen = true; this.quench = false; }
    else if (this.auto) {
      this.T *= a > 0.96 ? 0.5 : a > 0.8 ? 0.9 : a > 0.15 ? 0.95 : 0.8;
      const nn = Math.max(1, this.D.nets.length);
      if (this.T < 0.005 * this.cost / nn || this.cost === 0) { this.T = 0; this.quench = true; }
    }
    this.rlim = Math.min(this.D.fab.G, Math.max(1, this.rlim * (1 - 0.44 + a)));
    this.history.push({ cost: this.cost, T: this.T, acc: a });
    if (this.history.length > 600) this.history.splice(1, this.history.length - 600);
    this.att = 0; this.acc = 0; this.inT = 0;
  }
  step(n) {
    for (let i = 0; i < n && !this.frozen; i++) { this.tryMove(); if (++this.inT >= this.mpt) this.endT(); }
  }
  setT(T) { this.T = T; this.frozen = false; this.quench = false; }
}

function annealFully(D, P, rng) {
  const A = new Annealer(D, P, rng); A.initT();
  let guard = 0; while (!A.frozen && guard++ < 4000) A.step(A.mpt);
  return A;
}

/* ---------- routing: island-style channels between tiles ---------- */
function makeRRG(G) {
  const nH = G * (G + 1), nV = (G + 1) * G, S = nH + nV;
  const H = (i, j) => i * (G + 1) + j, V = (i, j) => nH + i * G + j;
  const seg = new Array(S);
  for (let i = 0; i < G; i++) for (let j = 0; j <= G; j++) seg[H(i, j)] = { x0: i, y0: j, x1: i + 1, y1: j, h: true };
  for (let i = 0; i <= G; i++) for (let j = 0; j < G; j++) seg[V(i, j)] = { x0: i, y0: j, x1: i, y1: j + 1, h: false };
  const C = (G + 1); const cs = Array.from({ length: C * C }, () => []);
  seg.forEach((s, k) => { cs[s.y0 * C + s.x0].push(k); cs[s.y1 * C + s.x1].push(k); });
  const adj = seg.map((s, k) => { const set = new Set([...cs[s.y0 * C + s.x0], ...cs[s.y1 * C + s.x1]]); set.delete(k); return [...set]; });
  const pins = (x, y) => [H(x, y), H(x, y + 1), V(x, y), V(x + 1, y)];
  return { G, S, seg, adj, pins, H, V };
}

class Heap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val);
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v; const topK = k[0], topV = v[0]; const lk = k.pop(), lv = v.pop();
    if (k.length) {
      let i = 0; const n = k.length;
      for (;;) { let l = 2 * i + 1, r = l + 1, m = i; let mk = lk; if (l < n && k[l] < mk) { m = l; mk = k[l]; } if (r < n && k[r] < mk) { m = r; } if (m === i) break; k[i] = k[m]; v[i] = v[m]; i = m; }
      k[i] = lk; v[i] = lv;
    }
    this.lastKey = topK; return topV;
  }
}

function routeDesign(D, P, W, maxIt = 45) {
  const R = D.rrg, S = R.S, sites = D.fab.sites;
  const occ = new Int16Array(S), hist = new Float32Array(S);
  const dist = new Float64Array(S).fill(Infinity), prev = new Int32Array(S).fill(-1);
  let pres = 0.6;
  const routes = D.nets.map(() => null);
  const order = D.nets.map((n, i) => i).sort((a, b) => (D.nets[b].sinks.length - D.nets[a].sinks.length) || (netHPWL(D, P, b) - netHPWL(D, P, a)));
  const cost = s => (1 + hist[s]) * (1 + pres * Math.max(0, occ[s] + 1 - W));
  const routeNet = ni => {
    const net = D.nets[ni]; const src = sites[P.pos[net.driver]];
    const tree = new Map(); const sinks = new Map();
    const sinkCells = net.sinks.slice().sort((a, b) => {
      const sa = sites[P.pos[a]], sb = sites[P.pos[b]];
      return (Math.abs(sa.x - src.x) + Math.abs(sa.y - src.y)) - (Math.abs(sb.x - src.x) + Math.abs(sb.y - src.y));
    });
    const srcPins = R.pins(src.x, src.y);
    for (const sc of sinkCells) {
      const ss = sites[P.pos[sc]]; const tg = R.pins(ss.x, ss.y); const tset = new Set(tg);
      let hit = -1;
      for (const t of tg) if (tree.has(t) && (hit < 0 || tree.get(t).d < tree.get(hit).d)) hit = t;
      if (hit < 0) {
        const touched = []; const hp = new Heap();
        const seed = (s, d0) => { if (d0 < dist[s]) { if (dist[s] === Infinity) touched.push(s); dist[s] = d0; prev[s] = -1; hp.push(d0, s); } };
        if (tree.size) for (const s of tree.keys()) seed(s, 0); else for (const s of srcPins) seed(s, cost(s));
        let found = -1;
        while (hp.size) {
          const s = hp.pop(); const d = hp.lastKey; if (d > dist[s]) continue;
          if (tset.has(s)) { found = s; break; }
          for (const nb of R.adj[s]) {
            const nd = d + cost(nb) + 0.001 * (Math.abs(R.seg[nb].x0 - ss.x) + Math.abs(R.seg[nb].y0 - ss.y));
            if (nd < dist[nb]) { if (dist[nb] === Infinity) touched.push(nb); dist[nb] = nd; prev[nb] = s; hp.push(nd, nb); }
          }
        }
        const path = []; for (let s = found; s >= 0; s = prev[s]) path.push(s);
        path.reverse();
        for (let k = 0; k < path.length; k++) {
          const s = path[k]; if (tree.has(s)) continue;
          const par = k > 0 ? path[k - 1] : -1;
          tree.set(s, { parent: par, d: par >= 0 ? tree.get(par).d + 1 : 1 });
        }
        for (const s of touched) { dist[s] = Infinity; prev[s] = -1; }
        hit = found;
      }
      const sp = []; for (let s = hit; s >= 0; s = tree.get(s).parent) sp.push(s);
      sinks.set(sc, { seg: hit, hops: tree.get(hit).d, path: sp.reverse() });
    }
    return { segs: [...tree.keys()], sinks, src: srcPins };
  };
  const iters = []; let it = 0;
  for (it = 1; it <= maxIt; it++) {
    for (const ni of order) {
      if (routes[ni]) for (const s of routes[ni].segs) occ[s]--;
      routes[ni] = D.nets[ni].sinks.length ? routeNet(ni) : { segs: [], sinks: new Map(), src: [] };
      for (const s of routes[ni].segs) occ[s]++;
    }
    let over = 0, used = 0, peak = 0;
    for (let s = 0; s < S; s++) { if (occ[s] > W) over++; used += occ[s]; if (occ[s] > peak) peak = occ[s]; }
    iters.push({ it, over, used, peak, occ: occ.slice(), routes: routes.slice() });
    if (!over) break;
    for (let s = 0; s < S; s++) if (occ[s] > W) hist[s] += 0.8 * (occ[s] - W);
    pres *= 1.7;
  }
  const last = iters[iters.length - 1];
  return { W, iters, routes: last.routes, occ: last.occ, ok: last.over === 0, over: last.over, used: last.used, peak: last.peak, order };
}

/* ---------- static timing ---------- */
const DLY = { ibuf: 0.45, obuf: 0.80, lut: 0.12, pin: 0.05, seg: 0.135, fan: 0.015 };
function netDelay(D, RT, ni, sink, ideal) {
  if (ideal) return 0;
  const r = RT.routes[ni]; const s = r && r.sinks.get(sink); const hops = s ? s.hops : 0;
  return DLY.pin + DLY.seg * hops + DLY.fan * (D.nets[ni].sinks.length - 1);
}
function analyzeTiming(S, M, D, RT, ideal = false) {
  const nC = D.cells.length; const arr = new Float64Array(nC); const from = new Int32Array(nC).fill(-1);
  D.cells.forEach((c, i) => { if (c.kind === 'in') arr[i] = DLY.ibuf; });
  for (const l of M.luts) {
    let best = 0, bc = -1;
    for (const leaf of l.leaves) {
      const dc = D.drvCell.get(leaf); const ni = D.netOfDriver.get(dc);
      const t = arr[dc] + netDelay(D, RT, ni, l.cell, ideal);
      if (t >= best) { best = t; bc = dc; }
    }
    arr[l.cell] = best + DLY.lut; from[l.cell] = bc;
  }
  const ends = [];
  D.cells.forEach((c, i) => {
    if (c.kind !== 'out') return;
    const dc = D.drvCell.get(c.node); const ni = D.netOfDriver.get(dc);
    arr[i] = arr[dc] + netDelay(D, RT, ni, i, ideal) + DLY.obuf; from[i] = dc;
    ends.push({ cell: i, name: c.label, t: arr[i] });
  });
  ends.sort((a, b) => b.t - a.t);
  const crit = ends[0];
  const chain = []; if (crit) { for (let c = crit.cell; c >= 0; c = from[c]) chain.push(c); chain.reverse(); }
  const path = [];
  chain.forEach((c, k) => {
    const cell = D.cells[c];
    if (k > 0) {
      const dc = chain[k - 1]; const ni = D.netOfDriver.get(dc);
      const r = RT.routes[ni]; const si = r && r.sinks.get(c);
      path.push({ kind: 'net', net: ni, from: dc, to: c, d: netDelay(D, RT, ni, c, ideal), hops: si ? si.hops : 0, segs: si ? si.path : [] });
    }
    if (cell.kind === 'in') path.push({ kind: 'ibuf', cell: c, d: DLY.ibuf });
    else if (cell.kind === 'lut') path.push({ kind: 'lut', cell: c, d: DLY.lut });
    else path.push({ kind: 'obuf', cell: c, d: DLY.obuf });
  });
  const sum = k => path.filter(p => k.includes(p.kind)).reduce((a, p) => a + p.d, 0);
  return { ends, crit, path, total: crit ? crit.t : 0, logic: sum(['lut']), route: sum(['net']), io: sum(['ibuf', 'obuf']), levels: path.filter(p => p.kind === 'lut').length };
}

/* ---------- whole flow ---------- */
function compileAll(src, seed = 7, W = null) {
  const S = synthesize(src);
  const M = mapLuts(S);
  const D = buildPlaceDesign(S, M);
  const rng = rngOf(seed);
  const P = randomPlacement(D, rng);
  const P0 = clonePlacement(P);
  const A = annealFully(D, P, rng);
  const w = W || defaultW(D);
  const RT = routeDesign(D, P, w);
  const TM = analyzeTiming(S, M, D, RT);
  return { S, M, D, P, P0, A, RT, TM };
}
function defaultW(D) { return D.nets.length > 40 ? 5 : 4; }

if (typeof module !== 'undefined') module.exports = { synthesize, mapLuts, buildPlaceDesign, randomPlacement, clonePlacement, annealFully, Annealer, routeDesign, analyzeTiming, compileAll, rngOf, totalHPWL, evalCone, SrcError, DLY, parseSource };
