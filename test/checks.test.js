const test = require('node:test');
const assert = require('node:assert/strict');
const { acceptanceCriteria, codeFiles, runChecks } = require('../src/checks');
const { signals } = require('../src/diff');

const config = { requireTests: true, requireLinkedIssue: true, maxChangedLines: 400 };
const f = (filename, additions = 10) => ({ filename, additions, deletions: 0 });
const story = { number: 4, title: 'Export', body: '### Acceptance criteria\n\n- [ ] CSV export\n- [ ] Header row\n\n### Story points\n\n3' };

test('acceptanceCriteria reads the GitHub issue form section and stops at the next heading', () => {
  assert.deepEqual(acceptanceCriteria(story.body), ['CSV export', 'Header row']);
  assert.deepEqual(acceptanceCriteria('**Criterios de aceptación**\n1. Exporta a CSV'), ['Exporta a CSV']);
  assert.deepEqual(acceptanceCriteria('No criteria\n- item'), []);
});

test('codeFiles ignores tests, docs and config', () => {
  const files = [f('src/a.js'), f('test/a.test.js'), f('README.md'), f('.github/workflows/ci.yml'), f('package.json'), f('src/Api/OrdersTests.cs')];
  assert.deepEqual(codeFiles(files), ['src/a.js']);
});

test('a complete PR passes all checks', () => {
  const files = [f('src/export.js'), f('test/export.test.js')];
  const result = runChecks({ pr: { body: 'Adds CSV export for orders' }, files, stories: [story], signals: signals(files), config });
  assert.equal(result.passed, true);
  assert.ok(result.checks.every((c) => c.passed));
});

test('missing description, story and tests fail; size is only a recommendation', () => {
  const files = [f('src/export.js', 900)];
  const result = runChecks({ pr: { body: '' }, files, stories: [], signals: signals(files), config });
  assert.equal(result.passed, false);
  assert.deepEqual(result.checks.filter((c) => !c.passed).map((c) => c.id),
    ['description', 'linked-story', 'acceptance-criteria', 'tests', 'size']);
});

test('requirements can be relaxed', () => {
  const files = [f('src/export.js')];
  const relaxed = { ...config, requireTests: false, requireLinkedIssue: false };
  const result = runChecks({ pr: { body: 'Refactor of the export module' }, files, stories: [], signals: signals(files), config: relaxed });
  assert.equal(result.passed, true);
});
