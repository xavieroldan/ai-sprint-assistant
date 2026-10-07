const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { run } = require('../src/main');

function setup(overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asa-'));
  const out = path.join(dir, 'out');
  const summary = path.join(dir, 'summary');
  const env = {
    GITHUB_REPOSITORY: 'acme/app',
    GITHUB_EVENT_PATH: path.join(dir, 'event.json'),
    GITHUB_WORKSPACE: dir,
    GITHUB_OUTPUT: out,
    GITHUB_STEP_SUMMARY: summary,
    'INPUT_ANTHROPIC-API-KEY': 'key',
    'INPUT_GITHUB-TOKEN': 'token',
    ...overrides.env,
  };
  const event = { pull_request: { number: 7, title: 'Add export', body: 'Closes #4', user: { login: 'ana' }, base: { ref: 'main' }, head: { ref: 'f' }, draft: false, ...overrides.pr } };
  fs.writeFileSync(env.GITHUB_EVENT_PATH, JSON.stringify(event));
  const posted = [];
  const deps = {
    log: () => {},
    githubClient: () => ({
      listPullFiles: async () => [{ filename: 'src/export.js', status: 'added', additions: 20, deletions: 0, patch: '+code' }],
      getIssue: async (n) => ({ number: n, title: 'Export orders', body: 'AC: CSV' }),
      upsertComment: async (n, body) => posted.push({ n, body }),
    }),
    loadDod: () => ({ items: ['Tests added', 'Docs updated'], source: 'default' }),
    askClaude: async () =>
      overrides.answer ||
      JSON.stringify({
        summary: 'Adds CSV export.',
        change_type: 'feature',
        story_alignment: 'aligned',
        dod: [{ item: 'Tests added', status: 'not_met' }, { item: 'Docs updated', status: 'met' }],
        risks: [],
        suggested_tests: [],
      }),
  };
  return { env, deps, posted, out, summary };
}

test('end to end: posts a comment and writes outputs', async () => {
  const { env, deps, posted, out, summary } = setup();
  const result = await run({ env, deps });
  assert.equal(result.met, 1);
  assert.equal(posted[0].n, 7);
  assert.match(posted[0].body, /Story:\*\* #4/);
  assert.match(fs.readFileSync(out, 'utf8'), /change-type=feature\ndod-met=1\ndod-total=2/);
  assert.match(fs.readFileSync(summary, 'utf8'), /AI Sprint Assistant/);
});

test('without an API key it still posts the automatic checks (fork pull requests)', async () => {
  const { env, deps, posted, out } = setup({ env: { 'INPUT_ANTHROPIC-API-KEY': '' } });
  const result = await run({ env, deps });
  assert.equal(result.review, null);
  assert.equal(posted.length, 1);
  assert.match(posted[0].body, /AI review unavailable: no anthropic-api-key/);
  assert.match(posted[0].body, /### Automatic checks/);
  assert.match(fs.readFileSync(out, 'utf8'), /checks-passed=false/);
});

test('skips draft pull requests by default', async () => {
  const { env, deps, posted } = setup({ pr: { draft: true } });
  assert.deepEqual(await run({ env, deps }), { skipped: true });
  assert.equal(posted.length, 0);
});

test('fails when the DoD ratio is below fail-below-dod', async () => {
  const { env, deps, posted } = setup({ env: { 'INPUT_FAIL-BELOW-DOD': '0.8' } });
  await assert.rejects(run({ env, deps }), /below the required 80%/);
  assert.equal(posted.length, 1, 'the comment is still posted before failing');
});

test('an unusable model answer still posts the checks instead of failing', async () => {
  const { env, deps, posted } = setup({ answer: 'I cannot help' });
  const result = await run({ env, deps });
  assert.match(result.aiError, /not valid JSON/);
  assert.match(posted[0].body, /AI review unavailable: Model response was not valid JSON/);
});

test('a Claude API error does not break the job', async () => {
  const { env, deps, posted } = setup();
  deps.askClaude = async () => { throw new Error('HTTP 529 overloaded'); };
  const result = await run({ env, deps });
  assert.equal(result.skipped, false);
  assert.match(posted[0].body, /HTTP 529 overloaded/);
});

test('fail-on-checks fails the job after posting the comment', async () => {
  const { env, deps, posted } = setup({ env: { 'INPUT_FAIL-ON-CHECKS': 'true' } });
  await assert.rejects(run({ env, deps }), /Required checks failed: .*Code changes include tests/);
  assert.equal(posted.length, 1);
});
