// Deterministic Definition of Done checks that run without AI.
const { TEST_PATTERN, DOC_PATTERN } = require('./diff');

const CONFIG_PATTERN = /(^|\/)\.github\/|\.(ya?ml|json|toml|ini|lock)$|(^|\/)\.[^/]+$/i;
const AC_HEADING = /^\s*(?:#{1,6}\s*|\*\*)?\s*(?:acceptance criteria|criterios de aceptaci[oó]n)\b/i;
const HEADING = /^\s*(?:#{1,6}\s+\S|\*\*[^*]+\*\*\s*$)/;
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.+?)\s*$/;

// List items under an "Acceptance criteria" heading of a user story
function acceptanceCriteria(body) {
  const lines = String(body || '').split(/\r?\n/);
  const start = lines.findIndex((line) => AC_HEADING.test(line));
  if (start === -1) return [];
  const items = [];
  for (const line of lines.slice(start + 1)) {
    if (HEADING.test(line)) break;
    const m = line.match(LIST_ITEM);
    if (m && m[1].trim()) items.push(m[1].trim());
  }
  return items;
}

function codeFiles(files) {
  return files
    .map((f) => f.filename)
    .filter((n) => !TEST_PATTERN.test(n) && !DOC_PATTERN.test(n) && !CONFIG_PATTERN.test(n));
}

// config: { requireTests, requireLinkedIssue, maxChangedLines }
function runChecks({ pr, files, stories, signals, config }) {
  const code = codeFiles(files);
  const criteria = stories.reduce((n, s) => n + acceptanceCriteria(s.body).length, 0);
  const lines = signals.additions + signals.deletions;
  const body = String(pr.body || '').trim();

  const checks = [
    {
      id: 'description',
      label: 'PR has a description',
      required: true,
      passed: body.length >= 20,
      detail: body.length >= 20 ? 'provided' : 'add what changes and why',
    },
    {
      id: 'linked-story',
      label: 'Linked to a user story (Closes #N)',
      required: config.requireLinkedIssue,
      passed: stories.length > 0,
      detail: stories.length ? stories.map((s) => `#${s.number}`).join(', ') : 'no linked issue found',
    },
    {
      id: 'acceptance-criteria',
      label: 'User story has acceptance criteria',
      required: config.requireLinkedIssue,
      passed: criteria > 0,
      detail: criteria ? `${criteria} criteria` : 'add an "Acceptance criteria" list to the story',
    },
    {
      id: 'tests',
      label: 'Code changes include tests',
      required: config.requireTests,
      passed: code.length === 0 || signals.testsChanged,
      detail: code.length === 0
        ? 'no code changes'
        : signals.testsChanged ? `${signals.testFiles.length} test file(s)` : `${code.length} code file(s) without tests`,
    },
    {
      id: 'size',
      label: `Small enough to review (≤ ${config.maxChangedLines} lines)`,
      required: false,
      passed: lines <= config.maxChangedLines,
      detail: `${lines} changed lines`,
    },
  ];
  return { passed: checks.every((c) => !c.required || c.passed), checks };
}

module.exports = { acceptanceCriteria, codeFiles, runChecks };
