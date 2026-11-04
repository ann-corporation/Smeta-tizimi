import { describe, expect, it } from 'vitest';
import type { TenglashHolat, TenglashQator, TenglashReja } from './fakt-f2-tenglash';
import { paketQatorlar } from './fakt-f2-tenglash';
import { dalilFarqi, faktKeyin, obyektTiklashXulosa, qoralamaYigish, tiklashJami, tiklashPaket, tiklashSatrlar, tiklashSarlavha, type KompHolat, type TiklashMeta } from './fakt-tiklash';

const h = (qator_id: number, fakt: number | null, f2: number | null, o: Partial<TenglashHolat> = {}): TenglashHolat =>
  ({ qator_id, smeta_hajm: 100, fakt_hajm: fakt, f2_hajm: f2, smeta_narx: null, ...o });
const meta = (id: number, o: Partial<TiklashMeta> = {}): TiklashMeta => ({ id, tur: 'bl', nom: `Ish ${id}`, birlik: 'm3', kat: 'МАТ', bolim: 'B1', ...o });
const rq = (o: Partial<TenglashQator> & { id: number }): TenglashQator => ({
  tur: 'bl', nom: `Ish ${o.id}`, birlik: 'm3', fakt: 3, f2: 8, delta: 5, narx: 100, summa: 500, avtomatik: 0, bolim: 'B1', narxManba: 'f2', aktlar: [7], ...o,
});
const rejaDan = (qatorlar: TenglashQator[]): TenglashReja => ({
  qatorlar, paket: qatorlar.flatMap(paketQatorlar), jamiSumma: 0, narxsiz: 0, otkazildi: { manfiyReja: 0, f2Yoq: 0 }, faktOrtiq: [],
});
const bosReja = rejaDan([]);
const yig = (xs: [number, number, number | null][]) => qoralamaYigish(xs.map(([akt_id, qator_id, hajm]) => ({ akt_id, qator_id, hajm })));

describe('Fakt tiklash — dalil bo‘yicha takliflar', () => {
  it('(a) tasdiqlangan F2: fakt = F2 taklifi, manba hujjat, F2 narxida summa, fakt_yoz_v2 paketi — faqat delta', () => {
    const s = tiklashSatrlar({ reja: rejaDan([rq({ id: 10 })]), holat: new Map([[10, h(10, 3, 8)]]), meta: [meta(10)], qoralama: new Map() });
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ kalit: 'f2:10', manba: 'f2', hujjat: 'F2 №7', fakt: 3, keyin: 8, delta: 5, summa: 500, narx: 100 });
    expect(s[0].paket).toEqual([expect.objectContaining({ qator_id: 10, hajm: 5, narx: 100, narx_manba: 'f2_sertifikat', narx_manba_id: 7 })]);
  });

  it('(b) qoralama F2: kuchsiz dalil, F2 yo‘q qatorda smeta narxida; paket narxsiz (server smeta narxini oladi), izohda hujjat', () => {
    const s = tiklashSatrlar({
      reja: bosReja, holat: new Map([[20, h(20, 2, 0, { smeta_narx: 50 })]]), meta: [meta(20)], qoralama: yig([[3, 20, 6]]), qoralamaRaqam: new Map([[3, 'Q-3']]),
    });
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ kalit: 'qoralama:20', manba: 'qoralama', hujjat: 'qoralama F2 №Q-3', fakt: 2, keyin: 6, delta: 4, narx: 50, summa: 200, narxManba: 'smeta' });
    expect(s[0].paket).toHaveLength(1);
    expect(s[0].paket[0]).toMatchObject({ qator_id: 20, hajm: 4 });
    expect(s[0].paket[0].narx).toBeUndefined();
    expect(s[0].paket[0].narx_manba).toBeUndefined();
    expect(s[0].paket[0].narx_izoh).toContain('qoralama F2 №Q-3');
  });

  it('fakt ≥ dalil bo‘lsa taklif yo‘q (qoralama ham, tasdiqlangan ham)', () => {
    const s = tiklashSatrlar({
      reja: bosReja, holat: new Map([[20, h(20, 6, 0, { smeta_narx: 50 })], [21, h(21, 9, 8)]]), meta: [meta(20), meta(21)],
      qoralama: yig([[3, 20, 6], [3, 21, 0.5]]),
    });
    expect(s).toEqual([]); // 6 ≥ 6; 8 + 0.5 = 8.5 ≤ 9
  });

  it('tasdiqlangan F2 + qoralama bir qatorda: qoralama (a) qo‘llangandan keyingi faktdan hisoblanadi, F2 narxida', () => {
    const s = tiklashSatrlar({
      reja: rejaDan([rq({ id: 10 })]), holat: new Map([[10, h(10, 3, 8, { f2_summa: 800 })]]), meta: [meta(10)], qoralama: yig([[4, 10, 4]]),
    });
    const q = s.find((x) => x.manba === 'qoralama')!;
    expect(q).toMatchObject({ fakt: 8, keyin: 12, delta: 4, summa: 400, narxManba: 'f2' }); // F2 narxi 800/8 = 100
    // Ikkalasi tanlansa — bitta yig‘ma qator (serverda bir hujjatda qator takrorlanmasin)
    const p = tiklashPaket(s, new Set(s.map((x) => x.kalit)));
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ qator_id: 10, hajm: 9, narx: 100, narx_manba: 'f2_sertifikat' });
    expect(p[0].narx_izoh).toContain('qoralama F2');
  });

  it('minus: F2 dagi minus qator manfiy yoziladi; fakt allaqachon dalildan past (manfiy) bo‘lsa taklif yo‘q', () => {
    const s = tiklashSatrlar({
      reja: bosReja, holat: new Map([[30, h(30, 0, 0, { smeta_narx: 50 })], [31, h(31, -5, 0, { smeta_narx: 50 })]]), meta: [meta(30), meta(31)],
      qoralama: yig([[5, 30, -3], [5, 31, -3]]),
    });
    expect(s.map((x) => x.id)).toEqual([30]);
    expect(s[0]).toMatchObject({ delta: -3, summa: -150, keyin: -3 });
    expect(tiklashJami(s, new Set([s[0].kalit])).manfiySoni).toBe(1);
    expect(dalilFarqi(-3, -5)).toBeNull();
    expect(dalilFarqi(-3, 0)).toBe(-3);
  });

  it('F2 summasi noma‘lum (null) — summa noma‘lum, 0 emas; jami yig‘indiga kirmaydi va narxsiz sanaladi', () => {
    const s = tiklashSatrlar({
      reja: bosReja, holat: new Map([[40, h(40, 1, 8, { f2_summa: null })], [41, h(41, 0, 0)]]), meta: [meta(40), meta(41)], qoralama: yig([[6, 40, 2], [6, 41, 5]]),
    });
    expect(s.find((x) => x.id === 40)).toMatchObject({ summa: null, narxManba: 'narxsiz', delta: 9 });
    expect(s.find((x) => x.id === 41)).toMatchObject({ summa: null, narx: null }); // smeta narxi ham yo‘q
    const j = tiklashJami(s, new Set(s.map((x) => x.kalit)));
    expect(j.ustamasiz).toBeNull();
    expect(j.narxsiz).toBe(2);
  });

  it('mehnat/mashina (rs) qoralama dalili bilan alohida yozilmaydi; holatsiz qator tashlanadi; hajmi null qoralama qatori hisobga olinmaydi', () => {
    const s = tiklashSatrlar({
      reja: bosReja, holat: new Map([[50, h(50, 0, 0, { smeta_narx: 1 })]]), meta: [meta(50, { tur: 'rs' }), meta(51)], qoralama: yig([[1, 50, 5], [1, 51, 5], [1, 52, null]]),
    });
    expect(s).toEqual([]);
    expect(qoralamaYigish([{ akt_id: 1, qator_id: 9, hajm: null }]).size).toBe(0);
  });

  it('qoralamaYigish: bir qator bir necha qoralamada — hajm yig‘indisi va akt idlari', () => {
    const y = yig([[1, 9, 2], [2, 9, 3], [2, 9, 1]]);
    expect(y.get(9)).toEqual({ hajm: 6, aktlar: [1, 2] });
  });

  it('apply payload: tanlanmagan qator paketga tushmaydi; 1:1 nusxa (manba_akt_qator_id) qatorlari saqlanadi', () => {
    const nusxali = rq({ id: 11, nusxa: [{ manba: 901, akt: 7, hajm: 2, summa: 20 }, { manba: 902, akt: 7, hajm: 3, summa: 30 }], delta: 5, summa: 50 });
    const s = tiklashSatrlar({ reja: rejaDan([rq({ id: 10 }), nusxali]), holat: new Map([[10, h(10, 3, 8)], [11, h(11, 0, 5)]]), meta: [meta(10), meta(11)], qoralama: new Map() });
    expect(tiklashPaket(s, new Set(['f2:11'])).map((p) => [p.qator_id, p.hajm, p.manba_akt_qator_id])).toEqual([[11, 2, 901], [11, 3, 902]]);
    expect(tiklashPaket(s, new Set())).toEqual([]);
    const j = tiklashJami(s, new Set(s.map((x) => x.kalit)));
    expect(j.f2.soni).toBe(2);
    expect(j.qoralama.soni).toBe(0);
    expect(j.ustamasiz).toBe(550);
  });

  it('faktKeyin: hozirgi fakt + tanlangan; hozirgi noma‘lum bo‘lsa faqat taklif; sarlavha hujjatlarni nomlaydi', () => {
    const s = tiklashSatrlar({ reja: rejaDan([rq({ id: 10 })]), holat: new Map([[10, h(10, 3, 8)]]), meta: [meta(10)], qoralama: new Map() });
    const j = tiklashJami(s, new Set(['f2:10']));
    expect(faktKeyin({ ustamasiz: 1000, kesim: j.kesim }, j).ustamasiz).toBe(1500);
    expect(faktKeyin(null, j).ustamasiz).toBe(500);
    expect(tiklashSarlavha('Stella', j.hujjatlar)).toBe('Stella — F2 №7');
  });
});

describe('Fakt tiklash — kompaniya xulosasi', () => {
  const kh = (qator_id: number, tur: string, fakt: number, f2: number, f2s: number | null, o: Partial<KompHolat> = {}): KompHolat =>
    ({ qator_id, tur, kat: 'МАТ', fakt_hajm: fakt, fakt_summa: null, f2_hajm: f2, f2_summa: f2s, f2_summa_yoq: 0, smeta_narx: null, ...o });
  it('(a) F2 narxida, (b) qoralama; fakt ≥ F2 qator hisobga olinmaydi; summasi noma‘lum qator alohida sanaladi', () => {
    const x = obyektTiklashXulosa([
      kh(1, 'mat', 2, 10, 1000),                   // (a): 8 × 100 = 800
      kh(2, 'mat', 12, 10, 1000),                  // fakt > F2: yo‘q
      kh(3, 'mat', 0, 4, null),                    // (a): summa noma‘lum
      kh(4, 'bl', 1, 0, null, { smeta_narx: 20 }), // (b): qoralama 6 → delta 5 × 20 = 100
    ], new Map([[4, { hajm: 6, aktlar: [9] }]]));
    expect(x.a.soni).toBe(2);
    expect(x.a.noma).toBe(1);
    expect(x.a.ustamasiz).toBe(800);
    expect(x.b).toMatchObject({ soni: 1, noma: 0, ustamasiz: 100 });
  });
});
