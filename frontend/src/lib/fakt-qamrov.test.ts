import { describe, expect, it } from 'vitest';
import type { T2Qator } from '../api/supabase';
import { jurnalQur, type JurnalHolat } from './fakt-jurnal';
import { foizOqi, markirovkaIshlari, qamrovBolaklari, qamrovJami, qamrovReja } from './fakt-qamrov';
import { bolimIshlariYigish } from './fakt-f2-tenglash';

const q = (o: Partial<T2Qator> & { id: number; tur: string }): T2Qator => ({
  obyekt_id: 1, obyekt: null, kompaniya_id: 1, ota_id: null, daraja: 0, tartib: o.id, kod: null, nom: `q${o.id}`, birlik: 'м3',
  hajm: null, narx: null, summa: null, kat: null, narx_usul: null, qoshimcha: false, zamena: false,
  d1: null, d2: null, d3: null, xom_qator: null, yangilandi: null, manba_id: null, versiya: 1, ...o,
} as T2Qator);

// 1 Ko'l → 1.1 Tub (ichki bo'lim). Ishlar: 10 (rs+mat bolali), 20 (faktli), 30 (chegirma), 40 (alohida mat, narxsiz), 50 (ichki bo'limda).
const rows = [
  q({ id: 1, tur: 'rz', nom: 'Ko‘l' }),
  q({ id: 10, tur: 'bl', ota_id: 1, hajm: 100 }),
  q({ id: 11, tur: 'rs', ota_id: 10, hajm: 50, kat: 'ЧЕЛ' }),
  q({ id: 12, tur: 'mat', ota_id: 10, hajm: 20, kat: 'МАТ' }),
  q({ id: 20, tur: 'bl', ota_id: 1, hajm: 10 }),
  q({ id: 30, tur: 'bl', ota_id: 1, hajm: -4 }),
  q({ id: 40, tur: 'mat', ota_id: 1, hajm: 8, kat: 'МАТ' }),
  q({ id: 2, tur: 'rz', ota_id: 1, daraja: 1, nom: 'Tub' }),
  q({ id: 50, tur: 'bl', ota_id: 2, hajm: 6 }),
  q({ id: 60, tur: 'bl', ota_id: 2, hajm: null }),
];
const states: JurnalHolat[] = [
  { qator_id: 10, smeta_hajm: 100, fakt_hajm: 0 },
  { qator_id: 11, smeta_hajm: 50, fakt_hajm: 0, smeta_summa: 5000 },
  { qator_id: 12, smeta_hajm: 20, fakt_hajm: 0, smeta_narx: 10 },
  { qator_id: 20, smeta_hajm: 10, fakt_hajm: 4, almashtirilgan_hajm: 2 },
  { qator_id: 30, smeta_hajm: -4, fakt_hajm: 0 },
  { qator_id: 40, smeta_hajm: 8, fakt_hajm: 0 },
  { qator_id: 50, smeta_hajm: 6, fakt_hajm: 6 },
];

function qamrov(baj?: Map<number, number>) {
  const { bolimlar, bolimIshlari } = jurnalQur(rows, states, null, baj);
  const bolalar = new Map<number, number[]>();
  for (const b of bolimlar) if (b.otaId != null) bolalar.set(b.otaId, [...(bolalar.get(b.otaId) ?? []), b.id]);
  return bolimIshlariYigish(1, bolimIshlari, bolalar, true);
}
const holat = new Map(states.map((s) => [s.qator_id, s]));

describe('qamrov % (Tiklash rejimi)', () => {
  it('bo‘lim avlodlari bilan: foiz × ochiq qoldiq; rs yozilmaydi; yopiq va smetasiz sanaladi', () => {
    const r = qamrovReja(qamrov(new Map([[20, 1]])), 100, holat);
    expect(r.qatorlar.map((x) => [x.id, x.hajm])).toEqual([[10, 100], [12, 20], [20, 3], [30, -4], [40, 8]]);
    expect(r.yopiq).toBe(1);     // 50: to'liq faktli
    expect(r.smetasiz).toBe(1);  // 60: smeta NULL
  });
  it('70%: ochiq qoldiqning 70% i; chegirma ham shu foizda (manfiy)', () => {
    const r = qamrovReja(qamrov(), 70, holat);
    expect(Object.fromEntries(r.qatorlar.map((x) => [x.id, x.hajm]))).toEqual({ 10: 70, 12: 14, 20: 2.8, 30: -2.8, 40: 5.6 });
  });
  it('istisnolar belgilanadi (avtomatik tashlanmaydi)', () => {
    const r = qamrovReja(qamrov(new Map([[20, 1]])), 100, holat);
    const ist = Object.fromEntries(r.qatorlar.map((x) => [x.id, x.istisnolar]));
    expect(ist[10]).toEqual([]);
    expect(ist[20]).toEqual(['faktli', 'zamenalangan', 'bajarilmaydi']);
    expect(ist[30]).toEqual(['chegirma']);
    expect(ist[40]).toEqual(['narxsiz']);
  });
  it('summa: ish — rs smeta summasi ulushi, mat — hajm × narx; narxsiz NULL (0 emas)', () => {
    const r = qamrovReja(qamrov(), 50, holat);
    const s = Object.fromEntries(r.qatorlar.map((x) => [x.id, x.summa]));
    expect(s[10]).toBe(2500);
    expect(s[12]).toBe(100);
    expect(s[40]).toBeNull();
    const j = qamrovJami(r, new Set());
    expect(j.ustamasiz).toBe(2600 + (s[20] ?? 0) + (s[30] ?? 0));
    expect(j.narxsiz).toBe(1);
    expect(j.kesim.summasizSoni).toBeGreaterThanOrEqual(1);
  });
  it('ichki resurslarsiz rejim; olib tashlangan ish — ichki resurslari ham tushadi', () => {
    expect(qamrovReja(qamrov(), 100, holat, { ichkiResurslar: false }).qatorlar.map((x) => x.id)).not.toContain(12);
    const r = qamrovReja(qamrov(), 100, holat);
    const j = qamrovJami(r, new Set([10, 40]));
    expect(j.paket.map((x) => x.qator_id)).toEqual([20, 30]);
  });
  it('bo‘laklash va foiz o‘qish', () => {
    expect(qamrovBolaklari([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(foizOqi('70%')).toBe(70);
    expect(foizOqi('12,5')).toBe(12.5);
    expect(foizOqi('0')).toBeNull();
    expect(foizOqi('abc')).toBeNull();
  });
});

describe('JQA-03: 100% oshgan faktni kamaytirmaydi; markirovka qamrovi', () => {
  const r2 = [
    q({ id: 1, tur: 'rz' }),
    q({ id: 10, tur: 'bl', ota_id: 1, hajm: 100, kat: 'МАТ' }),
    q({ id: 11, tur: 'bl', ota_id: 1, hajm: 100, kat: 'МАТ' }),
    q({ id: 12, tur: 'bl', ota_id: 1, hajm: -10, kat: 'МАТ' }),
    q({ id: 13, tur: 'bl', ota_id: 1, hajm: 50, kat: 'ЧЕЛ' }),
    q({ id: 14, tur: 'mat', ota_id: 13, hajm: 5, kat: 'МАТ' }),
    q({ id: 15, tur: 'mat', ota_id: 13, hajm: 5, kat: 'ОБ' }),
    q({ id: 30, tur: 'bl', ota_id: null, hajm: 8, kat: 'МАТ' }), // bo'limsiz ish
  ];
  const s2: JurnalHolat[] = [
    { qator_id: 10, smeta_hajm: 100, fakt_hajm: 120 }, { qator_id: 11, smeta_hajm: 100, fakt_hajm: 40 },
    { qator_id: 12, smeta_hajm: -10, fakt_hajm: -12 }, { qator_id: 13, smeta_hajm: 50, fakt_hajm: 0 },
    { qator_id: 14, smeta_hajm: 5, fakt_hajm: 0 }, { qator_id: 15, smeta_hajm: 5, fakt_hajm: 0 }, { qator_id: 30, smeta_hajm: 8, fakt_hajm: 0 },
  ];
  const h2 = new Map(s2.map((s) => [s.qator_id, s]));
  it('markirovka: mos ishlar, mos bo‘lmagan ish ichidagi mos resurs alohida, bo‘limsiz ish ham', () => {
    const j = jurnalQur(r2, s2);
    expect(markirovkaIshlari(j.bolimIshlari, 'МАТ', j.ildizIshlari).map((x) => x.id)).toEqual([10, 11, 12, 14, 30]);
  });
  it('120/100 va chegirmadagi oshgan (-12/-10) — yozilmaydi, oshganlar ro‘yxatida tuzatish deltasi bilan', () => {
    const j = jurnalQur(r2, s2);
    const r = qamrovReja(markirovkaIshlari(j.bolimIshlari, 'МАТ', j.ildizIshlari), 100, h2);
    expect(r.qatorlar.map((x) => [x.id, x.hajm])).toEqual([[11, 60], [14, 5], [30, 8]]);
    expect(r.qatorlar.every((x) => x.hajm > 0)).toBe(true);
    expect(r.oshganlar.map((x) => [x.id, x.hajm])).toEqual([[10, -20], [12, 2]]);
    expect(qamrovJami(r, new Set()).paket.some((x) => x.qator_id === 10)).toBe(false);
  });
});