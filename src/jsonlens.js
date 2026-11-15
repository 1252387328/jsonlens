// jsonlens core: strict JSON parsing with precise error locations, formatting,
// key sorting, path queries and structure stats. Pure ES module, no dependencies.

export class JsonError extends Error {
  constructor(message, offset, text) {
    const { line, column } = locate(text, offset);
    super(`${message} at line ${line}, column ${column}`);
    this.name = 'JsonError';
    this.offset = offset;
    this.line = line;
    this.column = column;
    this.reason = message;
  }
}

function locate(text, offset) {
  let line = 1, column = 1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === '\n') { line++; column = 1; } else column++;
  }
  return { line, column };
}

/**
 * Strict JSON parser that reports exactly where input goes wrong.
 * (JSON.parse error messages differ across browsers and often lack positions.)
 */
export function parse(text) {
  let i = 0;
  const fail = (msg, at = i) => { throw new JsonError(msg, at, text); };
  const ws = () => { while (i < text.length && ' \t\n\r'.includes(text[i])) i++; };
  const describe = (ch) => (ch === undefined ? 'end of input' : `"${ch}"`);

  function value() {
    ws();
    const ch = text[i];
    if (ch === '{') return object();
    if (ch === '[') return array();
    if (ch === '"') return string();
    if (ch === '-' || (ch >= '0' && ch <= '9')) return number();
    for (const [word, v] of [['true', true], ['false', false], ['null', null]]) {
      if (text.startsWith(word, i)) { i += word.length; return v; }
    }
    if (ch === "'") fail('strings must use double quotes');
    if (ch === undefined) fail('unexpected end of input');
    if (text.startsWith('undefined', i) || text.startsWith('NaN', i) || text.startsWith('Infinity', i)) {
      fail(`${text.slice(i).match(/^\w+/)[0]} is not valid JSON`);
    }
    fail(`unexpected ${describe(ch)}`);
  }

  function object() {
    const out = {};
    i++; ws();
    if (text[i] === '}') { i++; return out; }
    for (;;) {
      ws();
      if (text[i] === '}') fail('trailing comma before "}"', i);
      if (text[i] !== '"') fail(text[i] === "'" ? 'keys must use double quotes' : `expected a "quoted" key, got ${describe(text[i])}`);
      const key = string();
      ws();
      if (text[i] !== ':') fail(`expected ":" after key, got ${describe(text[i])}`);
      i++;
      out[key] = value();
      ws();
      if (text[i] === ',') { i++; continue; }
      if (text[i] === '}') { i++; return out; }
      fail(`expected "," or "}", got ${describe(text[i])}`);
    }
  }

  function array() {
    const out = [];
    i++; ws();
    if (text[i] === ']') { i++; return out; }
    for (;;) {
      ws();
      if (text[i] === ']') fail('trailing comma before "]"', i);
      out.push(value());
      ws();
      if (text[i] === ',') { i++; continue; }
      if (text[i] === ']') { i++; return out; }
      fail(`expected "," or "]", got ${describe(text[i])}`);
    }
  }

  function string() {
    const start = i;
    i++;
    let out = '';
    for (;;) {
      const ch = text[i];
      if (ch === undefined) fail('unterminated string', start);
      if (ch === '"') { i++; return out; }
      if (ch < ' ') fail('control character in string (use \\n, \\t …)');
      if (ch === '\\') {
        const esc = text[i + 1];
        const map = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
        if (esc in map) { out += map[esc]; i += 2; continue; }
        if (esc === 'u') {
          const hex = text.slice(i + 2, i + 6);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('invalid \\u escape');
          out += String.fromCharCode(parseInt(hex, 16));
          i += 6;
          continue;
        }
        fail(`invalid escape \\${esc ?? ''}`);
      }
      out += ch;
      i++;
    }
  }

  function number() {
    const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i));
    if (!m) fail('invalid number');
    if (/^-?0\d/.test(text.slice(i))) fail('numbers cannot have leading zeros');
    i += m[0].length;
    return Number(m[0]);
  }

  const result = value();
  ws();
  if (i < text.length) fail(`unexpected ${describe(text[i])} after the JSON value`);
  return result;
}

export function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
  }
  return v;
}

export function format(v, { indent = 2, sort = false } = {}) {
  return JSON.stringify(sort ? sortKeys(v) : v, null, indent);
}

export const minify = (v) => JSON.stringify(v);

// ------------------------------------------------------------------ queries

/**
 * Tokenise a path such as  $.store.books[0].title  |  .items[*].id  |  $["odd key"][-1]
 * Returns segments: {key}, {index}, {wildcard:true}
 */
export function parsePath(path) {
  let p = path.trim();
  if (p.startsWith('$')) p = p.slice(1);
  const segs = [];
  let i = 0;
  while (i < p.length) {
    if (p[i] === '.') {
      i++;
      if (p[i] === '*') { segs.push({ wildcard: true }); i++; continue; }
      const m = /^[^.[\]]+/.exec(p.slice(i));
      if (!m) throw new Error(`empty key at ${i} in path`);
      segs.push({ key: m[0] });
      i += m[0].length;
    } else if (p[i] === '[') {
      const end = p.indexOf(']', i);
      if (end === -1) throw new Error('missing "]" in path');
      const inner = p.slice(i + 1, end).trim();
      if (inner === '*') segs.push({ wildcard: true });
      else if (/^-?\d+$/.test(inner)) segs.push({ index: Number(inner) });
      else if (/^(["']).*\1$/.test(inner)) segs.push({ key: inner.slice(1, -1) });
      else throw new Error(`bad bracket segment [${inner}]`);
      i = end + 1;
    } else {
      const m = /^[^.[\]]+/.exec(p.slice(i));
      segs.push({ key: m[0] });
      i += m[0].length;
    }
  }
  return segs;
}

/** Evaluate a path. Always returns an array of matches. */
export function query(value, path) {
  let cur = [value];
  for (const seg of parsePath(path)) {
    const next = [];
    for (const v of cur) {
      if (seg.wildcard) {
        if (Array.isArray(v)) next.push(...v);
        else if (v && typeof v === 'object') next.push(...Object.values(v));
      } else if (seg.index !== undefined) {
        if (Array.isArray(v)) {
          const idx = seg.index < 0 ? v.length + seg.index : seg.index;
          if (idx >= 0 && idx < v.length) next.push(v[idx]);
        }
      } else if (v && typeof v === 'object' && !Array.isArray(v) && Object.hasOwn(v, seg.key)) {
        next.push(v[seg.key]);
      }
    }
    cur = next;
  }
  return cur;
}

/** Path string for a key under a parent path, quoting keys that are not identifiers. */
export function childPath(parent, key) {
  if (typeof key === 'number') return `${parent}[${key}]`;
  return /^[A-Za-z_$][\w$]*$/.test(key) ? `${parent}.${key}` : `${parent}[${JSON.stringify(key)}]`;
}

export function stats(v) {
  const s = { objects: 0, arrays: 0, strings: 0, numbers: 0, booleans: 0, nulls: 0, keys: 0, depth: 0 };
  const walk = (x, d) => {
    s.depth = Math.max(s.depth, d);
    if (Array.isArray(x)) { s.arrays++; x.forEach((y) => walk(y, d + 1)); }
    else if (x === null) s.nulls++;
    else if (typeof x === 'object') { s.objects++; for (const k in x) { s.keys++; walk(x[k], d + 1); } }
    else if (typeof x === 'string') s.strings++;
    else if (typeof x === 'number') s.numbers++;
    else s.booleans++;
  };
  walk(v, 0);
  return s;
}
