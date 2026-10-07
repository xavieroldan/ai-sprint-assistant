const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_DOD, parseDod, loadDod } = require('../src/dod');

test('parseDod reads list and checklist items only', () => {
  const md = '# Definition of Done\n\nIntro text\n- [ ] Tests pass\n* Docs updated\n- [x] Reviewed\n';
  assert.deepEqual(parseDod(md), ['Tests pass', 'Docs updated', 'Reviewed']);
});

test('loadDod falls back to the default list', () => {
  const missing = loadDod('/ws', '.github/dod.md', () => false);
  assert.equal(missing.source, 'default');
  assert.deepEqual(missing.items, DEFAULT_DOD);
  const empty = loadDod('/ws', 'dod.md', () => true, () => 'no list here');
  assert.equal(empty.source, 'default');
});

test('loadDod uses the repository file when present', () => {
  const dod = loadDod('/ws', 'dod.md', () => true, () => '- A\n- B');
  assert.deepEqual(dod, { items: ['A', 'B'], source: 'dod.md' });
});
