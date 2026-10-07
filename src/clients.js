// Minimal GitHub and Anthropic HTTP clients built on fetch (no dependencies).

const RETRY_STATUS = new Set([429, 500, 502, 503, 529]);

async function requestJson(fetchFn, url, options, { retries = 2, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    const res = await fetchFn(url, options);
    if (res.ok) return res.status === 204 ? null : res.json();
    if (attempt < retries && RETRY_STATUS.has(res.status)) {
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} for ${options.method || 'GET'} ${url}: ${text.slice(0, 300)}`);
  }
}

function githubClient({ token, apiUrl, owner, repo, fetchFn = fetch, sleep }) {
  const base = `${apiUrl}/repos/${owner}/${repo}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'ai-sprint-assistant',
  };
  const call = (path, method = 'GET', body) =>
    requestJson(fetchFn, `${base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined }, { sleep });

  return {
    async listPullFiles(number, maxFiles = 300) {
      const files = [];
      for (let page = 1; files.length < maxFiles; page += 1) {
        const batch = await call(`/pulls/${number}/files?per_page=100&page=${page}`);
        files.push(...batch);
        if (batch.length < 100) break;
      }
      return files.slice(0, maxFiles);
    },
    async getIssue(number) {
      try {
        const issue = await call(`/issues/${number}`);
        return { number: issue.number, title: issue.title, body: issue.body || '' };
      } catch (e) {
        return null; // A missing or private issue must not break the review
      }
    },
    async upsertComment(number, body, marker) {
      const comments = await call(`/issues/${number}/comments?per_page=100`);
      const existing = comments.find((c) => typeof c.body === 'string' && c.body.includes(marker));
      if (existing) return call(`/issues/comments/${existing.id}`, 'PATCH', { body });
      return call(`/issues/${number}/comments`, 'POST', { body });
    },
  };
}

async function askClaude({ apiKey, model, prompt, maxTokens = 1500, fetchFn = fetch, sleep }) {
  const data = await requestJson(
    fetchFn,
    'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model, max_tokens: maxTokens, temperature: 0, messages: [{ role: 'user', content: prompt }] }),
    },
    { sleep },
  );
  const block = (data.content || []).find((c) => c.type === 'text');
  return block ? block.text : '';
}

module.exports = { requestJson, githubClient, askClaude };
