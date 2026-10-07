// Render the review as a single, updatable pull request comment.

const MARKER = '<!-- ai-sprint-assistant -->';
const ICON = { met: '✅', not_met: '❌', unknown: '❔' };
const ALIGNMENT_TEXT = {
  aligned: '✅ Aligned with the user story',
  partial: '⚠️ Partially covers the user story',
  unrelated: '❌ Does not match the linked user story',
  no_story: '❔ No user story linked',
};

function dodScore(dod) {
  const met = dod.filter((d) => d.status === 'met').length;
  return { met, total: dod.length };
}

function escapeCell(text) {
  return String(text || '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function renderChecks(checks) {
  return [
    `### Automatic checks ${checks.passed ? '✅' : '❌'}`,
    ...checks.checks.map((c) => `- [${c.passed ? 'x' : ' '}] ${c.label}${c.required ? '' : ' _(recommended)_'} — ${escapeCell(c.detail)}`),
  ];
}

function renderComment({ review, aiError, checks, stories, signals, dodSource, model }) {
  const storyLinks = stories.length ? stories.map((s) => `#${s.number}`).join(', ') : 'none';
  const lines = [MARKER, '## 🤖 AI Sprint Assistant', ''];

  if (review) {
    const { met, total } = dodScore(review.dod);
    lines.push(
      `**Type:** \`${review.changeType}\` · **Definition of Done:** ${met}/${total} met · **Story:** ${storyLinks}`,
      '',
      '### Summary',
      review.summary || '_No summary._',
      '',
    );
  } else {
    lines.push(`**Story:** ${storyLinks}`, '', `> ⚠️ AI review unavailable: ${escapeCell(aiError || 'unknown error')}`, '');
  }

  if (checks) lines.push(...renderChecks(checks), '');

  if (review) {
    lines.push(
      '### User story',
      `${ALIGNMENT_TEXT[review.storyAlignment]}${review.storyNotes ? ` — ${review.storyNotes}` : ''}`,
      '',
      '### Definition of Done',
      '| | Item | Evidence |',
      '|---|---|---|',
      ...review.dod.map((d) => `| ${ICON[d.status]} | ${escapeCell(d.item)} | ${escapeCell(d.evidence) || '—'} |`),
    );
    if (review.risks.length) lines.push('', '### Risks', ...review.risks.map((r) => `- ${r}`));
    if (review.suggestedTests.length) {
      lines.push('', '### Suggested tests', ...review.suggestedTests.map((t) => `- ${t}`));
    }
  }

  lines.push(
    '',
    '<sub>',
    `Detected: ${signals.files} file(s), +${signals.additions}/-${signals.deletions}, ` +
      `tests ${signals.testsChanged ? 'changed' : 'not changed'}, docs ${signals.docsChanged ? 'changed' : 'not changed'}. ` +
      `DoD source: ${dodSource}. Model: ${review ? model : 'not used'}. AI output can be wrong — reviewers decide.`,
    '</sub>',
  );
  return lines.join('\n');
}

module.exports = { MARKER, renderComment, dodScore };
