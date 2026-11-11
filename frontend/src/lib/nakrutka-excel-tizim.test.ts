import { describe, expect, it } from 'vitest';
import { excelBilanTizim, oqishNolBilan } from './nakrutka-smetadan';
import { serverCatsdan } from './hisob-yadro';
import type { NakrutkaPodvalOqish } from './smeta-anatomiya/nakrutka';

/** Sintetik: haqiqiy summa yo'q. Fayl podvali: transport 5% + НДС 12%, ПРОЧИЕ/СТРАХОВАНИЕ yo'q; kompaniya sukuti — 18% / 0,32%. */
const manzil = { fayl: 'f', varaq: 'RES', qator: 1, ustun: 8 };
const oqish = (vsego: number): NakrutkaPodvalOqish => ({
  fayl: 'f', varaqlar: ['RES'], masshtab: 1,
  qatorlar: [{ kod: 'vsego', xom: 'ВСЕГО', summa: vsego, foizlar: [], manzil, masshtab: 1, formulaIsbot: null }],
  koeffitsientlar: { ТРАНСПОРТ_МАТЕРИАЛ: 5, НДС: 12 }, manba: {}, resursKf: {}, nostandart: [], isbot: [], review: [], holat: 'qisman',
});
const joriy = { НДС: 12, РИСК: 0, СТРАХОВАНИЕ: 0.32, ПРОЧИЕ_ПОДРЯДЧИК: 18, ТРАНСПОРТ_МАТЕРИАЛ: 5, ТРАНСПОРТ_КАБЕЛЬ: 1.5, ТРАНСПОРТ_ОБОРУД: 2, ЗАГОТ_СКЛАД_ОБОРУД: 0, СКЛАДСКИЕ_МАТЕРИАЛ: 0, СКЛАДСКИЕ_МК: 0, ЗТР_СОЦСТРАХ: 12 };
const cats = serverCatsdan({ chel: 0, mash: 0, mat: 1000, ob: 0, mk: 0, kab: 0, bez: 0 });

describe('Excel jami ↔ tizim jami', () => {
  it('faylda ПРОЧИЕ yo‘q va jami faqat transport + НДС bilan mos — nol isboti (kompaniya 18% emas)', () => {
    const r = excelBilanTizim(oqish(1176), cats, joriy);
    expect(r.mos).toBe(false); // kompaniya foizlari bilan jami katta
    expect(r.nolTaklif).toMatchObject({ ПРОЧИЕ_ПОДРЯДЧИК: 0, СТРАХОВАНИЕ: 0 });
    expect(r.taxminiy).toBe(false);
    const nol = oqishNolBilan(oqish(1176), r.nolTaklif);
    expect(nol.koeffitsientlar.ПРОЧИЕ_ПОДРЯДЧИК).toBe(0);
    expect(nol.manba.ПРОЧИЕ_ПОДРЯДЧИК?.dalil).toBe('summa_nisbati');
  });
  it('jami hech qaysi variantda mos emas — taxminiy belgisi, nol taklif yo‘q', () => {
    const r = excelBilanTizim(oqish(5000), cats, joriy);
    expect(r.nolTaklif).toBeNull();
    expect(r.taxminiy).toBe(true);
    expect(r.farq).not.toBeNull();
  });
});
