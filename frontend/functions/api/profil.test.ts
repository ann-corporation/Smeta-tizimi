import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { imzola, tekshir, SESSIYA_MUDDAT_MS } from '../_shared/auth';
import { vakolatKeshTozala } from '../_shared/role-authority';
import { onRequestGet, onRequestPost, urinishlarTozala, URINISH_LIMIT } from './profil';

const ENV = { SESSIYA_KALIT: 'k'.repeat(32), SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_KEY: 'service-key' };
const PROFIL = { id: 7, login: 'anvar', email: 'a@b.uz', ism: 'Anvar', telefon: null, telefon_tasdiqlangan: false, til: 'uz', avatar_rang: '#112233',
  google_ulangan: false, parol_bor: true, parol_yangilandi: null, yaratildi: '2026-01-01T00:00:00Z' };
const MEN = { ok: true, platform_role: 'none', foydalanuvchi: { holat: 'faol' }, azoliklar: [{ kompaniya_id: 17, rol: 'pto', faol: true }], context_kompaniyalar: [{ kompaniya_id: 17, effective_role: 'pto' }] };

type Rpcs = Record<string, unknown | ((body: any) => unknown)>;
function mockFetch(rpcs: Rpcs, men: unknown = MEN) {
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    const nom = String(url).split('/rpc/')[1];
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (nom === 't2_men_v1') return Response.json(men);
    if (!(nom in rpcs)) throw new Error('kutilmagan rpc: ' + nom);
    const v = rpcs[nom];
    return Response.json(typeof v === 'function' ? (v as (b: unknown) => unknown)(body) : v);
  });
  vi.stubGlobal('fetch', f);
  return f;
}
const J = (r: Response): Promise<any> => r.json();
const rpcCalls = (f: ReturnType<typeof mockFetch>, nom: string) => f.mock.calls.filter((c) => String(c[0]).endsWith('/rpc/' + nom));

async function cookie(over: Record<string, unknown> = {}) {
  const t = await imzola({ rol: 'pto', email: 'anvar', foydalanuvchi_id: 7, kompaniyalar: [{ kompaniya_id: 17, rol: 'pto' }], ...over } as never, ENV.SESSIYA_KALIT);
  return 'sess=' + t;
}
const post = async (body: unknown, c?: string | null, headers: Record<string, string> = {}) => {
  const h: Record<string, string> = { 'Content-Type': 'application/json', ...headers };
  const ck = c === undefined ? await cookie() : c;
  if (ck) h.Cookie = ck;
  return onRequestPost({ request: new Request('https://t.example/api/profil', { method: 'POST', headers: h, body: JSON.stringify(body) }), env: ENV, data: {} } as never);
};
const get = async (c?: string | null) => {
  const ck = c === undefined ? await cookie() : c;
  return onRequestGet({ request: new Request('https://t.example/api/profil', { headers: ck ? { Cookie: ck } : {} }), env: ENV, data: {} } as never);
};

beforeEach(() => { vakolatKeshTozala(); urinishlarTozala(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('/api/profil — kirish va origin', () => {
  it('sessiyasiz GET/POST → 401 SESSIYA_YOQ', async () => {
    mockFetch({});
    for (const r of [await get(null), await post({ amal: 'yangila' }, null)]) {
      expect(r.status).toBe(401);
      expect(await J(r)).toEqual({ ok: false, code: 'SESSIYA_YOQ' });
    }
  });
  it('soxta/yaroqsiz cookie → 401', async () => {
    mockFetch({});
    expect((await get('sess=abc.def')).status).toBe(401);
  });
  it('boshqa saytdan POST → 403 ORIGIN_INVALID (RPC chaqirilmaydi)', async () => {
    const f = mockFetch({});
    const r = await post({ amal: 'parol', yangi: 'x'.repeat(10) }, undefined, { Origin: 'https://evil.example' });
    expect(r.status).toBe(403);
    expect((await J(r)).code).toBe('ORIGIN_INVALID');
    expect((await post({ amal: 'yangila' }, undefined, { 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403);
    expect(f).not.toHaveBeenCalled();
  });
});

describe('GET /api/profil', () => {
  it('shakl: profil + sessiya{boshlangan,tugaydi} + google; actor sessiyadan', async () => {
    const f = mockFetch({ t2_profil_ol_v1: { ok: true, profil: PROFIL } });
    const t0 = Date.now();
    const r = await get();
    expect(r.status).toBe(200);
    const j = await J(r);
    expect(j.ok).toBe(true);
    expect(j.profil).toEqual(PROFIL);
    expect(j.profil).not.toHaveProperty('parol_hash');
    expect(Date.parse(j.sessiya.tugaydi) - Date.parse(j.sessiya.boshlangan)).toBe(SESSIYA_MUDDAT_MS);
    expect(Math.abs(Date.parse(j.sessiya.boshlangan) - t0)).toBeLessThan(5000);
    expect(typeof j.google.clientId).toBe('string');
    expect(Array.isArray(j.google.originlar)).toBe(true);
    expect(JSON.parse(String(rpcCalls(f, 't2_profil_ol_v1')[0][1]!.body))).toEqual({ p_actor_id: 7 });
  });
});

describe('POST yangila', () => {
  it('ism/telefon/til/rang RPC ga o‘tadi (actor faqat sessiyadan, tanadagi actor e’tiborsiz), kesh tozalanadi', async () => {
    const f = mockFetch({ t2_profil_yangila_v1: { ok: true, profil: { ...PROFIL, ism: 'Yangi' } } });
    const r = await post({ amal: 'yangila', ism: 'Yangi', til: 'ru', actor_id: 999, p_actor_id: 999 });
    expect(r.status).toBe(200);
    expect((await J(r)).profil.ism).toBe('Yangi');
    expect(JSON.parse(String(rpcCalls(f, 't2_profil_yangila_v1')[0][1]!.body))).toEqual({ p_actor_id: 7, p_ism: 'Yangi', p_telefon: null, p_til: 'ru', p_avatar_rang: null });
  });
  it('tur noto‘g‘ri → 400; DB validatsiya kodi → 400', async () => {
    mockFetch({ t2_profil_yangila_v1: { ok: false, code: 'ISM_NOTOGRI' } });
    expect((await post({ amal: 'yangila', ism: 5 })).status).toBe(400);
    const r = await post({ amal: 'yangila', ism: 'x' });
    expect(r.status).toBe(400);
    expect(await J(r)).toEqual({ ok: false, code: 'ISM_NOTOGRI' });
  });
});

describe('POST parol', () => {
  it('muvaffaqiyat → {ok:true} + yangi Set-Cookie (shu qurilma qoladi), iat bekor vaqtidan keyin', async () => {
    const bekor = new Date(Date.now() + 5000).toISOString();    // soat siljishi: DB 5 s oldinda
    const f = mockFetch({ t2_parol_ozgartir_v1: { ok: true, sessiya_bekor_dan: bekor } });
    const eski = await cookie();
    const r = await post({ amal: 'parol', eski: 'eski-parol-1', yangi: 'yangi-parol-2' }, eski);
    expect(r.status).toBe(200);
    expect(await J(r)).toEqual({ ok: true });
    const sc = r.headers.get('Set-Cookie')!;
    expect(sc).toMatch(/^sess=[^;]+; HttpOnly; Secure; SameSite=Lax; Path=\/; Max-Age=7776000$/);
    expect(JSON.parse(String(rpcCalls(f, 't2_parol_ozgartir_v1')[0][1]!.body))).toEqual({ p_actor_id: 7, p_eski: 'eski-parol-1', p_yangi: 'yangi-parol-2' });
    const yangi = await tekshir(sc.split(';')[0], ENV.SESSIYA_KALIT);
    expect(yangi?.foydalanuvchi_id).toBe(7);
    expect(yangi?.kompaniyalar).toEqual([{ kompaniya_id: 17, rol: 'pto' }]);
    expect(yangi!.exp - SESSIYA_MUDDAT_MS).toBeGreaterThan(Date.parse(bekor));
  });
  it('ESKI_PAROL_XATO → 400 {ok:false, code}, cookie yo‘q', async () => {
    mockFetch({ t2_parol_ozgartir_v1: { ok: false, code: 'ESKI_PAROL_XATO' } });
    const r = await post({ amal: 'parol', eski: 'xato', yangi: 'yangi-parol-2' });
    expect(r.status).toBe(400);
    expect(await J(r)).toEqual({ ok: false, code: 'ESKI_PAROL_XATO' });
    expect(r.headers.get('Set-Cookie')).toBeNull();
  });
  it('PAROL_QISQA/UZUN/BIR_XIL → 400', async () => {
    for (const code of ['PAROL_QISQA', 'PAROL_UZUN', 'PAROL_BIR_XIL']) {
      mockFetch({ t2_parol_ozgartir_v1: { ok: false, code } });
      const r = await post({ amal: 'parol', yangi: 'abc' });
      expect([r.status, (await J(r)).code]).toEqual([400, code]);
    }
  });
  it(`${URINISH_LIMIT} ta noto‘g‘ri urinishdan keyin → 429 KOP_URINISH (RPC chaqirilmaydi); boshqa foydalanuvchiga tegmaydi; muvaffaqiyat nolga qaytaradi`, async () => {
    const f = mockFetch({ t2_parol_ozgartir_v1: { ok: false, code: 'ESKI_PAROL_XATO' } });
    for (let i = 0; i < URINISH_LIMIT; i++) expect((await post({ amal: 'parol', eski: 'x', yangi: 'yangi-parol-2' })).status).toBe(400);
    const n = rpcCalls(f, 't2_parol_ozgartir_v1').length;
    const r = await post({ amal: 'parol', eski: 'x', yangi: 'yangi-parol-2' });
    expect(r.status).toBe(429);
    expect((await J(r)).code).toBe('KOP_URINISH');
    expect(rpcCalls(f, 't2_parol_ozgartir_v1').length).toBe(n);
    // boshqa foydalanuvchi (id 8) bloklanmagan
    vakolatKeshTozala();
    mockFetch({ t2_parol_ozgartir_v1: { ok: true, sessiya_bekor_dan: new Date().toISOString() } });
    expect((await post({ amal: 'parol', eski: 'x', yangi: 'yangi-parol-2' }, await cookie({ foydalanuvchi_id: 8 }))).status).toBe(200);
  });
  it('yangi parol berilmasa → 400 TALAB_NOTOGRI', async () => {
    mockFetch({});
    expect((await post({ amal: 'parol' })).status).toBe(400);
  });
  it('RPC xatosi (500) → SERVER_XATO, DB matni qaytmaydi', async () => {
    const f = vi.fn(async (url: string) => String(url).endsWith('/rpc/t2_men_v1') ? Response.json(MEN) : new Response('{"message":"secret db detail password=abc"}', { status: 500 }));
    vi.stubGlobal('fetch', f);
    const r = await post({ amal: 'parol', eski: 'a', yangi: 'yangi-parol-2' });
    expect(r.status).toBe(500);
    const t = await r.text();
    expect(t).toBe(JSON.stringify({ ok: false, code: 'SERVER_XATO' }));
  });
});

describe('POST boshqa_sessiyalar_chiqish / google_uzish / amal', () => {
  it('boshqa_sessiyalar_chiqish → {ok:true} + yangi Set-Cookie', async () => {
    mockFetch({ t2_sessiya_bekor_v1: { ok: true, sessiya_bekor_dan: new Date().toISOString() } });
    const r = await post({ amal: 'boshqa_sessiyalar_chiqish' });
    expect(r.status).toBe(200);
    expect(await J(r)).toEqual({ ok: true });
    expect(r.headers.get('Set-Cookie')).toMatch(/^sess=[^;]+; HttpOnly; Secure; SameSite=Lax; Path=\/; Max-Age=7776000$/);
  });
  it('google_uzish: ok va GOOGLE_PAROLSIZ', async () => {
    mockFetch({ t2_google_uzish_v1: { ok: true, profil: PROFIL } });
    expect((await J(await post({ amal: 'google_uzish' }))).ok).toBe(true);
    mockFetch({ t2_google_uzish_v1: { ok: false, code: 'GOOGLE_PAROLSIZ' } });
    const r = await post({ amal: 'google_uzish' });
    expect([r.status, await J(r)]).toEqual([400, { ok: false, code: 'GOOGLE_PAROLSIZ' }]);
  });
  it('noma’lum amal → 400 AMAL_NOMALUM; JSON emas → 400 BODY_INVALID', async () => {
    mockFetch({});
    const r = await post({ amal: 'yoq_amal' });
    expect([r.status, await J(r)]).toEqual([400, { ok: false, code: 'AMAL_NOMALUM' }]);
    const bad = await onRequestPost({ request: new Request('https://t.example/api/profil', { method: 'POST', headers: { Cookie: await cookie() }, body: 'not json' }), env: ENV, data: {} } as never);
    expect(bad.status).toBe(400);
  });
});

describe('POST hisob_birlashtir', () => {
  const NATIJA = { ok: true, birlashtirilgan_id: 4, kochirilgan_kompaniyalar: [{ kompaniya_id: 123, rol: 'boss' }], qolgan_rollar: [{ kompaniya_id: 1, rol: 'superadmin', actor_rol: 'superadmin' }] };
  it('muvaffaqiyat: natija + yangi cookie (yangi a’zoliklar bilan), ikkala id uchun kesh tozalanadi', async () => {
    const yangiMen = { ...MEN, azoliklar: [{ kompaniya_id: 17, rol: 'pto', faol: true }, { kompaniya_id: 123, rol: 'boss', faol: true }],
      context_kompaniyalar: [{ kompaniya_id: 17, effective_role: 'pto' }, { kompaniya_id: 123, effective_role: 'boss' }] };
    const f = mockFetch({ t2_hisob_birlashtir_v1: NATIJA }, yangiMen);
    const r = await post({ amal: 'hisob_birlashtir', login: ' admin ', parol: 'admin-parol' });
    expect(r.status).toBe(200);
    const j = await J(r);
    expect(j).toEqual({ ok: true, kochirilgan_kompaniyalar: NATIJA.kochirilgan_kompaniyalar, qolgan_rollar: NATIJA.qolgan_rollar });
    expect(JSON.parse(String(rpcCalls(f, 't2_hisob_birlashtir_v1')[0][1]!.body))).toEqual({ p_actor_id: 7, p_login: 'admin', p_parol: 'admin-parol' });
    const yangi = await tekshir(r.headers.get('Set-Cookie')!.split(';')[0], ENV.SESSIYA_KALIT);
    expect(yangi?.kompaniyalar?.map((k) => k.kompaniya_id)).toEqual([17, 123]);
    expect(yangi).not.toHaveProperty('permissionsByCompany');
  });
  it('LOGIN_PAROL_XATO → 400; 5 xatodan keyin 429 KOP_URINISH (parol almashtirish bilan umumiy hisob)', async () => {
    const f = mockFetch({ t2_hisob_birlashtir_v1: { ok: false, code: 'LOGIN_PAROL_XATO' } });
    for (let i = 0; i < URINISH_LIMIT; i++) {
      const r = await post({ amal: 'hisob_birlashtir', login: 'admin', parol: 'x' });
      expect([r.status, (await J(r)).code]).toEqual([400, 'LOGIN_PAROL_XATO']);
    }
    expect((await post({ amal: 'hisob_birlashtir', login: 'admin', parol: 'x' })).status).toBe(429);
    expect((await post({ amal: 'parol', eski: 'x', yangi: 'yangi-parol-2' })).status).toBe(429);
    expect(rpcCalls(f, 't2_hisob_birlashtir_v1').length).toBe(URINISH_LIMIT);
  });
  it('OZI / PAROLSIZ_HISOB → 400; login yoki parol yo‘q → 400 TALAB_NOTOGRI', async () => {
    mockFetch({ t2_hisob_birlashtir_v1: { ok: false, code: 'PAROLSIZ_HISOB' } });
    expect((await J(await post({ amal: 'hisob_birlashtir', login: 'x', parol: 'y' }))).code).toBe('PAROLSIZ_HISOB');
    expect((await post({ amal: 'hisob_birlashtir', login: '', parol: 'y' })).status).toBe(400);
    expect((await post({ amal: 'hisob_birlashtir', login: 'x' })).status).toBe(400);
  });
});

describe('POST google_ulash', () => {
  it('yaroqsiz Google token → 400 GOOGLE_TOKEN_YAROQSIZ (RPC chaqirilmaydi)', async () => {
    const f = vi.fn(async (url: string) => {
      if (String(url).includes('googleapis.com')) return Response.json({ keys: [] });
      if (String(url).endsWith('/rpc/t2_men_v1')) return Response.json(MEN);
      throw new Error('kutilmagan: ' + url);
    });
    vi.stubGlobal('fetch', f);
    const r = await post({ amal: 'google_ulash', credential: 'a.b.c' });
    expect(r.status).toBe(400);
    expect((await J(r)).code).toBe('GOOGLE_TOKEN_YAROQSIZ');
    expect(f.mock.calls.some((c) => String(c[0]).includes('t2_google_ulash_v1'))).toBe(false);
  });
  it('credential yo‘q → 400 TALAB_NOTOGRI', async () => {
    mockFetch({});
    expect((await post({ amal: 'google_ulash' })).status).toBe(400);
  });
});

describe('/api/profil — migratsiya hali qo‘llanmagan', () => {
  it('RPC bazada yo‘q (PostgREST 404) → 404 SERVER_YANGILANMAGAN, 500 emas', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => String(url).endsWith('/rpc/t2_men_v1')
      ? Response.json(MEN) : new Response('{"code":"PGRST202"}', { status: 404 })));
    const r = await get();
    expect(r.status).toBe(404);
    expect(await J(r)).toEqual({ ok: false, code: 'SERVER_YANGILANMAGAN' });
  });
});
