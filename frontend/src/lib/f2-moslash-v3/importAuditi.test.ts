/**
 * F2 import auditi (2026-11-09) — P1…P8 xato naqshlari, SINTETIK fikstura bilan (real nom/summa yo'q).
 */
import { describe, expect, it } from 'vitest';
import { f2AktlarniOqi, type F2Tugun } from '../smeta-anatomiya/f2';
import type { Katak, KirishKitob } from '../smeta-anatomiya/turlar';
import { IerarxiyaQuruvchi, sarlavhaYoli } from '../smeta-anatomiya/ierarxiya';
import { f2MoslashV3, BOSHQA_BOLIM_USUL, MODIFIKATOR_USUL, type SmetaQator } from './index';
import { modifikatorFarqlari } from './modifikator';
import { f2Indeks, smetaIndeks, type Bog, type IshJoyi } from './ishJoyi';
import { f2QoralamaYozish } from '../f2-ishchi-qoralama';
import { moslashHisoboti } from './moslashHisoboti';
import { zamenaRejaXatosi } from './zamenaReja';

// ─── Fikstura yordamchilari ──────────────────────────────────────────────────

const HDR: Katak[][] = [
  ['АКТ'], ['О выполненных работах по объекту "Синтетик"'], [], ['За сентябрь месяц 2025 года'], [],
  ['№№', 'ОБОСНОВАНИЕ', 'НАИМЕНОВАНИЕ РАБОТ И РЕСУРСОВ', 'ЕД.ИЗМ', 'КОЛ-ВО', null, 'Сметная стоимость', null],
  [null, null, null, null, 'НА ЕДИНИЦУ', 'ПО ПРОЕКТУ', 'на.ед.изм.', 'общая'],
  [1, 2, 3, 4, 5, 6, 7, 8],
];
const PODVAL = (jami: number): Katak[][] => [[null, null, 'ИТОГО ПРЯМЫЕ ЗАТРАТЫ', 'СУМ', null, null, null, jami], [], [null, null, 'ЗАКАЗЧИК']];
const ishQ = (n: number, kod: string, nom: string, bir: string, hajm: number, summa: number): Katak[] => [n, kod, nom, bir, hajm, null, null, summa];
const resQ = (n: string, kod: string, nom: string, bir: string, norma: number, hajm: number, narx: number, summa: number): Katak[] => [n, kod, nom, bir, norma, hajm, narx, summa];
const varaq = (nom: string, rows: Katak[][]) => ({ nom, rows: [...HDR, ...rows] });

function barglar(daraxt: readonly F2Tugun[]): F2Tugun[] {
  return daraxt.flatMap((t) => (t.tur === 'rz' ? barglar(t.bolalar) : [t, ...barglar(t.bolalar)]));
}

let sid = 1000;
function smetaQur() {
  const S: SmetaQator[] = [];
  const rz = (nom: string, ota: number | null = null) => { const id = ++sid; S.push({ id, otaId: ota, tur: 'rz', kod: null, nom, birlik: null, hajm: null, tartib: id }); return id; };
  const bl = (ota: number, kod: string, nom: string, birlik: string, hajm: number, res: Array<[string, string, string, number, string?]> = []) => {
    const id = ++sid;
    S.push({ id, otaId: ota, tur: 'bl', kod, nom, birlik, hajm, tartib: id });
    const ids = res.map(([k, n, b, norma, tur]) => { const r = ++sid; S.push({ id: r, otaId: id, tur: tur ?? 'rs', kod: k, nom: n, birlik: b, hajm: norma * hajm, tartib: r }); return r; });
    return { id, ids };
  };
  const mat = (ota: number, kod: string, nom: string, birlik: string, hajm: number) => { const id = ++sid; S.push({ id, otaId: ota, tur: 'mat', kod, nom, birlik, hajm, tartib: id }); return id; };
  return { S, rz, bl, mat };
}

let fu = 0;
function f(tur: F2Tugun['tur'], kod: string | null, nom: string, birlik: string | null, hajm: number | null, yol: string[], bolalar: F2Tugun[] = [], norma?: number): F2Tugun {
  const u = `SINT!${++fu}`;
  return { uid: u, tur, kod, nom, birlik, hajm, narx: null, summa: hajm, norma, manzil: { fayl: 'sint.xlsx', varaq: 'SINT', qator: fu }, yol, bolalar, barg: !bolalar.length };
}
const rzF = (nom: string, yol: string[], bolalar: F2Tugun[]): F2Tugun => ({ ...f('rz', null, nom, null, null, yol), bolalar, barg: false });
const ijQur = (bog: Array<[string, number, Bog['holat']?, string?]>): IshJoyi => ({ bog: new Map(bog.map(([u, q, h, usul]) => [u, { qatorId: q, holat: h ?? 'aniq', usul: usul ?? 'test' }])), otkaz: new Set() });

// ─── P1: eskirgan sarlavha yo'li ─────────────────────────────────────────────

describe('P1 — sarlavha steki: yangi daraja chuqurroqlarini yopadi, varaq/hujjat bo‘yicha qayta boshlanadi', () => {
  it('«ТИП 2» oldingi «ТИП 1» ning ichki bo‘limi ostida qolmaydi; seriyadan keyingi bo‘lim seriya otasiga qo‘shni', () => {
    const kitob: KirishKitob = { fayl: 'sint.xlsx', varaqlar: [varaq('ф2', [
      ['ТРОТУАР'], ['ТИП 1'], ['ЗЕМЛЯНЫЕ РАБОТЫ'],
      ishQ(1, 'E1-1-1', 'РАЗРАБОТКА ГРУНТА', '1000М3', 1, 100), resQ('1.1', '000001', 'ЗАТРАТЫ ТРУДА РАБОЧИХ', 'ЧЕЛ-Ч', 2, 2, 50, 100),
      ['ТИП 2'],
      ishQ(2, 'E27-1-1', 'УСТРОЙСТВО ОСНОВАНИЯ', '1000М2', 1, 200), resQ('2.1', '000001', 'ЗАТРАТЫ ТРУДА РАБОЧИХ', 'ЧЕЛ-Ч', 4, 4, 50, 200),
      ['ФОНТАН'],
      ishQ(3, 'E6-1-1', 'УСТРОЙСТВО ФУНДАМЕНТА', '100М3', 1, 300), resQ('3.1', '000001', 'ЗАТРАТЫ ТРУДА РАБОЧИХ', 'ЧЕЛ-Ч', 6, 6, 50, 300),
      ...PODVAL(600),
    ])] };
    const [akt] = f2AktlarniOqi(kitob);
    const bl = (kod: string) => barglar(akt.daraxt).find((t) => t.tur === 'bl' && t.kod === kod)!;
    expect(bl('E1-1-1').yol).toEqual(['ТРОТУАР', 'ТИП 1', 'ЗЕМЛЯНЫЕ РАБОТЫ']);
    expect(bl('E27-1-1').yol).toEqual(['ТРОТУАР', 'ТИП 2']);
    expect(bl('E6-1-1').yol).toEqual(['ФОНТАН']);
  });

  it('ketma-ket kelgan bir seriyali sarlavhalar («ПАРКОВКА ТИП1» → «ТИП 4») — qo‘shni, bola emas', () => {
    const iq = new IerarxiyaQuruvchi();
    const M = { fayl: 'f', varaq: 'V', qator: 1 };
    iq.sarlavha('ТРОТУАР', M, true);
    iq.sarlavha('ПАРКОВКА ТИП1', { ...M, qator: 2 }, true);
    const t4 = iq.sarlavha('ТИП 4', { ...M, qator: 3 }, false);
    expect(sarlavhaYoli(iq.sarlavhalar, t4.id).map((s) => s.xom)).toEqual(['ТРОТУАР', 'ТИП 4']);
  });

  it('har varaq o‘z steki bilan: oldingi varaqdagi bo‘lim keyingi hujjat yo‘liga prefiks bo‘lmaydi', () => {
    const kitob: KirishKitob = { fayl: 'sint.xlsx', varaqlar: [
      varaq('ф2 A', [['НАРУЖНЫЕ СЕТИ'], ishQ(1, 'E22-1-1', 'УКЛАДКА ТРУБ', '1000М', 1, 100), resQ('1.1', '000001', 'ЗАТРАТЫ ТРУДА РАБОЧИХ', 'ЧЕЛ-Ч', 2, 2, 50, 100), ...PODVAL(100)]),
      varaq('ф2 B', [['ТРОТУАР'], ishQ(1, 'E27-1-1', 'УСТРОЙСТВО ОСНОВАНИЯ', '1000М2', 1, 200), resQ('1.1', '000001', 'ЗАТРАТЫ ТРУДА РАБОЧИХ', 'ЧЕЛ-Ч', 4, 4, 50, 200), ...PODVAL(200)]),
    ] };
    const aktlar = f2AktlarniOqi(kitob);
    const b = aktlar.find((a) => a.varaq === 'ф2 B')!;
    expect(barglar(b.daraxt).find((t) => t.tur === 'bl')!.yol).toEqual(['ТРОТУАР']);
  });
});

// ─── P2: alohida manba bloklari birlashmaydi ─────────────────────────────────

describe('P2 — ikki alohida manba qatori jim bitta smeta qatoriga qo‘shilmaydi', () => {
  it('ikkinchi bir xil blok (ikkinchi ПГС qatlami) — ◐ takror, hisobotda shubhali', () => {
    const { S, rz, bl } = smetaQur();
    const R = rz('ТИП 4');
    const w = bl(R, 'E27-4-1-1', 'УСТРОЙСТВО ПОДСТИЛАЮЩЕГО СЛОЯ ИЗ ПГС 10 СМ', '1000М2', 10, [['000001', 'ЗАТРАТЫ ТРУДА', 'ЧЕЛ-Ч', 5]]);
    const yol = ['ТИП 4'];
    const mk = () => f('bl', 'E27-4-1-1', 'УСТРОЙСТВО ПОДСТИЛАЮЩЕГО СЛОЯ ИЗ ПГС 10 СМ', '1000М2', 4, yol, [f('rs', '000001', 'ЗАТРАТЫ ТРУДА', 'ЧЕЛ-Ч', 20, [...yol, 'x'], [], 5)]);
    const a = mk(), b = mk();
    const n = f2MoslashV3([rzF('ТИП 4', [], [a, b])], S);
    expect(n.natijalar.get(a.uid)).toMatchObject({ holat: 'aniq', qatorId: w.id });
    expect(n.natijalar.get(b.uid)).toMatchObject({ holat: 'taklif', qatorId: w.id, usul: 'takror' });
    const daraxt = [rzF('ТИП 4', [], [a, b])];
    const ind = f2Indeks(daraxt);
    const h = moslashHisoboti({ ind, ij: ijQur([[a.uid, w.id], [b.uid, w.id, 'qolda']]), S: smetaIndeks(S), natija: n });
    expect(h.qatorlar.find((q) => q.uid === b.uid)).toMatchObject({ shubhali: true, ishonch: 'ehtimol' });
    expect(h.qatorlar.find((q) => q.uid === b.uid)!.sabablar.join(' ')).toMatch(/2 ta manba qatori/);
  });

  it('turli materiallar (plita va bruschatka) bitta mustaqil qatorga — ikkinchisi ✓ emas', () => {
    const { S, rz, bl, mat } = smetaQur();
    const R = rz('ТИП 2');
    const w1 = bl(R, 'E27-7-1', 'УКЛАДКА ПЛИТ', '100М2', 1, [['000001', 'ЗАТРАТЫ ТРУДА', 'ЧЕЛ-Ч', 5]]);
    const w2 = bl(R, 'E27-7-2', 'УКЛАДКА БРУСЧАТКИ', '100М2', 1, [['000001', 'ЗАТРАТЫ ТРУДА', 'ЧЕЛ-Ч', 5]]);
    const m = mat(R, '17-1-1', 'ПЛИТА БЕТОННАЯ 20', 'М2', 200);
    const yol = ['ТИП 2'];
    const a = f('bl', 'E27-7-1', 'УКЛАДКА ПЛИТ', '100М2', 1, yol, [f('rs', '000001', 'ЗАТРАТЫ ТРУДА', 'ЧЕЛ-Ч', 5, yol, [], 5), f('rs', '17-1-1', 'ПЛИТА БЕТОННАЯ 20', 'М2', 100, yol)]);
    const b = f('bl', 'E27-7-2', 'УКЛАДКА БРУСЧАТКИ', '100М2', 1, yol, [f('rs', '000001', 'ЗАТРАТЫ ТРУДА', 'ЧЕЛ-Ч', 5, yol, [], 5), f('rs', '17-1-1', 'БРУСЧАТКА БЕТОННАЯ 20', 'М2', 100, yol)]);
    const n = f2MoslashV3([rzF('ТИП 2', [], [a, b])], S);
    expect(n.natijalar.get(a.uid)!.qatorId).toBe(w1.id);
    expect(n.natijalar.get(b.uid)!.qatorId).toBe(w2.id);
    expect(n.natijalar.get(a.bolalar[1].uid)).toMatchObject({ holat: 'aniq', qatorId: m });
    expect(n.natijalar.get(b.bolalar[1].uid), JSON.stringify(n.natijalar.get(b.bolalar[1].uid))).toMatchObject({ holat: 'taklif', qatorId: m });
    expect(n.natijalar.get(b.bolalar[1].uid)!.sabab).toMatch(/farqli/);
  });
});

// ─── P3: К= / modifikator ────────────────────────────────────────────────────

describe('P3 — shifr bir xil, К= farqli: aniq emas («shubhali»)', () => {
  it('manba К=5 ↔ smeta yagona К=15 — ✓ emas, ◐ modifikator', () => {
    const { S, rz, bl } = smetaQur();
    const R = rz('ТИП 4');
    const w = bl(R, 'E27-1-5-2 ШНК.ДОП.4 К=15', 'НА КАЖДЫЙ 1 СМ ИЗМЕНЕНИЯ ТОЛЩИНЫ ДОБАВЛЯТЬ', '1000М2', 10, [['000001', 'ЗАТРАТЫ ТРУДА', 'ЧЕЛ-Ч', 15]]);
    const yol = ['ТИП 4'];
    const a = f('bl', 'E27-1-5-2 ШНК.ДОП.4 К=5', 'НА КАЖДЫЙ 1 СМ ИЗМЕНЕНИЯ ТОЛЩИНЫ ДОБАВЛЯТЬ', '1000М2', 10, yol, [f('rs', '000001', 'ЗАТРАТЫ ТРУДА', 'ЧЕЛ-Ч', 50, yol, [], 5)]);
    const n = f2MoslashV3([rzF('ТИП 4', [], [a])], S);
    const r = n.natijalar.get(a.uid)!;
    expect(r.holat).not.toBe('aniq');
    expect(r).toMatchObject({ holat: 'taklif', qatorId: w.id, usul: MODIFIKATOR_USUL });
    expect(r.sabab).toMatch(/К=5.*К=15/);
  });

  it('smetada К=5 ham, К=15 ham bor — o‘zining К=5 qatori tanlanadi', () => {
    const { S, rz, bl } = smetaQur();
    const R = rz('ТИП 1');
    const k15 = bl(R, 'E27-1-5-2 К=15', 'НА КАЖДЫЙ 1 СМ ИЗМЕНЕНИЯ ТОЛЩИНЫ ДОБАВЛЯТЬ', '1000М2', 10);
    const k5 = bl(R, 'E27-1-5-2 К=5', 'НА КАЖДЫЙ 1 СМ ИЗМЕНЕНИЯ ТОЛЩИНЫ ДОБАВЛЯТЬ', '1000М2', 10);
    const a = f('bl', 'E27-1-5-2 К=5', 'НА КАЖДЫЙ 1 СМ ИЗМЕНЕНИЯ ТОЛЩИНЫ ДОБАВЛЯТЬ', '1000М2', 10, ['ТИП 1']);
    const n = f2MoslashV3([rzF('ТИП 1', [], [a])], S);
    expect(n.natijalar.get(a.uid)).toMatchObject({ holat: 'aniq', qatorId: k5.id });
    expect(k15.id).not.toBe(k5.id);
  });

  it('modifikator tokenlari: К=, ШНК.ДОП, qalinlik (см/мм, t>), ДОБАВЛЯТЬ/ИСКЛЮЧАТЬ', () => {
    expect(modifikatorFarqlari({ kod: 'E27-1-5-2 K=5', nom: 'X' }, { kod: 'E27-1-5-2 К=12', nom: 'X' }).map((x) => x.kalit)).toEqual(['koef']);
    expect(modifikatorFarqlari({ kod: 'E1-1-1 ШHК.ДОП.4', nom: 'X' }, { kod: 'E1-1-1 ШНК.ДОП.11', nom: 'X' }).map((x) => x.kalit)).toEqual(['shnk_dop']);
    expect(modifikatorFarqlari({ kod: '', nom: 'ПГС 10СМ/15СМ' }, { kod: '', nom: 'ПГС 10СМ/25СМ' }).map((x) => x.kalit)).toEqual(['olcham']);
    expect(modifikatorFarqlari({ kod: '', nom: 'ПЛИТА t>18' }, { kod: '', nom: 'ПЛИТА Т.1,8СМ' })).toEqual([]);
    expect(modifikatorFarqlari({ kod: '', nom: 'БЕТОН ИСКЛЮЧАТЬ 8 СМ' }, { kod: '', nom: 'БЕТОН ДОБАВЛЯТЬ 8 СМ' }).map((x) => x.kalit)).toEqual(['yonalish']);
    expect(modifikatorFarqlari({ kod: 'E1', nom: 'БЕЗ МОДИФИКАТОРА' }, { kod: 'E1 К=3', nom: 'БЕЗ МОДИФИКАТОРА' })).toEqual([]);
  });
});

// ─── P4: resurs qo'shni ishga o'tmaydi ───────────────────────────────────────

describe('P4 — resurs o‘z manba ishiga bog‘lanadi, qo‘shni ishning resursiga emas', () => {
  it('chegirma (minus) ishining betoni asosiy ishning betoniga bog‘lansa — yozish to‘xtatiladi, hisobotda xato', () => {
    const { S, rz, bl } = smetaQur();
    const R = rz('ТИП 4');
    const asos = bl(R, 'E27-6-2-17', 'УСТРОЙСТВО БЕТОННОГО ОСНОВАНИЯ 20 СМ', '1000М2', 10, [['000001', 'ЗАТРАТЫ ТРУДА', 'ЧЕЛ-Ч', 5], ['17-1-8', 'БЕТОН М200', 'М3', 200]]);
    const minus = bl(R, 'E27-6-2-18 К=8', 'НА КАЖДЫЙ 1 СМ ИСКЛЮЧАТЬ', '1000М2', -10, [['000001', 'ЗАТРАТЫ ТРУДА', 'ЧЕЛ-Ч', 1], ['17-1-8', 'БЕТОН М200', 'М3', 80]]);
    const yol = ['ТИП 4'];
    const a = f('bl', 'E27-6-2-17', 'УСТРОЙСТВО БЕТОННОГО ОСНОВАНИЯ 20 СМ', '1000М2', 5, yol, [f('rs', '000001', 'ЗАТРАТЫ ТРУДА', 'ЧЕЛ-Ч', 25, yol), f('rs', '17-1-8', 'БЕТОН М200', 'М3', 1000, yol)]);
    const b = f('bl', 'E27-6-2-18 К=8', 'НА КАЖДЫЙ 1 СМ ИСКЛЮЧАТЬ', '1000М2', -5, yol, [f('rs', '000001', 'ЗАТРАТЫ ТРУДА', 'ЧЕЛ-Ч', -5, yol), f('rs', '17-1-8', 'БЕТОН М200', 'М3', -400, yol)]);
    const daraxt = [rzF('ТИП 4', [], [a, b])];
    const ind = f2Indeks(daraxt);
    const ij = ijQur([
      [a.uid, asos.id], [a.bolalar[0].uid, asos.ids[0]], [a.bolalar[1].uid, asos.ids[1]],
      [b.uid, minus.id], [b.bolalar[0].uid, minus.ids[0]], [b.bolalar[1].uid, asos.ids[1], 'qolda'],
    ]);
    const y = f2QoralamaYozish(ind, ij, smetaIndeks(S));
    expect(y.toxtatish.join(' ')).toMatch(/qo‘shni/);
    const h = moslashHisoboti({ ind, ij, S: smetaIndeks(S) });
    expect(h.qatorlar.find((q) => q.uid === b.bolalar[1].uid)).toMatchObject({ xato: true });
    // To'g'ri bog'lansa — to'siq yo'q, minus qator minusligicha qoladi.
    const toza = f2QoralamaYozish(ind, ijQur([
      [a.uid, asos.id], [a.bolalar[0].uid, asos.ids[0]], [a.bolalar[1].uid, asos.ids[1]],
      [b.uid, minus.id], [b.bolalar[0].uid, minus.ids[0]], [b.bolalar[1].uid, minus.ids[1]],
    ]), smetaIndeks(S));
    expect(toza.toxtatish).toEqual([]);
    expect(toza.nodes.find((x) => x.uid === b.bolalar[1].uid)!.hajm).toBe(-400);
  });
});

// ─── P5: material qalinligi ──────────────────────────────────────────────────

describe('P5 — material kodi mos, qalinligi farqli: ✓ emas', () => {
  it('«ПЛИТА … 20 ММ» smetaning «Т.3СМ» qatoriga avtomatik ulanmaydi', () => {
    const { S, rz, bl } = smetaQur();
    const R = rz('ТИП 4');
    const w = bl(R, 'E11-1-31-9', 'УСТРОЙСТВО ПОКРЫТИЙ ИЗ ГРАНИТНЫХ ПЛИТ', '100М2', 10, [['000001', 'ЗАТРАТЫ ТРУДА', 'ЧЕЛ-Ч', 5], ['17-1-9', 'ПЛИТА ГРАНИТНАЯ Т.3СМ', 'М2', 102, 'mat']]);
    const yol = ['ТИП 4'];
    const a = f('bl', 'E11-1-31-9', 'УСТРОЙСТВО ПОКРЫТИЙ ИЗ ГРАНИТНЫХ ПЛИТ', '100М2', 5, yol, [
      f('rs', '000001', 'ЗАТРАТЫ ТРУДА', 'ЧЕЛ-Ч', 25, yol, [], 5), f('rs', '17-1-9', 'ПЛИТА ГРАНИТНАЯ 20 ММ', 'М2', 510, yol, [], 102)]);
    const n = f2MoslashV3([rzF('ТИП 4', [], [a])], S);
    expect(n.natijalar.get(a.uid)).toMatchObject({ holat: 'aniq', qatorId: w.id });
    const r = n.natijalar.get(a.bolalar[1].uid)!;
    expect(r).toMatchObject({ holat: 'taklif', qatorId: w.ids[1] });
    expect(r.sabab).toMatch(/qalinlik/);
  });
});

// ─── P6: zamena rejasi birligi ───────────────────────────────────────────────

describe('P6 — importdan zamena: birlik farqli bo‘lsa almashtirish hajmi majburiy', () => {
  it('Т ↔ 1000М2: almashtirish hajmisiz — xato; kiritilsa yoki birlik bir xil — to‘g‘ri', () => {
    expect(zamenaRejaXatosi({ aslBirlik: '1000М2', aslHajm: 5, birlik: 'Т', almashtirishHajm: null })).toMatch(/1000М2/);
    expect(zamenaRejaXatosi({ aslBirlik: '1000М2', aslHajm: 5, birlik: 'Т', almashtirishHajm: 5 })).toBeNull();
    expect(zamenaRejaXatosi({ aslBirlik: '1000М2', aslHajm: 5, birlik: 'Т', almashtirishHajm: 50 })).toMatch(/katta/);
    expect(zamenaRejaXatosi({ aslBirlik: 'М3', aslHajm: 5, birlik: 'м3', almashtirishHajm: null })).toBeNull();
  });
});

// ─── P7: bo'lim doirasi ──────────────────────────────────────────────────────

describe('P7 — bo‘lim transporti umumiy «ПЕРЕВОЗКА» bo‘limiga jim tushmaydi', () => {
  it('o‘z bo‘limida transport yo‘q — faqat ◐ (boshqa bo‘lim), tasdiqlangan bo‘lsa ham hisobotda shubhali', () => {
    const { S, rz, bl } = smetaQur();
    const R = rz('ТИП 2');
    const w = bl(R, 'E27-1-1', 'УСТРОЙСТВО ОСНОВАНИЯ', '1000М2', 10);
    const P = rz('ПЕРЕВОЗКА');
    const tr = bl(P, 'С310-1011', 'ПЕРЕВОЗКА ГРУЗОВ АВТОМОБИЛЕМ НА 11 КМ', 'Т', 1000);
    const yol = ['ТИП 2'];
    const a = f('bl', 'E27-1-1', 'УСТРОЙСТВО ОСНОВАНИЯ', '1000М2', 5, yol);
    const b = f('bl', 'С310-1011', 'ПЕРЕВОЗКА ГРУЗОВ АВТОМОБИЛЕМ НА 11 КМ', 'Т', 400, yol);
    const daraxt = [rzF('ТИП 2', [], [a, b])];
    const n = f2MoslashV3(daraxt, S);
    expect(n.natijalar.get(a.uid)).toMatchObject({ holat: 'aniq', qatorId: w.id });
    expect(n.natijalar.get(b.uid)!.holat).not.toBe('aniq');
    expect(n.natijalar.get(b.uid)).toMatchObject({ holat: 'taklif', qatorId: tr.id });
    expect(['boshqa_razdel', BOSHQA_BOLIM_USUL]).toContain(n.natijalar.get(b.uid)!.usul);
    const h = moslashHisoboti({ ind: f2Indeks(daraxt), ij: ijQur([[a.uid, w.id], [b.uid, tr.id, 'qolda']]), S: smetaIndeks(S), natija: n });
    const q = h.qatorlar.find((x) => x.uid === b.uid)!;
    expect(q.shubhali).toBe(true);
    expect(q.sabablar.join(' ')).toMatch(/boshqa bo‘lim/);
    expect(q.smetaYol).toBe('ПЕРЕВОЗКА');
    expect(q.manbaYol).toBe('ТИП 2');
  });
});

// ─── P8: ishsiz resurs ───────────────────────────────────────────────────────

describe('P8 — ishi (BL) yuklanmagan resurs aktga yolg‘iz kirmaydi', () => {
  it('BL hal qilinmagan, resurslari bog‘langan — resurslar bloklanadi, sababi aniq', () => {
    const { S, rz, bl } = smetaQur();
    const R = rz('ТИП 4');
    const w = bl(R, 'E27-1-5-1', 'УСТРОЙСТВО ОСНОВАНИЯ ИЗ ПГС', '1000М2', 10, [['000001', 'ЗАТРАТЫ ТРУДА', 'ЧЕЛ-Ч', 5]]);
    const yol = ['ТИП 4'];
    const a = f('bl', 'E27-1-5-1', 'УСТРОЙСТВО ОСНОВАНИЯ ИЗ ПГС', '1000М2', 5, yol, [f('rs', '000001', 'ЗАТРАТЫ ТРУДА', 'ЧЕЛ-Ч', 25, yol)]);
    const daraxt = [rzF('ТИП 4', [], [a])];
    const ind = f2Indeks(daraxt);
    const ij = ijQur([[a.uid, w.id, 'taklif'], [a.bolalar[0].uid, w.ids[0]]]);
    const y = f2QoralamaYozish(ind, ij, smetaIndeks(S));
    expect(y.nodes.map((x) => x.uid)).not.toContain(a.bolalar[0].uid);
    expect(y.qolgan.map((x) => x.uid)).toContain(a.bolalar[0].uid);
    expect(y.ogohlantirish.join(' ')).toMatch(/bloklandi/);
    const h = moslashHisoboti({ ind, ij, S: smetaIndeks(S) });
    expect(h.qatorlar.find((q) => q.uid === a.bolalar[0].uid)).toMatchObject({ xato: true });
    // Ish tasdiqlansa — resurs yana yoziladi.
    const ok = f2QoralamaYozish(ind, ijQur([[a.uid, w.id], [a.bolalar[0].uid, w.ids[0]]]), smetaIndeks(S));
    expect(ok.nodes.map((x) => x.uid)).toContain(a.bolalar[0].uid);
  });
});
