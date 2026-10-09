import { describe, expect, it } from 'vitest';
import { ishonchliChaqir, ZAXIRA_MODEL } from './smeta-ai';
import type { AiRequest, AiResponse } from '../_shared/ai';

const javob = (text: string, model: string) => ({ text, model, provider: 'openrouter' }) as unknown as AiResponse;

describe('Smetachi AI — har qanday model bilan ishonchli', () => {
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
