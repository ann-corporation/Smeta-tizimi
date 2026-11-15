// @vitest-environment node
// @ts-nocheck -- uses node:* APIs to run the real repack tool; the functions tsconfig only carries Workers types.
// Synthetic end-to-end: build a tiny report folder, run the real repack tool, read the result through the Worker reader.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { imzola } from './auth';
import { vakolatKeshTozala } from './role-authority';
import { onRequestGet } from '../api/normativ-qidir';
import { bucketName, bucketOf, normalise } from './normativ-token';
import { evidenceFor, loadCorpus, normativR2CacheClear, readUnit, searchIndex, type Corpus } from './normativ-r2-index';

const sha = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex');
const PREFIX = 'normativ/shnk/v1/';
const BUCKETS = 8;
const root = mkdtempSync(join(tmpdir(), 'shnk-r2-test-'));
const out = join(root, 'out');
const SOURCE = Buffer.from('synthetic original');
const SOURCE_SHA = sha(SOURCE);
const JOB = 'c'.repeat(64);
const TEXTS = ['Synthetic foundation depth requirement for test soil.', 'Synthetic drainage layer and gravel bedding notes.'];

beforeAll(() => {
  const p2 = join(root, 'phase2');
  const objects = join(p2, 'r2', 'objects', 'normativ');
  for (const dir of [join(objects, 'chunks'), join(objects, 'manifests'), join(p2, 'r2', 'index', 'v1', 'p'), join(p2, 'converted', 'txt'), join(p2, 'converted', 'src')]) mkdirSync(dir, { recursive: true });
  const chunks = TEXTS.map((matn, i) => {
    const body = gzipSync(JSON.stringify({ source_sha: SOURCE_SHA, unit: 'page-' + (i + 1), matn, sahifa_pdf: i + 1, sahifa_bosma: null, bob_punkt: null, jadval_kod: null, qatorlar: [] }));
    writeFileSync(join(objects, 'chunks', sha(body) + '.json'), body);
    return { tartib: i, unit: 'page-' + (i + 1), unit_sha: sha('unit' + i), sha256: sha(body), sahifa_pdf: i + 1, sahifa_bosma: null, bob_punkt: null, jadval_kod: null, bayt: body.length };
  });
  writeFileSync(join(objects, 'manifests', JOB + '.json'), JSON.stringify({ doc: { norma_kod: '9.99.01-26' }, chunks, job_manifest: {} }));
  const doc = { id: 0, code: '9.99.01-26', title: 'Synthetic Norm', tahrir: '2026', path: 'x.pdf', source_sha: SOURCE_SHA, job_sha: JOB, state: 'PUBLISHED', flags: [], pages: 2, chars: 100, unit_chunks: chunks.map(c => c.unit_sha) };
  writeFileSync(join(p2, 'r2', 'corpus.json.gz'), gzipSync(JSON.stringify({ format: 'shnk-corpus-v1', docs: [doc] })));
  const shard: Record<string, number[][]> = {};
  TEXTS.forEach((matn, unit) => { for (const t of new Set(normalise(matn))) (shard[t] ??= []).push([0, unit, 1]); });
  writeFileSync(join(p2, 'r2', 'index', 'v1', 'p', 'all.json.gz'), gzipSync(JSON.stringify(shard)));
  const source = join(root, 'original.pdf');
  writeFileSync(source, SOURCE);
  writeFileSync(join(p2, 'ingest-queue-all.json'), JSON.stringify([{ job_dir: join(root, 'jobs', JOB), source }]));
  writeFileSync(join(p2, 'converted', 'src', 'z1_001.doc'), 'synthetic doc source');
  writeFileSync(join(p2, 'converted', 'doc_map.csv'), '"id","zip","member_raw","bytes","file"\n"z1_001","S.zip","m","20","' + join(p2, 'converted', 'src', 'z1_001.doc').replace(/\\/g, '/') + '"\n');
  writeFileSync(join(p2, 'converted', 'doc_rows.csv'), 'code,title,edition,pages,language,source_type,ambiguous,note,file,inv_year,candidate\n9.99.02-26,"Synthetic ""amendment""",,,,doc,yes,n,z1_001 (S.zip),,\n');
  writeFileSync(join(p2, 'converted', 'txt', 'z1_001.txt'), 'First paragraph about waterproofing membrane.\n\nSecond paragraph about membrane joints.\n');
  const tool = new URL('../../../tools/normativ-ingest/shnk_repack.mjs', import.meta.url);
  execFileSync(process.execPath, [fileURLToPath(tool), '--report', root, '--out', out, '--buckets', String(BUCKETS)]);
});
afterAll(() => rmSync(root, { recursive: true, force: true }));
beforeEach(() => { normativR2CacheClear(); vakolatKeshTozala(); });

function fakeR2() {
  const calls: { key: string; range?: { offset: number; length: number } }[] = [];
  const get = vi.fn(async (key: string, options?: { range?: { offset: number; length: number } }) => {
    calls.push({ key, range: options?.range });
    try {
      const file = readFileSync(join(out, key.replace(PREFIX, '')));
      const body = options?.range ? file.subarray(options.range.offset, options.range.offset + options.range.length) : file;
      return { size: file.length, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.length) };
    } catch { return null; }
  });
  return { bucket: { get } as unknown as Pick<R2Bucket, 'get'>, calls, get };
}

it('repack: one bundle per document, merged buckets, sha256 per object, originals referenced', () => {
  const manifest = JSON.parse(readFileSync(join(out, 'upload-manifest.json'), 'utf8')) as { objects: { key: string; file: string; sha256: string; kind: string }[] };
  const kinds = (k: string) => manifest.objects.filter(o => o.kind === k);
  expect(kinds('docs')).toHaveLength(2);
  expect(kinds('index')).toHaveLength(BUCKETS);
  expect(kinds('original')).toHaveLength(2);
  expect(readdirSync(join(out, 'docs'))).toHaveLength(2);
  for (const o of manifest.objects) expect(sha(readFileSync(o.file))).toBe(o.sha256);
  expect(statSync(join(out, 'corpus.json.gz')).size).toBeGreaterThan(0);
  expect(manifest.objects.every(o => o.key.startsWith(PREFIX))).toBe(true);
});

it('search by terms: BM25 rank, page number, single Range read per chunk', async () => {
  const r2 = fakeR2();
  const corpus = (await loadCorpus(r2.bucket, PREFIX)) as Corpus;
  expect(corpus.docs.map(d => d.state)).toEqual(['PUBLISHED', 'REVIEW_REQUIRED']);
  const result = await searchIndex(r2.bucket, corpus, { q: 'foundation depth', limit: 3, prefix: PREFIX });
  expect(result.hits).toHaveLength(1);
  const evidence = await evidenceFor(r2.bucket, result.hits[0], result.terms, 3, PREFIX);
  expect(evidence).toMatchObject({ norma_kod: '9.99.01-26', sahifa_pdf: 1, source_type: 'pdf', manba: 'r2' });
  expect(evidence.iqtibos).toContain('foundation depth');
  const bundleReads = r2.calls.filter(c => c.key.endsWith('.bundle'));
  expect(bundleReads.length).toBe(2); // table + one chunk
  expect(bundleReads.every(c => c.range)).toBe(true);
  const indexReads = r2.calls.filter(c => c.key.includes('/index/'));
  expect(indexReads.map(c => c.key)).toEqual(expect.arrayContaining([PREFIX + 'index/' + bucketName(bucketOf('foundation', BUCKETS))]));
  expect((await searchIndex(r2.bucket, corpus, { q: 'foundation gravel', limit: 3, prefix: PREFIX })).hits).toHaveLength(2); // AND empty -> one term may be missing
  expect((await searchIndex(r2.bucket, corpus, { q: 'zzzzqq', limit: 3, prefix: PREFIX })).reason).toBe('NOT_FOUND');
});

it('search by code and edition; unpublished and doc sources are hidden unless states allow them', async () => {
  const r2 = fakeR2();
  const corpus = (await loadCorpus(r2.bucket, PREFIX)) as Corpus;
  expect((await searchIndex(r2.bucket, corpus, { q: 'ShNK 9.99.01-26', limit: 2, prefix: PREFIX })).hits[0].doc.code).toBe('9.99.01-26');
  expect((await searchIndex(r2.bucket, corpus, { q: '9.99.01-26', tahrir: '1999', limit: 2, prefix: PREFIX })).hits).toHaveLength(0);
  expect((await searchIndex(r2.bucket, corpus, { q: 'membrane', limit: 3, states: ['PUBLISHED'], prefix: PREFIX })).hits).toHaveLength(0);
  const all = await searchIndex(r2.bucket, corpus, { q: 'membrane', limit: 3, states: ['PUBLISHED', 'REVIEW_REQUIRED'], prefix: PREFIX });
  expect(all.hits.map(h => h.unit)).toEqual([0]); // short text = one paragraph block
  const doc = await evidenceFor(r2.bucket, all.hits[0], all.terms, 3, PREFIX);
  expect(doc).toMatchObject({ source_type: 'doc', sahifa_pdf: null, unit: 'blok-1' });
});

it('rejects a tampered bundle and reports a missing index as null', async () => {
  const r2 = fakeR2();
  const corpus = (await loadCorpus(r2.bucket, PREFIX)) as Corpus;
  const tampered = { get: async (key: string, options?: { range?: { offset: number; length: number } }) => {
    const res = await r2.bucket.get(key, options as never);
    if (!res || !options?.range || !key.endsWith('.bundle') || options.range.offset !== 0) return res;
    const bytes = new Uint8Array(await res.arrayBuffer()); bytes[bytes.length - 1] ^= 1;
    return { size: res.size, arrayBuffer: async () => bytes.buffer } as unknown as R2ObjectBody;
  } } as Pick<R2Bucket, 'get'>;
  await expect(readUnit(tampered, corpus.docs[0], 0, PREFIX)).rejects.toThrow('CHUNK_SHA_INVALID');
  normativR2CacheClear();
  expect(await loadCorpus({ get: async () => null }, PREFIX)).toBeNull();
});

async function handler(env: Record<string, unknown>, query: string) {
  const secret = 'synthetic-secret';
  vi.stubGlobal('fetch', vi.fn(async (url: string) => Response.json(url.endsWith('/t2_men_v1')
    ? { ok: true, foydalanuvchi: { holat: 'faol' }, context_kompaniyalar: [{ kompaniya_id: 3, effective_role: 'pto', permissions: ['company.read'] }] }
    : { ok: true, natijalar: [] })));
  const cookie = 'sess=' + await imzola({ rol: 'pto', foydalanuvchi_id: 7 }, secret);
  const res = await onRequestGet({ request: new Request('https://test.invalid/api/normativ-qidir?' + query, { headers: { Cookie: cookie } }),
    env: { SESSIYA_KALIT: secret, SUPABASE_URL: 'https://synthetic.invalid', SUPABASE_KEY: 'synthetic', ...env } } as unknown as Parameters<typeof onRequestGet>[0]);
  return { res, body: await res.json() as { ok: boolean; code?: string; natijalar?: { havola: string; sahifa_pdf: number }[] } };
}

it('endpoint: answers from the R2 index without database search, follow-up link works, no index -> 503 unless flag', async () => {
  const r2 = fakeR2();
  const { res, body } = await handler({ NORMATIV_R2: r2.bucket }, 'kompaniya_id=3&q=drainage%20gravel');
  expect(res.status).toBe(200);
  expect(body.natijalar?.[0]).toMatchObject({ sahifa_pdf: 2, norma_kod: '9.99.01-26' });
  expect(vi.mocked(fetch).mock.calls.every(c => String(c[0]).endsWith('/t2_men_v1'))).toBe(true);
  const again = await handler({ NORMATIV_R2: r2.bucket }, body.natijalar![0].havola.split('?')[1]);
  expect(again.body.natijalar?.[0]).toMatchObject({ sahifa_pdf: 2 });
  normativR2CacheClear();
  const missing = await handler({ NORMATIV_R2: { get: async () => null } }, 'kompaniya_id=3&q=drainage%20gravel');
  expect(missing.res.status).toBe(503);
  expect(missing.body).toEqual({ ok: false, code: 'INDEX_UNAVAILABLE' });
  const legacy = await handler({ NORMATIV_R2: { get: async () => null }, NORMATIV_DB_FALLBACK: '1' }, 'kompaniya_id=3&q=drainage%20gravel');
  expect(legacy.res.status).toBe(200);
  expect(legacy.body).toMatchObject({ ok: true, code: 'UNKNOWN' });
});
