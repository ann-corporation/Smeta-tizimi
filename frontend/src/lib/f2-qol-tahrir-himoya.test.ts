/**
 * Qo'lda tahrir himoyasi (2026-11-18): qoralamadagi qo'lda hajm/narx «F2 qoralamani yangilash» da smeta normasiga/narxiga
 * qaytib ketmasin. Sintetik sonlar (haqiqiy summa/ism yo'q).
 */
import { describe, expect, it } from 'vitest';
import type { T2Qator } from '../api/supabase';
import { aktdanKiritma } from './f2-akt-kiritma';
import { f2Qatorlar, f2Qur, f2Yuk, olibniQaytar, olibTashlanganlar, qolniQaytar, type F2Holat } from './f2-tayyor';

const q = (id: number, tur: string, ota: number | null, kat: string | null, extra: Record<string, unknown> = {}) =>
  ({ id, obyekt_id: 1, tur, ota_id: ota, kat, nom: `q${id}`, birlik: 'x', tartib: id, versiya_holat: 'faol', hajm: 1, ...extra }) as unknown as T2Qator;
const smeta: T2Qator[] = [
  q(1, 'rz', null, null),
  q(20, 'bl', 1, null, { hajm: 1000 }),
  q(21, 'rs', 20, 'МАТ', { norma: 0.3, narx: 100 }), // qo'lda nisbat qo'yiladigan resurs
  q(22, 'rs', 20, 'МАТ', { norma: 2, narx: 10 }),    // oddiy (qo'lda emas) resurs
];
const holat: F2Holat[] = [20, 21, 22].map((id) => ({ qator_id: id, f2_mumkin_hajm: 100000 }));
const band = (qator_id: number, hajm: number, narx: number | null, qol?: Record<string, unknown>) => ({
  qator_id, hajm, certified_quantity: hajm, certified_unit_price: narx, certified_amount: narx == null ? null : hajm * narx,
  provenance_status: 'source_certified', raw_snapshot: qol ? { qolTahrir: qol } : {} });

/** Qoralama: ish 100; resurs 21 qo'lda 0,5 nisbat (50) va qo'lda narx 100 (= smeta narxi); resurs 22 norma bo'yicha (200). */
const akt = [band(20, 100, null), band(21, 50, 100, { hajm: true, narx: true }), band(22, 200, 10)];

const qur = (aktBand: typeof akt) => {
  const bolimlar = f2Qur(smeta, holat);
  const { k } = aktdanKiritma(aktBand, bolimlar);
  return { bolimlar, k, qator: f2Qatorlar(bolimlar, k).filter((x) => !x.xato) };
};

describe('qo\'lda tahrir himoyasi', () => {
  it('belgili resurs hajmi yangilashda smeta normasiga (100 × 0,3 = 30) qaytmaydi — qo\'lda nisbat (0,5) saqlanadi', () => {
    const { qator } = qur(akt);
    expect(qator.find((x) => x.id === 21)?.hajm).toBeCloseTo(50, 6);
    expect(qator.find((x) => x.id === 21)?.qol).toMatchObject({ hajm: true, norma: 0.5 });
    expect(qator.find((x) => x.id === 22)?.hajm).toBeCloseTo(200, 6); // belgisiz — norma bo'yicha
    expect(qator.find((x) => x.id === 22)?.qol).toBeUndefined();
  });

  it('belgisiz holat (eski xulq): avtomatik resurs normadan qayta hisoblanadi', () => {
    const { qator } = qur([band(20, 100, null), band(21, 50, 100), band(22, 200, 10)]);
    expect(qator.find((x) => x.id === 21)?.hajm).toBeCloseTo(30, 6);
  });

  it('ish hajmi o\'zgarsa qo\'lda nisbat proporsional ergashadi (200 × 0,5 = 100); oddiy resurs normasi bilan', () => {
    const { bolimlar, k } = qur(akt);
    const k2 = { ...k, hajm: { ...k.hajm, 20: '200' } };
    const qator = f2Qatorlar(bolimlar, k2);
    expect(qator.find((x) => x.id === 21)?.hajm).toBeCloseTo(100, 6);
    expect(qator.find((x) => x.id === 22)?.hajm).toBeCloseTo(400, 6);
  });

  it('qo\'lda narx taklif narxiga (smeta) teng bo\'lsa ham kiritmada saqlanadi va qayta yozishda belgi yo\'qolmaydi', () => {
    const { k, qator } = qur(akt);
    expect(k.narx[21]).toBe('100');
    const yuk = f2Yuk(qator, '', 'fakt');
    const r21 = yuk.find((y) => y.qatorId === 21)!;
    expect((r21.rawSnapshot as { qolTahrir?: unknown }).qolTahrir).toMatchObject({ hajm: true, narx: true, norma: 0.5 });
    // yuk → yana akt qatori → yana yuklash: barqaror (ikkinchi yangilashda ham o'zgarmaydi)
    const aktQayta = yuk.map((y) => ({ qator_id: y.qatorId, hajm: y.certifiedQuantity, certified_quantity: y.certifiedQuantity,
      certified_unit_price: y.certifiedUnitPrice ?? null, certified_amount: y.certifiedAmount ?? null, provenance_status: 'source_certified', raw_snapshot: y.rawSnapshot }));
    expect(f2Qatorlar(...(() => { const b = f2Qur(smeta, holat); return [b, aktdanKiritma(aktQayta, b).k] as const; })()).find((x) => x.id === 21)?.hajm).toBeCloseTo(50, 6);
  });

  it('«Smeta normasiga qaytarish» qo\'lda nisbat va narxni olib tashlaydi — hajm yana ish × norma', () => {
    const { bolimlar, k } = qur(akt);
    const qaytdi = f2Qatorlar(bolimlar, qolniQaytar(k, [21]));
    const x = qaytdi.find((y) => y.id === 21)!;
    expect(x.hajm).toBeCloseTo(30, 6);
    expect(x.qol).toBeUndefined();
    expect(qaytdi.find((y) => y.id === 22)?.hajm).toBeCloseTo(200, 6);
  });
});

describe('olib tashlangan qatorlar (tombstone)', () => {
  const smeta2: T2Qator[] = [...smeta, q(23, 'rs', 20, 'МАТ', { norma: 1, narx: 5 })];
  const holat2: F2Holat[] = [20, 21, 22, 23].map((id) => ({ qator_id: id, f2_mumkin_hajm: 100000 }));
  const bandOlib = (olib?: number[]) => band(20, 100, null, olib ? { olib } : undefined);
  const qur2 = (aktBand: ReturnType<typeof band>[]) => { const bolimlar = f2Qur(smeta2, holat2); const { k } = aktdanKiritma(aktBand, bolimlar); return { bolimlar, k, qator: f2Qatorlar(bolimlar, k).filter((x) => !x.xato) }; };
  const aktOlib = (olib?: number[]) => [bandOlib(olib), band(21, 30, 100), band(22, 200, 10)]; // 23-resurs aktda yo'q

  it('belgisiz: olib tashlangan resurs yangilashda qayta paydo bo\'ladi (xavf isboti)', () => {
    expect(qur2(aktOlib()).qator.some((x) => x.id === 23)).toBe(true);
  });
  it('tombstone bor: resurs qayta paydo bo\'lmaydi, qolganlar saqlanadi', () => {
    const { qator, k, bolimlar } = qur2(aktOlib([23]));
    expect(qator.some((x) => x.id === 23)).toBe(false);
    expect(qator.map((x) => x.id).sort()).toEqual([20, 21, 22]);
    expect(olibTashlanganlar(bolimlar, k).map((x) => x.id)).toEqual([23]);
  });
  it('ish hajmi o\'zgarsa ham qaytmaydi; yozishda ota ish qatori tombstone ni saqlaydi (ikkinchi yangilashda ham)', () => {
    const { qator, k, bolimlar } = qur2(aktOlib([23]));
    const k2 = { ...k, hajm: { ...k.hajm, 20: '500' } };
    expect(f2Qatorlar(bolimlar, k2).some((x) => x.id === 23)).toBe(false);
    const yuk = f2Yuk(qator, '', 'fakt');
    expect((yuk.find((y) => y.qatorId === 20)!.rawSnapshot as { qolTahrir?: { olib?: number[] } }).qolTahrir?.olib).toEqual([23]);
    const aktQayta = yuk.map((y) => ({ qator_id: y.qatorId, hajm: y.certifiedQuantity, certified_quantity: y.certifiedQuantity,
      certified_unit_price: y.certifiedUnitPrice ?? null, certified_amount: y.certifiedAmount ?? null, provenance_status: 'source_certified', raw_snapshot: y.rawSnapshot }));
    const b = f2Qur(smeta2, holat2);
    expect(f2Qatorlar(b, aktdanKiritma(aktQayta, b).k).some((x) => x.id === 23)).toBe(false);
  });
  it('«Qaytarish»: tombstone olinadi — resurs yana ish × norma bilan tushadi', () => {
    const { k, bolimlar } = qur2(aktOlib([23]));
    const x = f2Qatorlar(bolimlar, olibniQaytar(k, [23])).find((y) => y.id === 23);
    expect(x?.hajm).toBeCloseTo(100, 6);
  });
  it('resurs aktda bor bo\'lsa eskirgan tombstone e\'tiborga olinmaydi', () => {
    expect(qur2([bandOlib([23]), band(21, 30, 100), band(22, 200, 10), band(23, 100, 5)]).qator.some((x) => x.id === 23)).toBe(true);
  });
});