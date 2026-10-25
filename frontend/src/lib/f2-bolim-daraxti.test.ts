import { describe, expect, it } from 'vitest';
import type { T2Qator } from '../api/supabase';
import { bosKiritma, f2Jami, f2Qatorlar, f2Qur, ishBirlikNarxi, type F2Holat } from './f2-tayyor';
import { avlodKalitlari, bolimTuguni, f2BolimIerarxiya, f2Uchastkalar, korinadiganTugunlar } from './f2-bolim-daraxti';

const q = (o: Partial<T2Qator> & { id: number; tur: string; norma?: number | null }): T2Qator => ({
  obyekt_id: 8, obyekt: null, kompaniya_id: 1, ota_id: null, daraja: 0, tartib: o.id, kod: null, nom: `q${o.id}`, birlik: 'м3',
  hajm: null, narx: null, summa: null, kat: null, narx_usul: null, qoshimcha: false, zamena: false,
  d1: null, d2: null, d3: null, xom_qator: null, yangilandi: null, manba_id: null, versiya: 1, ...o,
} as T2Qator);

// Ikki uchastka (fayl), ikkalasida bir xil nomli «2.ЗЕМЛЯНЫЕ РАБОТЫ .» ichki razdeli.
const U1 = '1уч-к.5.05.xlsx — 4230_БВ';
const U2 = '2уч-к.5.05.xlsx — 4240_БВ';
const RZ = '2.ЗЕМЛЯНЫЕ РАБОТЫ .';
const rows = [
  q({ id: 1, tur: 'rz', nom: U1 }),
  q({ id: 2, tur: 'rz', ota_id: 1, nom: 'РАЗДЕЛ 1.ЗЕМЛЯНЫЕ' }),
  q({ id: 3, tur: 'rz', ota_id: 2, nom: RZ }),
  q({ id: 4, tur: 'bl', ota_id: 3, nom: 'Выемка', hajm: 10 }),
  q({ id: 5, tur: 'rs', ota_id: 4, kat: 'ЧЕЛ', nom: 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', norma: 2, narx: 1000 }),
  q({ id: 6, tur: 'rs', ota_id: 4, kat: 'МАШ', nom: 'ЗАТРАТЫ ТРУДА МАШИНИСТОВ', norma: 1, narx: null }),
  q({ id: 7, tur: 'rz', nom: U2 }),
  q({ id: 8, tur: 'rz', ota_id: 7, nom: RZ }),
  q({ id: 9, tur: 'bl', ota_id: 8, nom: 'Засыпка', hajm: 5 }),
  q({ id: 10, tur: 'rz', nom: 'Бўш уч-к' }),
];
const holat: F2Holat[] = [
  { qator_id: 4, f2_mumkin_hajm: 10, smeta_hajm: 10 }, { qator_id: 5, f2_mumkin_hajm: 20 }, { qator_id: 6, f2_mumkin_hajm: 10 },
  { qator_id: 9, f2_mumkin_hajm: 5, smeta_hajm: 5 },
];

describe('F2 bo‘limlar to‘liq daraxti', () => {
  const b = f2Qur(rows, holat);
  const ier = f2BolimIerarxiya(rows, b);

  it('yo‘l: uchastka › razdel › ichki razdel; bir xil nomli razdellar ildizi bilan ajraladi', () => {
    expect(bolimTuguni(ier, 3)?.yol).toEqual([U1, 'РАЗДЕЛ 1.ЗЕМЛЯНЫЕ', RZ]);
    expect(bolimTuguni(ier, 8)?.yol).toEqual([U2, RZ]);
    expect(bolimTuguni(ier, 3)?.ildizNom).toBe(U1);
    expect(bolimTuguni(ier, 8)?.ildizNom).toBe(U2);
    expect(bolimTuguni(ier, 3)?.ildiz).not.toBe(bolimTuguni(ier, 8)?.ildiz);
  });

  it('ichida ish yo‘q razdel daraxtdan chiqariladi; sanoq avlodlar bilan', () => {
    expect(ier.byKalit.has(10)).toBe(false);
    const u1 = ier.byKalit.get(1)!;
    expect(u1.jami).toBe(1); expect(u1.mumkin).toBe(1);
    expect(u1.summa).toBe(20000);
  });

  it('istalgan daraja bosilganda barcha avlod ishlari (bo‘sh emas)', () => {
    const av = avlodKalitlari(ier, 1);
    expect([...av].sort((a, c) => a - c)).toEqual([1, 2, 3]);
    expect(b.filter((x) => av.has(x.id ?? -1)).flatMap((x) => x.ishlar.map((i) => i.id))).toEqual([4]);
    expect(b.filter((x) => avlodKalitlari(ier, 7).has(x.id ?? -1)).flatMap((x) => x.ishlar.map((i) => i.id))).toEqual([9]);
  });

  it('ko‘rinadigan tugunlar: yig‘iq ildizlar, ochilganda farzandlar; faqatMumkin filtri', () => {
    expect(korinadiganTugunlar(ier, new Set(), null).map((x) => x.kalit)).toEqual([1, 7]);
    expect(korinadiganTugunlar(ier, new Set([1]), null).map((x) => x.kalit)).toEqual([1, 2, 7]);
    expect(korinadiganTugunlar(ier, new Set(), 3).map((x) => x.kalit)).toEqual([1, 2, 3, 7]);
    expect(korinadiganTugunlar(ier, new Set(), null, true).map((x) => x.kalit)).toEqual([1, 7]);
  });

  it('turli uchastka ishlari aralashsa - ogohlantirish ro‘yxati', () => {
    const k = bosKiritma(); k.hajm[4] = '10';
    const qb = new Map<number, number | null>([[4, 3], [9, 8]]);
    expect(f2Uchastkalar(f2Qatorlar(b, k), ier, qb)).toHaveLength(1);
    k.hajm[9] = '5';
    const u = f2Uchastkalar(f2Qatorlar(b, k), ier, qb);
    expect(u.map((x) => [x.nom, x.soni])).toEqual([[U1, 1], [U2, 1]]);
  });

  it('ЗАТРАТЫ ТРУДА МАШИНИСТОВ: narx-yo‘q hisobiga va ogohlantirishga kirmaydi, F2 ni to‘smaydi', () => {
    expect(ishBirlikNarxi(b[0].ishlar[0]).narxsiz).toBe(0);
    const k = bosKiritma(); k.hajm[4] = '10';
    const qs = f2Qatorlar(b, k);
    const m = qs.find((x) => x.id === 6)!;
    expect(m.xato).toBeUndefined(); expect(m.narxsiz).toBe(true);
    const j = f2Jami(qs);
    expect(j.narxsiz).toBe(0); expect(j.ogoh).toBe(0); expect(j.xato).toBe(0);
  });
});
