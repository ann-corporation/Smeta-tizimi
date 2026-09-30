import { describe, expect, it } from 'vitest';
import { slichitelniyHujjatXlsx, slichitelniyModeli } from './slichitelniy-vedomost';
import { hujjatTekshir, imzoRollariBormi } from './hujjat-yozuvchi';
import { namunaSaqla } from './hujjat-yozuvchi/test-yordam';
import type { T2Qator, T2QatorHolat } from '../api/supabase';

function q(id: number, ota_id: number | null, tur: string, hajm: number | null, extra: Partial<T2Qator> = {}): T2Qator {
  return {
    id, obyekt_id: 1, obyekt: 'X', kompaniya_id: 1, ota_id, daraja: 0, tartib: id, tur, kod: 'К' + id, nom: 'Позиция ' + id,
    birlik: 'м3', hajm, narx: 1000, summa: null, kat: null, narx_usul: null, qoshimcha: false, zamena: false,
    d1: null, d2: null, d3: null, xom_qator: id, yangilandi: null, manba_id: null, versiya: 1, raqam: null, norma: null, ...extra,
  };
}
function h(qator_id: number, fakt_hajm: number, f2_hajm = 0, f2_summa = 0): T2QatorHolat {
  return {
    id: qator_id, qator_id, obyekt_id: 1, tur: null, kod: null, nom: null, birlik: null, kat: null, smeta_hajm: null,
    smeta_summa: null, fakt_hajm, fakt_summa: 0, f2_hajm, f2_summa, qoldiq_hajm: null, qoldiq_summa: null,
  };
}

// ОЗЕРА(1) → bl2 ЗАСЫПКА (10; fakt 12 — сверх) → rs3 ТРУД (20 × 25 000; fakt 24), mat4 ПЕСОК (5 × 12 000; fakt 5 — mos)
//          → bl5 БЕТОН (4; fakt 0) → mat6 (4 × 900 000, qo'shimcha; fakt 0)
const QATOR = [
  q(1, null, 'rz', null, { nom: 'СМЕТА № 01-01 ОЗЕРА' }),
  q(2, 1, 'bl', 10, { nom: 'ЗАСЫПКА ПАЗУХ' }),
  q(3, 2, 'rs', 20, { nom: 'ЗАТРАТЫ ТРУДА', birlik: 'чел.-ч', narx: 25_000 }),
  q(4, 2, 'mat', 5, { nom: 'ПЕСОК', narx: 12_000 }),
  q(5, 1, 'bl', 4, { nom: 'БЕТОНИРОВАНИЕ' }),
  q(6, 5, 'mat', 4, { nom: 'БЕТОН В25', narx: 900_000, qoshimcha: true }),
];
const HOLAT = [h(2, 12, 8), h(3, 24, 16, 400_000), h(4, 5, 5, 60_000), h(5, 0), h(6, 0)];

describe('Сличительная ведомость (H1–H9)', () => {
  it('model: farq = fakt − smeta, summa smeta narxida, jamilar faqat barglardan', () => {
    const m = slichitelniyModeli(QATOR, HOLAT);
    const r = (nom: string) => m.qatorlar.find((x) => x.nom === nom)!;
    expect([r('ЗАТРАТЫ ТРУДА').farqHajm, r('ЗАТРАТЫ ТРУДА').farqSumma, r('ЗАТРАТЫ ТРУДА').izoh]).toEqual([4, 100_000, 'выполнено сверх сметы']);
    expect([r('ПЕСОК').farqHajm, r('ПЕСОК').izoh]).toEqual([0, '']);
    expect([r('БЕТОН В25').farqSumma, r('БЕТОН В25').izoh]).toEqual([-3_600_000, 'дополнительная работа; не выполнено']);
    expect(r('ЗАСЫПКА ПАЗУХ').smetaSumma).toBe(560_000);
    expect(m.jami).toEqual({ smeta: 4_160_000, fakt: 660_000, f2: 460_000, farq: -3_500_000 });
    expect([m.barglar, m.ortiq, m.kam]).toEqual([3, 1, 1]);
  });

  it('faqat farqi borlar: mos pozitsiya kirmaydi, jami faqat qolganlardan', () => {
    const m = slichitelniyModeli(QATOR, HOLAT, { faqatFarq: true });
    expect(m.qatorlar.some((x) => x.nom === 'ПЕСОК')).toBe(false);
    expect(m.jami.farq).toBe(-3_500_000);
  });

  it('hujjat standarti: formulalar $ siz va keshlangan, imzolar, chop, texnik matn yo‘q, UI == Excel', () => {
    const m = slichitelniyModeli(QATOR, HOLAT);
    const { bytes, faylNomi } = slichitelniyHujjatXlsx(m, { obyektNomi: 'Объект', sana: '2026-09-25' });
    namunaSaqla('slichitelniy.xlsx', bytes);
    expect(faylNomi).toBe('Объект_СЛИЧИТЕЛЬНАЯ_ВЕДОМОСТЬ_2026-09-25.xlsx');
    const t = hujjatTekshir(bytes);
    expect(t.taqiqlangan).toEqual([]);
    expect(t.dollarFormulalar).toEqual([]);
    expect(t.keshsizFormulalar).toEqual([]);
    expect(t.fullCalcOnLoad).toBe(true);
    const v = t.varaqlar[0];
    expect(v.a4 && v.bittaEnli && v.yonalish === 'landscape').toBe(true);
    expect(v.printTitles).toBeTruthy();
    expect(imzoRollariBormi(t, ['ЗАКАЗЧИК', 'ПОДРЯДЧИК', 'ТЕХНАДЗОР', 'СОСТАВИЛ']).yoq).toEqual([]);
    expect(t.matnlar).toEqual(expect.arrayContaining(['СЛИЧИТЕЛЬНАЯ ВЕДОМОСТЬ', 'ОТКЛОНЕНИЕ (ФАКТ − СМЕТА)', 'ВСЕГО ПО ОБЪЕКТУ', 'ИТОГО ПО РАЗДЕЛУ: СМЕТА № 01-01 ОЗЕРА']));
    const vsego = v.kataklar.find((k) => k.matn === 'ВСЕГО ПО ОБЪЕКТУ')!;
    const row = vsego.ref.replace(/^[A-Z]+/, '');
    expect(Number(v.kataklar.find((k) => k.ref === `M${row}`)?.v)).toBe(-3_500_000);
    expect(Number(v.kataklar.find((k) => k.ref === `G${row}`)?.v)).toBe(4_160_000);
  });

  it('H7: narx noma‘lum — summa va jamilar bo‘sh, diqqat ro‘yxatida', () => {
    const rows = QATOR.map((r) => (r.id === 4 ? { ...r, narx: null } : r));
    const m = slichitelniyModeli(rows, HOLAT);
    expect(m.jami.smeta).toBeNull();
    expect(m.diqqat).toHaveLength(1);
    const t = hujjatTekshir(slichitelniyHujjatXlsx(m, { obyektNomi: 'Объект', sana: '2026-09-25' }).bytes);
    expect(t.matnlar.some((s) => s.startsWith('ПОЗИЦИИ, ТРЕБУЮЩИЕ ВНИМАНИЯ (1)'))).toBe(true);
    expect(t.keshsizFormulalar).toEqual([]);
  });

  it('ostatkadan chiqarilgan ish izohda asosi bilan', () => {
    const m = slichitelniyModeli(QATOR, HOLAT, { istisnolar: [{ qatorId: 6, holat: 'tasdiqlangan', eskiHajm: 4, yangiHajm: 0, asos: 'изменение № ИЗМ-1 от 21.09.2026', sabab: 'исключено заказчиком' }] });
    expect(m.qatorlar.find((x) => x.id === 6)!.izoh).toContain('исключено из остатка: изменение № ИЗМ-1 от 21.09.2026; исключено заказчиком');
  });
});

describe('Сличительная ведомость — ikki narx', () => {
  it('выполнено и отклонение к оплате; podval 4 ustun; kesh = formula', () => {
    const rows = QATOR.map((r) => (r.tur === 'rs' ? { ...r, kat: 'ЧЕЛ' } : r.tur === 'mat' ? { ...r, kat: 'МАТ' } : r));
    const m = slichitelniyModeli(rows, HOLAT);
    const r = slichitelniyHujjatXlsx(m, { obyektNomi: 'Объект', sana: '2026-09-25', nakrutka: { ПРОЧИЕ_ПОДРЯДЧИК: 18, НДС: 12 } });
    namunaSaqla('slichitelniy_k_oplate.xlsx', r.bytes);
    // ЧЕЛ Kf = 1,18 × 1,12; МАТ Kf = 1,18 × 1,12 (transport/sklad 0 %).
    expect(r.kOplata.fakt).toBeCloseTo(660_000 * 1.18 * 1.12, 0);
    expect(r.kOplata.farq).toBeCloseTo(-3_500_000 * 1.18 * 1.12, 0);
    const t = hujjatTekshir(r.bytes);
    expect(t.keshsizFormulalar).toEqual([]);
    expect(t.taqiqlangan).toEqual([]);
  });
});

describe('Сличительная ведомость — tirik smeta (egasi 2026-09-30)', () => {
  it('resurs smeta hajmi = norma × ish hajmi formulasi', () => {
    const rows = QATOR.map((r) => (r.id === 3 ? { ...r, norma: 2 } : r));
    const m = slichitelniyModeli(rows, HOLAT);
    const t = hujjatTekshir(slichitelniyHujjatXlsx(m, { obyektNomi: 'Объект', sana: '2026-09-30' }).bytes);
    const v = t.varaqlar[0];
    const r = (nom: string) => v.kataklar.find((k) => k.matn === nom)!.ref.replace(/^[A-Z]+/, '');
    expect(v.kataklar.find((k) => k.ref === `E${r('ЗАТРАТЫ ТРУДА')}`)?.f).toBe(`ROUND(2*E${r('ЗАСЫПКА ПАЗУХ')},6)`);
  });
});
