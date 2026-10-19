import { describe, expect, it } from 'vitest';
import { ishonchliChaqir } from './smeta-ai';
import type { AiRequest, AiResponse } from '../_shared/ai';

const javob = (text: string, model: string) => ({ text, model, provider: 'openrouter' }) as unknown as AiResponse;

describe('Smetachi AI — har qanday model bilan ishonchli', () => {
  it('repairs an audited source contradiction even when valid JSON contains work rows', async () => {
    let calls = 0;
    const work = { id: 'w1', bolim: 'Fundament', tavsif: 'Beton quyish', qidiruv: 'lentali fundament', birlik: 'm3', hajmIfoda: '34.56', hajmIzoh: '48 × 0.6 × 1.2', material: 'B20', holat: 'TAYYOR' };
    const result = await ishonchliChaqir(async () => javob(JSON.stringify({
      javob: ++calls === 1 ? 'Lentali fundament normasida armatura o‘rnatish odatda kirmaydi' : 'Jadval 6-01-001, sahifa 12: armatura o‘rnatish tarkibda bor',
      ishlar: [work], savollar: [],
    }), 'm'), { text: 'Lentali fundament', system: 'TEKSHIRILGAN MANBA:' } as AiRequest, ['javob', 'ishlar']);
    expect(calls).toBe(2);
    expect(result.obj?.javob).toContain('tarkibda bor');
  });
  it('repairs a ready-estimate claim without actual work rows', async () => {
    let calls = 0;
    const r = await ishonchliChaqir(async () => javob(++calls === 1 ? '{"javob":"Smeta tayyor. Fundament hisoblandi","ishlar":[]}' : '{"javob":"O‘lchamni aniqlashtiring","savollar":["Chuqurlik?"],"ishlar":[]}', 'm'), { text: 'fundament' } as AiRequest, ['javob', 'ishlar']);
    expect(calls).toBe(2);
    expect(r.obj?.javob).toBe('O‘lchamni aniqlashtiring');
  });
  it('unrelated valid JSON triggers repair rather than false success', async () => {
    let calls = 0;
    const r = await ishonchliChaqir(async () => javob(++calls === 1 ? '{"error":"blocked"}' : '{"javob":"Aniqlashtiring"}', 'm'), { text: 'x' } as AiRequest, ['javob']);
    expect(calls).toBe(2);
    expect(r.obj).toEqual({ javob: 'Aniqlashtiring' });
  });
  it('izohli/```json javob birinchi urinishda o‘qiladi', async () => {
    const chaqir = async () => javob('Mana:\n```json\n{"javob":"ok","ishlar":[]}\n```', 'google/gemini-3.5-flash');
    const r = await ishonchliChaqir(chaqir, { text: 'x' } as AiRequest, ['javob']);
    expect(r.obj).toEqual({ javob: 'ok', ishlar: [] });
    expect(r.ogohlantirish).toBeUndefined();
  });
  it('o‘qilmasa — "faqat JSON" bilan qayta so‘raladi', async () => {
    const sorovlar: AiRequest[] = [];
    const chaqir = async (q: AiRequest) => { sorovlar.push(q); return javob(sorovlar.length === 1 ? 'Kechirasiz, matn' : '{"javob":"ok"}', 'm'); };
    const r = await ishonchliChaqir(chaqir, { text: 'x', system: 's' } as AiRequest, ['javob']);
    expect(r.obj).toEqual({ javob: 'ok' });
    expect(sorovlar).toHaveLength(2);
    expect(sorovlar[1].system).toContain('FAQAT bitta JSON');
  });
  it('tanlangan model ikki marta buzsa — ekspert saqlanadi, arzon modelga tushmaydi', async () => {
    const modellar: Array<string | undefined> = [];
    const chaqir = async (q: AiRequest) => { modellar.push(q.model); return javob(modellar.length === 3 ? '{"javob":"ok"}' : '...', 'google/gemini-3.5-flash'); };
    const r = await ishonchliChaqir(chaqir, { text: 'x' } as AiRequest, ['javob']);
    expect(modellar).toEqual([undefined, undefined, 'google/gemini-3.5-flash']);
    expect(r.obj).toEqual({ javob: 'ok' });
    expect(r.ogohlantirish).toContain('google/gemini-3.5-flash');
  });
  it('length bilan tugagan valid JSON qabul qilinmaydi; primary va low reasoning bilan tuzatiladi', async () => {
    const qs: AiRequest[] = [];
    const r = await ishonchliChaqir(async q => {
      qs.push(q); return { ...javob('{"javob":"ok"}', qs.length === 1 ? 'cheap' : 'expert'), finishReason: qs.length === 1 ? 'length' : 'stop' };
    }, { text: 'x', workload: 'utility' }, ['javob']);
    expect(qs).toHaveLength(2);
    expect(qs[1]).toMatchObject({ workload: 'primary', reasoning: { effort: 'low' } });
    expect(qs[1].model).toBeUndefined();
    expect(r.r.model).toBe('expert');
  });
  it('uch urinish ham length bo‘lsa muvaffaqiyat uydirilmaydi', async () => {
    let count=0;
    const r=await ishonchliChaqir(async()=>{count++;return {...javob('{"javob":"ok"}','expert'),finishReason:'length'};},{text:'x'},['javob']);
    expect(count).toBe(3); expect(r.obj).toBeNull();
  });
});
