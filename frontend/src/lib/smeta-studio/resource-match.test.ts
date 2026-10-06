import { describe, expect, it } from 'vitest';
import type { KatalogQatori } from '../narx-katalog/price-remote';
import { autoPrice, characteristics, matchResource, normName, type MatchCatalog } from './resource-match';

type R = [string, string, number | null, string];
const ROWS: R[] = [
  ['БЕТОН ТЯЖЕЛЫЙ, КЛАСС B15 (М200)', 'м3', 780000, 'toshkent'],
  ['БЕТОН ТЯЖЕЛЫЙ, КЛАСС B15 (М200)', 'м3', 760000, 'samarqand'],
  ['БЕТОН ТЯЖЕЛЫЙ, КЛАСС B25 (М350)', 'м3', 900000, 'toshkent'],
  ['БЕТОН ТЯЖЕЛЫЙ, КЛАСС В7,5 (М100)', 'м3', 650000, 'toshkent'],
  ['АРМАТУРА КЛАССА А500С ДИАМЕТРОМ 12 ММ', 'т', 9800000, 'toshkent'],
  ['АРМАТУРА КЛАССА А500С ДИАМЕТРОМ 16 ММ', 'т', 9700000, 'toshkent'],
  ['АРМАТУРА КЛАССА А240 ДИАМЕТРОМ 12 ММ', 'т', 9900000, 'toshkent'],
  ['КИРПИЧ КЕРАМИЧЕСКИЙ ПОЛНОТЕЛЫЙ М150', 'тыс. шт', 1500000, 'toshkent'],
  ['ПЕСОК ДЛЯ СТРОИТЕЛЬНЫХ РАБОТ', 'м3', 120000, 'toshkent'],
  ['ПЕСОК ДЛЯ СТРОИТЕЛЬНЫХ РАБОТ', 'т', 80000, 'toshkent'],
  ['ПРОВОЛОКА ВЯЗАЛЬНАЯ', 'т', null, 'toshkent'],
  ['Кабели силовые с медными жилами ВВГ 4х2,5', 'км', 14000000, 'toshkent'],
  ['Кабели силовые с алюминиевыми жилами АВВГ 4х2,5', 'км', 4700000, 'toshkent'],
  ['Кабели силовые с алюминиевыми жилами АВВГ 4х4', 'км', 6000000, 'toshkent'],
];
const row = (i: number): KatalogQatori => ({ id: i + 1, manba_id: 1, kod: null, nom: ROWS[i][0], birlik: ROWS[i][1], narx: ROWS[i][2],
  hudud: ROWS[i][3], ishlab_chiqaruvchi: null, nds_holati: null, nds_izoh: null, yil: 2026, kvartal: 2, narx_varianti: null, guruh: null,
  hudud_kalit: ROWS[i][3], manba_nom: 'Katalog', manba_tur: 'platforma' });
const cat: MatchCatalog = { size: ROWS.length, name: i => ROWS[i][0], unit: i => ROWS[i][1], region: i => ROWS[i][3], price: i => ROWS[i][2], row };

describe('characteristics', () => {
  it('normalises Latin look-alikes and decimal comma', () => {
    expect(normName('Бетон B7,5')).toBe('БЕТОН В7.5');
  });
  it('extracts concrete class, rebar class and diameter', () => {
    expect(characteristics('Бетон тяжелый B15').grade).toBe('В15');
    expect(characteristics('Раствор цементный М100').grade).toBe('М100');
    expect(characteristics('Кирпич М150').grade).toBeNull();
    const a = characteristics('Арматура A500C Ø12');
    expect([a.rebar, a.diameter]).toEqual(['А500С', '12']);
    expect(characteristics('Арматурная сталь класса A-III диаметром 16 мм').rebar).toBe('АIII');
  });
});

describe('matchResource — characteristic gates, region, confidence', () => {
  it('B15 never matches B25 even with identical words; object region preferred', () => {
    const r = matchResource(cat, 'Бетон тяжелый класса B15', 'м3', 'samarqand');
    expect(r.candidates.every(c => c.row.nom.includes('B15'))).toBe(true);
    expect(r.best?.row.hudud_kalit).toBe('samarqand');
    expect(r.confidence).toBe('HIGH');
    expect(r.gateRejected).toBeGreaterThan(0);
  });
  it('exact name + unit is EXACT', () => {
    expect(matchResource(cat, 'Бетон тяжелый, класс B15 (М200)', 'м3', 'toshkent')).toMatchObject({ confidence: 'EXACT', best: { row: { id: 1 } } });
  });
  it('rebar: class and diameter are hard gates', () => {
    const r = matchResource(cat, 'Арматура A500C диаметром 16 мм', 'т');
    expect(r.best?.row.id).toBe(6);
    expect(r.candidates.map(c => c.row.id)).not.toContain(5);
    expect(r.candidates.map(c => c.row.id)).not.toContain(7);
  });
  it('unit mismatch is rejected (sand m3 ≠ sand t); priceless rows never offered', () => {
    expect(matchResource(cat, 'Песок для строительных работ', 'т').candidates.map(c => c.row.id)).toEqual([10]);
    expect(matchResource(cat, 'Проволока вязальная', 'т').confidence).toBe('NONE');
  });
  it('cable: brand (АВВГ ≠ ВВГ) and cross-section (4х2,5 ≠ 4х4) are hard gates', () => {
    const r = matchResource(cat, 'Кабели силовые с алюминиевыми жилами, марки АВВГ, с числом жил и сечением, мм2: 4X2,5', 'км');
    expect(r.candidates.map(c => c.row.id)).toEqual([13]);
  });
  it('vague name stays REVIEW for the AI agent / operator', () => {
    expect(matchResource(cat, 'Бетон', 'м3').confidence).toBe('REVIEW');
  });
  it('autoPrice splits applied (EXACT/HIGH) and review lines', () => {
    const r = autoPrice([
      { occurrenceId: 'o', recipeId: 'a', name: 'Бетон тяжелый, класс B15 (М200)', unit: 'м3' },
      { occurrenceId: 'o', recipeId: 'b', name: 'Бетон', unit: 'м3' },
    ], cat, 'toshkent');
    expect(r.applied.map(x => x.recipeId)).toEqual(['a']);
    expect(r.review.map(x => x.recipeId)).toEqual(['b']);
  });
});

describe('matchResource — strong identity', () => {
  it('long official cable name with verified brand+section and a single surviving product → HIGH', () => {
    const r = matchResource(cat, 'Кабели силовые с поливинилхлоридной изоляцией с алюминиевыми жилами на напряжение 1000 в, марки АВВГ, с числом жил и сечением, мм2: 4X2,5', 'км');
    expect([r.confidence, r.best?.row.id]).toEqual(['HIGH', 13]);
  });
  it('without a known unit nothing is auto-applied', () => {
    expect(matchResource(cat, 'Кабели силовые марки АВВГ 4X2,5', null).confidence).toBe('REVIEW');
  });
});
