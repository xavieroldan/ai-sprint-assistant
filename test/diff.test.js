const test = require('node:test');
const assert = require('node:assert/strict');
const { signals, compactDiff } = require('../src/diff');

const files = [
  { filename: 'src/api/Orders.cs', status: 'modified', additions: 10, deletions: 2, patch: '@@ -1 +1 @@\n-a\n+b' },
  { filename: 'tests/OrdersTests.cs', status: 'added', additions: 30, deletions: 0, patch: '+test' },
  { filename: 'docs/orders.md', status: 'modified', additions: 3, deletions: 1, patch: '+doc' },
  { filename: 'logo.png', status: 'added', additions: 0, deletions: 0 },
];

test('signals detect tests and docs', () => {
  const s = signals(files);
  assert.equal(s.files, 4);
  assert.equal(s.additions, 43);
  assert.equal(s.testsChanged, true);
  assert.deepEqual(s.docFiles, ['docs/orders.md']);
});

test('test detection covers common conventions', () => {
  const names = ['src/a.test.js', 'app/__tests__/x.js', 'spec/models/user_spec.rb', 'src/FooTest.java', 'src/main.js'];
  const s = signals(names.map((filename) => ({ filename })));
  assert.deepEqual(s.testFiles, names.slice(0, 4));
});

test('compactDiff respects the budget and lists skipped files', () => {
  const full = compactDiff(files, 100000);
  assert.match(full, /--- src\/api\/Orders\.cs \(modified, \+10\/-2\)/);
  assert.match(full, /binary or too large/);
  const small = compactDiff(files, 120);
  assert.ok(small.length < 400);
  assert.match(small, /not shown|patch omitted/);
});
