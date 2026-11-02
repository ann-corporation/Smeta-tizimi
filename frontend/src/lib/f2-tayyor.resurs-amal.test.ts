import { describe, expect, it } from 'vitest';
import type { T2Qator } from '../api/supabase';
import { bosKiritma, f2Qatorlar, f2Qur, f2Yuk, f2ZamenaQolla, ishBirlikNarxi, type F2Holat, type F2ZamenaKontekst } from './f2-tayyor';

/** Egasi 2026-10-27: faktli ish ichidagi resurs zamenasi (asl yopiladi) va ishdan chiqarish (F2 ga kirmaydi). */
const q = (o: Partial<T2Qator> & { id: number; tur: string; norma?: number | null }): T2Qator => ({
  obyekt_id: 8, obyekt: null, kompaniya_id: 1, ota_id: null, daraja: 0, tartib: o.id, kod: null, nom: `q${o.id}`, birlik: 'м3',
  hajm: null, narx: null, summa: null, kat: null, narx_usul: null, qoshimcha: false, zamena: false,
  d1: null, d2: null, d3: null, xom_qator: null, yangilandi: null, manba_id: null, versiya: 1, ...o,
} as T2Qator);

// Ish 10 m3: mehnat (norma 2), kran (norma 0.5), qum (rs, norma 1.2 т), armatura (mat, mustaqil 0.8 т);
// qum zamenasi — shag'al (id 20, tartibi oxirida, lekin asl yonida turishi kerak).
const rows = [
  q({ id: 1, tur: 'rz', nom: 'Poydevor' }),
  q({ id: 2, tur: 'bl', ota_id: 1, nom: 'Beton', hajm: 10 }),
  q({ id: 3, tur: 'rs', ota_id: 2, kat: 'ЧЕЛ', nom: 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', birlik: 'чел.-ч', norma: 2, hajm: 20, narx: 25000 }),
  q({ id: 4, tur: 'rs', ota_id: 2, kat: 'МАШ', nom: 'Kran', birlik: 'маш.-ч', norma: 0.5, hajm: 5, narx: 300000 }),
  q({ id: 5, tur: 'rs', ota_id: 2, kat: 'МАТ', nom: 'Qum', birlik: 'т', norma: 1.2, hajm: 12, narx: 100000 }),
  q({ id: 6, tur: 'mat', ota_id: 2, kat: 'МАТ', nom: 'Armatura', birlik: 'т', hajm: 0.8, narx: 9000000 }),
  q({ id: 20, tur: 'rs', ota_id: 2, kat: 'МАТ', nom: 'Shag‘al', birlik: 'т', norma: 1.2, hajm: 12, narx: 120000, zamena: true, qoshimcha: true }),
];
const holat: F2Holat[] = [
  { qator_id: 2, f2_mumkin_hajm: 10, smeta_hajm: 10 },
  { qator_id: 3, f2_mumkin_hajm: 20, smeta_hajm: 20 }, { qator_id: 4, f2_mumkin_hajm: 5, smeta_hajm: 5 },
  { qator_id: 5, f2_mumkin_hajm: 12, smeta_hajm: 12 }, { qator_id: 6, f2_mumkin_hajm: 0.8, smeta_hajm: 0.8 },
  { qator_id: 20, f2_mumkin_hajm: 12, smeta_hajm: 12 },
];
const zamenaAsl = new Map([[20, 5]]);
const ktx = (o: Partial<F2ZamenaKontekst> = {}): F2ZamenaKontekst => ({
  rows: rows.map((r) => ({ id: r.id, ota_id: r.ota_id, tur: r.tur, birlik: r.birlik, hajm: r.hajm })),
  zamenaAsl, miqdor: new Map(), oldingi: new Map(), serverAlm: new Map(), ...o,
});

describe('F2 tayyorlash: ishdan chiqarilgan resurs', () => {
  it('chiqarilgan avto resurs (kran) va mustaqil material F2 ga KIRMAYDI; qolganlari o‘zgarmaydi', () => {
    const b = f2Qur(rows, holat, undefined, 'fakt', undefined, { chiqarilgan: new Set([4, 6]), zamenaAsl });
    const ish = b[0].ishlar[0];
    expect(ish.resurslar.find((r) => r.id === 4)).toMatchObject({ chiqarilgan: true, mumkin: 0 });
    const k = bosKiritma(); k.hajm[2] = '10'; k.hajm[6] = '0.8'; // operator mustaqil hajmni yozgan bo'lsa ham
    const qs = f2Qatorlar(b, k);
    expect(qs.map((x) => x.id)).not.toContain(4);
    expect(qs.map((x) => x.id)).not.toContain(6);
    expect(qs.find((x) => x.id === 3)?.hajm).toBe(20);
    expect(f2Yuk(qs, '1').map((x) => x.qatorId)).not.toContain(4);
    // Ish birlik narxi chiqarilgan resurssiz: 2×25000 + 1.2×100000 + 1.2×120000
    expect(ishBirlikNarxi(ish).summa).toBe(314000);
  });

  it('kontekstsiz (eski chaqiruv) — xatti-harakat o‘zgarmaydi', () => {
    const qs = f2Qatorlar(f2Qur(rows, holat), Object.assign(bosKiritma(), { hajm: { 2: '10' } }));
    expect(qs.map((x) => x.id).sort((a, c) => a - c)).toEqual([2, 3, 4, 5, 20]);
  });

  it('hamma resurslari chiqarilgan, ishning o‘zi qoldig‘i yo‘q mustaqil material — ish ro‘yxatga kirmaydi', () => {
    const h2: F2Holat[] = holat.map((x) => (x.qator_id === 2 ? { ...x, f2_mumkin_hajm: 0 } : x));
    expect(f2Qur(rows, h2, undefined, 'fakt', undefined, { chiqarilgan: new Set([6]) })).toHaveLength(0);
    expect(f2Qur(rows, h2, undefined, 'fakt', undefined, {})).toHaveLength(1);
  });
});

describe('F2 tayyorlash: resurs zamenasi — asl hajmi zamena hajmiga qarab yopiladi', () => {
  it('zamena asl resurs yonida turadi', () => {
    const b = f2Qur(rows, holat, undefined, 'fakt', undefined, { zamenaAsl });
    expect(b[0].ishlar[0].resurslar.map((r) => r.id)).toEqual([3, 4, 5, 20, 6]);
    expect(b[0].ishlar[0].resurslar.find((r) => r.id === 20)).toMatchObject({ zamena: true, almashtiradi: 5 });
  });

  it('birlik bir xil → 1:1: zamena to‘liq qoplasa asl F2 dan tushadi (ikki marta olinmaydi)', () => {
    const b = f2Qur(rows, holat, undefined, 'fakt', undefined, { zamenaAsl });
    const k = bosKiritma(); k.hajm[2] = '5';
    const xom = f2Qatorlar(b, k);
    expect(xom.find((x) => x.id === 5)?.hajm).toBe(6);
    const n = f2ZamenaQolla(xom, b, k, ktx());
    expect(n.qatorlar.map((x) => x.id)).not.toContain(5);
    expect(n.qatorlar.find((x) => x.id === 20)?.hajm).toBe(6);
    expect(n.yopildi.get(5)).toBe(6);
    expect(n.tashlandi.has(5)).toBe(true);
  });

  it('almashtirish_hajm bo‘lsa — proporsional: asl qisman yopiladi, summa qayta hisoblanadi', () => {
    const b = f2Qur(rows, holat, undefined, 'fakt', undefined, { zamenaAsl });
    const k = bosKiritma(); k.hajm[2] = '5';
    const xom = f2Qatorlar(b, k);
    // Zamena to'liq (12 т) aslning 4 т sini almashtiradi → shu F2 (6 т) → 6/12×4 = 2 т yopiladi.
    const n = f2ZamenaQolla(xom, b, k, ktx({ miqdor: new Map([[20, 4]]) }));
    const asl = n.qatorlar.find((x) => x.id === 5)!;
    expect(asl.hajm).toBe(4);
    expect(asl.summa).toBe(400000);
    expect(n.yopildi.get(5)).toBe(2);
    expect(n.tashlandi.size).toBe(0);
  });

  it('birlik farqli, miqdorsiz — zamenaning bajarilgan ulushida yopiladi', () => {
    const r2 = rows.map((r) => (r.id === 20 ? { ...r, birlik: 'м3', hajm: 8, norma: 0.8 } : r));
    const h2 = holat.map((x) => (x.qator_id === 20 ? { ...x, f2_mumkin_hajm: 8, smeta_hajm: 8 } : x));
    const b = f2Qur(r2, h2, undefined, 'fakt', undefined, { zamenaAsl });
    const k = bosKiritma(); k.hajm[2] = '5';
    const xom = f2Qatorlar(b, k); // zamena 4 м3 (ulush 4/8 = 0.5) → asl 12 т × 0.5 = 6 т yopiladi
    const n = f2ZamenaQolla(xom, b, k, { ...ktx(), rows: r2.map((r) => ({ id: r.id, ota_id: r.ota_id, tur: r.tur, birlik: r.birlik, hajm: r.hajm })) });
    expect(n.qatorlar.map((x) => x.id)).not.toContain(5);
    expect(n.yopildi.get(5)).toBe(6);
  });

  it('zamena F2 da yo‘q yoki kontekst yo‘q — hech narsa o‘zgarmaydi', () => {
    const b = f2Qur(rows, holat, undefined, 'fakt', undefined, { zamenaAsl, chiqarilgan: new Set([20]) });
    const k = bosKiritma(); k.hajm[2] = '5';
    const xom = f2Qatorlar(b, k);
    expect(f2ZamenaQolla(xom, b, k, ktx()).qatorlar).toBe(xom);
    expect(f2ZamenaQolla(xom, b, k, null).qatorlar).toBe(xom);
  });

  it('server allaqachon yopgan qism hisobga olinadi (qoldiqdan oshmaydi)', () => {
    const b = f2Qur(rows, holat, undefined, 'fakt', undefined, { zamenaAsl });
    const k = bosKiritma(); k.hajm[2] = '5';
    const xom = f2Qatorlar(b, k);
    // Aslning 10 t i oldingi davrlarda zamena bilan yopilgan → qolgan 2 т gina yopiladi.
    const n = f2ZamenaQolla(xom, b, k, ktx({ serverAlm: new Map([[5, 10]]) }));
    expect(n.yopildi.get(5)).toBe(2);
    expect(n.qatorlar.find((x) => x.id === 5)?.hajm).toBe(4);
  });
});
