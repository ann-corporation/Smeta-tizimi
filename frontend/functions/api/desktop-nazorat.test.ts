// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { imzola } from '../_shared/auth';
import { base64url, DESKTOP_ORIGIN, DESKTOP_VERSION_HEADER, deviceHash } from '../_shared/desktop-device';
import { vakolatKeshTozala } from '../_shared/role-authority';
import { otaKeshTozala } from '../_shared/ota-kesh';
import { onRequestPost as gateway } from './desktop/bff';
import { onRequestPost as issue } from './desktop/qurilma';
import { onRequestPost as lease } from './desktop/lease';
import { onRequestGet as nazoratGet, onRequestPost as nazoratPost } from './desktop/nazorat';
import { onRequestGet as yangilanish } from './desktop/yangilanish';

const env = { SUPABASE_URL: 'https://synthetic.supabase.co', SUPABASE_KEY: 'synthetic-only', SESSIYA_KALIT: 'synthetic-only'.repeat(3),
  GAS_URL: 'https://synthetic.invalid', GAS_TOKEN: 'synthetic', DESKTOP_LEASE_SK: '', DESKTOP_LEASE_KID: 'desktop-lease-v1' };
const deviceId = '00000000-0000-4000-8000-000000000001';
const op = '00000000-0000-4000-8000-000000000002';
const token = base64url(new Uint8Array(32).fill(33));
let verify: Record<string, unknown>;
let enroll: Record<string, unknown>;
let leaseQuota: Record<string, unknown>;
let rpc: Record<string, unknown>;
let calls: { path: string; body: any }[] = [];
beforeEach(() => {
  calls = [];
  verify = { ok: true, device_id: deviceId, foydalanuvchi_id: 7, tugaydi: Date.now() + 86400_000, sessiya_exp: Date.now() + 86400_000, versiya: 1 };
  enroll = { ok: true };
  leaseQuota = { ok: true, lease_ms: 3600_000 };
  rpc = { ok: true, qurilmalar: [] };
  vakolatKeshTozala(); otaKeshTozala();
  vi.stubGlobal('fetch', vi.fn(async (raw: string, init?: RequestInit) => {
    const u = new URL(String(raw));
    const b = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ path: u.pathname, body: b });
    if (u.pathname.endsWith('/t2_desktop_qurilma_tekshir_v2')) return Response.json(b.p_token_hash === await deviceHash(token) ? verify : { ok: false });
    if (u.pathname.endsWith('/t2_desktop_qurilma_yarat_v2')) return Response.json(enroll.ok ? { ok: true, device_id: b.p_device_id, tugaydi: b.p_sessiya_exp } : enroll);
    if (u.pathname.endsWith('/t2_desktop_lease_chegara_v2')) return Response.json(leaseQuota);
    if (/t2_desktop_(boshqaruv|siyosat_saqla|yangilanish)/.test(u.pathname)) return Response.json(rpc);
    if (u.pathname.endsWith('/t2_men_v1')) return Response.json({ ok: true, platform_role: 'none', foydalanuvchi: { holat: 'faol' },
      context_kompaniyalar: [{ kompaniya_id: 8, effective_role: 'boss', permissions: ['company.read','smeta.read','f2.read','narx.read'] }] });
    if (u.pathname === '/rest/v1/t2_obyekt') return Response.json([{ kompaniya_id: 8 }]);
    throw new Error('Unexpected synthetic upstream: ' + u.pathname);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vakolatKeshTozala(); otaKeshTozala(); });
const ctx = (request: Request, overrides = {}) => ({ request, env: { ...env, ...overrides }, data: {}, next: vi.fn() } as never);
function native(path: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request('https://site.test' + path, { method: 'POST', headers: { Authorization: 'Bearer ' + token, Origin: DESKTOP_ORIGIN, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body ?? {}) });
}
async function web(path: string, method: string, body?: unknown, origin: string | null = 'https://site.test') {
  const cookie = 'sess=' + await imzola({ rol: 'superadmin', foydalanuvchi_id: 7 }, env.SESSIYA_KALIT);
  return new Request('https://site.test' + path, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

describe('desktop policy enforcement at the BFF', () => {
  it.each(['DESKTOP_DISABLED', 'DESKTOP_UPDATE_REQUIRED'])('verify refusal %s → 401 with explicit code (client revoke path)', async code => {
    verify = { ok: false, code };
    for (const r of [await gateway(ctx(native('/api/desktop/bff', { path: '/api/sessiya', method: 'GET' }))),
      await lease(ctx(native('/api/desktop/lease', { kompaniya_id: 8, obyekt_idlar: [4] })))]) {
      expect(r.status).toBe(401);
      expect(await r.json()).toMatchObject({ ok: false, code });
    }
  });
  it('passes the reported app version to verify (never trusted beyond format)', async () => {
    await gateway(ctx(native('/api/desktop/bff', { path: '/api/sessiya', method: 'GET' }, { [DESKTOP_VERSION_HEADER]: '1.4.2' })));
    expect(calls.find(c => c.path.endsWith('/t2_desktop_qurilma_tekshir_v2'))!.body.p_ilova_versiya).toBe('1.4.2');
    calls = [];
    await gateway(ctx(native('/api/desktop/bff', { path: '/api/sessiya', method: 'GET' }, { [DESKTOP_VERSION_HEADER]: '1.4.2; drop' })));
    expect(calls.find(c => c.path.endsWith('/t2_desktop_qurilma_tekshir_v2'))!.body.p_ilova_versiya).toBeNull();
  });
  it('enroll sends sanitized metadata and maps policy codes', async () => {
    const r = await issue(ctx(await web('/api/desktop/qurilma', 'POST', { operation_id: op, qurilma_nomi: 'PC\u0000-1', os: 'windows', ilova_versiya: '0.1.0' })));
    expect(r.status).toBe(200);
    expect(calls.find(c => c.path.endsWith('/t2_desktop_qurilma_yarat_v2'))!.body).toMatchObject({ p_actor_id: 7, p_qurilma_nomi: 'PC-1', p_os: 'windows', p_ilova_versiya: '0.1.0' });
    enroll = { ok: false, code: 'DESKTOP_DISABLED' };
    expect((await issue(ctx(await web('/api/desktop/qurilma', 'POST', { operation_id: op })))).status).toBe(403);
    enroll = { ok: false, code: 'DESKTOP_UPDATE_REQUIRED', min_versiya: '1.2.0' };
    const u = await issue(ctx(await web('/api/desktop/qurilma', 'POST', { operation_id: op })));
    expect(u.status).toBe(426); expect(await u.json()).toMatchObject({ code: 'DESKTOP_UPDATE_REQUIRED', min_versiya: '1.2.0' });
  });
  it('lease: company policy codes are 403 (credential kept), lease length follows policy', async () => {
    leaseQuota = { ok: false, code: 'DESKTOP_OFFLINE_DISABLED' };
    const r = await lease(ctx(native('/api/desktop/lease', { kompaniya_id: 8, obyekt_idlar: [4, 5] })));
    expect(r.status).toBe(403); expect(await r.json()).toMatchObject({ code: 'DESKTOP_OFFLINE_DISABLED' });
    expect(calls.find(c => c.path.endsWith('/t2_desktop_lease_chegara_v2'))!.body).toMatchObject({ p_kompaniya_id: 8, p_obyekt_soni: 2, p_actor_id: 7 });
  });
});

describe('/api/desktop/nazorat', () => {
  it('actor comes from the session, never from the body; company scope is passed through', async () => {
    const r = await nazoratGet(ctx(await web('/api/desktop/nazorat?kompaniya_id=8', 'GET')));
    expect(r.status).toBe(200);
    expect(calls.find(c => c.path.endsWith('/t2_desktop_boshqaruv_v1'))!.body).toEqual({ p_actor_id: 7, p_kompaniya_id: 8 });
    await nazoratPost(ctx(await web('/api/desktop/nazorat', 'POST', { action: 'bekor', device_id: deviceId, kompaniya_id: 8, sabab: 'yo‘qolgan', operation_id: op, p_actor_id: 1, actor_id: 1 })));
    expect(calls.find(c => c.path.endsWith('/t2_desktop_boshqaruv_buyruq_v1'))!.body).toMatchObject({ p_actor_id: 7, p_amal: 'bekor', p_kompaniya_id: 8, p_device_id: deviceId });
  });
  it('maps DB authorization refusals to 403 and keeps no-store', async () => {
    rpc = { ok: false, code: 'AUTHORIZATION_DENIED' };
    const r = await nazoratGet(ctx(await web('/api/desktop/nazorat', 'GET')));
    expect(r.status).toBe(403); expect(r.headers.get('Cache-Control')).toBe('no-store');
    rpc = { ok: false, code: 'TENANT_FORBIDDEN' };
    expect((await nazoratPost(ctx(await web('/api/desktop/nazorat', 'POST', { action: 'foydalanuvchi_bekor', foydalanuvchi_id: 9, kompaniya_id: 8, sabab: 'test', operation_id: op })))).status).toBe(403);
  });
  it('refuses desktop bearer, missing session, cross-site POST and malformed commands', async () => {
    expect((await nazoratGet(ctx(native('/api/desktop/nazorat')))).status).toBe(401);
    expect((await nazoratGet(ctx(new Request('https://site.test/api/desktop/nazorat')))).status).toBe(401);
    expect((await nazoratPost(ctx(await web('/api/desktop/nazorat', 'POST', { action: 'bekor', device_id: deviceId, sabab: 'x', operation_id: op }, 'https://evil.test')))).status).toBe(403);
    expect((await nazoratPost(ctx(await web('/api/desktop/nazorat', 'POST', { action: 'sql', operation_id: op })))).status).toBe(400);
    expect((await nazoratPost(ctx(await web('/api/desktop/nazorat', 'POST', { action: 'bekor', device_id: 'x', operation_id: op })))).status).toBe(400);
    expect((await nazoratPost(ctx(await web('/api/desktop/nazorat', 'POST', { action: 'bekor', device_id: deviceId })))).status).toBe(400);
    expect((await nazoratGet(ctx(await web('/api/desktop/nazorat?kompaniya_id=abc', 'GET')))).status).toBe(400);
    expect(calls.some(c => /t2_desktop_boshqaruv/.test(c.path))).toBe(false);
  });
  it('policy save forwards scope and value object only', async () => {
    const r = await nazoratPost(ctx(await web('/api/desktop/nazorat', 'POST', { action: 'siyosat', manba: 'platforma', kompaniya_id: null,
      qiymat: { yoqilgan: false }, sabab: 'avariya', expected_versiya: 3, operation_id: op })));
    expect(r.status).toBe(200);
    expect(calls.find(c => c.path.endsWith('/t2_desktop_siyosat_saqla_v1'))!.body).toEqual({ p_actor_id: 7, p_kompaniya_id: null, p_manba: 'platforma',
      p_qiymat: { yoqilgan: false }, p_sabab: 'avariya', p_expected_versiya: 3, p_operation_id: op });
  });
  it('download info needs a live web session (revoked/merged account → 401 via roleAuthority)', async () => {
    expect((await yangilanish(ctx(new Request('https://site.test/api/desktop/yangilanish')))).status).toBe(401);
    const asl = fetch;
    vi.stubGlobal('fetch', vi.fn(async (raw: string, init?: RequestInit) => new URL(String(raw)).pathname.endsWith('/t2_men_v1')
      ? Response.json({ ok: false, code: 'ACTOR_NOT_FOUND' }) : (asl as any)(raw, init)));
    vakolatKeshTozala();
    expect((await yangilanish(ctx(await web('/api/desktop/yangilanish', 'GET')))).status).toBe(401);
    expect(calls.some(c => c.path.endsWith('/t2_desktop_yangilanish_v1'))).toBe(false);
    vi.stubGlobal('fetch', asl); vakolatKeshTozala();
    rpc = { ok: true, joriy_versiya: '0.2.0', yuklab_olish_url: 'https://example.invalid/setup.exe' };
    expect(await (await yangilanish(ctx(await web('/api/desktop/yangilanish', 'GET')))).json()).toMatchObject({ joriy_versiya: '0.2.0' });
  });
});
