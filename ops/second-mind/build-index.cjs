#!/usr/bin/env node
/* TIZIM_02 Second Mind: deterministic evidence index builder.
 * No network, no secrets, no AI inference, no production writes. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');

const root = path.resolve(__dirname, '..', '..');
const memoryPath = path.join(__dirname, 'PROJECT_MEMORY.json');
const outPath = path.join(__dirname, 'INDEX.json');
const memory = JSON.parse(fs.readFileSync(memoryPath, 'utf8'));

function gitFiles() {
  const output = cp.execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' });
  return new Set(output.split(/\r?\n/).filter(Boolean).map((p) => p.replaceAll('\\', '/')));
}

function addPath(set, p) {
  if (typeof p !== 'string' || !p || p.includes('*') || p.endsWith('/') || p === 'relevant architecture and handoff evidence') return;
  const normalized = p.replaceAll('\\', '/');
  if (normalized === 'ops/second-mind/INDEX.json') return;
  set.add(normalized);
}

const required = new Set([
  'AGENTS.md',
  'docs/governance/CONSTITUTION.md',
  'docs/governance/CURRENT_STATE.md',
  'docs/governance/AGENT_COMMS_PROTOCOL.md',
  'docs/governance/OWNER_AUTHORIZATION.md',
  'docs/governance/AGENT_CAPABILITY_POLICY.md',
  'ops/ACTIVE_TASKS.json',
  'ops/mailbox/INBOX.md',
  'ops/second-mind/README.md',
  'ops/second-mind/PROJECT_MEMORY.json',
  'ops/second-mind/DECISIONS.json',
]);
for (const d of memory.domains || []) for (const p of [...(d.entrypoints || []), ...(d.evidence || [])]) addPath(required, p);
for (const rule of memory.non_negotiable_laws || []) for (const p of rule.evidence || []) addPath(required, p);
for (const p of memory.agent_read_order || []) addPath(required, p);
// Directory anchors are useful even when a future branch does not contain every
// historical handoff. Add tracked files beneath known evidence roots.
const tracked = gitFiles();
for (const p of tracked) {
  if (p.startsWith('ops/handoff/') || p.startsWith('docs/architecture/') || p.startsWith('docs/governance/')) required.add(p);
}

const category = (p) => p.startsWith('docs/governance/') ? 'governance'
  : p.startsWith('docs/architecture/') ? 'architecture'
  : p.startsWith('ops/handoff/') ? 'handoff'
  : p.startsWith('frontend/src/') || p.startsWith('frontend/functions/') ? 'source'
  : p.startsWith('supabase/migrations/') ? 'migration'
  : 'control';

const files = [...required].sort().map((rel) => {
  const absolute = path.join(root, rel);
  const exists = fs.existsSync(absolute) && fs.statSync(absolute).isFile();
  if (!exists) return { path: rel, exists: false, category: category(rel) };
  const bytes = fs.readFileSync(absolute);
  return {
    path: rel,
    exists: true,
    category: category(rel),
    bytes: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  };
});

const head = cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const result = {
  schema: 'tizim02-second-mind-index-v1',
  generated_from: { git_head: head, builder: 'ops/second-mind/build-index.cjs' },
  files,
  missing_required: files.filter((f) => !f.exists).map((f) => f.path),
};
fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n');
console.log(`Second mind index: ${files.length} evidence paths, missing=${result.missing_required.length}, head=${head}`);
