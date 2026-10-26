import { afterEach, describe, expect, it, vi } from 'vitest';
import { imzola } from '../_shared/auth';
import { onRequestGet, onRequestPost } from './kompaniya-sozlama';

const ENV = { SESSIYA_KALIT: 'k'.repeat(32), SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_KEY: 'service' };
const OP = '22222222-2222-4222-8222-222222222222';
async function cookie(id = 183) {
  return 'sess=' + await imzola({ rol: 'boss', email: 'a@b.uz', foydalanuvchi_id: id, kompaniyalar: [{ kompaniya_id: 1, rol: 'boss' }] }, ENV.SESSIYA_KALIT);
}
function mockRpc(fn: (nom: string, body: any) => Response | unknown) {
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    const v = fn(String(url).split('/rpc/')[1], init?.body ? JSON.parse(String(init.body)) : {});
    return v instanceof Response ? v : Response.json(v);
  });
  vi.stubGlobal('fetch', f);
  return f;
}
const get = async (q: string, c?: string) => onRequestGet({ request: new Request('https://t.example/api/kompaniya-sozlama' + q, { headers: c ? { Cookie: c } : {} }), env: ENV, data: {} } as never);
const post = async (body: unknown, c?: string, h: Record<string, string> = {}) => onRequestPost({
  request: new Request('https://t.example/api/kompaniya-sozlama', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(c ? { Cookie: c } : {}), ...h }, body: JSON.stringify(body) }),
  env: ENV, data: {},
} as never);
afterEach(() => vi.unstubAllGlobals());

describe('/api/kompaniya-sozlama', () => {
  it('sessiyasiz → 401, RPC chaqirilmaydi', async () => {
    const f = mockRpc(() => ({}));
    expect((await get('?kompaniya_id=1')).status).toBe(401);
    expect((await post({ kompaniya_id: 1, kalit: 'f2.tasdiq_rejimi', qiymat: 'korporativ' })).status).toBe(401);
    expect(f).not.toHaveBeenCalled();
  });

  it('GET: actor sessiyadan olinadi (so‘rovdan emas), javob o‘tkaziladi', async () => {
    let yuk: any = null;
    mockRpc((nom, b) => { expect(nom).toBe('t2_kompaniya_sozlama_ol_v1'); yuk = b; return { ok: true, mavqe: 'pudratchi', f2_tasdiq_rejimi: 'shaxsiy', sozlamalar: {}, yozish_mumkin: true }; });
    const r = await get('?kompaniya_id=7&p_actor_id=1', await cookie(183));
    expect(r.status).toBe(200);
    expect(yuk).toEqual({ p_actor_id: 183, p_kompaniya_id: 7 });
    expect(await r.json()).toMatchObject({ ok: true, mavqe: 'pudratchi' });
  });

  it('ruxsat yo‘q → 403; migratsiya yo‘q → 404 SERVER_YANGILANMAGAN', async () => {
    mockRpc(() => ({ ok: false, code: 'AUTHORIZATION_DENIED' }));
    expect((await get('?kompaniya_id=7', await cookie())).status).toBe(403);
    mockRpc(() => new Response('{}', { status: 404 }));
    const r = await get('?kompaniya_id=7', await cookie());
    expect(r.status).toBe(404);
    expect(((await r.json()) as { code: string }).code).toBe('SERVER_YANGILANMAGAN');
  });

  it('POST: kalit/qiymat tekshiruvi bazaga yetmasdan', async () => {
    const f = mockRpc(() => ({ ok: true }));
    const c = await cookie();
    expect((await post({ kompaniya_id: 1, kalit: 'boshqa', qiymat: {} }, c)).status).toBe(400);
    expect((await post({ kompaniya_id: 1, kalit: 'f2.tasdiq_rejimi', qiymat: 'aralash' }, c)).status).toBe(400);
    expect((await post({ kompaniya_id: 1, kalit: 'hujjat.dizayn', qiymat: [1] }, c)).status).toBe(400);
    expect((await post({ kompaniya_id: 1, kalit: 'hujjat.dizayn', qiymat: { x: 'a'.repeat(20001) } }, c)).status).toBe(400);
    expect((await post({ kompaniya_id: 1, kalit: 'hujjat.dizayn', qiymat: {} }, c, { Origin: 'https://evil.example' })).status).toBe(403);
    expect(f).not.toHaveBeenCalled();
  });

  it('POST: muvaffaqiyat — operation_id o‘tkaziladi, null = o‘chirish', async () => {
    const yuklar: any[] = [];
    mockRpc((nom, b) => { expect(nom).toBe('t2_kompaniya_sozlama_saqla_v1'); yuklar.push(b); return { ok: true, kalit: b.p_kalit }; });
    const c = await cookie(183);
    expect((await post({ kompaniya_id: 3, kalit: 'f2.tasdiq_rejimi', qiymat: 'korporativ', operation_id: OP }, c)).status).toBe(200);
    expect((await post({ kompaniya_id: 3, kalit: 'hujjat.imzo_tomonlari', qiymat: null }, c)).status).toBe(200);
    expect(yuklar[0]).toEqual({ p_actor_id: 183, p_kompaniya_id: 3, p_kalit: 'f2.tasdiq_rejimi', p_qiymat: 'korporativ', p_operation_id: OP });
    expect(yuklar[1].p_qiymat).toBeNull();
    expect(yuklar[1].p_operation_id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
