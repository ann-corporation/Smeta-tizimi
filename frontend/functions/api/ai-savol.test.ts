import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ auth: vi.fn(), ai: vi.fn() }));
vi.mock('../_shared/auth', () => ({ tekshir: m.auth }));
vi.mock('../_shared/ai', () => ({ aiCall: m.ai, aiPublicError: () => ({ code: 'provider_unavailable', message: 'AI hozir javob bera olmadi' }) }));
import { onRequestPost } from './ai-savol';
const data = { ok: true, izoh: '', obyektlar: [{ id: 79, nom: 'Fast Food 1-etaj', smeta: 10, fakt: 20, f2: 241983934.96, narxsiz: 0, toliq: true }] };
const run = (savol: string, kompaniya_id = 17, extra = {}) => onRequestPost({ request: new Request('https://x/api/ai-savol', { method: 'POST', body: JSON.stringify({ savol, kompaniya_id }) }), env: { SESSIYA_KALIT: 'test', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_KEY: 'test', ...extra } } as never);
beforeEach(() => { m.auth.mockResolvedValue({ kompaniyalar: [{ kompaniya_id: 17 }] }); m.ai.mockReset(); vi.stubGlobal('fetch', vi.fn(async () => Response.json(data))); });
afterEach(() => vi.unstubAllGlobals());
it('salom va help pullik model yoki DB chaqirmaydi', async () => {
  for (const q of ['salom', 'nimalar qila olasan']) expect((await run(q)).status).toBe(200);
  expect(fetch).not.toHaveBeenCalled(); expect(m.ai).not.toHaveBeenCalled();
});
it('unauthorized tenant model va DBga chiqmaydi', async () => {
  expect((await run('F2 qancha', 99)).status).toBe(403);
  expect(fetch).not.toHaveBeenCalled(); expect(m.ai).not.toHaveBeenCalled();
});
it('F2 exact qiymati local dalil javobida qoladi', async () => {
  const r = await (await run('Fast Food 1-etaj F2 jami qancha?')).json() as { javob: string; provider: string; dalil: { id: number } };
  expect(r.javob.replace(/\s/g, '')).toContain('241983934,96'); expect(r.provider).toBe('local'); expect(r.dalil.id).toBe(17); expect(m.ai).not.toHaveBeenCalled();
});
it('OpenRouter configured bo‘lsa Workers AI binding uni chetlab o‘tmaydi', async () => {
  const worker = vi.fn(); m.ai.mockResolvedValue({ text: 'Dalilli javob', provider: 'openrouter', model: 'configured' });
  const r = await (await run('Narxlar haqida tushuntir', 17, { OPENROUTER_API_KEY: 'test', AI: { run: worker } })).json() as { provider: string };
  expect(r.provider).toBe('openrouter'); expect(worker).not.toHaveBeenCalled();
  expect(m.ai.mock.calls[0][0].AI_PRIMARY_PROVIDER).toBe('openrouter');
  expect(m.ai.mock.calls[0][1].text.replace(/\s/g, '')).toContain('241983934,96');
});
it('sessiyasiz help ham yopiq', async () => {
  m.auth.mockResolvedValue(null); expect((await run('nimalar qila olasan')).status).toBe(401);
});
