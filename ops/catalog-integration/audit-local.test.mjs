import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { auditLocal, jsonLines } from './audit-local.mjs';
const sha = text => createHash('sha256').update(text).digest('hex');
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'catalog-audit-fixture-'));
  const source = join(root, 'compact-estimate-reference-v1-20261005'), support = join(root, 'outputs/norm-suggestion-support-v1');
  await mkdir(source); await mkdir(support, { recursive: true });
  const rules = JSON.stringify({ factReferenceId: 1, source: { KODP: 'Ш-6001' } }) + '\n';
  const links = JSON.stringify({ factReferenceId: 1, source: { KODP: 'Ш-6001', KODTAB: 'E6-1-1', KODE: 'E6-1-1-2' }, coefficientFactReferenceIds: [1] }) + '\n';
  const manifest = { sourceHashes: { 'COEFFICIENT_RULES.jsonl': sha(rules), 'COEFFICIENT_LINKS.jsonl': sha(links) }, counts: { rules: 1, links: 1 } };
  await writeFile(join(source, 'COEFFICIENT_RULES.jsonl'), rules); await writeFile(join(source, 'COEFFICIENT_LINKS.jsonl'), links);
  await writeFile(join(support, 'manifest.json'), JSON.stringify(manifest));
  const runtime = join(root, 'runtime.json'); await writeFile(runtime, JSON.stringify({ schema: 'koef-katalog-v1', koef: { 'П-6001': { a: 'reference', s: 'condition', k: { ЧЕЛ: 1.04 } } }, jadval: { '6-1-1': ['П-6001'] } }));
  return { root, source, support, runtime, manifest };
}
test('full file pipeline verifies exact hashes and reports missing inventory honestly', async () => {
  const f = await fixture(); const r = await auditLocal(f.root, f.runtime);
  assert.equal(r.counts.sourceRules, 1); assert.equal(r.counts.sourceLinks, 1);
  assert.equal(r.evidence.hashes.runtime, sha(await readFile(f.runtime)));
  assert(r.inventory.some(i => i.status === 'LOCAL_MANIFEST_NOT_FOUND')); assert(r.inventory.every(i => i.runtimeBindingVerified === false));
});
test('corrupted source cannot generate a green receipt', async () => {
  const f = await fixture(); await writeFile(join(f.source, 'COEFFICIENT_RULES.jsonl'), '{}\n');
  await assert.rejects(auditLocal(f.root, f.runtime), /SOURCE_HASH_MISMATCH/);
});
test('manifest count mismatch blocks completeness claims', async () => {
  const f = await fixture(); f.manifest.counts.links = 2; await writeFile(join(f.support, 'manifest.json'), JSON.stringify(f.manifest));
  await assert.rejects(auditLocal(f.root, f.runtime), /SOURCE_COUNT_MISMATCH/);
});
test('malformed JSONL identifies its line rather than skipping it', async () => {
  const f = await fixture(); const file = join(f.root, 'broken.jsonl'); await writeFile(file, '{}\nnot-json\n');
  await assert.rejects(async () => { for await (const _row of jsonLines(file)) {} }, /JSONL_INVALID:2/);
});
