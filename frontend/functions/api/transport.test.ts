// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Sess } from '../_shared/auth';
import { vakolatKeshTozala } from '../_shared/role-authority';
import { onRequestPost } from './transport';

// Faqat sintetik ma'lumot: haqiqiy summa, nom, INN yo'q.
const env = { SUPABASE_URL: 'https://synthetic.supabase.co', SUPABASE_KEY: 'synthetic-service', SESSIYA_KALIT: 'k'.repeat(32) };
const mk = (perms: string[], denials: string[] = []): Sess => ({ rol: 'pto', exp: Date.now() + 600000, jti: 'synthetic', foydalanuvchi_id: 7,
  kompaniyalar: [{ kompaniya_id: 1, rol: 'pto' }], permissionsByCompany: { 1: perms }, explicitDenialsByCompany: { 1: denials } } as unknown as Sess);
const TOLIQ = mk(['smeta.read', 'smeta.write']);
const FAQAT_OQISH = mk(['smeta.read']);
const post = (body: unknown, sess: Sess | null = TOLIQ, headers: Record<string, string> = {}) => onRequestPost({
  request: new Request('https://smeta.example/api/transport', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ kompaniya_id: 1, ...(body as object) }) }),
  env, data: sess ? { roleAuthority: structuredClone(sess) } : {},
} as never);

type Chaqiruv = { nom: string; body: Record<string, any> };
let ch: Chaqiruv[]; let rpcJavob: { status: number; body: unknown };
const GURUH = { material: 'Sintetik shag‘al', zichlik: 1.5, km: 20, miqdor: 10, hisob_tkm: 300, kodlar: ['12303'] };
const YOY = { amal: 'yoy', obyekt_id: 5, rz_id: 9, tkm_narx: 100, qatorlar: [GURUH] };

beforeEach(() => {
  ch = []; rpcJavob = { status: 200, body: { ok: true } };
  vi.stubGlobal('fetch', vi.fn(async (url: unknown, init?: RequestInit) => {
    const u = String(url); const nom = /\/rpc\/([a-z0-9_]+)/.exec(u)?.[1];
    if (nom) { ch.push({ nom, body: JSON.parse(String(init?.body ?? '{}')) }); return Response.json(rpcJavob.body, { status: rpcJavob.status }); }
    if (u.includes('/rest/v1/t2_obyekt?')) return Response.json(u.includes('kompaniya_id=eq.1') && u.includes('id=eq.5') ? [{ id: 5 }] : []);
    return Response.json([]);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vakolatKeshTozala(); });

it('anonim so‘rov hech qanday chaqiruvsiz 401; begona kompaniya 403', async () => {
  expect((await post({ amal: 'audit', obyekt_id: 5 }, null)).status).toBe(401);
  const r = await onRequestPost({ request: new Request('https://smeta.example/api/transport', { method: 'POST', body: JSON.stringify({ amal: 'audit', obyekt_id: 5, kompaniya_id: 2 }) }), env, data: { roleAuthority: structuredClone(TOLIQ) } } as never);
  expect(r.status).toBe(403);
  expect(ch.length).toBe(0);
});

it('tanadagi actor_id rad etiladi; cross-site rad', async () => {
  expect((await post({ amal: 'audit', obyekt_id: 5, actor_id: 99 })).status).toBe(400);
  expect((await post({ amal: 'audit', obyekt_id: 5 }, TOLIQ, { 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403);
  expect(ch.length).toBe(0);
});

it('audit: smeta.read yetarli; RPC ga aktor sessiyadan qo‘yiladi', async () => {
  rpcJavob = { status: 200, body: { ok: true, obyekt_id: 5, xulosa: { xato_soni: 0 }, xatolar: [] } };
  const r = await post({ amal: 'audit', obyekt_id: 5 }, FAQAT_OQISH);
  expect(r.status).toBe(200);
  expect(ch).toEqual([{ nom: 't2_qator_transport_audit_v1', body: { p_actor_id: 7, p_obyekt_id: 5 } }]);
});

it('begona/yo‘q obyekt — bir xil 404, RPC chaqirilmaydi', async () => {
  expect((await post({ amal: 'audit', obyekt_id: 6 })).status).toBe(404);
  expect(ch.length).toBe(0);
});

it('yoy va belgila smeta.write talab qiladi (faqat o‘qish ruxsati 403, RPC chaqirilmaydi)', async () => {
  expect((await post(YOY, FAQAT_OQISH)).status).toBe(403);
  expect((await post({ amal: 'belgila', obyekt_id: 5, qator_idlar: [1], usul: 'tkm' }, FAQAT_OQISH)).status).toBe(403);
  expect((await post(YOY, mk(['smeta.read', 'smeta.write'], ['smeta.write']))).status).toBe(403);
  expect(ch.length).toBe(0);
});

it('yoy preview: sukut p_yoz=false, majburiy=false; bloklangan guruhlar qaytadi', async () => {
  rpcJavob = { status: 200, body: { ok: true, yozildi: false, bloklangan: true, guruhlar: [{ material: 'Sintetik', holat: 'chetlanish' }] } };
  const r = await post(YOY);
  const j = await r.json() as Record<string, any>;
  expect(r.status).toBe(200);
  expect(j).toMatchObject({ ok: true, bloklangan: true });
  expect(ch).toHaveLength(1);
  expect(ch[0]).toMatchObject({ nom: 't2_qator_transport_yoy_v1', body: { p_actor_id: 7, p_obyekt_id: 5, p_rz_id: 9, p_tkm_narx: 100, p_majburiy: false, p_yoz: false } });
});

it('yoy yozish: yoz:true va majburiy faqat aniq true bo‘lsa yuboriladi', async () => {
  rpcJavob = { status: 200, body: { ok: true, yozildi: true, bloklangan: true, yaratildi: 2, guruhlar: [] } };
  expect((await post({ ...YOY, yoz: true, majburiy: 'ha' })).status).toBe(200);
  expect(ch[0].body).toMatchObject({ p_yoz: true, p_majburiy: false });
  ch.length = 0;
  expect((await post({ ...YOY, yoz: true, majburiy: true })).status).toBe(200);
  expect(ch[0].body).toMatchObject({ p_yoz: true, p_majburiy: true });
});

it('RPC TASDIQ_KERAK xato emas — jadval qaytadi; boshqa ok:false — 409 kod bilan', async () => {
  rpcJavob = { status: 200, body: { ok: false, code: 'TASDIQ_KERAK', bloklangan: true, guruhlar: [] } };
  const a = await post({ ...YOY, yoz: true });
  expect(a.status).toBe(200);
  expect(await a.json()).toMatchObject({ code: 'TASDIQ_KERAK', bloklangan: true });
  rpcJavob = { status: 200, body: { ok: false, code: 'RZ_YOQ', error: 'rz_id shu obyektda topilmadi' } };
  const b = await post(YOY);
  expect(b.status).toBe(409);
  expect(await b.json()).toMatchObject({ ok: false, code: 'RZ_YOQ' });
});

it('belgila: usul tekshiriladi, RPC ga massiv va aktor ketadi; RPC rad etsa 409', async () => {
  expect((await post({ amal: 'belgila', obyekt_id: 5, qator_idlar: [1], usul: 'ish' })).status).toBe(400);
  expect((await post({ amal: 'belgila', obyekt_id: 5, qator_idlar: [], usul: 'tkm' })).status).toBe(400);
  expect(ch.length).toBe(0);
  rpcJavob = { status: 200, body: { ok: true, usul: 'tkm', ozgardi: 1 } };
  expect((await post({ amal: 'belgila', obyekt_id: 5, qator_idlar: [3, 3, 4], usul: 'tkm' })).status).toBe(200);
  expect(ch[0]).toEqual({ nom: 't2_qator_transport_belgila_v1', body: { p_actor_id: 7, p_obyekt_id: 5, p_qator_idlar: [3, 4], p_usul: 'tkm' } });
  rpcJavob = { status: 200, body: { ok: false, code: 'TKM_QATOR_BOR', error: 'Faol t·km qatori bor', qator_idlar: [3] } };
  const r = await post({ amal: 'belgila', obyekt_id: 5, qator_idlar: [3], usul: 'foiz' });
  expect(r.status).toBe(409);
  expect(await r.json()).toMatchObject({ code: 'TKM_QATOR_BOR', qator_idlar: [3] });
});

it('baza ruxsat bermasa (42501) 403; funksiya yo‘q bo‘lsa 501; noma‘lum amal 400', async () => {
  rpcJavob = { status: 403, body: { code: '42501', message: 'permission' } };
  expect((await post({ amal: 'audit', obyekt_id: 5 })).status).toBe(403);
  rpcJavob = { status: 404, body: { code: 'PGRST202' } };
  expect((await post({ amal: 'audit', obyekt_id: 5 })).status).toBe(501);
  expect((await post({ amal: 'yoq' })).status).toBe(400);
});
