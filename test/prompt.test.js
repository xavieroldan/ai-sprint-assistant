const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPrompt, parseReview } = require('../src/prompt');

const dodItems = ['Tests added', 'Docs updated'];

test('buildPrompt includes story, DoD, facts and diff', () => {
  const prompt = buildPrompt({
    pr: { title: 'Add export', body: 'Closes #4', author: 'ana', head: 'f', base: 'main' },
    stories: [{ number: 4, title: 'As a user I can export', body: 'AC: CSV file' }],
    dodItems,
    signals: { files: 2, additions: 5, deletions: 1, testsChanged: false, testFiles: [], docsChanged: true, docFiles: ['README.md'] },
    diff: '--- a.js',
  });
  assert.match(prompt, /#4 As a user I can export/);
  assert.match(prompt, /1\. Tests added\n2\. Docs updated/);
  assert.match(prompt, /Test files changed: none/);
  assert.match(prompt, /Documentation changed: README\.md/);
  assert.match(prompt, /--- a\.js/);
});

test('buildPrompt states when no story is linked', () => {
  const prompt = buildPrompt({
    pr: { title: 't', body: '', author: 'a', head: 'h', base: 'b' },
    stories: [],
    dodItems,
    signals: { files: 0, additions: 0, deletions: 0, testsChanged: false, testFiles: [], docsChanged: false, docFiles: [] },
    diff: '',
  });
  assert.match(prompt, /No user story is linked/);
});

test('parseReview normalises a valid answer', () => {
  const answer = `Sure:\n${JSON.stringify({
    summary: 'Adds CSV export.',
    change_type: 'feature',
    story_alignment: 'aligned',
    story_notes: 'Covers AC',
    dod: [{ item: 'Docs updated', status: 'met', evidence: 'README' }, { item: 'Tests added', status: 'weird' }],
    risks: ['a', 'b', 'c', 'd'],
    suggested_tests: ['empty file'],
  })}`;
  const r = parseReview(answer, dodItems);
  assert.equal(r.ok, true);
  assert.equal(r.changeType, 'feature');
  assert.deepEqual(r.dod.map((d) => [d.item, d.status]), [['Tests added', 'unknown'], ['Docs updated', 'met']]);
  assert.equal(r.risks.length, 3);
});

test('parseReview falls back to position and safe defaults', () => {
  const r = parseReview('{"change_type":"nope","dod":[{"item":"x","status":"not_met"}]}', dodItems);
  assert.equal(r.changeType, 'chore');
  assert.equal(r.storyAlignment, 'no_story');
  assert.equal(r.dod[0].status, 'not_met');
  assert.equal(r.dod[1].status, 'unknown');
});

test('parseReview reports invalid JSON', () => {
  assert.deepEqual(parseReview('no json', dodItems), { ok: false, error: 'Model response was not valid JSON' });
});
