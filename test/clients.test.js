const test = require('node:test');
const assert = require('node:assert/strict');
const { requestJson, githubClient, askClaude } = require('../src/clients');

const ok = (data, status = 200) => ({ ok: true, status, json: async () => data, text: async () => JSON.stringify(data) });
const fail = (status, text = 'err') => ({ ok: false, status, json: async () => ({}), text: async () => text });
const noSleep = async () => {};

test('requestJson retries transient errors then succeeds', async () => {
  const responses = [fail(529), fail(503), ok({ done: true })];
  const result = await requestJson(async () => responses.shift(), 'u', {}, { sleep: noSleep });
  assert.deepEqual(result, { done: true });
});

test('requestJson does not retry client errors', async () => {
  let calls = 0;
  await assert.rejects(requestJson(async () => { calls += 1; return fail(401, 'bad key'); }, 'u', {}, { sleep: noSleep }), /HTTP 401/);
  assert.equal(calls, 1);
});

test('upsertComment updates the existing marker comment', async () => {
  const calls = [];
  const fetchFn = async (url, opts) => {
    calls.push([opts.method, url]);
    if (url.endsWith('/comments?per_page=100')) return ok([{ id: 1, body: 'hi' }, { id: 9, body: 'x <!-- m --> y' }]);
    return ok({ id: 9 });
  };
  const gh = githubClient({ token: 't', apiUrl: 'https://api', owner: 'o', repo: 'r', fetchFn, sleep: noSleep });
  await gh.upsertComment(3, 'new', '<!-- m -->');
  assert.deepEqual(calls[1], ['PATCH', 'https://api/repos/o/r/issues/comments/9']);
});

test('upsertComment creates a comment when none exists', async () => {
  const calls = [];
  const fetchFn = async (url, opts) => {
    calls.push([opts.method, url]);
    return url.includes('per_page') ? ok([]) : ok({ id: 1 }, 201);
  };
  const gh = githubClient({ token: 't', apiUrl: 'https://api', owner: 'o', repo: 'r', fetchFn, sleep: noSleep });
  await gh.upsertComment(3, 'new', '<!-- m -->');
  assert.deepEqual(calls[1], ['POST', 'https://api/repos/o/r/issues/3/comments']);
});

test('getIssue returns null instead of throwing', async () => {
  const gh = githubClient({ token: 't', apiUrl: 'https://api', owner: 'o', repo: 'r', fetchFn: async () => fail(404), sleep: noSleep });
  assert.equal(await gh.getIssue(1), null);
});

test('listPullFiles paginates', async () => {
  const pages = { 1: Array.from({ length: 100 }, (_, i) => ({ filename: `f${i}` })), 2: [{ filename: 'last' }] };
  const fetchFn = async (url) => ok(pages[Number(url.match(/page=(\d+)$/)[1])]);
  const gh = githubClient({ token: 't', apiUrl: 'https://api', owner: 'o', repo: 'r', fetchFn, sleep: noSleep });
  assert.equal((await gh.listPullFiles(1)).length, 101);
});

test('askClaude sends the Messages API request and returns text', async () => {
  let sent;
  const fetchFn = async (url, opts) => {
    sent = { url, headers: opts.headers, body: JSON.parse(opts.body) };
    return ok({ content: [{ type: 'text', text: '{"a":1}' }] });
  };
  const text = await askClaude({ apiKey: 'k', model: 'claude-haiku-4-5-20251001', prompt: 'p', fetchFn, sleep: noSleep });
  assert.equal(text, '{"a":1}');
  assert.equal(sent.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(sent.headers['x-api-key'], 'k');
  assert.equal(sent.body.temperature, 0);
});
