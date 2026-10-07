const test = require('node:test');
const assert = require('node:assert/strict');
const { MARKER, renderComment, dodScore } = require('../src/comment');

const review = {
  summary: 'Adds export.',
  changeType: 'feature',
  storyAlignment: 'partial',
  storyNotes: 'XLSX missing',
  dod: [
    { item: 'Tests | added', status: 'met', evidence: 'OrdersTests.cs' },
    { item: 'Docs updated', status: 'not_met', evidence: '' },
    { item: 'No secrets', status: 'unknown', evidence: 'line\nbreak' },
  ],
  risks: ['Large files'],
  suggestedTests: [],
};
const signals = { files: 2, additions: 10, deletions: 1, testsChanged: true, docsChanged: false };

test('dodScore counts met items', () => {
  assert.deepEqual(dodScore(review.dod), { met: 1, total: 3 });
});

test('renderComment produces an updatable markdown comment', () => {
  const body = renderComment({ review, stories: [{ number: 4 }], signals, dodSource: 'default', model: 'm' });
  assert.ok(body.startsWith(MARKER));
  assert.match(body, /\*\*Definition of Done:\*\* 1\/3 met/);
  assert.match(body, /⚠️ Partially covers the user story — XLSX missing/);
  assert.match(body, /\| ✅ \| Tests \\\| added \| OrdersTests\.cs \|/);
  assert.match(body, /\| ❌ \| Docs updated \| — \|/);
  assert.match(body, /line break/);
  assert.match(body, /### Risks\n- Large files/);
  assert.ok(!body.includes('### Suggested tests'));
});

test('renderComment shows automatic checks and an AI warning when there is no review', () => {
  const checks = { passed: false, checks: [
    { label: 'PR has a description', required: true, passed: true, detail: 'provided' },
    { label: 'Small enough', required: false, passed: false, detail: '900 | lines' },
  ] };
  const body = renderComment({ review: null, aiError: 'no key', checks, stories: [], signals, dodSource: 'default', model: 'm' });
  assert.match(body, /AI review unavailable: no key/);
  assert.match(body, /### Automatic checks ❌/);
  assert.match(body, /- \[x\] PR has a description — provided/);
  assert.match(body, /Small enough _\(recommended\)_ — 900 \\\| lines/);
  assert.ok(!body.includes('### Definition of Done'));
  assert.match(body, /Model: not used/);
});
