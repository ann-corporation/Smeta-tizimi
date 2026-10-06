import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ tekshir: vi.fn() }));
vi.mock('../_shared/auth', () => ({ tekshir: m.tekshir }));

import { onRequestGet, onRequestPost } from './agent-ish';

const env = (o: Record<string, unknown> = {}) => ({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_KEY: 'svc', SESSIYA_KALIT: 's', AGENT_ISH_YOQILGAN: '1', GROQ_API_KEY: 'g', ...o });
const post = (body: unknown, e = env()) => onRequestPost({ request: new Request('https://t/api/agent-ish', { method: 'POST', body: JSON.stringify(body) }), env: e } as never);

const rpcJavob = (d: unknown) => new Response(JSON.stringify(d), { status: 200 });

beforeEach(() => { m.tekshir.mockResolvedValue({ foydalanuvchi_id: 7 }); });
afterEach(() => vi.unstubAllGlobals());

describe('agent-ish shlyuzi', () => {
  it('yoqilmagan bo‘lsa 503 (hech narsa chaqirilmaydi)', async () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f);
    const r = await post({ amal: 'savol', savol: 'salom' }, env({ AGENT_ISH_YOQILGAN: undefined }));
    expect(r.status).toBe(503); expect(f).not.toHaveBeenCalled();
  });

  it('sessiyasiz 401', async () => {
    m.tekshir.mockResolvedValue(null);
    expect((await post({ amal: 'savol', savol: 'salom' })).status).toBe(401);
  });

  it('doira bazada rad etilsa model CHAQIRILMAYDI (token sarflanmaydi)', async () => {
    const f = vi.fn(async () => rpcJavob({ ok: false, code: 'COMPANY_ACCESS_DENIED' })); vi.stubGlobal('fetch', f);
    const r = await post({ amal: 'savol', savol: 'salom', kompaniya_id: 5 });
    expect(r.status).toBe(403);
    expect(f).toHaveBeenCalledTimes(1);
    expect(String((f.mock.calls[0] as unknown as [string])[0])).toContain('t2_agent_muhit_v1');
  });

  it('global doira (kompaniya_id yo‘q) null sifatida bazaga ketadi; actor sessiyadan', async () => {
    const f = vi.fn(async () => rpcJavob({ ok: false, code: 'GLOBAL_SCOPE_DENIED' })); vi.stubGlobal('fetch', f);
    const r = await post({ amal: 'savol', savol: 'salom', p_actor_id: 999 });
    expect(r.status).toBe(403);
    const yuk = JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(yuk).toMatchObject({ p_actor_id: 7, p_kompaniya_id: null });
  });

  it('veb_ol: tasdiqlanmagan domenga tashqi so‘rov yuborilmaydi', async () => {
    const f = vi.fn(async (u: string) => (String(u).includes('t2_agent_veb_ruxsat_v1') ? rpcJavob({ ok: false, code: 'MANBA_TASDIQLANMAGAN' }) : new Response('x')));
    vi.stubGlobal('fetch', f);
    const r = await post({ amal: 'veb_ol', url: 'https://norma.uz/a', kompaniya_id: 5 });
    expect(r.status).toBe(400);
    expect(f.mock.calls.every(([u]) => String(u).includes('supabase.co'))).toBe(true);
  });

  it('takliflar GET noto‘g‘ri kompaniya_id ni rad etadi', async () => {
    const r = await onRequestGet({ request: new Request('https://t/api/agent-ish?bolim=muhit&kompaniya_id=abc'), env: env() } as never);
    expect(r.status).toBe(400);
  });

  it('noma‘lum amal rad', async () => {
    vi.stubGlobal('fetch', vi.fn());
    expect((await post({ amal: 'sql_yoz' })).status).toBe(400);
  });
});
