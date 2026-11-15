import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, format, minify, query, parsePath, childPath, stats, sortKeys, JsonError } from '../src/jsonlens.js';

test('parses the same values as JSON.parse', () => {
  const samples = [
    '{"a":1,"b":[true,false,null],"c":{"d":"e\\n\\u00e9"}}',
    '[]', '{}', '0', '-1.5e10', '"\\"quoted\\""', '  [1, 2 , 3 ]  ',
    '{"nested":{"deep":[[[{"x":[]}]]]}}',
  ];
  for (const s of samples) assert.deepEqual(parse(s), JSON.parse(s), s);
});

test('reports precise, friendly errors', () => {
  const cases = [
    ['{"a": 1,}', /trailing comma before "}" at line 1, column 9/],
    ['[1, 2,]', /trailing comma before "]"/],
    ["{'a': 1}", /keys must use double quotes/],
    ['{"a": \'x\'}', /strings must use double quotes/],
    ['{"a" 1}', /expected ":" after key/],
    ['{"a": 1\n "b": 2}', /expected "," or "}", got """ at line 2, column 2/],
    ['[01]', /leading zeros/],
    ['{"a": undefined}', /undefined is not valid JSON/],
    ['"abc', /unterminated string at line 1, column 1/],
    ['{"a":1} x', /after the JSON value/],
    ['', /unexpected end of input/],
    ['"tab\there"', /control character/],
  ];
  for (const [input, re] of cases) {
    assert.throws(() => parse(input), (e) => e instanceof JsonError && re.test(e.message), input);
  }
});

test('error carries line and column', () => {
  try {
    parse('{\n  "a": 1,\n  "b": ]\n}');
    assert.fail('should throw');
  } catch (e) {
    assert.equal(e.line, 3);
    assert.equal(e.column, 8);
  }
});

test('format, minify and sort keys', () => {
  const v = { b: 1, a: { d: [1], c: 2 } };
  assert.equal(minify(v), '{"b":1,"a":{"d":[1],"c":2}}');
  assert.equal(format(v, { indent: 0, sort: true }), '{"a":{"c":2,"d":[1]},"b":1}');
  assert.deepEqual(Object.keys(sortKeys(v)), ['a', 'b']);
  assert.equal(format([1], { indent: 4 }), '[\n    1\n]');
});

test('path parsing', () => {
  assert.deepEqual(parsePath('$.a.b[0]'), [{ key: 'a' }, { key: 'b' }, { index: 0 }]);
  assert.deepEqual(parsePath('.items[*].id'), [{ key: 'items' }, { wildcard: true }, { key: 'id' }]);
  assert.deepEqual(parsePath('$["odd key"][-1]'), [{ key: 'odd key' }, { index: -1 }]);
  assert.throws(() => parsePath('$.a[0'), /missing/);
});

test('queries', () => {
  const doc = {
    store: { books: [{ title: 'A', tags: ['x'] }, { title: 'B', tags: [] }, { title: 'C' }] },
    'odd key': 42,
  };
  assert.deepEqual(query(doc, '$.store.books[*].title'), ['A', 'B', 'C']);
  assert.deepEqual(query(doc, '$.store.books[-1].title'), ['C']);
  assert.deepEqual(query(doc, '$["odd key"]'), [42]);
  assert.deepEqual(query(doc, '$.store.books[*].tags[0]'), ['x']);
  assert.deepEqual(query(doc, '$.missing.path'), []);
  assert.deepEqual(query(doc, '$'), [doc]);
});

test('child paths quote awkward keys', () => {
  assert.equal(childPath('$', 'name'), '$.name');
  assert.equal(childPath('$', 'first name'), '$["first name"]');
  assert.equal(childPath('$.a', 3), '$.a[3]');
});

test('stats', () => {
  assert.deepEqual(stats({ a: [1, 'x', null, true], b: {} }),
    { objects: 2, arrays: 1, strings: 1, numbers: 1, booleans: 1, nulls: 1, keys: 2, depth: 2 });
});
