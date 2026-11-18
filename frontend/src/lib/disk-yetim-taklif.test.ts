import { describe, expect, it } from 'vitest';
import { aiNomzodlari, aiTaklifTekshir, faylTakliffi, normalla, takliflar, type YetimFayl, type YetimLoyiha, type YetimObyekt } from './disk-yetim-taklif';

const loyihalar: YetimLoyiha[] = [{ id: 1, nom: 'Navoiy bog‘' }, { id: 2, nom: 'Chilonzor turar joy' }];
const obyektlar: YetimObyekt[] = [
  { id: 10, nom: 'Fast Food 1-qavat', loyiha_id: 1, loyiha_nom: 'Navoiy bog‘', shartnoma_id: 5, shartnoma_raqam: '15-A' },
  { id: 11, nom: 'Karting', loyiha_id: 1, loyiha_nom: 'Navoiy bog‘', shartnoma_id: 5, shartnoma_raqam: '15-A' },
  { id: 12, nom: 'Amfiteatr', loyiha_id: 1, loyiha_nom: 'Navoiy bog‘' },
  { id: 20, nom: 'Maktab binosi', loyiha_id: 2, loyiha_nom: 'Chilonzor turar joy' },
];
const fayl = (id: number, nom: string, o: Partial<YetimFayl> = {}): YetimFayl => ({ id, nom, ...o });

describe('normalla: lotin <-> kirill, apostroflar', () => {
  it('kirill va lotin yozuv bir xil skeletga tushadi', () => {
    expect(normalla('Карting')).toBe(normalla('Karting'));
    expect(faylTakliffi({ id: 1, nom: 'Навои боги режа.pdf' }, [], loyihalar)).toMatchObject({ loyihaId: 1, manba: 'nom' });
    expect(normalla('Картинг')).toBe(normalla('Karting'));
    expect(normalla('Чилонзор')).toBe(normalla('Chilonzor'));
  });
});

describe('faylTakliffi: aniq', () => {
  it('fayl nomi obyekt nomini lotin yozuvda o‘z ichiga oladi -> aniq, obyekt + loyiha', () => {
    const t = faylTakliffi(fayl(1, 'Nakopitelniy — Karting — 2026-11.xlsx'), obyektlar, loyihalar);
    expect(t).toMatchObject({ daraja: 'aniq', manba: 'nom', obyektId: 11, loyihaId: 1, obyektNom: 'Karting', loyihaNom: 'Navoiy bog‘' });
    expect(t.ball).toBeGreaterThanOrEqual(0.75);
  });
  it('kirill yozilgan fayl nomi lotin obyekt nomiga moslanadi', () => {
    const t = faylTakliffi(fayl(2, 'Амфитеатр F-2 2026-11.xlsx'), obyektlar, loyihalar);
    expect(t).toMatchObject({ daraja: 'aniq', obyektId: 12 });
  });
  it('asl nom (registry) ham hisobga olinadi', () => {
    const t = faylTakliffi(fayl(3, 'hujjat.xlsx', { asl_nom: 'Maktab_binosi_slichitelniy.xlsx' }), obyektlar, loyihalar);
    expect(t).toMatchObject({ obyektId: 20, loyihaId: 2, daraja: 'aniq' });
  });
  it('registry metadata (obyekt) - eng ishonchli, ball 1', () => {
    const t = faylTakliffi(fayl(4, 'nomsiz.pdf', { registry_obyekt_id: 12 }), obyektlar, loyihalar);
    expect(t).toMatchObject({ daraja: 'aniq', manba: 'metadata', obyektId: 12, loyihaId: 1, ball: 1 });
  });
  it('registry metadata (faqat loyiha)', () => {
    const t = faylTakliffi(fayl(5, 'nomsiz.pdf', { registry_loyiha_id: 2 }), obyektlar, loyihalar);
    expect(t).toMatchObject({ daraja: 'aniq', manba: 'metadata', obyektId: null, loyihaId: 2 });
  });
  it('faqat loyiha nomi uchragan fayl -> loyiha darajasida taklif (obyektsiz)', () => {
    const t = faylTakliffi(fayl(6, 'Chilonzor turar joy rejasi.pdf'), obyektlar, loyihalar);
    expect(t).toMatchObject({ loyihaId: 2, manba: 'nom' });
  });
});

describe('faylTakliffi: noaniq', () => {
  it('ikki obyekt bir xil darajada mos -> aniq emas (taxminiy)', () => {
    const t = faylTakliffi(fayl(7, 'Karting Amfiteatr jamlanma.xlsx'), obyektlar, loyihalar);
    expect(t.daraja).not.toBe('aniq');
  });
  it('faqat qisman (yarim) mos -> taxminiy, ko‘chirishdan oldin foydalanuvchi ko‘radi', () => {
    const t = faylTakliffi(fayl(8, 'Fast hisobot.xlsx'), obyektlar, loyihalar);
    expect(['taxminiy', 'yoq']).toContain(t.daraja);
    if (t.daraja === 'taxminiy') expect(t.obyektId).toBe(10);
  });
  it('umumiy tizim so‘zlari (nakopitelniy, 2026-11, shartnoma, smeta) obyektni ajratmaydi', () => {
    const t = faylTakliffi(fayl(9, 'Smeta shartnoma nakopitelniy 2026-11.xlsx', { hujjat_turi: 'nakopitelniy', revision: '2026-11' }), obyektlar, loyihalar);
    expect(t.daraja).not.toBe('aniq');
  });
});

describe('faylTakliffi: mos kelmaydigan', () => {
  it('hech bir nomga o‘xshamaydi -> taklif yo‘q', () => {
    expect(faylTakliffi(fayl(10, 'Photo_20261104_IMG.jpg'), obyektlar, loyihalar)).toMatchObject({ daraja: 'yoq', manba: null, obyektId: null, loyihaId: null, ball: 0 });
    expect(faylTakliffi(fayl(11, 'Omborga kirim 12.xlsx'), obyektlar, loyihalar).daraja).toBe('yoq');
  });
  it('bo‘sh ro‘yxatlar bilan ham xato bermaydi', () => {
    expect(faylTakliffi(fayl(12, 'Karting.xlsx'), [], []).daraja).toBe('yoq');
  });
  it('registry obyekti ro‘yxatda yo‘q (loyihasiz obyekt) -> metadata ishlamaydi, nomga o‘tadi', () => {
    const t = faylTakliffi(fayl(13, 'Amfiteatr.xlsx', { registry_obyekt_id: 999 }), obyektlar, loyihalar);
    expect(t).toMatchObject({ manba: 'nom', obyektId: 12 });
  });
  it('takliflar: tartib va fayl id saqlanadi', () => {
    const r = takliflar([fayl(1, 'Karting.xlsx'), fayl(2, 'x.pdf')], obyektlar, loyihalar);
    expect(r.map((x) => x.faylId)).toEqual([1, 2]);
  });
});

describe('AI taklifini tekshirish (model id o‘ylab topa olmaydi)', () => {
  const fayllar = [fayl(1, 'a.xlsx'), fayl(2, 'b.xlsx')];
  it('to‘g‘ri javob qabul qilinadi, har doim «taxminiy» va manba «ai»', () => {
    const r = aiTaklifTekshir({ natija: [{ fayl_id: 1, obyekt_id: 11, ishonch: 0.9 }] }, fayllar, obyektlar);
    expect(r).toEqual([expect.objectContaining({ faylId: 1, obyektId: 11, loyihaId: 1, daraja: 'taxminiy', manba: 'ai', ball: 0.9 })]);
  });
  it('mavjud bo‘lmagan fayl/obyekt, past ishonch, takror va buzuq shakl rad etiladi', () => {
    const r = aiTaklifTekshir({ natija: [
      { fayl_id: 99, obyekt_id: 11, ishonch: 0.9 }, { fayl_id: 1, obyekt_id: 777, ishonch: 0.9 }, { fayl_id: 2, obyekt_id: 10, ishonch: 0.3 },
      { fayl_id: 1, obyekt_id: 10, ishonch: 0.8 }, { fayl_id: 1, obyekt_id: 11, ishonch: 0.8 }, { fayl_id: 2, obyekt_id: null, ishonch: 0.9 },
    ] }, fayllar, obyektlar);
    expect(r.map((x) => [x.faylId, x.obyektId])).toEqual([[1, 10]]);
    expect(aiTaklifTekshir(null, fayllar, obyektlar)).toEqual([]);
    expect(aiTaklifTekshir({ natija: 'x' }, fayllar, obyektlar)).toEqual([]);
  });
  it('aiNomzodlari: kichik ro‘yxat to‘liq, katta ro‘yxat fayl nomiga yaqinlari bilan cheklanadi', () => {
    expect(aiNomzodlari(fayllar, obyektlar)).toHaveLength(obyektlar.length);
    const katta = Array.from({ length: 200 }, (_, i) => ({ id: 1000 + i, nom: `Obyekt${i} nomi`, loyiha_id: 1 }));
    const r = aiNomzodlari([fayl(1, 'Karting.xlsx')], [...obyektlar, ...katta]);
    expect(r.length).toBeLessThanOrEqual(120);
    expect(r.some((o) => o.id === 11)).toBe(true);
  });
});
