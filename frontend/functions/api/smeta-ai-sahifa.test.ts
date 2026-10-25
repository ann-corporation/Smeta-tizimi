import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ auth: vi.fn(), ai: vi.fn(), Xato: class extends Error { constructor(readonly kod: string, readonly xabar: string) { super(kod); } } }));
vi.mock('../_shared/auth', () => ({ tekshir: m.auth }));
vi.mock('../_shared/ai-hisobli', () => ({ aiHisobli: m.ai, AiByudjetXatosi: m.Xato }));
vi.mock('../_shared/agent-rpc', () => ({ rpcData: async () => ({ ok: false, status: 502, data: {} }) }));
import { onRequestPost } from './smeta-ai';

const run = (body: Record<string, unknown>) => onRequestPost({ request: new Request('https://test/api/smeta-ai', { method: 'POST', body: JSON.stringify({ amal: 'sahifa_suhbat', kompaniya_id: 17, sahifa: 'fakt', xabarlar: [{ rol: 'user', matn: 'beton qayerda?' }], kontekst: 'Obyekt X', ...body }) }), env: { SESSIYA_KALIT: 'test' } } as never);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const js = async (r: Response): Promise<any> => r.json();
const javob = (o: unknown) => ({ provider: 'openrouter', model: 'test-model', text: JSON.stringify(o) });

beforeEach(() => { m.auth.mockResolvedValue({ foydalanuvchi_id: 7, kompaniyalar: [{ kompaniya_id: 17 }] }); m.ai.mockReset(); });

describe('sahifa_suhbat (fakt/F2 AI yordamchisi)', () => {
  it('boshqa kompaniya — model chaqirilmaydi (tenant default-deny)', async () => {
    const r = await run({ kompaniya_id: 99 });
    expect(r.status).toBe(403); expect(m.ai).not.toHaveBeenCalled();
  });
  it('noma’lum sahifa rad etiladi', async () => {
    const r = await run({ sahifa: 'ombor' });
    expect((await js(r)).code).toBe('SAHIFA_INVALID'); expect(m.ai).not.toHaveBeenCalled();
  });
  it('hisobli chaqiruv (smeta_ai / fakt_yordam); ro‘yxatda yo‘q vosita va amal tashlanadi', async () => {
    m.ai.mockResolvedValue(javob({ javob: 'Qidiryapman', savollar: [], oqish: [{ vosita: 'qidir', arg: 'beton' }, { vosita: 'sql', arg: 'drop' }],
      amallar: [{ tur: 'fakt_hajm', qator: 12, qiymat: '+5', izoh: 'x' }, { tur: 'ochir', qator: 12, qiymat: null, izoh: '' }, { tur: 'fakt_hajm', qator: 'abc', qiymat: '+1', izoh: '' }] }));
    const j = await js(await run({ natijalar: [{ vosita: 'holat', arg: null, natija: 'fakt 30%' }] }));
    expect(m.ai.mock.calls[0].slice(1, 5)).toEqual([7, 17, 'smeta_ai', 'fakt_yordam']);
    expect(m.ai.mock.calls[0][5].text).toContain('fakt 30%');
    expect(j.oqish).toEqual([{ vosita: 'qidir', arg: 'beton' }]);
    expect(j.amallar).toEqual([{ tur: 'fakt_hajm', qator: 12, qiymat: '+5', izoh: 'x' }]);
  });
  it('oxirgi aylanishda o‘qish so‘rovi qaytmaydi', async () => {
    m.ai.mockResolvedValue(javob({ javob: 'Javob', savollar: [], oqish: [{ vosita: 'qidir', arg: 'beton' }], amallar: [] }));
    const j = await js(await run({ oxirgi: true }));
    expect(j.oqish).toEqual([]); expect(m.ai.mock.calls[0][5].text).toContain('oxirgi aylanish');
  });
  it('byudjet yo‘q — 402, model javobi yo‘q', async () => {
    m.ai.mockRejectedValue(new m.Xato('BYUDJET_YOQ', 'limit yo‘q'));
    const r = await run({});
    expect(r.status).toBe(402); expect((await js(r)).code).toBe('BYUDJET_YOQ');
  });
});
