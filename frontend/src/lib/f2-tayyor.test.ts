import { describe, expect, it } from 'vitest';
import type { T2Qator } from '../api/supabase';
import { bosKiritma, f2Jami, f2Qatorlar, f2Qur, f2Yuk, narxsizNomzodlar, ulushHajm, type F2Holat } from './f2-tayyor';

const q = (o: Partial<T2Qator> & { id: number; tur: string; norma?: number | null }): T2Qator => ({
  obyekt_id: 8, obyekt: null, kompaniya_id: 1, ota_id: null, daraja: 0, tartib: o.id, kod: null, nom: `q${o.id}`, birlik: 'м3',
  hajm: null, narx: null, summa: null, kat: null, narx_usul: null, qoshimcha: false, zamena: false,
  d1: null, d2: null, d3: null, xom_qator: null, yangilandi: null, manba_id: null, versiya: 1, ...o,
} as T2Qator);

// Bo'lim → ish (beton 10 m3) → ЧЕЛ (norma 2), МАШ (norma 0.5, smetada narxsiz), МАТ (norma 1.02, oldingi F2 narxi bor)
//        + ish ichidagi mustaqil material (mat) + bo'lim darajasidagi material
const rows = [
  q({ id: 1, tur: 'rz', nom: 'Poydevor' }),
  q({ id: 2, tur: 'bl', ota_id: 1, nom: 'Beton', hajm: 10 }),
  q({ id: 3, tur: 'rs', ota_id: 2, kat: 'ЧЕЛ', nom: 'Ishchi', birlik: 'чел.-ч', norma: 2, narx: 25000 }),
  q({ id: 4, tur: 'rs', ota_id: 2, kat: 'МАШ', nom: 'Kran', birlik: 'маш.-ч', norma: 0.5, narx: null }),
  q({ id: 5, tur: 'rs', ota_id: 2, kat: 'МАТ', nom: 'Beton B25', norma: 1.02, narx: 900000 }),
  q({ id: 6, tur: 'mat', ota_id: 2, kat: 'МАТ', nom: 'Armatura', birlik: 'т', narx: 9000000 }),
  q({ id: 7, tur: 'mat', ota_id: 1, kat: 'МАТ', nom: 'Gidroizolyatsiya', birlik: 'м2', narx: 50000 }),
  q({ id: 8, tur: 'bl', ota_id: 1, nom: 'Bajarilmagan ish', hajm: 5 }),
];
const holat: F2Holat[] = [
  { qator_id: 2, f2_mumkin_hajm: 6, f2_hajm: 4, smeta_hajm: 10 },
  { qator_id: 3, f2_mumkin_hajm: 12 }, { qator_id: 4, f2_mumkin_hajm: 3 }, { qator_id: 5, f2_mumkin_hajm: 6.12, f2_narx: 880000 },
  { qator_id: 6, f2_mumkin_hajm: 0.8 }, { qator_id: 7, f2_mumkin_hajm: 40 }, { qator_id: 8, f2_mumkin_hajm: 0 },
];

describe('F2 tayyorlash mantig‘i', () => {
  it('daraxt: faqat F2 olish mumkin bo‘lgan ishlar; rs avtomatik, mat mustaqil', () => {
    const b = f2Qur(rows, holat);
    expect(b).toHaveLength(1);
    expect(b[0].ishlar.map((x) => x.id)).toEqual([2]);
    expect(b[0].ishlar[0].resurslar.map((r) => [r.id, r.avto, r.taklifManba])).toEqual([[3, true, 'smeta'], [4, true, 'yoq'], [5, true, 'oldingi_f2'], [6, false, 'smeta']]);
    expect(b[0].alohida.map((r) => r.id)).toEqual([7]);
  });

  it('ish hajmi → resurslar hajm × norma, narx manbasi bilan, summa avtomatik', () => {
    const b = f2Qur(rows, holat);
    const k = bosKiritma(); k.hajm[2] = '6';
    expect(f2Qatorlar(b, k).find((x) => x.id === 4)?.xato).toBe('NARX');   // narxsiz — faqat ongli tanlov
    expect(narxsizNomzodlar(f2Qatorlar(b, k))).toEqual([4]);
    k.narxsiz[4] = true;
    const r = f2Qatorlar(b, k);
    expect(r.map((x) => [x.id, x.hajm, x.narx, x.summa, x.manba])).toEqual([
      [2, 6, null, null, 'yoq'], [3, 12, 25000, 300000, 'smeta'], [4, 3, null, null, 'yoq'], [5, 6.12, 880000, 5385600, 'oldingi_f2'],
    ]);
    expect(r[0].narxsiz && r[2].narxsiz).toBe(true);
    const j = f2Jami(r);
    expect(j).toMatchObject({ ish: 1, xato: 0, narxsiz: 1, summa: 5685600 });
    expect(j.kat).toEqual({ ЧЕЛ: 300000, МАТ: 5385600 });
  });

  it('fakt qoldig‘idan oshgan hajm — xato; smetadan oshgan jami — faqat ogohlantirish', () => {
    const b = f2Qur(rows, holat);
    const k = bosKiritma(); k.hajm[2] = '7';
    expect(f2Qatorlar(b, k)[0].xato).toBe('OSHDI');
    const b2 = f2Qur(rows, holat.map((h) => (h.qator_id === 2 ? { ...h, f2_mumkin_hajm: 8 } : h)));
    const r = f2Qatorlar(b2, Object.assign(bosKiritma(), { hajm: { 2: '7' }, narxsiz: { 4: true } }));
    expect(r[0].xato).toBeUndefined();
    expect(r[0].ogoh).toBe('SMETADAN_OSHDI');
    expect(r.find((x) => x.id === 4)).toMatchObject({ hajm: 3, ogoh: 'RESURS_CHEGARA' });   // 7 × 0.5 = 3.5 > 3 → chegara
  });

  it('qo‘lda narx/summa, mustaqil material, narxsiz → qayta narx', () => {
    const b = f2Qur(rows, holat);
    const k = bosKiritma();
    k.hajm[2] = '1'; k.narx[3] = '30000'; k.summa[5] = '900000'; k.narxsiz[4] = false; k.narx[4] = '120000';
    k.hajm[6] = '0,5'; k.hajm[7] = '40';
    const r = f2Qatorlar(b, k);
    const by = new Map(r.map((x) => [x.id, x]));
    expect(by.get(3)).toMatchObject({ hajm: 2, narx: 30000, summa: 60000, manba: 'qolda' });
    expect(by.get(4)).toMatchObject({ hajm: 0.5, narx: 120000, summa: 60000, manba: 'qolda', narxsiz: false });
    expect(by.get(5)).toMatchObject({ hajm: 1.02, summa: 900000, ogoh: 'ARIFMETIKA' });
    expect(by.get(6)).toMatchObject({ hajm: 0.5, narx: 9000000, summa: 4500000 });
    expect(by.get(7)).toMatchObject({ hajm: 40, summa: 2000000, ishId: null });
  });

  it('smetada aniq 0 narx (mashinist mehnati) — 0 summa, narxsiz emas', () => {
    const r0 = rows.map((x) => (x.id === 4 ? { ...x, narx: 0 } : x));
    const r = f2Qatorlar(f2Qur(r0, holat), Object.assign(bosKiritma(), { hajm: { 2: '2' } }));
    expect(r.find((x) => x.id === 4)).toMatchObject({ hajm: 1, narx: 0, summa: 0, manba: 'smeta', narxsiz: false });
    expect(f2Jami(r).xato).toBe(0);
  });

  it('server yuki: ish narxsiz, resurs hujjat narxi bilan, manba — hujjat raqami', () => {
    const b = f2Qur(rows, holat);
    const y = f2Yuk(f2Qatorlar(b, Object.assign(bosKiritma(), { hajm: { 2: '6' }, narxsiz: { 4: true } })), '12');
    expect(y[0]).toMatchObject({ qatorId: 2, certifiedQuantity: 6, priceIntentionallyAbsent: true, certifiedUnitPrice: undefined });
    expect(y[1]).toMatchObject({ qatorId: 3, certifiedUnitPrice: 25000, certifiedAmount: 300000, priceIntentionallyAbsent: false });
    expect(y[0].rawSnapshot.sourceReference).toBe('Ф-2 № 12');
    expect(y[1].rawSnapshot.sourceReference).toBe('Ф-2 № 12; цена по смете');
    expect(ulushHajm(6, 50)).toBe('3');
  });
});
