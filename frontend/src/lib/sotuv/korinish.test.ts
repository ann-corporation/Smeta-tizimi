import { describe, expect, it } from 'vitest';
import type { Birlik, BitimQator } from '../../api/t2-sotuv';
import { BOSH_FILTR, filtrBormi, filtrMos, ixcham, raqamSolishtir, shaxmatkaTuz, tanlovXulosa, yangiNarxM2 } from './shaxmatka-korinish';
import { aloqaHolat, boshlangichSumma, bronQoldi, grafikTekshir, kanbanGuruh, otishlar, shartnomaYetishmaydi, telefonKorinish } from './bitim-korinish';
import { agingQur, foiz, manbaKonversiya, prognoz12, ustunUlush, voronkaQur } from './panel-korinish';

const b = (o: Partial<Birlik> & { id: number }): Birlik => ({
  podyezd: 1, qavat: 1, raqam: String(o.id), tur: 'xonadon', xona_soni: 2, maydon: 50, maydon_yashash: null, maydon_oshxona: null, maydon_balkon: null,
  shift: null, pardoz: null, yon: null, manzara: null, planirovka_id: null, narx_m2: 1000, narx_jami: 50000, valyuta: 'UZS', holat: 'bosh', versiya: 1,
  bron_id: null, bron_tugaydi: null, bitim_id: null, mijoz: null, ...o,
});

describe('shaxmatka tuzilmasi', () => {
  it('podyezdlar yonma-yon, qavatlar umumiy o‘qda kamayish tartibida, katak raqami tabiiy tartibda', () => {
    const t = shaxmatkaTuz([
      b({ id: 1, podyezd: 2, qavat: 1, raqam: '10' }), b({ id: 2, podyezd: 2, qavat: 1, raqam: '9' }),
      b({ id: 3, podyezd: 1, qavat: 3, raqam: '5' }), b({ id: 4, podyezd: 1, qavat: 1, raqam: '1' }),
      b({ id: 5, podyezd: null, qavat: null, raqam: 'P1' }),
    ]);
    expect(t.qavatlar).toEqual([3, 1, 0]);
    expect(t.podyezdlar.map((p) => p.podyezd)).toEqual([1, 2]);
    expect(t.podyezdlar[1].ustunlar).toBe(2);
    expect(t.podyezdlar[1].qavatlar.get(1)!.map((x) => x.raqam)).toEqual(['9', '10']);
    expect(t.podyezdlar[0].qavatlar.get(0)!.map((x) => x.raqam)).toEqual(['P1']);
  });

  it('raqamSolishtir — 2 < 10, kod raqamlash', () => {
    expect(raqamSolishtir('2', '10')).toBeLessThan(0);
    expect(raqamSolishtir('1-02-3', '1-10-1')).toBeLessThan(0);
  });
});

describe('shaxmatka filtri', () => {
  it('bo‘sh filtr hammasini o‘tkazadi', () => {
    expect(filtrBormi(BOSH_FILTR)).toBe(false);
    expect(filtrMos(b({ id: 1 }), BOSH_FILTR)).toBe(true);
  });
  it('xonalar (4 = 4+), maydon, narx, holat; narxsiz birlik narx oralig‘iga tushmaydi', () => {
    const f = { ...BOSH_FILTR, xonalar: [4] };
    expect(filtrMos(b({ id: 1, xona_soni: 5 }), f)).toBe(true);
    expect(filtrMos(b({ id: 1, xona_soni: 3 }), f)).toBe(false);
    expect(filtrMos(b({ id: 1, maydon: 40 }), { ...BOSH_FILTR, maydonDan: 45 })).toBe(false);
    expect(filtrMos(b({ id: 1, narx_jami: null, narx_m2: null }), { ...BOSH_FILTR, narxGacha: 1e9 })).toBe(false);
    expect(filtrMos(b({ id: 1, holat: 'bron' }), { ...BOSH_FILTR, holatlar: ['bosh'] })).toBe(false);
    expect(filtrBormi({ ...BOSH_FILTR, narxDan: 0 })).toBe(true);
  });
});

describe('ixcham va tanlov', () => {
  it('ixcham summa', () => {
    expect(ixcham(1_250_000_000)).toEqual({ son: '1.25', birlik: 'mlrd' });
    expect(ixcham(450_000_000)).toEqual({ son: '450', birlik: 'mln' });
    expect(ixcham(7_500_000)).toEqual({ son: '7.5', birlik: 'mln' });
    expect(ixcham(12_400)).toEqual({ son: '12', birlik: 'ming' });
    expect(ixcham(null)).toBeNull();
  });
  it('tanlov xulosasi bron/sotilganni o‘tkazib yuboradi', () => {
    const bs = [b({ id: 1 }), b({ id: 2, holat: 'bron' }), b({ id: 3, holat: 'sotilgan' }), b({ id: 4, narx_m2: null })];
    expect(tanlovXulosa(bs, new Set([1, 2, 3, 4]))).toEqual({ soni: 4, ozgaradi: 2, otkaziladi: 2, narxsiz: 1, ids: [1, 4] });
  });
  it('yangi m² narx oldindan ko‘rinishi', () => {
    expect(yangiNarxM2(1000, 'foiz', 10)).toBeCloseTo(1100);
    expect(yangiNarxM2(1000, 'summa_m2', -200)).toBe(800);
    expect(yangiNarxM2(null, 'foiz', 10)).toBeNull();
    expect(yangiNarxM2(null, 'yangi_m2', 900)).toBe(900);
    expect(yangiNarxM2(100, 'summa_m2', -200)).toBeNull();
  });
});

describe('bitim o‘tishlari', () => {
  it('ochiq bosqichdan: boshqa ochiqlar + bron (dialog) + shartnoma + bekor', () => {
    expect(otishlar('lid').map((o) => `${o.bosqich}:${o.tur}`)).toEqual(['aloqa:oddiy', 'korsatildi:oddiy', 'bron:bron', 'shartnoma:shartnoma', 'bekor:bekor']);
  });
  it('bron → faqat shartnoma/bekor; shartnoma → tolov/topshirildi/bekor; yopiq — hech narsa', () => {
    expect(otishlar('bron').map((o) => o.bosqich)).toEqual(['shartnoma', 'bekor']);
    expect(otishlar('shartnoma').map((o) => o.bosqich)).toEqual(['tolov', 'topshirildi', 'bekor']);
    expect(otishlar('tolov').map((o) => o.bosqich)).toEqual(['topshirildi', 'bekor']);
    expect(otishlar('topshirildi')).toEqual([]);
    expect(otishlar('bekor')).toEqual([]);
  });
  it('shartnoma uchun birlik va summa kerak', () => {
    expect(shartnomaYetishmaydi({ birlik_id: null, summa: null })).toEqual(['birlik', 'summa']);
    expect(shartnomaYetishmaydi({ birlik_id: 5, summa: 100 })).toEqual([]);
  });
  it('kanban guruhlari: bekor faqat so‘ralganda', () => {
    const q = (id: number, bosqich: BitimQator['bosqich']) => ({ id, bosqich } as BitimQator);
    const g = kanbanGuruh([q(1, 'lid'), q(2, 'bekor'), q(3, 'lid')], false);
    expect(g.map((x) => x.bosqich)).toEqual(['lid', 'aloqa', 'korsatildi', 'bron', 'shartnoma', 'tolov', 'topshirildi']);
    expect(g[0].bitimlar.map((x) => x.id)).toEqual([1, 3]);
    expect(kanbanGuruh([q(2, 'bekor')], true).at(-1)!.bitimlar).toHaveLength(1);
  });
});

describe('vaqt va telefon', () => {
  const hozir = new Date('2026-11-03T10:00:00');
  it('bron qolgan vaqti', () => {
    expect(bronQoldi('2026-11-04T12:30:00', hozir)).toEqual({ soat: 26, daqiqa: 30, otdi: false });
    expect(bronQoldi('2026-11-03T09:00:00', hozir)).toEqual({ soat: 0, daqiqa: 0, otdi: true });
    expect(bronQoldi(null, hozir)).toBeNull();
  });
  it('keyingi aloqa holati', () => {
    expect(aloqaHolat('2026-11-02T10:00:00', hozir)).toBe('otgan');
    expect(aloqaHolat('2026-11-03T18:00:00', hozir)).toBe('bugun');
    expect(aloqaHolat('2026-11-05T10:00:00', hozir)).toBe('kelajak');
    expect(aloqaHolat(null, hozir)).toBeNull();
  });
  it('telefon ko‘rinishi', () => {
    expect(telefonKorinish('901234567')).toBe('+998 90 123 45 67');
    expect(telefonKorinish('+998 (90) 123-45-67')).toBe('+998 90 123 45 67');
    expect(telefonKorinish('12345')).toBe('12345');
  });
});

describe('grafik yordamchilari', () => {
  it('boshlang‘ich to‘lov summa yoki foiz', () => {
    expect(boshlangichSumma(1000, 30, true)).toBe(300);
    expect(boshlangichSumma(1000, 300, false)).toBe(300);
    expect(boshlangichSumma(1000, 5000, false)).toBe(1000);
    expect(boshlangichSumma(1000, 0, true)).toBe(0);
  });
  it('Σ tekshiruvi ±1', () => {
    expect(grafikTekshir([{ summa: 500 }, { summa: 500.5 }], 1000).mos).toBe(true);
    expect(grafikTekshir([{ summa: 500 }, { summa: 498 }], 1000)).toEqual({ jami: 998, farq: -2, mos: false });
    expect(grafikTekshir([], 1000).mos).toBe(false);
    expect(grafikTekshir([{ summa: 1 }], null).mos).toBe(false);
  });
});

describe('panel', () => {
  it('voronka: yetib kelganlar va konversiya', () => {
    const v = voronkaQur({ lid: 5, aloqa: 3, korsatildi: 1, shartnoma: 1, bekor: 4 });
    expect(v.qadamlar.map((q) => q.yetdi)).toEqual([10, 5, 2, 1, 1, 0, 0]);
    expect(v.qadamlar[1].oldingidanFoiz).toBe(50);
    expect(v.qadamlar[4].boshidanFoiz).toBe(10);
    expect(v.qadamlar[6].oldingidanFoiz).toBeNull();
    expect(v.bekor).toBe(4);
  });
  it('foiz: maxraj 0 → null', () => {
    expect(foiz(1, 0)).toBeNull();
    expect(foiz(1, 3)).toBe(33.3);
  });
  it('aging ulushlari', () => {
    const a = agingQur({ muddati_otgan: 30, k0_30: 10, k31_90: 20, k90: 0, kelajak: 40 });
    expect(a.map((x) => x.ulush)).toEqual([0.25, 0.5, 0, 1]);
  });
  it('ustun ulushlari va 12 oy prognoz', () => {
    expect(ustunUlush([0, 5, 10, null])).toEqual([0, 0.5, 1, 0]);
    const p = prognoz12([{ oy: '2026-12', summa: 7 }], new Date('2026-11-15T00:00:00'));
    expect(p).toHaveLength(12);
    expect(p[0]).toEqual({ oy: '2026-11', summa: 0 });
    expect(p[1]).toEqual({ oy: '2026-12', summa: 7 });
    expect(p[11].oy).toBe('2027-10');
  });
  it('manba konversiyasi', () => {
    expect(manbaKonversiya([{ manba: 'sayt', lid: 4, sotildi: 1 }])[0].foiz).toBe(25);
  });
});
