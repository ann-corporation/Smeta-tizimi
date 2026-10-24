import { describe, expect, it } from 'vitest';
import { f2AktlarniOqi, guruhSarlavhasimi } from '../smeta-anatomiya/f2';
import type { Katak, KirishKitob } from '../smeta-anatomiya/turlar';
import type { F2Tugun } from '../smeta-anatomiya/f2';
import { f2MoslashV3, rzKalit, type SmetaQator } from './index';
import { f2Indeks, ishniBogla, ishniTasdiqla, smetaIndeks } from './ishJoyi';

const SARLAVHA: Katak[][] = [
  ['Подрядчик: ООО "NEW TIMES BUILDINGS"'], ['Заказчик: "Янги Навоий шахарчаси"'], [], ['АКТ'],
  ['О выполненых работ по объекту "Янги Узбекистон боги"'], [], ['За сентябрь месяц 2025 года'], [],
  ['№№', 'ОБОСНОВАНИЕ', 'НАИМЕНОВАНИЕ РАБОТ И РЕСУРСОВ', 'ЕД.ИЗМ', 'КОЛ-ВО', null, 'Сметная стоимость', null],
  [null, null, null, null, 'НА ЕДИНИЦУ', 'ПО ПРОЕКТУ', 'на.ед.изм.', 'общая'],
  [1, 2, 3, 4, 5, 6, 7, 8],
];
const ISH: Katak[][] = [
  ['РАЗДЕЛ: СТЕЛЛА'],
  ['МЕТАЛЛИЧЕСКИЙ РЕШЕТЧАТЫЙ КАРКАС(КР-33)'],
  [34, 'E9-3-13-1', 'МОНТАЖ ВЕРТИКАЛЬНЫХ СВЯЗЕЙ В ВИДЕ ФЕРМ', 'Т', 5, null, null, 1000],
  [34.1, '000001', 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'ЧЕЛ-Ч', 10, 2, 100, 1000],
  // Matnli guruh sarlavhasi: kodsiz, birliksiz, hajmsiz, summa 0
  [34.18, null, 'ДЕТАЛЬ -1', null, null, null, null, 0],
  [34.19, '17-107880-11', 'ЛИСТ T=14Х300Х400', 'ТН', 0.163, null, 10000000, 1630000],
  [34.2, '17-107880-12', 'ЛИСТ T=14Х300Х156', 'ТН', 0.064, null, 10000000, 640000],
  [34.22, null, 'ДЕТАЛЬ -2', null, null, null, null, 0],
  [34.23, '17-107880-14', 'ЛИСТ T=14Х230Х220', 'ТН', 0.023, null, 10000000, 230000],
];
const PODVAL: Katak[][] = [[null, null, 'ИТОГО ПРЯМЫЕ ЗАТРАТЫ', 'СУМ', null, null, null, 3500000], [null, null, 'ВСЕГО СТОИМОСТЬ СТРОИТЕЛЬСТВА В ТЕКУЩИХ ЦЕНАХ', 'СУМ', null, null, null, 3500000]];
const kitob: KirishKitob = { fayl: 'f2.xlsx', varaqlar: [{ nom: 'ф2 Стелла', rows: [...SARLAVHA, ...ISH, ...PODVAL] }] };

describe('F2 ish ichidagi matnli guruh sarlavhasi (Stella «ДЕТАЛЬ -1»)', () => {
  it('guruhSarlavhasimi: faqat kodsiz, birliksiz, hajmsiz, narxsiz matn (summa yo‘q yoki 0)', () => {
    const q = { kod: null, xom: 'ДЕТАЛЬ -1', birlik: null, hajm: null, narx: null, summa: 0 };
    expect(guruhSarlavhasimi(q)).toBe(true);
    expect(guruhSarlavhasimi({ ...q, kod: '17-1' })).toBe(false);
    expect(guruhSarlavhasimi({ ...q, birlik: 'ТН' })).toBe(false);
    expect(guruhSarlavhasimi({ ...q, hajm: 2 })).toBe(false);
    expect(guruhSarlavhasimi({ ...q, summa: 10 })).toBe(false);
    expect(guruhSarlavhasimi({ ...q, xom: ' ' })).toBe(false);
  });

  it('parser: sarlavha resurs emas — keyingi resurslar guruh nomi bilan; summa o‘zgarmaydi', () => {
    const [akt] = f2AktlarniOqi(kitob);
    const bl = akt.daraxt[0].bolalar[0].bolalar[0];
    expect(bl.tur).toBe('bl');
    expect(bl.bolalar.map((r) => r.nom)).toEqual(['ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'ЛИСТ T=14Х300Х400', 'ЛИСТ T=14Х300Х156', 'ЛИСТ T=14Х230Х220']);
    expect(bl.bolalar.map((r) => r.guruh ?? null)).toEqual([null, 'ДЕТАЛЬ -1', 'ДЕТАЛЬ -1', 'ДЕТАЛЬ -2']);
    expect(akt.qatorlarJami).toBe(1000 + 1630000 + 640000 + 230000);
  });
});

// ── Smeta: ish bir razdelda, «ДЕТАЛЬ -n» razdellari alohida (ota-razdelning bolalari) ─────────────────────────────
let sid = 0;
const S: SmetaQator[] = [];
const rz = (nom: string, ota: number | null) => { const id = ++sid; S.push({ id, otaId: ota, tur: 'rz', kod: null, nom, birlik: null, hajm: null, tartib: id }); return id; };
const qator = (ota: number, tur: SmetaQator['tur'], kod: string | null, nom: string, birlik: string | null, hajm: number | null) => { const id = ++sid; S.push({ id, otaId: ota, tur, kod, nom, birlik, hajm, tartib: id }); return id; };
const R0 = rz('РАЗДЕЛ: СТЕЛЛА', null);
const R1 = rz('МЕТАЛЛИЧЕСКИЙ РЕШЕТЧАТЫЙ КАРКАС(КР-33)', R0);
const W = qator(R1, 'bl', 'E9-3-13-1', 'МОНТАЖ ВЕРТИКАЛЬНЫХ СВЯЗЕЙ В ВИДЕ ФЕРМ', 'Т', 5);
const ISH_TRUD = qator(W, 'rs', '000001', 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'ЧЕЛ-Ч', 10);
const SHVELLER = qator(W, 'mat', '17-000001', 'ШВЕЛЛЕРЫ N 40', 'Т', 1);   // ish ichidagi boshqa material (zamena nomzodi bo‘lib qolmasligi kerak)
const D1 = rz('ДЕТАЛЬ -1', R0);
const D1a = qator(D1, 'mat', '17-107880-11', 'ЛИСТ T=14Х300Х400', 'ТН', 0.163);
const D1b = qator(D1, 'mat', '17-107880-12', 'ЛИСТ T=14Х300Х156', 'ТН', 0.064);
const D2 = rz('ДЕТАЛЬ -2', R0);
const D2a = qator(D2, 'mat', '17-107880-14', 'ЛИСТ T=14Х230Х220', 'ТН', 0.023);

describe('guruhli resurs → smetadagi shu nomli razdel (rz) ichiga', () => {
  const [akt] = f2AktlarniOqi(kitob);

  it('moslash: ◐/✕ zamena taklifi yo‘q — resurslar rz ichidagi qatorlarga aniq bog‘lanadi', () => {
    const n = f2MoslashV3(akt.daraxt, S);
    const bl = akt.daraxt[0].bolalar[0].bolalar[0];
    const [trud, l1, l2, l3] = bl.bolalar;
    expect(n.natijalar.get(bl.uid)).toMatchObject({ holat: 'aniq', qatorId: W });
    expect(n.natijalar.get(trud.uid)).toMatchObject({ holat: 'aniq', qatorId: ISH_TRUD });
    expect(n.natijalar.get(l1.uid)).toMatchObject({ holat: 'aniq', qatorId: D1a });
    expect(n.natijalar.get(l2.uid)).toMatchObject({ holat: 'aniq', qatorId: D1b });
    expect(n.natijalar.get(l3.uid)).toMatchObject({ holat: 'aniq', qatorId: D2a });
    for (const r of [l1, l2, l3]) expect(n.natijalar.get(r.uid)?.tavsiya).toBeUndefined();
    expect(SHVELLER).toBeGreaterThan(0);
  });

  it('ishniBogla / ishniTasdiqla: guruhli resurslar ham razdel ichida bog‘lanadi', () => {
    const SI = smetaIndeks(S);
    const bl = akt.daraxt[0].bolalar[0].bolalar[0];
    const b = ishniBogla({ bog: new Map(), otkaz: new Set() }, bl, W, SI);
    expect(b.qoldi).toBe(0);
    expect(b.ij.bog.get(bl.bolalar[1].uid)?.qatorId).toBe(D1a);
    expect(b.ij.bog.get(bl.bolalar[3].uid)?.qatorId).toBe(D2a);
    const t = ishniTasdiqla({ bog: new Map([[bl.uid, { qatorId: W, holat: 'taklif' as const, usul: 'tartib' }]]), otkaz: new Set() }, bl, SI);
    expect(t.qoldi).toBe(0);
    expect(t.ij.bog.get(bl.bolalar[2].uid)?.qatorId).toBe(D1b);
    expect(f2Indeks(akt.daraxt).qatorlar.some((x) => x.nom === 'ДЕТАЛЬ -1')).toBe(false);
    expect(rzKalit('ДЕТАЛЬ -1')).toBe(rzKalit('  деталь -1 '));
  });

  it('bir xil nomli rz lar bir nechta (3 ta «ЗАКЛАДНАЯ ДЕТАЛЬ») — har guruhga navbat bilan, takror berilmaydi', () => {
    const S2: SmetaQator[] = []; let id = 0;
    const R = (nom: string, ota: number | null) => { const x = ++id; S2.push({ id: x, otaId: ota, tur: 'rz', kod: null, nom, birlik: null, hajm: null, tartib: x }); return x; };
    const Q = (ota: number, tur: SmetaQator['tur'], kod: string | null, nom: string, birlik: string | null, hajm: number | null) => { const x = ++id; S2.push({ id: x, otaId: ota, tur, kod, nom, birlik, hajm, tartib: x }); return x; };
    const root = R('РАЗДЕЛ: СТЕЛЛА', null);
    const z1 = R('ЗАКЛАДНАЯ ДЕТАЛЬ ЗД1', root); const m1 = Q(z1, 'mat', '17-1', 'ЛИСТ А', 'ТН', 1);
    const z2 = R('ЗАКЛАДНАЯ ДЕТАЛЬ ЗД1', root); const m2 = Q(z2, 'mat', '17-1', 'ЛИСТ А', 'ТН', 1);
    const w1 = Q(R('КАРКАС 1', root), 'bl', 'E9-1', 'МОНТАЖ 1', 'Т', 1);
    const f = (uid: string, nom: string, bolalar: F2Tugun[] = [], extra: Partial<F2Tugun> = {}): F2Tugun => ({ uid, tur: bolalar.length ? 'bl' : 'mat', kod: bolalar.length ? 'E9-1' : '17-1', nom, birlik: bolalar.length ? 'Т' : 'ТН', hajm: 1, narx: null, summa: null, manzil: { fayl: 'f', varaq: 'F', qator: Number(uid.split('!')[1]) }, yol: [], bolalar, barg: !bolalar.length, ...extra });
    const SI2 = smetaIndeks(S2);
    const bl1 = f('F!1', 'МОНТАЖ 1', [f('F!2', 'ЛИСТ А', [], { guruh: 'ЗАКЛАДНАЯ ДЕТАЛЬ ЗД1', guruhUid: 'F!g1' }), f('F!3', 'ЛИСТ А', [], { guruh: 'ЗАКЛАДНАЯ ДЕТАЛЬ ЗД1', guruhUid: 'F!g2' })]);
    const r = ishniBogla({ bog: new Map(), otkaz: new Set() }, bl1, w1, SI2);
    expect(new Set([r.ij.bog.get('F!2')?.qatorId, r.ij.bog.get('F!3')?.qatorId])).toEqual(new Set([m1, m2]));
  });
});
