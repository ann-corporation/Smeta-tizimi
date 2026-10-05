// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { birlikKalit, nomKalit } from './kalit';
import { buildPriceShards, type ExportRow, type PriceManba } from './price-shards';
import { PriceCatalog, katalogQidirSozlar, type SmetaResurs } from './price-remote';

const manba: PriceManba = { id: 5, tur: 'katalog', nom: 'Каталог 1 кв. 2026', raqam: null, sana: '2026-01-01', yil: 2026, kvartal: 1, region: null, yetkazuvchi: null, nds_holati: 'nomalum', fayl_document_id: null };
const hk = { 'г. Ташкент': 'toshkent_sh', 'Самаркандская о': 'samarqand' };
const row = (id: number, nom: string, birlik: string, narx: string | null, hudud: string, extra: Partial<{ zavod: string; guruh: string; nk: string; bk: string }> = {}): ExportRow =>
  [id, 5, id, null, nom, birlik, narx, hudud, extra.zavod ?? 'ООО Завод', 'nds_bilan', 'НДС 12%', 2026, 1, 'nds_bilan', extra.guruh ?? null, null, extra.nk ?? nomKalit(nom), extra.bk ?? birlikKalit(birlik), false];
const sample = (): ExportRow[] => [
  row(10, 'Бетон тяжелый В15 (М200)', 'м³', '700000', 'г. Ташкент'),
  row(11, 'Бетон тяжелый В15 (М200)', 'м³', '710000', 'Самаркандская о'),
  row(12, 'Труба стальная 57х3,5', 'м', '45000', 'г. Ташкент'),
  row(13, 'Бетон тяжелый В25', 'м3', null, 'г. Ташкент'),
];
const sha = (s: string) => createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');
function serve(files: Map<string, string>, rowFiles: string[], tamper?: string) {
  const meta = (p: string) => ({ path: p, sha256: sha(files.get(p)!), bytes: Buffer.byteLength(files.get(p)!) });
  const manifest = { schema: 'narx-katalog-shards-v1', revision: 'c'.repeat(16), status: 'REFERENCE', counts: { rows: [...files.keys()].filter(k => k.startsWith('r/')).reduce((s, k) => s + JSON.parse(files.get(k)!).rows.length, 0) },
    source: { manba }, files: { dict: meta('dict.json'), rows: rowFiles.map(meta) } };
  return async (u: string) => {
    const f = new URL(u, 'https://x').searchParams.get('f')!;
    if (f === 'current') return new Response(JSON.stringify({ revision: manifest.revision }));
    if (f === 'manifest.json') return new Response(JSON.stringify(manifest));
    const body = files.get(f); if (body == null) return new Response('', { status: 404 });
    return new Response(f === tamper ? body.replace('Бетон', 'Бетoн') : body);
  };
}
const open = async (rows = sample()) => { const b = buildPriceShards(rows, manba, hk); return PriceCatalog.open(serve(b.files, b.rowFiles)); };

describe('price catalogue keys', () => {
  it('match the SQL key functions', () => {
    expect(nomKalit('Бетон тяжёлый В15 (М200)')).toBe('БЕТОНТЯЖЕЛЫЙВ15М200');
    expect(nomKalit('Ўзбек Қум')).toBe('ЗБЕКУМ');              // SQL [^0-9A-ZА-Я] drops Ў/Қ too
    expect(birlikKalit('м³')).toBe('М3'); expect(birlikKalit(' 100 м²/шт. ')).toBe('100М2ШТ');
  });
});

describe('R2 price catalogue client', () => {
  it('search = every word in name, optional region, sorted, ≤ limit', async () => {
    const c = await open();
    expect(c.qidir('бетон в15').map(q => q.id)).toEqual([10, 11]);
    expect(c.qidir('бетон в15', 'samarqand').map(q => q.id)).toEqual([11]);
    expect(c.qidir('труба 57')[0]).toMatchObject({ id: 12, narx: 45000, birlik: 'м', hudud: 'г. Ташкент', hudud_kalit: 'toshkent_sh', ishlab_chiqaruvchi: 'ООО Завод', manba_nom: manba.nom });
    expect(c.qidir('', null, 2)).toHaveLength(2);            // browse mode
    expect(katalogQidirSozlar('Труба "57" х3,5 a')).toEqual(['труба', '57', 'х3', '5'].filter(w => w.length >= 2));
  });
  it('offers by exact name+unit key; unknown price row never offered; NULL price stays null in search', async () => {
    const c = await open();
    const q: SmetaResurs = { id: 1, kompaniya_id: 3, obyekt_id: 7, tur: 'mat', kat: null, kod: 'C1', nom: 'Бетон тяжелый В15 (М200)', birlik: 'м3', narx: 650000, nom_key: nomKalit('Бетон тяжелый В15 (М200)'), birlik_key: birlikKalit('м3') };
    const t = c.takliflar([q, { ...q, id: 2, tur: 'bl' }, { ...q, id: 3, nom_key: nomKalit('Бетон тяжелый В25') }]);
    expect(t.map(x => [x.qator_id, x.manba_qator_id, x.manba_narx, x.region])).toEqual([[1, 10, 700000, 'г. Ташкент'], [1, 11, 710000, 'Самаркандская о']]);
    expect(t[0]).toMatchObject({ moslik: 'nom_birlik', platforma: true, smeta_narx: 650000, manba_id: 5, yil: 2026, nds_holati: 'nds_bilan' });
    expect(c.qidir('в25')[0].narx).toBeNull();
  });
  it('DB key overrides are honoured when TS keys would differ', async () => {
    const c = await open([row(20, 'Плита', 'шт', '10', 'г. Ташкент', { nk: 'ОСОБЫЙКЛЮЧ', bk: 'ШТ' })]);
    const base: SmetaResurs = { id: 1, kompaniya_id: 1, obyekt_id: 1, tur: 'rs', kat: null, kod: null, nom: 'x', birlik: 'шт', narx: null, nom_key: 'ОСОБЫЙКЛЮЧ', birlik_key: 'ШТ' };
    expect(c.takliflar([base]).map(x => x.manba_qator_id)).toEqual([20]);
  });
  it('tampered shard and wrong manba fail closed', async () => {
    const b = buildPriceShards(sample(), manba, hk);
    await expect(PriceCatalog.open(serve(b.files, b.rowFiles, 'r/0000.json'))).rejects.toThrow('PRICE_INTEGRITY_FAILED');
    expect(() => buildPriceShards([[...sample()[0].slice(0, 1), 9, ...sample()[0].slice(2)] as ExportRow], manba, hk)).toThrow('MANBA_MISMATCH');
    expect(() => buildPriceShards([row(1, 'a', 'b', '1', 'Неизвестно')], manba, hk)).toThrow('HUDUD_KALIT_MISSING');
  });
});

// Real acceptance: R2 shards built from the verified DB export must reproduce the former t2_narx_taklif
// platform offers exactly. Enable with PRICE_SHARDS_DIR (built dir) and PRICE_TAKLIF_DUMP (MCP dump of
// {resurs, taklif} for real objects).
const dir = process.env.PRICE_SHARDS_DIR, dump = process.env.PRICE_TAKLIF_DUMP;
it.skipIf(!dir || !dump || !existsSync(dir))('real corpus: R2 offers == DB view offers', async () => {
  const manifest = readFileSync(join(dir!, 'manifest.json'), 'utf8');
  const fetcher = async (u: string) => {
    const f = new URL(u, 'https://x').searchParams.get('f')!;
    if (f === 'current') return new Response(JSON.stringify({ revision: JSON.parse(manifest).revision }));
    if (f === 'manifest.json') return new Response(manifest);
    return new Response(gunzipSync(readFileSync(join(dir!, 'gz', f + '.gz'))).toString('utf8'));
  };
  const c = await PriceCatalog.open(fetcher);
  expect(c.rows.length).toBe(JSON.parse(manifest).counts.rows);
  const outer = JSON.parse(readFileSync(dump!, 'utf8'));
  const text: string = outer.result;
  const j = JSON.parse(text.slice(text.indexOf('[{'), text.lastIndexOf('}]') + 2))[0].j;
  const resurs: SmetaResurs[] = j.resurs.map((r: unknown[]) => ({ id: r[0], kompaniya_id: r[1], obyekt_id: r[2], tur: r[3], kat: r[4], kod: r[5], nom: r[6], birlik: r[7], narx: r[8], nom_key: r[9], birlik_key: r[10] }));
  const mine = c.takliflar(resurs).map(t => [t.qator_id, t.manba_qator_id, t.manba_narx, t.region, t.yil, t.kvartal, t.nds_holati, t.manba_nom_qator, t.manba_birlik, t.ishlab_chiqaruvchi, t.moslik])
    .sort((a, b) => (a[0] as number) - (b[0] as number) || (a[1] as number) - (b[1] as number));
  const db = (j.taklif as unknown[][]).map(r => [r[0], r[1], Number(r[2]), r[3], r[4], r[5], r[6], r[7], r[8], r[9], r[10]]);
  expect(mine.length).toBe(db.length);
  expect(mine).toEqual(db);
  void readdirSync;
}, 120000);
