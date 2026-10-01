import { describe, expect, it } from 'vitest';
import type { T2Qator } from '../api/supabase';
import { holatTur, jurnalPaket, jurnalQur, qoldiqUlushi, sonOqi } from './fakt-jurnal';

const q = (o: Partial<T2Qator> & { id: number; tur: string }): T2Qator => ({
  obyekt_id: 1, obyekt: null, kompaniya_id: 1, ota_id: null, daraja: 0, tartib: o.id, kod: null, nom: 'n', birlik: 'м3',
  hajm: null, narx: null, summa: null, kat: null, narx_usul: null, qoshimcha: false, zamena: false,
  d1: null, d2: null, d3: null, xom_qator: null, yangilandi: null, manba_id: null, versiya: 1, ...o,
} as T2Qator);

const rows = [
  q({ id: 1, tur: 'rz', kod: '1', nom: 'Земляные', versiya: 4 }),
  q({ id: 2, tur: 'bl', ota_id: 1, daraja: 1, nom: 'Разработка грунта', hajm: 100 }),
  q({ id: 3, tur: 'rs', ota_id: 2, daraja: 2, nom: 'Затраты труда', hajm: 50 }),
  q({ id: 4, tur: 'mat', ota_id: 2, daraja: 2, nom: 'Песок', hajm: 10 }),
  q({ id: 5, tur: 'rz', ota_id: 1, daraja: 1, kod: '1.1', nom: 'Ичкари' }),
  q({ id: 6, tur: 'bl', ota_id: 5, daraja: 2, nom: 'Засыпка', hajm: 20 }),
  q({ id: 7, tur: 'mat', ota_id: 1, daraja: 1, nom: 'Щебень (мустақил)', hajm: 5 }),
];
const states = [
  { qator_id: 2, smeta_hajm: 100, fakt_hajm: 40, smeta_summa: 1000, fakt_summa: 400 },
  { qator_id: 3, smeta_hajm: 50, fakt_hajm: 20 },
  { qator_id: 6, smeta_hajm: 20, fakt_hajm: 20, smeta_summa: 1000, fakt_summa: 1000 },
  { qator_id: 7, smeta_hajm: 5, fakt_hajm: 6 },
];

describe('fakt jurnali', () => {
  it('bo‘limlar daraxt tartibida, ichki bo‘lim bilan foiz (summa bo‘yicha)', () => {
    const { bolimlar } = jurnalQur(rows, states);
    expect(bolimlar.map((b) => [b.id, b.daraja])).toEqual([[1, 0], [5, 1]]);
    expect(bolimlar[0].ulush).toBeCloseTo(0.8);          // hajm ulushi × smeta summasi: (0.4·1000 + 1·1000 + 1·1000) / 3000
    expect(bolimlar[0]).toMatchObject({ ishSoni: 3, tugaganSoni: 2, versiya: 4 });
    expect(bolimlar[1].ulush).toBe(1);
  });

  it('ish → resurslar (mat) va avtomatik (rs); mustaqil resurs ham ish qatori', () => {
    const { bolimIshlari } = jurnalQur(rows, states);
    const ishlar = bolimIshlari.get(1)!;
    expect(ishlar.map((x) => x.id)).toEqual([2, 7]);
    expect(ishlar[0]).toMatchObject({ holat: 'qisman', qoldiq: 60, otaId: 1, otaVersiya: 4 });
    expect(ishlar[0].resurslar.map((x) => x.id)).toEqual([4]);
    expect(ishlar[0].avtomatik.map((x) => [x.id, x.fakt])).toEqual([[3, 20]]);
    expect(ishlar[1].holat).toBe('oshdi');
  });

  it('hamma ishi 100% bo‘lgan bo‘lim — 100% (ish qatorining fakt summasi 0 bo‘lsa ham)', () => {
    // Real holat (obyekt 81): bl narxsiz → fakt_summa 0; avval 12% ko‘rinardi.
    const r = [q({ id: 1, tur: 'rz', nom: 'Стена' }), q({ id: 2, tur: 'bl', ota_id: 1, hajm: 0.2 }), q({ id: 3, tur: 'mat', ota_id: 1, hajm: 0.037 })];
    const h = [{ qator_id: 2, smeta_hajm: 0.2, fakt_hajm: 0.2, smeta_summa: 2246153, fakt_summa: 0 }, { qator_id: 3, smeta_hajm: 0.037, fakt_hajm: 0.037, smeta_summa: 285084, fakt_summa: 285084 }];
    expect(jurnalQur(r, h).bolimlar[0].ulush).toBe(1);
  });

  it('holatTur', () => {
    expect(holatTur(10, 0)).toBe('yangi');
    expect(holatTur(10, 10)).toBe('tugadi');
    expect(holatTur(null, 3)).toBe('smetasiz');
  });

  it('"+" va "=" rejimlari bitta delta paketiga', () => {
    const faktlar = new Map([[2, 40], [4, 0], [6, 20]]);
    const p = jurnalPaket({ 2: { rejim: '=', qiymat: '55' }, 4: { rejim: '+', qiymat: '2,5' }, 6: { rejim: '=', qiymat: '20' } }, faktlar);
    expect(p).toMatchObject({ ok: true, qatorlar: [{ qator_id: 2, hajm: 15 }, { qator_id: 4, hajm: 2.5 }] });
    const bad = jurnalPaket({ 2: { rejim: '=', qiymat: '-1' }, 4: { rejim: '+', qiymat: 'x' }, 6: { rejim: '+', qiymat: '0' } }, faktlar);
    expect(bad.ok).toBe(false);
    expect([...bad.xatolar.values()].sort()).toEqual(['MANFIY', 'NOL', 'SON_EMAS']);
    expect(jurnalPaket({ 2: { rejim: '=', qiymat: '30' } }, faktlar).qatorlar).toEqual([{ qator_id: 2, hajm: -10 }]);
  });

  it('qoldiq ulushi va sonOqi', () => {
    expect(qoldiqUlushi({ qoldiq: 60 }, 25)).toBe('15');
    expect(qoldiqUlushi({ qoldiq: 0 }, 100)).toBeNull();
    expect(sonOqi(' 1 000,5 ')).toBe(1000.5);
  });
});
