// Read the GitHub Actions environment and event payload.
const fs = require('fs');

const LINK_PATTERN = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?|refs?|relates? to)\s*:?\s+#(\d+)\b/gi;

function getInput(env, name, fallback = '') {
  const key = `INPUT_${name.replace(/ /g, '_').toUpperCase()}`;
  const value = env[key];
  return value === undefined || value === '' ? fallback : String(value).trim();
}

// Issue numbers referenced as "Closes #12", "fixes #3", "Refs: #7"...
function linkedIssueNumbers(text) {
  const found = new Set();
  for (const match of String(text || '').matchAll(LINK_PATTERN)) found.add(Number(match[1]));
  return [...found];
}

function readContext(env, readFile = (p) => fs.readFileSync(p, 'utf8')) {
  const [owner, repo] = String(env.GITHUB_REPOSITORY || '').split('/');
  if (!owner || !repo) throw new Error('GITHUB_REPOSITORY is not set');
  if (!env.GITHUB_EVENT_PATH) throw new Error('GITHUB_EVENT_PATH is not set');
  const event = JSON.parse(readFile(env.GITHUB_EVENT_PATH));
  const pr = event.pull_request;
  if (!pr) throw new Error('This action must run on pull_request or pull_request_target events');
  return {
    owner,
    repo,
    apiUrl: env.GITHUB_API_URL || 'https://api.github.com',
    workspace: env.GITHUB_WORKSPACE || process.cwd(),
    pr: {
      number: pr.number,
      title: pr.title || '',
      body: pr.body || '',
      author: (pr.user && pr.user.login) || '',
      base: (pr.base && pr.base.ref) || '',
      head: (pr.head && pr.head.ref) || '',
      draft: Boolean(pr.draft),
    },
  };
}

module.exports = { getInput, linkedIssueNumbers, readContext };
