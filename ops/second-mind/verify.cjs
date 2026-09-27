#!/usr/bin/env node
/* Deterministic second-mind integrity gate. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');

const dir = __dirname;
const root = path.resolve(dir, '..', '..');
const index = JSON.parse(fs.readFileSync(path.join(dir, 'INDEX.json'), 'utf8'));
const memory = JSON.parse(fs.readFileSync(path.join(dir, 'PROJECT_MEMORY.json'), 'utf8'));
const decisions = JSON.parse(fs.readFileSync(path.join(dir, 'DECISIONS.json'), 'utf8'));
const errors = [];

for (const p of ['AGENTS.md', 'docs/governance/CONSTITUTION.md', 'docs/governance/CURRENT_STATE.md', 'ops/ACTIVE_TASKS.json', 'ops/mailbox/INBOX.md']) {
  if (!fs.existsSync(path.join(root, p))) errors.push(`REQUIRED_EVIDENCE_MISSING:${p}`);
}
if (memory.schema !== 'tizim02-second-mind-v1') errors.push('MEMORY_SCHEMA_INVALID');
if (decisions.schema !== 'tizim02-decision-register-v1') errors.push('DECISION_SCHEMA_INVALID');
if (!Array.isArray(memory.non_negotiable_laws) || memory.non_negotiable_laws.length < 5) errors.push('LAWS_INCOMPLETE');
if (!Array.isArray(decisions.entries) || decisions.entries.length < 3) errors.push('DECISIONS_INCOMPLETE');
for (const f of index.files) {
  const p = path.join(root, f.path);
  if (!f.exists) { errors.push(`INDEX_PATH_MISSING:${f.path}`); continue; }
  if (!fs.existsSync(p)) { errors.push(`INDEX_STALE_MISSING:${f.path}`); continue; }
  const digest = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  if (digest !== f.sha256) errors.push(`INDEX_STALE_HASH:${f.path}`);
}
const head = cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
if (head !== index.generated_from.git_head) errors.push(`INDEX_HEAD_STALE:${index.generated_from.git_head}->${head}`);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`Second mind verify PASS: ${index.files.length} evidence paths, ${decisions.entries.length} decisions, head=${head}`);
