// Build the review prompt and parse the model's structured answer.

const CHANGE_TYPES = ['feature', 'fix', 'refactor', 'docs', 'test', 'chore'];
const ALIGNMENT = ['aligned', 'partial', 'unrelated', 'no_story'];
const DOD_STATUS = ['met', 'not_met', 'unknown'];

function buildPrompt({ pr, stories, dodItems, signals, diff }) {
  const storyText = stories.length
    ? stories.map((s) => `#${s.number} ${s.title}\n${s.body || '(no description)'}`).join('\n\n')
    : 'No user story is linked to this pull request.';
  const dodText = dodItems.map((item, i) => `${i + 1}. ${item}`).join('\n');
  return `You are an experienced Scrum Master and senior code reviewer helping a development team.
Review the pull request below against its linked user story and the team's Definition of Done.

<pull_request>
Title: ${pr.title}
Author: ${pr.author}
Branch: ${pr.head} -> ${pr.base}
Description:
${pr.body || '(empty)'}
</pull_request>

<user_stories>
${storyText}
</user_stories>

<definition_of_done>
${dodText}
</definition_of_done>

<facts_detected_automatically>
Files changed: ${signals.files} (+${signals.additions}/-${signals.deletions})
Test files changed: ${signals.testsChanged ? signals.testFiles.join(', ') : 'none'}
Documentation changed: ${signals.docsChanged ? signals.docFiles.join(', ') : 'none'}
</facts_detected_automatically>

<diff>
${diff}
</diff>

Rules:
- Base every judgement on the diff and descriptions above. If you cannot tell, use "unknown"; never guess.
- Evaluate EVERY Definition of Done item, in the same order, using the item text unchanged.
- Keep "summary" to at most 3 sentences for a reviewer who has not read the code.
- "risks" and "suggested_tests": at most 3 short items each, concrete to this change.
- Write in English.

Respond with ONLY a JSON object, no markdown fences, with exactly this shape:
{"summary": "", "change_type": "${CHANGE_TYPES.join('|')}", "story_alignment": "${ALIGNMENT.join('|')}", "story_notes": "", "dod": [{"item": "", "status": "${DOD_STATUS.join('|')}", "evidence": ""}], "risks": [], "suggested_tests": []}`;
}

function pick(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function strings(value, max) {
  return Array.isArray(value) ? value.map((v) => String(v).trim()).filter(Boolean).slice(0, max) : [];
}

// Never throws: returns { ok: false, error } when the answer cannot be used.
function parseReview(text, dodItems) {
  const jsonText = (String(text || '').match(/\{[\s\S]*\}/) || [''])[0];
  let data;
  try {
    data = JSON.parse(jsonText);
  } catch (e) {
    return { ok: false, error: 'Model response was not valid JSON' };
  }
  const byItem = new Map((Array.isArray(data.dod) ? data.dod : []).map((d) => [String(d.item || '').trim(), d]));
  const dod = dodItems.map((item, i) => {
    const entry = byItem.get(item) || (Array.isArray(data.dod) ? data.dod[i] : null) || {};
    return {
      item,
      status: pick(entry.status, DOD_STATUS, 'unknown'),
      evidence: String(entry.evidence || '').trim(),
    };
  });
  return {
    ok: true,
    summary: String(data.summary || '').trim(),
    changeType: pick(data.change_type, CHANGE_TYPES, 'chore'),
    storyAlignment: pick(data.story_alignment, ALIGNMENT, 'no_story'),
    storyNotes: String(data.story_notes || '').trim(),
    dod,
    risks: strings(data.risks, 3),
    suggestedTests: strings(data.suggested_tests, 3),
  };
}

module.exports = { buildPrompt, parseReview, CHANGE_TYPES, ALIGNMENT, DOD_STATUS };
