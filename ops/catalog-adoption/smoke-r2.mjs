/** Real handler + read-back R2 bytes + installed-core oracle. Synthetic session; no business writes. */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createServer } from '../../frontend/node_modules/vite/dist/node/index.js';
const root = fileURLToPath(new URL('../../frontend/', import.meta.url));
const base = 'D:/CatalogMigration/coefficient-foundation-20261021-v1/';
const raw = await readFile(base+'runtime-reference/REMOTE_RUNTIME_REFERENCE.json');
const payload = JSON.parse(raw);
const server = await createServer({ root, server: { middlewareMode: true }, logLevel: 'error' });
try {
  const { onRequestGet } = await server.ssrLoadModule('/functions/api/koef-katalog.ts');
  const { imzola } = await server.ssrLoadModule('/functions/_shared/auth.ts');
  const { constructCandidates, CONSTRUCT_REFERENCE } = await server.ssrLoadModule('/src/lib/smeta-studio/construct-koef.ts');
  if (createHash('sha256').update(raw).digest('hex') !== CONSTRUCT_REFERENCE.sha256) throw new Error('READBACK_SHA_INVALID');
  const signingKey = 'synthetic-offline-smoke-key-not-a-production-secret';
  const cookie = 'sess='+await imzola({ rol: 'pto', foydalanuvchi_id: 900001, kompaniyalar: [{ kompaniya_id: 900001, rol: 'pto' }] }, signingKey);
  let reads = 0;
  const request = async (work, signed = true) => onRequestGet({
    request: new Request('https://smoke.invalid/api/koef-katalog?f=construct&work='+encodeURIComponent(work), { headers: { Cookie: signed ? cookie : '' } }),
    env: { SESSIYA_KALIT: signingKey, R2_CANONICAL: { get: async () => { reads++; return { size: raw.byteLength,
      arrayBuffer: async () => raw.buffer.slice(raw.byteOffset, raw.byteOffset+raw.byteLength) }; } } },
  });
  const unauth = await request('Е01-01-001-1', false);
  if (unauth.status !== 401 || reads !== 0) throw new Error('AUTH_GATE_INVALID');
  const known = await request('Е01-01-001-1');
  const result = await known.json();
  if (known.status !== 200 || result.status !== 'REFERENCE_CANDIDATES' || result.total !== 5 || result.canApply !== false) throw new Error('HANDLER_SOURCE_INVALID');
  const oracle = (await readFile(base+'core_corrections.jsonl','utf8')).trim().split(/\r?\n/).map(JSON.parse);
  const mismatches = [];
  for (const item of oracle) {
    const actual = constructCandidates(payload, item.work_key, 100);
    if (actual.total > 100) throw new Error('ORACLE_PAGING_REQUIRED');
    const got = actual.candidates.map(({rule:r}) => JSON.stringify([r.collection_code+'-'+r.code,r.title,r.basis,r.labour,r.machines,r.materials])).sort();
    const expected = item.corrections.map(r => JSON.stringify([r.code,r.title,r.basis,r.labour,r.machines,r.materials])).sort();
    if (JSON.stringify(got) !== JSON.stringify(expected)) mismatches.push(item.work_key);
  }
  const summary = { source: 'Remote R2 read-back, real handler with synthetic session and read-only file-backed bucket',
    referenceSha256: CONSTRUCT_REFERENCE.sha256, unauthStatus: unauth.status, handlerStatus: known.status,
    checkedWorks: oracle.length, coreMismatches: mismatches.length, mismatchExamples: mismatches.slice(0,10), canApply: result.canApply,
    businessWrites: 0, productionAuthenticatedSmoke: false };
  await writeFile(base+'runtime-reference/runtime-smoke.json', JSON.stringify(summary,null,2)+'\n');
  console.log(JSON.stringify(summary));
  if (mismatches.length) process.exitCode = 1;
} finally { await server.close(); }
