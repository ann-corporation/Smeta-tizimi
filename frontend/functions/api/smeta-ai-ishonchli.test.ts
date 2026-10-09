import { describe, expect, it } from 'vitest';
import { ishonchliChaqir, ZAXIRA_MODEL } from './smeta-ai';
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
  it('tanlangan model ikki marta buzsa — zaxira model, ogohlantirish bilan', async () => {
    const modellar: Array<string | undefined> = [];
    const chaqir = async (q: AiRequest) => { modellar.push(q.model); return q.model === ZAXIRA_MODEL ? javob('{"javob":"ok"}', ZAXIRA_MODEL) : javob('...', 'google/gemini-3.5-flash'); };
    const r = await ishonchliChaqir(chaqir, { text: 'x' } as AiRequest, ['javob']);
    expect(modellar).toEqual([undefined, undefined, ZAXIRA_MODEL]);
    expect(r.obj).toEqual({ javob: 'ok' });
    expect(r.ogohlantirish).toContain('google/gemini-3.5-flash');
  });
});
