// Entry point of the GitHub Action.
const fs = require('fs');
const { getInput, linkedIssueNumbers, readContext } = require('./context');
const { signals: diffSignals, compactDiff } = require('./diff');
const { loadDod } = require('./dod');
const { runChecks } = require('./checks');
const { buildPrompt, parseReview } = require('./prompt');
const { MARKER, renderComment, dodScore } = require('./comment');
const { githubClient, askClaude } = require('./clients');

const MAX_STORIES = 3;

function appendFile(path, text) {
  if (path) fs.appendFileSync(path, text);
}

const getBool = (env, name, fallback) => ['true', '1', 'yes'].includes(getInput(env, name, String(fallback)).toLowerCase());

async function run({ env = process.env, deps = {} } = {}) {
  const log = deps.log || console.log;
  const token = getInput(env, 'github-token');
  if (!token) throw new Error('github-token is required');
  const apiKey = getInput(env, 'anthropic-api-key');
  const model = getInput(env, 'model', 'claude-haiku-4-5-20251001');
  const dodPath = getInput(env, 'dod-path', '.github/definition-of-done.md');
  const maxDiff = parseInt(getInput(env, 'max-diff-chars', '60000'), 10);
  const failBelow = parseFloat(getInput(env, 'fail-below-dod', '0'));
  const failOnChecks = getBool(env, 'fail-on-checks', false);
  const checkConfig = {
    requireTests: getBool(env, 'require-tests', true),
    requireLinkedIssue: getBool(env, 'require-linked-issue', true),
    maxChangedLines: parseInt(getInput(env, 'max-changed-lines', '400'), 10),
  };

  const ctx = readContext(env, deps.readFile);
  if (ctx.pr.draft && getBool(env, 'skip-drafts', true)) {
    log('Pull request is a draft. Skipping review.');
    return { skipped: true };
  }

  // 1. Gather context
  const gh = (deps.githubClient || githubClient)({ token, apiUrl: ctx.apiUrl, owner: ctx.owner, repo: ctx.repo });
  const files = await gh.listPullFiles(ctx.pr.number);
  const sig = diffSignals(files);
  const storyNumbers = linkedIssueNumbers(`${ctx.pr.title}\n${ctx.pr.body}`).slice(0, MAX_STORIES);
  const stories = (await Promise.all(storyNumbers.map((n) => gh.getIssue(n)))).filter(Boolean);
  const dod = (deps.loadDod || loadDod)(ctx.workspace, dodPath);

  // 2. Deterministic checks always run, with or without AI
  const checks = runChecks({ pr: ctx.pr, files, stories, signals: sig, config: checkConfig });

  // 3. AI review: optional, and a failure never blocks the comment
  let review = null;
  let aiError = null;
  if (!apiKey) {
    aiError = 'no anthropic-api-key (forks do not receive secrets): only automatic checks were run';
  } else {
    try {
      const prompt = buildPrompt({ pr: ctx.pr, stories, dodItems: dod.items, signals: sig, diff: compactDiff(files, maxDiff) });
      const parsed = parseReview(await (deps.askClaude || askClaude)({ apiKey, model, prompt }), dod.items);
      if (parsed.ok) review = parsed;
      else aiError = parsed.error;
    } catch (e) {
      aiError = e.message;
    }
  }
  if (aiError) log(`::warning::AI review unavailable: ${aiError}`);

  // 4. Comment and outputs
  const body = renderComment({ review, aiError, checks, stories, signals: sig, dodSource: dod.source, model });
  await gh.upsertComment(ctx.pr.number, body, MARKER);

  const { met, total } = review ? dodScore(review.dod) : { met: 0, total: 0 };
  appendFile(
    env.GITHUB_OUTPUT,
    `change-type=${review ? review.changeType : ''}\ndod-met=${met}\ndod-total=${total}\nchecks-passed=${checks.passed}\n`,
  );
  appendFile(env.GITHUB_STEP_SUMMARY, `${body}\n`);
  log(`Review posted on #${ctx.pr.number}: checks ${checks.passed ? 'passed' : 'failed'}, DoD ${met}/${total}`);

  // 5. Optional quality gates
  if (failOnChecks && !checks.passed) {
    const failed = checks.checks.filter((c) => c.required && !c.passed).map((c) => c.label);
    throw new Error(`Required checks failed: ${failed.join('; ')}`);
  }
  if (review && failBelow > 0 && total && met / total < failBelow) {
    throw new Error(`Definition of Done ${met}/${total} is below the required ${Math.round(failBelow * 100)}%`);
  }
  return { skipped: false, review, aiError, checks, met, total };
}

if (require.main === module) {
  run().catch((err) => {
    console.log(`::error::${err.message}`);
    process.exitCode = 1;
  });
}

module.exports = { run };
