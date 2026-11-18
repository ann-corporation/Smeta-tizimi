// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bahoQiymati, onRequestPost } from './ai-baho';
import { imzola } from '../_shared/auth';

const KEY = 'k'.repeat(32);
afterEach(() => vi.unstubAllGlobals());
async function post(body: unknown, opts: { kompaniyalar?: number[]; cookie?: boolean; origin?: string; rpc?: unknown } = {}) {
  const f = vi.fn(async () => Response.json(opts.rpc ?? { ok: true, id: 1 })); vi.stubGlobal('fetch', f);
  const sess = await imzola({ rol: 'prorab', foydalanuvchi_id: 9, kompaniyalar: (opts.kompaniyalar ?? [17]).map((kompaniya_id) => ({ kompaniya_id })) } as never, KEY);
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.cookie !== false) h.Cookie = 'sess=' + sess;
  if (opts.origin) h.Origin = opts.origin;
  const res = await onRequestPost({ request: new Request('https://x/api/ai-baho', { method: 'POST', headers: h, body: JSON.stringify(body) }), env: { SUPABASE_URL: 'https://a.supabase.co', SUPABASE_KEY: 'k', SESSIYA_KALIT: KEY } } as never);
  return { res, f, json: await res.json() as Record<string, unknown> };
}
describe('ai-baho', () => {
  it('bahoQiymati', () => { expect(bahoQiymati('yoqdi')).toBe(1); expect(bahoQiymati(-1)).toBe(-1); expect(bahoQiymati('x')).toBeNull(); });
  it('sessiyasiz 401, hech narsa yozilmaydi', async () => {
    const { res, f } = await post({ baho: 'yoqdi', yuza: 'jarvis' }, { cookie: false });
    expect(res.status).toBe(401); expect(f).not.toHaveBeenCalled();
  });
  it('begona origin 403', async () => { expect((await post({ baho: 1, yuza: 'jarvis' }, { origin: 'https://evil.example' })).res.status).toBe(403); });
  it('yaroqsiz baho/yuza/sabab 400', async () => {
    expect((await post({ baho: 5, yuza: 'jarvis' })).res.status).toBe(400);
    expect((await post({ baho: 1, yuza: 'Jarvis!' })).res.status).toBe(400);
    expect((await post({ baho: -1, yuza: 'jarvis', sabab: 'x' })).res.status).toBe(400);
  });
  it('begona kompaniya 403; bir nechta kompaniyada kompaniya_id kerak 422', async () => {
    expect((await post({ baho: 1, yuza: 'jarvis', kompaniya_id: 99 })).res.status).toBe(403);
    expect((await post({ baho: 1, yuza: 'jarvis' }, { kompaniyalar: [17, 18] })).res.status).toBe(422);
  });
  it('muvaffaqiyat: faqat baho/yuza/sabab RPC ga ketadi, matn yo\'q', async () => {
    const { res, f } = await post({ baho: 'yoqmadi', yuza: 'jarvis', sabab: 'tushunarsiz', matn: 'maxfiy savol' });
    expect(res.status).toBe(200);
    const body = JSON.parse((f.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(body).toEqual({ p_actor_id: 9, p_kompaniya_id: 17, p_baho: -1, p_yuza: 'jarvis', p_sabab: 'tushunarsiz' });
  });
  it('limit 429', async () => { expect((await post({ baho: 1, yuza: 'jarvis' }, { rpc: { ok: false, code: 'LIMIT' } })).res.status).toBe(429); });
});