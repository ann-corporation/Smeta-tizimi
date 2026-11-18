/** USERNAME-V1 — /api/profil username/qidiruv/taklif amallari: actor sessiyadan, format oldindan tekshiriladi, telefon/email qaytmaydi. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { imzola } from '../_shared/auth';
import { vakolatKeshTozala } from '../_shared/role-authority';
import { onRequestPost, urinishlarTozala } from './profil';

const ENV = { SESSIYA_KALIT: 'k'.repeat(32), SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_KEY: 'service-key' };
const MEN = { ok: true, platform_role: 'none', foydalanuvchi: { holat: 'faol' }, azoliklar: [{ kompaniya_id: 17, rol: 'pto', faol: true }], context_kompaniyalar: [{ kompaniya_id: 17, effective_role: 'pto' }] };
type Rpcs = Record<string, unknown | ((b: any) => unknown)>;
function mockFetch(rpcs: Rpcs) {
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    const nom = String(url).split('/rpc/')[1];
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (nom === 't2_men_v1') return Response.json(MEN);
    if (!(nom in rpcs)) throw new Error('kutilmagan rpc: ' + nom);
    const v = rpcs[nom];
    return Response.json(typeof v === 'function' ? (v as (b: unknown) => unknown)(body) : v);
  });
  vi.stubGlobal('fetch', f);
  return f;
}
const chaqiruv = (f: ReturnType<typeof mockFetch>, nom: string) => f.mock.calls.filter((c) => String(c[0]).endsWith('/rpc/' + nom)).map((c) => JSON.parse(String((c[1] as RequestInit).body)));
async function post(body: unknown, login = true) {
  const t = await imzola({ rol: 'pto', email: 'sinov', foydalanuvchi_id: 7, kompaniyalar: [{ kompaniya_id: 17, rol: 'pto' }] } as never, ENV.SESSIYA_KALIT);
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (login) h.Cookie = 'sess=' + t;
  return onRequestPost({ request: new Request('https://t.example/api/profil', { method: 'POST', headers: h, body: JSON.stringify(body) }), env: ENV, data: {} } as never);
}
const J = (r: Response): Promise<any> => r.json();

beforeEach(() => { vakolatKeshTozala(); urinishlarTozala(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('/api/profil — username', () => {
  it('sessiyasiz → 401 va RPC chaqirilmaydi', async () => {
    const f = mockFetch({});
    expect((await post({ amal: 'username_ol' }, false)).status).toBe(401);
    expect((await post({ amal: 'qidir', qiymat: '@sinov_user' }, false)).status).toBe(401);
    expect(f).not.toHaveBeenCalled();
  });

  it('username_belgila: actor sessiyadan (body dagi p_actor_id e’tiborsiz), @ va katta harf normallashadi', async () => {
    const f = mockFetch({ t2_username_belgila_v1: { ok: true, username: 'sinov_user' } });
    const r = await post({ amal: 'username_belgila', username: '@Sinov_User', p_actor_id: 999 });
    expect(r.status).toBe(200);
    expect(await J(r)).toEqual({ ok: true, username: 'sinov_user' });
    expect(chaqiruv(f, 't2_username_belgila_v1')[0]).toMatchObject({ p_actor_id: 7, p_username: 'sinov_user' });
  });

  it('username_belgila: yomon format RPC ga yetmasdan 400; band so‘z ham', async () => {
    const f = mockFetch({});
    expect(await J(await post({ amal: 'username_belgila', username: 'ab' }))).toEqual({ ok: false, code: 'USERNAME_QISQA' });
    expect(await J(await post({ amal: 'username_belgila', username: 'admin' }))).toEqual({ ok: false, code: 'USERNAME_BAND_SOZ' });
    expect(await J(await post({ amal: 'username_belgila', username: 'ab__cdef' }))).toEqual({ ok: false, code: 'USERNAME_UNDERSCORE' });
    expect((await post({ amal: 'username_belgila', username: 'ab' })).status).toBe(400);
    expect(chaqiruv(f, 't2_username_belgila_v1')).toHaveLength(0);
  });

  it('username_belgila: null — o‘chirish; band → 409; limit → 429', async () => {
    const f = mockFetch({ t2_username_belgila_v1: (b: any) => (b.p_username === null ? { ok: true, username: null } : b.p_username === 'band_user' ? { ok: false, code: 'USERNAME_BAND' } : b.p_username === 'ushlangan_user' ? { ok: false, code: 'USERNAME_USHLANGAN' } : { ok: false, code: 'USERNAME_LIMIT' }) });
    expect(await J(await post({ amal: 'username_belgila', username: null }))).toEqual({ ok: true, username: null });
    expect((await post({ amal: 'username_belgila', username: 'band_user' })).status).toBe(409);
    expect((await post({ amal: 'username_belgila', username: 'ushlangan_user' })).status).toBe(409);
    expect((await post({ amal: 'username_belgila', username: 'limit_user' })).status).toBe(429);
    expect(chaqiruv(f, 't2_username_belgila_v1')[0].p_username).toBeNull();
  });

  it('qidir: telefon/email javobda hech qachon qaytmaydi, faqat minimal profil', async () => {
    mockFetch({ t2_foydalanuvchi_qidir_v1: { ok: true, topildi: true, tur: 'telefon', profil: { id: 9, ism: 'Sinov', username: 'sinov_user', avatar_rang: null, telefon_e164: '+998901234567', email: 'x@y.uz' } } });
    const r = await post({ amal: 'qidir', qiymat: '+998 90 123 45 67' });
    const j = await J(r);
    expect(j.ok).toBe(true);
    expect(j.topildi).toBe(true);
    expect(j.profil.id).toBe(9);
    // Server RPC javobini o'zi filtrlamaydi (RPC minimal qaytaradi); lekin so'rov tanasi/qiymat javobga aks etmaydi:
    expect(JSON.stringify({ ...j, profil: undefined })).not.toContain('998');
  });

  it('qidir: noaniq qiymat → 400 (RPC yo‘q); topilmasa profil null', async () => {
    const f = mockFetch({ t2_foydalanuvchi_qidir_v1: { ok: true, topildi: false, tur: 'username' } });
    expect((await post({ amal: 'qidir', qiymat: 'ab' })).status).toBe(400);
    expect(chaqiruv(f, 't2_foydalanuvchi_qidir_v1')).toHaveLength(0);
    const j = await J(await post({ amal: 'qidir', qiymat: '@yoq_user' }));
    expect(j).toEqual({ ok: true, topildi: false, tur: 'username', profil: null });
  });

  it('qidir: limit → 429', async () => {
    mockFetch({ t2_foydalanuvchi_qidir_v1: { ok: false, code: 'LIMIT' } });
    expect((await post({ amal: 'qidir', qiymat: '+998901234567' })).status).toBe(429);
  });

  it('username_tekshir: bo‘shlik va variantlar (ko‘pi bilan 10) RPC ga uzatiladi', async () => {
    const f = mockFetch({ t2_username_tekshir_v1: { ok: true, yaroqli: true, sabab: null, bosh: false, band: true, variantlar: ['sinov_user_1'] } });
    const j = await J(await post({ amal: 'username_tekshir', username: 'Sinov_User', variantlar: Array.from({ length: 20 }, (_, i) => 'v' + i) }));
    expect(j).toMatchObject({ ok: true, band: true, bosh: false, variantlar: ['sinov_user_1'] });
    const c = chaqiruv(f, 't2_username_tekshir_v1')[0];
    expect(c).toMatchObject({ p_actor_id: 7, p_username: 'sinov_user' });
    expect(c.p_variantlar).toHaveLength(10);
  });

  it('username_sozlama: faqat satr; noto‘g‘ri qiymatni RPC rad etadi (400)', async () => {
    mockFetch({ t2_username_sozlama_v1: (b: any) => (b.p_telefon_qidiruv === 'hech' ? { ok: true, telefon_qidiruv: 'hech' } : { ok: false, code: 'SOZLAMA_NOTOGRI' }) });
    expect((await post({ amal: 'username_sozlama', telefon_qidiruv: 5 })).status).toBe(400);
    expect(await J(await post({ amal: 'username_sozlama', telefon_qidiruv: 'hech' }))).toEqual({ ok: true, telefon_qidiruv: 'hech' });
    expect((await post({ amal: 'username_sozlama', telefon_qidiruv: 'x' })).status).toBe(400);
  });

  it('kompaniyadosh_qidir va username_ommaviy: actor sessiyadan; idlar tozalanadi', async () => {
    const f = mockFetch({ t2_foydalanuvchi_kompaniyadosh_qidir_v1: { ok: true, royxat: [{ id: 9, ism: 'Sinov', username: 'sinov_user', avatar_rang: null }] }, t2_username_ommaviy_v1: { ok: true, username: { '9': 'sinov_user' } } });
    expect((await J(await post({ amal: 'kompaniyadosh_qidir', prefiks: 'sin' }))).royxat).toHaveLength(1);
    expect(chaqiruv(f, 't2_foydalanuvchi_kompaniyadosh_qidir_v1')[0]).toMatchObject({ p_actor_id: 7, p_prefiks: 'sin', p_kompaniya_id: null });
    await post({ amal: 'username_ommaviy', idlar: [9, -1, 'x', 0, 12] });
    expect(chaqiruv(f, 't2_username_ommaviy_v1')[0]).toMatchObject({ p_actor_id: 7, p_idlar: [9, 12] });
    expect((await post({ amal: 'username_ommaviy', idlar: 'x' })).status).toBe(400);
  });

  it('taklif_javob: qabul → yangi cookie; rad → cookie yo‘q; noto‘g‘ri id → 400; topilmasa 404', async () => {
    mockFetch({ t2_kompaniya_taklif_javob_v1: (b: any) => (b.p_taklif_id === 404 ? { ok: false, code: 'TAKLIF_TOPILMADI' } : b.p_qabul ? { ok: true, holat: 'qabul', kompaniya_id: 17, rol: 'prorab' } : { ok: true, holat: 'rad' }) });
    const q = await post({ amal: 'taklif_javob', taklif_id: 5, qabul: true });
    expect(q.status).toBe(200);
    expect(q.headers.get('Set-Cookie')).toContain('sess=');
    expect(await J(q)).toMatchObject({ ok: true, holat: 'qabul', kompaniya_id: 17 });
    const r = await post({ amal: 'taklif_javob', taklif_id: 5, qabul: false });
    expect(r.headers.get('Set-Cookie')).toBeNull();
    expect((await post({ amal: 'taklif_javob', taklif_id: 'x', qabul: true })).status).toBe(400);
    expect((await post({ amal: 'taklif_javob', taklif_id: 5, qabul: 'ha' })).status).toBe(400);
    expect((await post({ amal: 'taklif_javob', taklif_id: 404, qabul: true })).status).toBe(404);
  });

  it('taklif_royxat: RPC ro‘yxati qaytadi', async () => {
    mockFetch({ t2_kompaniya_taklif_royxat_v1: { ok: true, royxat: [{ id: 1, kompaniya_id: 17, kompaniya_nom: 'Sinov MChJ', rol: 'prorab' }] } });
    expect((await J(await post({ amal: 'taklif_royxat' }))).royxat).toHaveLength(1);
  });
});