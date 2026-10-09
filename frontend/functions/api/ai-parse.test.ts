import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ auth: vi.fn(), ai: vi.fn(), Xato: class extends Error { constructor(readonly kod: string, readonly xabar: string) { super(kod); } } }));
const ByudjetXato = m.Xato;
vi.mock('../_shared/auth', () => ({ tekshir: m.auth }));
vi.mock('../_shared/ai', () => ({ aiPublicError: () => ({ code: 'provider_unavailable', message: 'AI hozir javob bera olmadi' }), parseJsonText: (s: string) => JSON.parse(s) }));
vi.mock('../_shared/ai-hisobli', () => ({ aiHisobli: m.ai, AiByudjetXatosi: m.Xato }));
import { onRequestPost } from './ai-parse';

const FAKTURA = JSON.stringify({ supplier: 'Test MChJ', items: [{ fakturaRaqami: 'F-1', postavshik: 'Test MChJ', kelganSana: '2026-10-01', shartnomaRaqami: null, shartnomaSanasi: null, postavshikInn: null, postavshikManzil: null, sotibOluvchiInn: null, sotibOluvchiManzil: null, nomi: 'Sement', birligi: 'tonna', miqdori: 2, narxi: 100, jamiNdsSiz: 200, ndsSummasi: 24, jamiNdsBilan: 224, aksizSummasi: 0, ndsStavkasi: 12 }] });
const run = (body: unknown) => onRequestPost({ request: new Request('https://x/api/ai-parse', { method: 'POST', body: JSON.stringify(body) }), env: { SESSIYA_KALIT: 't', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_KEY: 'k' } } as never);
beforeEach(() => { m.auth.mockResolvedValue({ foydalanuvchi_id: 7, kompaniyalar: [{ kompaniya_id: 17 }, { kompaniya_id: 18 }] }); m.ai.mockReset(); m.ai.mockResolvedValue({ text: FAKTURA, provider: 'openrouter', model: 'x/y' }); });

it('sessiyasiz 401; kompaniya tanlanmagan (bir nechta) 422; begona kompaniya 403 — model chaqirilmaydi', async () => {
  m.auth.mockResolvedValueOnce(null);
  expect((await run({ text: 'faktura' })).status).toBe(401);
  expect((await run({ text: 'faktura' })).status).toBe(422);
  expect((await run({ text: 'faktura', kompaniya_id: 99 })).status).toBe(403);
  expect(m.ai).not.toHaveBeenCalled();
});
it('hisobli chaqiruv: actor + kompaniya + profil + amal bilan; foydalanuvchi modeli/limit aiHisobli ichida', async () => {
  const r = await run({ text: 'faktura matni', kompaniya_id: 18 });
  expect(r.status).toBe(200); expect(m.ai).toHaveBeenCalledTimes(1);
  expect(m.ai.mock.calls[0].slice(1, 5)).toEqual([7, 18, 'document_control', 'faktura_parse']);
  expect(m.ai.mock.calls[0][5]).toMatchObject({ temperature: 0, maxOutputTokens: 4000 });
});
it('limit yo‘q/tugagan/token yo‘q: 402 + kod (tushunarli), 502 emas', async () => {
  m.ai.mockRejectedValue(new ByudjetXato('TOKEN_YETMAYDI', 'Tokenlar yetarli emas — hisobni to‘ldiring'));
  const r = await run({ text: 'faktura', kompaniya_id: 17 });
  expect(r.status).toBe(402); expect(await r.json()).toMatchObject({ ok: false, code: 'TOKEN_YETMAYDI' });
});
it('fayl/matn yo‘q yoki noto‘g‘ri tur — AI ga umuman bormaydi', async () => {
  expect((await run({ kompaniya_id: 17 })).status).toBe(400);
  expect((await run({ kompaniya_id: 17, base64: 'QUJD', mimeType: 'application/x-msdownload' })).status).toBe(400);
  expect(m.ai).not.toHaveBeenCalled();
});
