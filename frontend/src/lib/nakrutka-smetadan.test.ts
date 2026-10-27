import { describe, expect, it } from 'vitest';
import { catsKat, koefFarqi, podvalSmetaNk, shartnomaSmetaFarqlari, smetadanPodval, ustamaTasiri } from './nakrutka-smetadan';
import { podvalTekshir } from './nakrutka-konstruktor';
import type { NakrutkaPodvalOqish } from './smeta-anatomiya/nakrutka';
import type { NakrutkaKoeffitsientlar } from '../api/t2-nakrutka';

const SUKUT: NakrutkaKoeffitsientlar = {
  ЗТР_СОЦСТРАХ: 12, ТРАНСПОРТ_МАТЕРИАЛ: 5, СКЛАДСКИЕ_МАТЕРИАЛ: 2, СКЛАДСКИЕ_МК: 0.75, ТРАНСПОРТ_КАБЕЛЬ: 1.5,
  ПРОЧИЕ_ПОДРЯДЧИК: 18, ТРАНСПОРТ_ОБОРУД: 2, ЗАГОТ_СКЛАД_ОБОРУД: 1.2, СТРАХОВАНИЕ: 0.32, РИСК: 0, НДС: 12,
};
const m = (qator: number) => ({ dalil: 'formula' as const, manzil: { fayl: 'f', varaq: '_СТАРТ', qator, ustun: 4 }, xom: 'x' });
const OQISH: NakrutkaPodvalOqish = {
  fayl: 'karting.xlsx', varaqlar: ['_СТАРТ'], masshtab: 1, qatorlar: [], resursKf: {}, nostandart: [], isbot: [], review: [], holat: 'topildi',
  koeffitsientlar: { ТРАНСПОРТ_МАТЕРИАЛ: 6, ПРОЧИЕ_ПОДРЯДЧИК: 18, НДС: 15 },
  manba: { ТРАНСПОРТ_МАТЕРИАЛ: m(253), ПРОЧИЕ_ПОДРЯДЧИК: m(13), НДС: m(16) },
};

describe('smeta podvali → obyekt podvali', () => {
  it('isbotli foiz — manba smeta, topilmagani — meros (joriy qiymat)', () => {
    const p = smetadanPodval(OQISH, SUKUT);
    expect(podvalTekshir(p)).toEqual([]);
    const tr = p.qatorlar.find((q) => q.koefKod === 'ТРАНСПОРТ_МАТЕРИАЛ')!;
    expect(tr).toMatchObject({ foiz: 6, manba: 'smeta', dalil: 'formula', katak: '_СТАРТ!D253' });
    expect(p.qatorlar.find((q) => q.koefKod === 'СКЛАДСКИЕ_МАТЕРИАЛ')).toMatchObject({ foiz: 2, manba: 'meros' });
    // Server qoidasi bilan bir xil: faqat manba=smeta qatorlari.
    expect(podvalSmetaNk(p)).toEqual({ ТРАНСПОРТ_МАТЕРИАЛ: 6, ПРОЧИЕ_ПОДРЯДЧИК: 18, НДС: 15 });
    expect(p.nom).toMatch(/^Smeta podvali: karting/);
  });
  it('eski / yangi farqi', () => {
    const f = koefFarqi(OQISH, SUKUT);
    expect(f.find((x) => x.kod === 'НДС')).toMatchObject({ eski: 12, yangi: 15, manba: 'smeta' });
    expect(f.find((x) => x.kod === 'РИСК')).toMatchObject({ eski: 0, yangi: 0, manba: 'meros', dalil: null });
  });
  it('obyekt jamiga ta’sir: ustamasiz o‘zgarmaydi, ustamali — yangi foizlar bilan', () => {
    const s = catsKat({ chel: 1000, mash: 0, mat: 0, ob: 0, mk: 0, kab: 0, bez: 0 });
    const t = ustamaTasiri(s, SUKUT, { ...SUKUT, ...OQISH.koeffitsientlar });
    expect(t.ustamasiz).toBe(1000);
    // ЧЕЛ: itogo1 = 1000; prochie 180; itogo3 1180; strax 3.78; itogo4 1183.78; НДС 12% → 1325.83, 15% → 1361.35.
    expect(t.eski.itogo4).toBe(1183.78);
    expect(t.yangi.itogo4).toBe(1183.78);
    expect(t.eski.vsego).toBe(1325.83);
    expect(t.yangi.vsego).toBe(1361.35);
    expect(t.kfYangi.ЧЕЛ).toBeGreaterThan(t.kfEski.ЧЕЛ);
  });
});

describe('shartnoma ↔ smeta podvali (egasi 2026-10-27: smetadagisi ustun)', () => {
  it('faqat farq qiladigan kodlar, NULL taqqoslanmaydi', () => {
    const amaldagi = { ...SUKUT, ТРАНСПОРТ_МАТЕРИАЛ: 6, НДС: 15 };
    const f = shartnomaSmetaFarqlari({ ...SUKUT, ЗАГОТ_СКЛАД_ОБОРУД: undefined as unknown as number }, amaldagi);
    expect(f).toEqual([
      { kod: 'ТРАНСПОРТ_МАТЕРИАЛ', shartnoma: 5, smeta: 6 },
      { kod: 'НДС', shartnoma: 12, smeta: 15 },
    ]);
  });
  it('bir xil yoki maʼlumotsiz — boʻsh', () => {
    expect(shartnomaSmetaFarqlari(SUKUT, SUKUT)).toEqual([]);
    expect(shartnomaSmetaFarqlari(null, SUKUT)).toEqual([]);
  });
});
