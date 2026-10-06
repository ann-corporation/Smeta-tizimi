import { afterEach, describe, expect, it, vi } from 'vitest';
import { baholash, javobNarxi, keshniTozala, kuchBahosi, openrouterModellar, orModelgaAylantir, tavsiyaEtilgan, TALAB, type OrModel } from './agent-modellar';

const m = (o: Partial<OrModel> & { id: string }): OrModel => ({ nom: o.id, kirish_usd: 0.1, chiqish_usd: 0.4, kontekst: 128000, vision: true, tools: true, json: true, reasoning: false, ...o });

afterEach(() => { keshniTozala(); vi.unstubAllGlobals(); });

describe('baholash — ishga qarab moslik va kuchsizlik ogohlantirishi', () => {
  it('tanilgan modellar: Gemini 2.5 Flash Lite direktor uchun «mos», Gemma 12B direktor uchun «chegarada/kuchsiz», usta uchun «mos»', () => {
    const flash = baholash(m({ id: 'google/gemini-2.5-flash-lite' }), 'direktor');
    expect(flash).toMatchObject({ ball: 66, manba: 'tanilgan', daraja: 'mos', talab: 62 }); expect(flash.ogohlantirish).toBeNull();
    const gemma = baholash(m({ id: 'google/gemma-3-12b-it', kirish_usd: 0.05, chiqish_usd: 0.15 }), 'direktor');
    expect(gemma.daraja).toBe('kuchsiz'); expect(gemma.ogohlantirish).toContain('KUCHSIZ');
    expect(baholash(m({ id: 'google/gemma-3-12b-it', chiqish_usd: 0.15 }), 'usta').daraja).toBe('mos');
  });
  it('juda kichik model (3B) hech bir hisob-kitob ishchisi uchun yaramaydi', () => {
    for (const p of ['direktor', 'pto_smeta', 'finance', 'prorab']) expect(baholash(m({ id: 'meta-llama/llama-3.2-3b-instruct', chiqish_usd: 0.02 }), p).daraja).toBe('kuchsiz');
  });
  it('kuchli model — «juda mos»', () => {
    expect(baholash(m({ id: 'google/gemini-2.5-flash', kirish_usd: 0.3, chiqish_usd: 2.5 }), 'finance').daraja).toBe('juda_mos');
  });
  it('JSON qo‘llamasa harakat takliflari uchun xavf ogohlantiriladi va daraja tushadi', () => {
    const b = baholash(m({ id: 'vendor/model-70b', json: false, chiqish_usd: 1.5 }), 'prorab');
    expect(['chegarada', 'kuchsiz']).toContain(b.daraja); expect(b.ogohlantirish).toContain('JSON');
  });
  it('rasm talab qilinadigan ishchida rasmsiz model ogohlantiriladi', () => {
    expect(TALAB.company_access.vision).toBe(true);
    const b = baholash(m({ id: 'google/gemini-2.5-flash-lite', vision: false }), 'company_access');
    expect(b.ogohlantirish).toContain('skrinshot'); expect(b.sabablar.join(' ')).toContain('Rasm');
  });
  it('qimmat model narx ogohlantirishi bilan keladi', () => {
    const b = baholash(m({ id: 'openai/gpt-5', kirish_usd: 5, chiqish_usd: 20 }), 'usta');
    expect(b.javob_narxi_usd).toBeGreaterThan(0.01); expect(b.ogohlantirish).toContain('Qimmat');
  });
  it('noma‘lum model: narx/hajmdan TAXMINIY baho va shu haqda izoh', () => {
    const b = baholash(m({ id: 'noma/lum-8b-instruct', chiqish_usd: 0.1 }), 'prorab');
    expect(b.manba).toBe('taxmin'); expect(b.sabablar.join(' ')).toContain('TAXMINIY');
    expect(kuchBahosi(m({ id: 'noma/lum-120b', chiqish_usd: 3 })).ball).toBeGreaterThan(kuchBahosi(m({ id: 'noma/lum-3b', chiqish_usd: 0.05 })).ball);
  });
  it('javobNarxi: 3000 kirish + 500 chiqish', () => expect(javobNarxi({ kirish_usd: 0.1, chiqish_usd: 0.4 })).toBeCloseTo(0.0005, 6));
});

describe('tavsiyaEtilgan', () => {
  it('talabga mos eng arzon modellar birinchi; kuchsizlar va JSON/rasm ogohlantirishli modellar tavsiyaga kirmaydi', () => {
    const royxat = [
      { id: 'a/gemma', ...(() => { const mm = m({ id: 'google/gemma-3-12b-it', chiqish_usd: 0.15, kirish_usd: 0.05 }); return { b: baholash(mm, 'direktor'), narx: javobNarxi(mm) }; })() },
      { id: 'google/gemini-2.5-flash-lite', ...(() => { const mm = m({ id: 'google/gemini-2.5-flash-lite' }); return { b: baholash(mm, 'direktor'), narx: javobNarxi(mm) }; })() },
      { id: 'google/gemini-2.5-flash', ...(() => { const mm = m({ id: 'google/gemini-2.5-flash', kirish_usd: 0.3, chiqish_usd: 2.5 }); return { b: baholash(mm, 'direktor'), narx: javobNarxi(mm) }; })() },
    ];
    expect(tavsiyaEtilgan(royxat)).toEqual(['google/gemini-2.5-flash-lite', 'google/gemini-2.5-flash']);
  });
});

describe('OpenRouter ro‘yxati', () => {
  const xom = (id: string, ish: Record<string, unknown> = {}) => ({ id, name: id, context_length: 100000, pricing: { prompt: '0.0000001', completion: '0.0000004' },
    architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] }, supported_parameters: ['tools', 'response_format', 'reasoning'], ...ish });
  it('aylantirish: narx 1M token uchun, imkoniyatlar, noto‘g‘ri/rasm chiqaradigan/sirtqi id lar tashlanadi', () => {
    expect(orModelgaAylantir(xom('google/gemini-2.5-flash-lite'))).toMatchObject({ id: 'google/gemini-2.5-flash-lite', kirish_usd: 0.1, chiqish_usd: 0.4, vision: true, tools: true, json: true, reasoning: true });
    expect(orModelgaAylantir(xom('bad id with space'))).toBeNull();
    expect(orModelgaAylantir(xom('v/img', { architecture: { input_modalities: ['text'], output_modalities: ['image'] } }))).toBeNull();
    expect(orModelgaAylantir(xom('v/x', { pricing: { prompt: '-1', completion: '1' } }))).toBeNull();
    expect(orModelgaAylantir(xom('v/x', { pricing: { prompt: 'abc', completion: '1' } }))).toBeNull();
    expect(orModelgaAylantir(null)).toBeNull();
  });
  it('keshlanadi (15 daqiqa), xatoda eski kesh qaytadi, kesh bo‘lmasa bo‘sh', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ data: [xom('a/b'), xom('c/d')] }), { status: 200 }));
    const t0 = 1_000_000;
    expect(await openrouterModellar(f as unknown as typeof fetch, t0)).toHaveLength(2);
    expect(await openrouterModellar(f as unknown as typeof fetch, t0 + 60_000)).toHaveLength(2);
    expect(f).toHaveBeenCalledTimes(1);
    const xato = vi.fn(async () => new Response('x', { status: 500 }));
    expect(await openrouterModellar(xato as unknown as typeof fetch, t0 + 20 * 60_000)).toHaveLength(2);
    keshniTozala();
    expect(await openrouterModellar(xato as unknown as typeof fetch, t0 + 99 * 60_000)).toEqual([]);
  });
});
