// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { NormCatalog } from './norm-catalog';
import { buildNormDraftLine } from './norm-draft';
import { NORM_SHARD_SCHEMA, buildNormShards, reconcileBookTree, type BookRow, type NormManifest } from './norm-shards';
import { RemoteNormCatalog } from './norm-remote';

const blob = (s: string) => ({ text_cp1251: s });
const REV = 'a'.repeat(16);
const book: BookRow[] = [
  { ID: '1', IDPARENT: '0', NAME: 'КМК', TIPBOOK: null, KODA: null, KODTAB: null },
  { ID: '2', IDPARENT: '1', NAME: 'E01-Земляные работы', TIPBOOK: 'A', KODA: 'E01', KODTAB: null, OLITEM: '1' },
  { ID: '3', IDPARENT: '2', NAME: 'E1-10 Разработка грунта', TIPBOOK: 'A', KODA: 'E01', KODTAB: 'E1-10', OLITEM: '2' },
  // Same KodTab in another book type: must not be confused with type A.
  { ID: '4', IDPARENT: '1', NAME: 'У01 Краны', TIPBOOK: 'M', KODA: 'E01', KODTAB: 'E1-10', OLITEM: '3' },
  // Two BOOK nodes with identical key → ambiguous, never first-match.
  { ID: '5', IDPARENT: '1', NAME: 'Дубль 1', TIPBOOK: 'H', KODA: 'E06', KODTAB: 'E6-1-1' },
  { ID: '6', IDPARENT: '1', NAME: 'Дубль 2', TIPBOOK: 'H', KODA: 'E06', KODTAB: 'E6-1-1' },
  { ID: '7', IDPARENT: '0', NAME: 'Материалы', TIPBOOK: null, KODA: null, KODTAB: null },
];
function corpus() {
  const c = new NormCatalog();
  c.add('basis', { Kod: 10, KodE: 'E1-10-1', TipBook: 'A', KodA: 'E01', KodRaz: '01', KodPRaz: '001', KodTab: 'E1-10', KodI: '003', NameP: blob('Бетонная подготовка') });
  c.add('basis', { Kod: 11, KodE: 'E6-1-1-1', TipBook: 'H', KodA: 'E06', KodRaz: '01', KodPRaz: null, KodTab: 'E6-1-1', NameP: blob('Кладка') });
  c.add('basis', { Kod: 12, KodE: 'E9-1-1', TipBook: 'H', KodA: 'E09', KodRaz: null, KodPRaz: null, KodTab: 'E9-1', NameP: blob('Без книги') });
  c.add('material', { Kod: 20, KodM: 'C1', KodR: '001', NameP: blob('Бетон B7,5'), KodI: '005', Tip: 'M' });
  c.add('basisres', { Kod: 30, KodE: 'E1-10-1', KodM: 'C1', KodR: '001', NormaR: 102 });
  c.add('basisres', { Kod: 31, KodE: 'E1-10-1', KodM: null, KodR: '999', NormaR: null });
  c.add('bprice', { Kod: 40, KodM: 'C1', Rajon: '40', Cena: 3.76, Transp: 0.24 });
  return c;
}
const sha = (s: string) => createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');
function serve(files: Map<string, string>, shardIndex: Record<string, string>, tamper?: string) {
  const meta = (path: string) => ({ path, sha256: sha(files.get(path)!), bytes: Buffer.byteLength(files.get(path)!) });
  const manifest: NormManifest = { schema: NORM_SHARD_SCHEMA, revision: REV, status: 'REVIEW_ONLY', source: {}, counts: {},
    linkage: { recipes: { exact: 0, missing: 0, ambiguous: 0, ambiguousWorkRecipes: 0 }, tables: { total: 0, exact: 0, missing: 0, ambiguous: 0 }, worksNamedFromBook: 0 },
    files: { tree: meta('tree.json'), works: meta('works.json'), shards: Object.fromEntries(Object.entries(shardIndex).map(([c, p]) => [c, meta(p)])) }, caveats: [] };
  const all = new Map(files); all.set('manifest.json', JSON.stringify(manifest));
  const asked: string[] = [];
  const fetcher = async (url: string) => {
    const u = new URL(url, 'https://x'); const f = u.searchParams.get('f')!; asked.push(f);
    if (f === 'current') return new Response(JSON.stringify({ revision: REV }));
    const body = all.get(f); if (body == null) return new Response('', { status: 404 });
    return new Response(f === tamper ? body.replace('Бетон', 'Бетоn') : body);
  };
  return { fetcher, asked };
}

describe('BOOK reconciliation — names are labels, exact key only', () => {
  it('(TipBook, KodA, KodTab) exact → named; other book type ignored; duplicate → ambiguous; no BOOK → missing', () => {
    const t = reconcileBookTree(book, corpus().works.values());
    expect(t.status).toEqual({ total: 3, exact: 1, missing: 1, ambiguous: 1 });
    expect(t.worksNamedFromBook).toBe(1);
    const names = t.nodes.map(n => n[2]);
    expect(names).toContain('E1-10 Разработка грунта');
    expect(names).not.toContain('У01 Краны');      // pruned: no works map to M-type node
    expect(names).not.toContain('Дубль 1');        // ambiguous never first-match
    expect(names).not.toContain('Материалы');      // empty branch pruned
    const table = t.nodes.find(n => n[2] === 'E1-10 Разработка грунта')!;
    expect(table[4]).toBe(JSON.stringify(['A', 'E01', 'E1-10'])); expect(table[5]).toBe('EXACT');
    expect(t.nodes.filter(n => n[5] === 'AMBIGUOUS').map(n => n[2])).toEqual(['E6-1-1']);
    expect(t.nodes.filter(n => n[5] === 'MISSING').map(n => n[2])).toEqual(['E9-1']);
  });
  it('cycle and duplicate BOOK id fail closed', () => {
    expect(() => reconcileBookTree([{ ID: '1', IDPARENT: '2', NAME: 'a', TIPBOOK: null, KODA: null, KODTAB: null }, { ID: '2', IDPARENT: '1', NAME: 'b', TIPBOOK: null, KODA: null, KODTAB: null }], [])).toThrow('BOOK_CYCLE');
    expect(() => reconcileBookTree([book[0], book[0]], [])).toThrow('BOOK_ID_INVALID');
  });
});

describe('Shards → remote client', () => {
  it('deterministic build; NULL norm stays NULL; linkage counted', () => {
    const a = buildNormShards(corpus(), book, REV), b = buildNormShards(corpus(), book, REV);
    expect([...a.files]).toEqual([...b.files]);
    expect(a.linkage).toEqual({ exact: 1, missing: 1, ambiguous: 0, ambiguousWorkRecipes: 0 });
    expect(() => buildNormShards(corpus(), book, 'bad')).toThrow('REVISION_INVALID');
  });
  it('remote detail equals local detail; shard loaded only on demand; draft engine shared', async () => {
    const built = buildNormShards(corpus(), book, REV);
    const { fetcher, asked } = serve(built.files, built.shardIndex);
    const remote = await RemoteNormCatalog.open(fetcher);
    expect(asked).toEqual(['current', 'manifest.json', 'tree.json', 'works.json']);
    expect(remote.search('beton', 0).rows.map(w => w.id)).toEqual(['10']);   // Latin → Cyrillic
    const tableNode = remote.nodes.findIndex(n => n[2] === 'E1-10 Разработка грунта');
    expect(remote.search('', 0, tableNode).rows.map(w => w.id)).toEqual(['10']);
    expect(remote.breadcrumb(tableNode).map(n => n.name)).toEqual(['КМК', 'E01-Земляные работы', 'E1-10 Разработка грунта']);
    expect(() => remote.detail('10')).toThrow('NORM_SHARD_NOT_LOADED');
    await remote.load('10');
    expect(asked.filter(f => f.startsWith('s/'))).toHaveLength(1);
    const local = corpus();
    expect(remote.detail('10')).toEqual(local.detail('10'));
    const req = { workId: '10', quantity: '4', basisQuantity: '1', unitEvidence: 'ShNQ test', unitLabel: 'm3', currency: 'UZS', priceEvidence: 'test', prices: { '30': '700000' } };
    expect(buildNormDraftLine(remote, req)).toEqual(buildNormDraftLine(local, req));
    expect(buildNormDraftLine(remote, req).amount).toBeNull();  // unresolved resource keeps total unknown
  });
  it('tampered shard fails closed', async () => {
    const built = buildNormShards(corpus(), book, REV);
    const { fetcher } = serve(built.files, built.shardIndex, built.shardIndex['E01']);
    const remote = await RemoteNormCatalog.open(fetcher);
    await expect(remote.load('10')).rejects.toThrow('NORM_INTEGRITY_FAILED');
  });
});

describe('Unit dictionary — observed in real smeta documents, never guessed', () => {
  it('unique observation → OBSERVED with parsed scale; Latin look-alike folded; conflict blocks; unmatched counted', async () => {
    const { deriveUnitDictionary, parseUnitText } = await import('./norm-shards');
    const works = corpus().works.values();
    const d = deriveUnitDictionary(works, [
      { kod: 'E1-10-1', birlik: '100М3', n: 5 }, { kod: 'E1-10-1', birlik: '100 M3', n: 2 },  // Latin M = same unit
      { kod: 'E6-1-1-1', birlik: 'М2', n: 1 }, { kod: 'E9-1-1', birlik: 'Т', n: 1 },        // KodI null → ambiguous
      { kod: 'NO-SUCH', birlik: 'ШТ', n: 3 },
    ]);
    expect(d.units['003']).toMatchObject({ text: '100М3', scale: '100', base: 'м3', observations: 7, status: 'OBSERVED' });
    expect(d.stats).toMatchObject({ matched: 7, unmatched: 3, ambiguous: 2 });
    const c = deriveUnitDictionary(corpus().works.values(), [{ kod: 'E1-10-1', birlik: '100М3', n: 5 }, { kod: 'E1-10-1', birlik: 'М3', n: 1 }]);
    expect(c.units['003'].status).toBe('CONFLICT'); expect(c.units['003'].scale).toBeNull();
    expect(parseUnitText('КОМПЛЕКТ')).toEqual({ scale: '1', base: 'комплект' });
    expect(parseUnitText('1000М2')).toEqual({ scale: '1000', base: 'м2' });
    expect(() => deriveUnitDictionary([], [{ kod: 'x', birlik: 'y', n: 0 }])).toThrow('UNIT_OBSERVATION_INVALID');
  });
  it('remote exposes only OBSERVED units', async () => {
    const built = buildNormShards(corpus(), book, REV, [{ kod: 'E1-10-1', birlik: '100М3', n: 5 }]);
    const remote = await RemoteNormCatalog.open(serve(built.files, built.shardIndex).fetcher);
    expect(remote.unit('003')).toMatchObject({ scale: '100', base: 'м3' });
    expect(remote.unit('999')).toBeNull(); expect(remote.unit(null)).toBeNull();
  });
});
