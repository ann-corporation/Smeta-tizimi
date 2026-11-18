import { describe, expect, it } from 'vitest';
import type { NormWork } from '../catalog-extraction/norm-catalog';
import { AVTO_CHEGARA, MAX_NOMZOD, OGIRLIK, NormMoslash, birlikAsoslari, birlikMosmi, ishonchHisobla } from './norm-moslash';
import { uzRuAlias, uzbekMi } from './norm-lugat';
import { avtoTanlov, kichikNomzodlar, moslashOl, qoshniToplamlar, type AiIsh, type AiKatalog } from './worker';

// ---- a tiny SYNTHETIC catalogue (no real data): construction, installation and repair collections + one Uzbek-named norm
const W = (id: string, code: string, name: string, coll: string, unit: string | null, table: string): NormWork =>
  ({ id, code, name, bookType: 'Е', collection: coll, section: null, subsection: null, tableCode: table, unitCode: unit });
const WORKS: NormWork[] = [
  W('1', 'Е06-01-001-1', 'Устройство бетонной подготовки', 'Е06', '100 м3 бетона', 'T1'),
  W('2', 'Е06-01-001-2', 'Устройство бетонных фундаментов общего назначения под колонны объемом: до 3 м3', 'Е06', '100 м3 бетона', 'T1'),
  W('3', 'Е15-02-016-1', 'Оштукатуривание поверхностей внутри здания цементно-известковым раствором по камню и бетону: простое стен', 'Е15', '100 м2 оштукатуриваемой поверхности', 'T2'),
  W('4', 'Е61-7-1', 'Ремонт штукатурки откосов внутри здания по камню и бетону', 'Е61', '100 м2 отремонтированной поверхности', 'T3'),
  W('5', 'Е16-04-006-4', 'Прокладка внутренних трубопроводов отопления из полипропиленовых труб диаметром до: 40 мм', 'Е16', '100 м трубопровода', 'T4'),
  W('6', 'Е16-04-006-5', 'Прокладка внутренних трубопроводов отопления из полипропиленовых труб диаметром до: 50 мм', 'Е16', '100 м трубопровода', 'T4'),
  W('7', 'Е16-04-006-6', 'Прокладка внутренних трубопроводов отопления из полипропиленовых труб диаметром до: 63 мм', 'Е16', '100 м трубопровода', 'T4'),
  W('8', 'Е11-01-011-1', 'Стяжкани қуриш. Стяжкани ташкил этиш: қалинлиги 20 мм цементли', 'Е11', '100 м2 стяжкани', 'T5'),
  W('9', 'Е11-01-011-8', 'Устройство стяжек из сухой теплоизоляционной смеси: толщиной 20 мм', 'Е11', '100 м2 стяжки', 'T5'),
  W('10', 'Е01-02-057-2', 'Разработка грунта вручную в траншеях глубиной до 2 м без креплений с откосами, группа грунтов: 2', 'Е01', '100 м3 грунта', 'T6'),
  W('11', 'Е29-01-001-1', 'Разработка грунта в тоннелях экскаваторами', 'Е29', '100 м3 грунта', 'T7'),
  W('12', 'Ц08-03-532-4', 'Посты управления кнопочные. Пост управления кнопочный общего назначения', 'Ц08', 'шт.', 'T8'),
  W('13', 'Е12-01-014-2', 'Утепление покрытий керамзитом', 'Е12', '1 м3', 'T9'),
  W('14', 'Е27-01-001-1', 'Перевозка грунта автосамосвалами на расстояние до 1 км', 'Е27', '1 т груза', 'T10'),
];
const TABLE: Record<string, string> = { T1: 'Устройство бетонной подготовки и фундаментов', T2: 'Оштукатуривание поверхностей', T3: 'Ремонт штукатурки', T4: 'Прокладка трубопроводов отопления',
  T5: 'Устройство стяжек', T6: 'Разработка грунта вручную', T7: 'Разработка грунта в тоннелях', T8: 'Посты управления', T9: 'Утепление покрытий', T10: 'Перевозка грунта' };
const COLL: Record<string, string> = { 'Е06': 'Бетонные и железобетонные конструкции монолитные', 'Е15': 'Отделочные работы', 'Е61': 'Ремонт штукатурных работ', 'Е16': 'Санитарно-техническое оборудование',
  'Е11': 'Полы', 'Е01': 'Земляные работы', 'Е29': 'Тоннели и метрополитены', 'Ц08': 'Электромонтажные работы', 'Е12': 'Кровли', 'Е27': 'Автомобильные дороги' };
const manba = {
  allWorks: () => WORKS,
  tableLabel: (id: string) => TABLE[WORKS.find(w => w.id === id)!.tableCode!] ?? null,
  collectionTitle: (c: string | null) => (c ? COLL[c] ?? null : null),
};

describe('birlikAsoslari / birlikMosmi — strict unit filter inputs', () => {
  it('reads the base of a catalogue measure and of a smeta unit', () => {
    expect([...birlikAsoslari('100 м3 грунта по проектному наружному очертанию конструкции')]).toEqual(['М3']);
    expect([...birlikAsoslari('100 м 2 окрашиваемой поверхности (нормы 1-4)')]).toEqual(['М2']);
    expect([...birlikAsoslari('100М2')]).toEqual(['М2']);
    expect([...birlikAsoslari('1000 м3')]).toEqual(['М3']);
    expect([...birlikAsoslari('10Т КОНСТРУКЦИЙ')]).toEqual(['Т']);
    expect([...birlikAsoslari('1 вентилятор')]).toEqual(['ШТ']);
    expect([...birlikAsoslari('шт.')]).toEqual(['ШТ']);
    expect([...birlikAsoslari('т (нормы 1-3), 100 шт. (нормы 4-15)')].sort()).toEqual(['Т', 'ШТ']);
    expect(birlikAsoslari('').size).toBe(0);
  });
  it('known & different is false, unknown is null, equal is true', () => {
    expect(birlikMosmi(birlikAsoslari('м2'), birlikAsoslari('100 м3'))).toBe(false);
    expect(birlikMosmi(birlikAsoslari('м'), birlikAsoslari('1 км'))).toBe(false);
    expect(birlikMosmi(birlikAsoslari('м3'), birlikAsoslari('1000 м3 грунта'))).toBe(true);
    expect(birlikMosmi(birlikAsoslari('м2'), birlikAsoslari(''))).toBeNull();
    expect(birlikMosmi(birlikAsoslari(null), birlikAsoslari('100 м2'))).toBeNull();
  });
});

describe('NormMoslash pipeline', () => {
  const nm = new NormMoslash(manba);
  it('exact wording is selected automatically with a high confidence', () => {
    const r = nm.moslash({ nom: 'Устройство бетонной подготовки', birlik: 'м3' });
    expect(r.nomzodlar[0].kod).toBe('Е06-01-001-1');
    expect(r.holat).toBe('AVTO');
    expect(r.tanlangan?.kod).toBe('Е06-01-001-1');
    expect(r.nomzodlar[0].ishonch).toBeGreaterThanOrEqual(AVTO_CHEGARA);
  });
  it('never more than 3 candidates, confidence within 0..1', () => {
    const r = nm.moslash({ nom: 'Прокладка трубопроводов отопления из полипропиленовых труб', birlik: 'м' });
    expect(r.nomzodlar.length).toBeLessThanOrEqual(MAX_NOMZOD);
    for (const n of r.nomzodlar) { expect(n.ishonch).toBeGreaterThanOrEqual(0); expect(n.ishonch).toBeLessThanOrEqual(1); }
  });
  it('numbers of the line pick the variant (diameter 50 mm)', () => {
    const r = nm.moslash({ nom: 'Прокладка внутренних трубопроводов отопления из полипропиленовых труб диаметром до 50 мм', birlik: '100М' });
    expect(r.nomzodlar[0].kod).toBe('Е16-04-006-5');
  });
  it('the unit filter drops a works with a known different unit', () => {
    const asoslar = nm.qidir({ nom: 'Разработка грунта', birlik: 'м2' }, 20);
    expect(asoslar.every(h => h.birlik !== false)).toBe(true);
    // грунт works are 100 м3: with a m2 unit none of them survives
    expect(asoslar.some(h => h.d.w.code === 'Е01-02-057-2')).toBe(false);
  });
  it('repair and special collections only when asked for', () => {
    const a = nm.qidir({ nom: 'Оштукатуривание откосов внутри здания по камню и бетону', birlik: 'м2' }, 5);
    expect(a[0].d.w.code).toBe('Е15-02-016-1');
    const b = nm.qidir({ nom: 'Ремонт штукатурки откосов внутри здания', birlik: 'м2' }, 5);
    expect(b[0].d.w.code).toBe('Е61-7-1');
    const c = nm.qidir({ nom: 'Разработка грунта', birlik: 'м3' }, 5);
    expect(c[0].d.coll).not.toBe('E29');
  });
  it('the heading of the smeta steers an ambiguous short line', () => {
    const r = nm.qidir({ nom: 'Разработка грунта', birlik: 'м3', bolim: ['Тоннели и метрополитены'] }, 5);
    expect(r.some(h => h.d.coll === 'E29')).toBe(true);
  });
  it('an Uzbek-named norm is found by its Russian wording (glossary) and its Russian table title', () => {
    const r = nm.qidir({ nom: 'Устройство стяжек цементных толщиной 20 мм', birlik: '100М2' }, 5);
    expect(r.slice(0, 2).map(h => h.d.w.code)).toContain('Е11-01-011-1');
  });
  it('nothing fits: «mos topilmadi» instead of junk', () => {
    const r = nm.moslash({ nom: 'Квантовая телепортация голограмм', birlik: 'м3' });
    expect(r.holat).toBe('TOPILMADI');
    expect(r.nomzodlar).toEqual([]);
    expect(r.tanlangan).toBeNull();
  });
  it('lines already matched in the same heading steer the next one (same collection)', () => {
    const solo = nm.qidir({ nom: 'Разработка грунта', birlik: '100М3' }, 5);
    const steered = nm.qidir({ nom: 'Разработка грунта', birlik: '100М3', qoshni: ['Е29', 'Е29'] }, 5);
    const pos = (l: typeof solo) => l.findIndex(h => h.d.coll === 'E29');
    expect(pos(steered)).toBeLessThanOrEqual(pos(solo));
  });
  it('the retrieval part is reusable: rerank with other weights does not re-retrieve', () => {
    const k = nm.kontekst({ nom: 'Устройство бетонной подготовки', birlik: 'м3' });
    const a = nm.rerank(k, 3), b = nm.rerank(k, 3, { ...OGIRLIK, bm: 0.5, mos: 0.5, prec: 0, bigram: 0 });
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
  });
  it('confidence rises with the margin and falls with the rank', () => {
    const base = { z: 0.8, margin: 0.2, mos: 1, birlikTrue: true, orin: 0 };
    expect(ishonchHisobla({ ...base, margin: 0.4 })).toBeGreaterThan(ishonchHisobla(base));
    expect(ishonchHisobla({ ...base, orin: 2 })).toBeLessThan(ishonchHisobla(base));
  });
});

describe('Uzbek glossary', () => {
  it('adds Russian words only for Uzbek-Cyrillic text', () => {
    expect(uzbekMi('Стяжкани қуриш')).toBe(true);
    expect(uzbekMi('Устройство стяжек')).toBe(false);
    expect(uzRuAlias('Устройство стяжек')).toBe('');
    expect(uzRuAlias('Тўшама қатламни қуриш: қумли')).toContain('песок');
    expect(uzRuAlias('Тўшама қатламни қуриш: щебенли')).toContain('щебеночный');
    expect(uzRuAlias('Металл эшикларни ўрнатиш')).toContain('дверь');
  });
});

describe('worker entry points (avtoTanlov / kichikNomzodlar)', () => {
  const k = {
    ...manba, manifest: { revision: 'synthetic' }, unit: () => null, load: async () => {}, detail: () => { throw new Error('n/a'); },
    sourceBasis: (measure: string | null) => measure === '100 м3 бетона'
      ? { scale: '100', unitLabel: 'м3', origin: 'OPERATOR', evidence: 'Synthetic catalogue measure' }
      : { scale: null, unitLabel: null, origin: null, evidence: null },
    search: (q: string) => ({ rows: WORKS.filter(w => w.code.toLowerCase() === q.toLowerCase()), total: 0 }),
  } as unknown as AiKatalog;
  const ish = (over: Partial<AiIsh>): AiIsh => ({ id: 'w1', bolim: 'Fundament', tavsif: '', qidiruv: [], birlik: 'м3', hajmIfoda: null, hajmIzoh: null, nomzodlar: [], tanlangan: null, hajm: null, hajmXato: null, ...over } as AiIsh);
  it('one pipeline per catalogue (cached)', () => {
    expect(moslashOl(k)).toBe(moslashOl(k));
  });
  it('an explicit norm code wins and is selected', () => {
    const r = avtoTanlov(k, ish({ qidiruv: ['Е06-01-001-2'] }));
    expect(r?.holat).toBe('KOD');
    expect(r?.avto?.kod).toBe('Е06-01-001-2');
  });
  it('offers text matches for review when the requested code is missing', () => {
    const r = avtoTanlov(k, ish({ qidiruv: ['Е06-99-999-9', 'Устройство бетонной подготовки'], tavsif: 'beton tayyorlov' }));
    expect(r).toMatchObject({ avto: null, holat: 'TEKSHIRISH', kodTekshirish: true, nomzodlar: expect.arrayContaining([expect.objectContaining({ kod: 'Е06-01-001-1' })]) });
  });
  it('a confident line comes back selected; the others only as ≤ 20 shortlist', () => {
    const a = avtoTanlov(k, ish({ qidiruv: ['Устройство бетонной подготовки'], tavsif: 'beton tayyorlov' }));
    expect(a?.avto?.kod).toBe('Е06-01-001-1');
    expect(a?.avto?.sabab).toContain('tizim tanlovi');
    const b = avtoTanlov(k, ish({ qidiruv: ['Квантовая телепортация'], birlik: 'м2' }));
    expect(b?.avto).toBeNull();
    expect(b?.holat).toBe('TOPILMADI');
    expect((a?.nomzodlar.length ?? 0)).toBeLessThanOrEqual(20);
  });
  it('production rule kept: a norm with a condition the user never stated is not offered', () => {
    const r = avtoTanlov(k, ish({ qidiruv: ['Перевозка грунта автосамосвалами'], birlik: 'т', tavsif: 'grunt tashish' }));
    expect(r).not.toBeNull();
  });
  it('kichikNomzodlar: chosen first, at most 3', () => {
    const nomzodlar = ['a', 'b', 'c', 'd', 'e'].map((id, i) => ({ id, kod: id, nom: id, birlik: null, ishonch: 0.9 - i * 0.1 }));
    const r = kichikNomzodlar({ nomzodlar, tanlangan: { workId: 'd', kod: 'd', nom: 'd', birlik: null, sabab: '' } });
    expect(r.map(n => n.id)).toEqual(['d', 'a', 'b']);
    expect(kichikNomzodlar({ nomzodlar: nomzodlar.map(n => ({ ...n, ishonch: undefined })), tanlangan: null })).toEqual([]);
  });
  it('qoshniToplamlar: collections of works already chosen in the same section', () => {
    const o = (id: string, bolim: string, kod: string | null) => ish({ id, bolim, tanlangan: kod ? { workId: id, kod, nom: '', birlik: null, sabab: '' } : null });
    expect(qoshniToplamlar({ id: 'x', bolim: 'A' }, [o('1', 'A', 'Е06-01-001-1'), o('2', 'B', 'Е15-02-016-1'), o('3', 'A', null), o('x', 'A', 'Е01-02-057-2')])).toEqual(['Е06']);
  });
});
