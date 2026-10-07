// Load the team's Definition of Done as a list of checklist items.
const fs = require('fs');
const path = require('path');

const DEFAULT_DOD = [
  'Code is covered by automated tests',
  'All acceptance criteria of the linked user story are met',
  'Documentation is updated when behaviour or configuration changes',
  'No secrets, credentials or personal data are committed',
  'The change is small enough to review and deploy safely',
];

// Accepts markdown with "- item" or "- [ ] item" lines; everything else is ignored.
function parseDod(markdown) {
  return String(markdown || '')
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*[-*]\s+(?:\[[ xX]\]\s+)?(.+?)\s*$/))
    .filter(Boolean)
    .map((m) => m[1])
    .slice(0, 20);
}

function loadDod(workspace, relativePath, exists = fs.existsSync, read = (p) => fs.readFileSync(p, 'utf8')) {
  const fullPath = path.join(workspace, relativePath);
  if (relativePath && exists(fullPath)) {
    const items = parseDod(read(fullPath));
    if (items.length) return { items, source: relativePath };
  }
  return { items: DEFAULT_DOD, source: 'default' };
}

module.exports = { DEFAULT_DOD, parseDod, loadDod };
