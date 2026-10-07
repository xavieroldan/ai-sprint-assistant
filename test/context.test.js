const test = require('node:test');
const assert = require('node:assert/strict');
const { getInput, linkedIssueNumbers, readContext } = require('../src/context');

test('getInput reads INPUT_ variables with fallback', () => {
  const env = { 'INPUT_ANTHROPIC-API-KEY': ' key ', INPUT_MODEL: '' };
  assert.equal(getInput(env, 'anthropic-api-key'), 'key');
  assert.equal(getInput(env, 'model', 'default'), 'default');
});

test('linkedIssueNumbers finds closing keywords and references', () => {
  const text = 'Closes #12\nfixes #3, resolves #3\nRefs: #40\nsee issue 7\n#99 alone';
  assert.deepEqual(linkedIssueNumbers(text), [12, 3, 40]);
});

test('readContext extracts the pull request', () => {
  const env = { GITHUB_REPOSITORY: 'acme/app', GITHUB_EVENT_PATH: '/e.json' };
  const event = { pull_request: { number: 5, title: 'T', body: null, user: { login: 'ana' }, base: { ref: 'main' }, head: { ref: 'f' } } };
  const ctx = readContext(env, () => JSON.stringify(event));
  assert.equal(ctx.owner, 'acme');
  assert.equal(ctx.pr.number, 5);
  assert.equal(ctx.pr.body, '');
  assert.equal(ctx.apiUrl, 'https://api.github.com');
});

test('readContext rejects non pull_request events', () => {
  const env = { GITHUB_REPOSITORY: 'acme/app', GITHUB_EVENT_PATH: '/e.json' };
  assert.throws(() => readContext(env, () => '{"push": {}}'), /pull_request/);
});
