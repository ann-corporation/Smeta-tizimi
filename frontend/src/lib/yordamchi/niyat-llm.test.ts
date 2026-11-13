import { describe, expect, it } from 'vitest';
import { niyatLlmGaMosmi, niyatLlmTekshir, niyatTizimi, NIYAT_SXEMA } from './niyat-llm';
import { niyatAniqla } from './niyat';

describe('LLM niyat qatlami (modelsiz testlar)', () => {
  it('tizim prompti: KIM bloki, kanonik shakllar, hamma vosita, inyeksiya qoidasi', () => {
    const p = niyatTizimi('== KIM ==\nRol: boss\n== /KIM ==');
    for (const x of ['== KIM ==', 'f2_tasdiqla', 'xarajat_yoz', 'tolov_yoz', 'murojaat_yubor', 'taqdim_yubor', 'bugun', 'solishtiruv', 'kanonik', 'e’tiborsiz']) expect(p).toContain(x);
    expect(p).not.toContain('- yoq:');
    expect(NIYAT_SXEMA.schema.required).toEqual(['tur', 'qayta', 'savol', 'variantlar']);
  });
  it('javobni tekshirish: yaroqli buyruq, noaniq+variantlar, yaroqsiz -> suhbat', () => {
    expect(niyatLlmTekshir('{"tur":"buyruq","qayta":"oktabr F2 ni tasdiqla","savol":null,"variantlar":[]}')).toEqual({ tur: 'buyruq', qayta: 'oktabr F2 ni tasdiqla', savol: null, variantlar: [] });
    expect(niyatLlmTekshir('Mana: {"tur":"noaniq","qayta":null,"savol":"Qaysi?","variantlar":["F2 ni tasdiqla","F2 ni bekor qil","x","y","z"]}')).toMatchObject({ tur: 'noaniq', variantlar: ['F2 ni tasdiqla', 'F2 ni bekor qil', 'x', 'y'] });
    expect(niyatLlmTekshir({ tur: 'buyruq', qayta: null })).toMatchObject({ tur: 'suhbat' });
    expect(niyatLlmTekshir({ tur: 'noaniq', variantlar: ['bitta'] })).toMatchObject({ tur: 'suhbat' });
    expect(niyatLlmTekshir('buzuq {json')).toMatchObject({ tur: 'suhbat' });
    expect(niyatLlmTekshir(null)).toMatchObject({ tur: 'suhbat' });
    expect(niyatLlmTekshir({ tur: 'buyruq', qayta: 'a'.repeat(500) }).qayta?.length).toBe(120);
  });
  it('qaysi gaplar LLM ga boradi', () => {
    expect(niyatLlmGaMosmi('oktabrdagi ф2ni tasdiqlab yubor')).toBe(true);
    expect(niyatLlmGaMosmi('salom')).toBe(true);
    expect(niyatLlmGaMosmi('beton narxi nima uchun oshdi?')).toBe(false);
    expect(niyatLlmGaMosmi('a'.repeat(200))).toBe(false);
    expect(niyatLlmGaMosmi('ok')).toBe(false);
  });
  it('model qayta yozgan kanonik buyruq mahalliy qatlamda vositaga aylanadi (xavfsizlik kafolati: ruxsat/tasdiq mahalliy)', () => {
    const c = { sahifalar: [], obyektlar: [] };
    expect(niyatAniqla('oktabr F2 ni tasdiqla', c)).toMatchObject({ tur: 'vosita', id: 'f2_tasdiqla' });
    expect(niyatAniqla('xarajat yoz 12 mln material', c)).toMatchObject({ tur: 'vosita', id: 'xarajat_yoz' });
  });
});
