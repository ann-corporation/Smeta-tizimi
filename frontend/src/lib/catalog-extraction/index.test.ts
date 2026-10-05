import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildExtractionReview, reviewPage, sourceTablePage, type ExtractionPacket } from '.';
const fixture = (): ExtractionPacket => ({ schema: 'catalog-extraction-review-v1', source: { database: 'test/IBASE', sha256: 'a'.repeat(64) },
  works: [{ KOD: '11', KODE: 'E1', NAMEP: 'Работа', KODA: '01', KODRAZ: '02', KODI: '004' }],
  recipes: [{ KOD: '22', KODE: 'E1', KODR: '000001', NORMAR: '1.7600000' }] });
describe('Extraction integration — manba soni va identity', () => {
  it('norma matni o‘zgarmaydi, canonical ID berilmaydi', () => {
    const r = buildExtractionReview(fixture());
    expect(r.works[0].recipes[0].normText).toBe('1.7600000');
    expect(r.works[0]).not.toHaveProperty('canonicalId');
    expect(r.status).toBe('REVIEW_ONLY'); expect(r.blockers).toHaveLength(3);
  });
  it('NULL nol emas', () => { const p = fixture(); p.recipes[0].NORMAR = null; expect(buildExtractionReview(p).works[0].recipes[0].normText).toBeNull(); });
  it('nol saqlanadi', () => { const p = fixture(); p.recipes[0].NORMAR = '0.0000000'; expect(buildExtractionReview(p).works[0].recipes[0].normText).toBe('0.0000000'); });
  it('katta decimal ham Numberga aylantirilmaydi', () => { const p = fixture(); p.recipes[0].NORMAR = '9007199254740993.1234567'; expect(buildExtractionReview(p).works[0].recipes[0].normText).toBe(p.recipes[0].NORMAR); });
  it('birlik kodi nom yoki koeffitsientga taxmin qilinmaydi', () => { expect(buildExtractionReview(fixture()).works[0].unitCode).toBe('004'); });
  it('nom yo‘q bo‘lsa yasalmaydi', () => { const p = fixture(); p.works[0].NAMEP = null; expect(buildExtractionReview(p).works[0].name).toBeNull(); });
  it('reorder source identityni almashtirmaydi', () => { const p = fixture(); p.works.push({ KOD: '12', KODE: 'E2' }); const a = buildExtractionReview(p); p.works.reverse(); const b = buildExtractionReview(p); expect(a.works[0].sourceIdentity).toBe(b.works[1].sourceIdentity); });
  it('fuzzy va leading-zero join yo‘q', () => { const p = fixture(); p.recipes[0].KODE = 'E01'; expect(() => buildExtractionReview(p)).toThrow(); });
  it('orphan rad etiladi', () => { const p = fixture(); p.recipes[0].KODE = 'E2'; expect(() => buildExtractionReview(p)).toThrow(); });
  it('bir xil codega ikki ish rad etiladi', () => { const p = fixture(); p.works.push({ KOD: '12', KODE: 'E1' }); expect(() => buildExtractionReview(p)).toThrow(); });
  it('duplicate source ID rad etiladi', () => { const p = fixture(); p.recipes.push({ ...p.recipes[0] }); expect(() => buildExtractionReview(p)).toThrow(); });
  it('manbaga qarab identity ajraladi', () => { const p = fixture(); const a = buildExtractionReview(p); p.source.database = 'other'; expect(a.works[0].sourceIdentity).not.toBe(buildExtractionReview(p).works[0].sourceIdentity); });
  it('input mutatsiya qilinmaydi', () => { const p = fixture(); const before = JSON.stringify(p); const r = buildExtractionReview(p); r.works[0].source.NAMEP = 'x'; expect(JSON.stringify(p)).toBe(before); });
  it.each(['1,76', '', 'NaN', '1e5', ' 1.76 ', '=1+1'])('noto‘g‘ri normani jim tuzatmaydi: %s', v => { const p = fixture(); p.recipes[0].NORMAR = v; expect(() => buildExtractionReview(p)).toThrow(); });
  it.each([{}, null, [], { ...fixture(), schema: 'other' }, { ...fixture(), works: null }])('buzilgan paket bloklanadi', p => { expect(() => buildExtractionReview(p)).toThrow(); });
  it('source fingerprint majburiy', () => { const p = fixture(); p.source.sha256 = 'bad'; expect(() => buildExtractionReview(p)).toThrow(); });
  it('sahifa cheklangan, qidiruv barcha ishlardan', () => { const p = fixture(); p.works = Array.from({ length: 10_000 }, (_, n) => ({ KOD: String(n), KODE: 'E' + n, NAMEP: 'Ish ' + n })); const start = performance.now(); const r = buildExtractionReview(p); expect(reviewPage(r, '', 0).rows).toHaveLength(25); expect(reviewPage(r, 'Ish 9999', 0).total).toBe(1); expect(performance.now() - start).toBeLessThan(2000); });
  it('manfiy sahifa rad etiladi', () => { expect(() => reviewPage(buildExtractionReview(fixture()), '', -1)).toThrow(); });
  it('recipe scalar must be string or null', () => { const p = fixture(); (p.recipes[0] as Record<string, unknown>).NORMAR = 1.76; expect(() => buildExtractionReview(p)).toThrow(); });
});
const real = process.env.CATALOG_REVIEW_PACKET;
it.skipIf(!real)('haqiqiy 299 ish / 2549 norma paketi, norm text aynan saqlanadi', () => {
  const input = JSON.parse(readFileSync(real!, 'utf8')) as ExtractionPacket;
  const r = buildExtractionReview(input);
  expect(r.works).toHaveLength(299); expect(r.recipeCount).toBe(2549);
  const actual = new Map(r.works.flatMap(w => w.recipes.map(v => [v.source.KOD, v.normText] as const)));
  for (const row of input.recipes) expect(actual.get(row.KOD)).toBe(row.NORMAR);
});
const full = process.env.CATALOG_FULL_PACKET;
it.skipIf(!full)('barcha 9 jadval real paketda yo‘qotilmasdan o‘qiladi', () => {
  const p = JSON.parse(readFileSync(full!, 'utf8')) as ExtractionPacket;
  const r = buildExtractionReview(p);
  const counts = Object.fromEntries(r.tables.map(v => [v.name, v.rows.length]));
  expect(counts).toEqual({ BOOK: 24738, LIBRARY: 621, NORMATIV: 26, POPRAV: 1438, POPRAVBASE: 95704, PRICE: 20706, RESURS_TIP: 42590 });
  expect(r.works).toHaveLength(299); expect(r.recipeCount).toBe(2549);
  for (const table of p.tables!) expect(r.tables.find(v => v.name === table.name)?.rows).toEqual(table.rows);
  expect(sourceTablePage(r, 'PRICE', '', 0).rows).toHaveLength(25);
  expect(sourceTablePage(r, 'POPRAVBASE', '', 1).rows).toHaveLength(25);
});
it('noma’lum jadval va duplicate table bloklanadi', () => {
  const p = fixture(); p.tables = [{ name: 'USERS', key: 'KOD', rows: [] }];
  expect(() => buildExtractionReview(p)).toThrow();
  p.tables = [{ name: 'BOOK', key: 'ID', rows: [{ ID: '1', NAME: 'X' }] }];
  p.tables.push(p.tables[0]); expect(() => buildExtractionReview(p)).toThrow();
});
