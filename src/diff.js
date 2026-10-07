// Turn the PR file list into compact signals and a size-limited diff for the prompt.

const TEST_PATTERN = /(^|\/)(tests?|__tests__|spec)(\/|$)|\.(test|spec)\.[a-z]+$|Tests?\.(cs|java|kt)$/i;
const DOC_PATTERN = /(^|\/)(docs?)\/|\.(md|mdx|rst|adoc)$/i;

function signals(files) {
  const changed = files.map((f) => f.filename);
  const tests = changed.filter((name) => TEST_PATTERN.test(name));
  const docs = changed.filter((name) => DOC_PATTERN.test(name));
  return {
    files: changed.length,
    additions: files.reduce((n, f) => n + (f.additions || 0), 0),
    deletions: files.reduce((n, f) => n + (f.deletions || 0), 0),
    testsChanged: tests.length > 0,
    docsChanged: docs.length > 0,
    testFiles: tests,
    docFiles: docs,
  };
}

// Keep the diff within a character budget; summarise files that do not fit.
function compactDiff(files, maxChars) {
  const parts = [];
  const skipped = [];
  let used = 0;
  for (const f of files) {
    const header = `--- ${f.filename} (${f.status}, +${f.additions || 0}/-${f.deletions || 0})`;
    const patch = f.patch ? `\n${f.patch}` : '\n(binary or too large to show)';
    const block = `${header}${patch}\n`;
    if (used + block.length <= maxChars) {
      parts.push(block);
      used += block.length;
    } else if (used + header.length + 1 <= maxChars) {
      parts.push(`${header}\n(patch omitted: size budget reached)\n`);
      used += header.length + 40;
    } else {
      skipped.push(f.filename);
    }
  }
  if (skipped.length) parts.push(`(${skipped.length} more file(s) not shown: ${skipped.slice(0, 20).join(', ')})\n`);
  return parts.join('');
}

module.exports = { signals, compactDiff, TEST_PATTERN, DOC_PATTERN };
