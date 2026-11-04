// @vitest-environment node
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { imzola, sessiyaOl } from '../_shared/auth';
import { base64url, unbase64url, DESKTOP_ORIGIN, desktopCsrfAllowed, deviceHash } from '../_shared/desktop-device';
import { LEASE_MAX_MS, signDesktopLease, verifyDesktopLease, type DesktopLeaseEnvelope, type DesktopLeasePayload } from '../_shared/desktop-lease';
import { vakolatKeshTozala } from '../_shared/role-authority';
import { otaKeshTozala } from '../_shared/ota-kesh';
import { onRequestPost as gateway } from './desktop/bff';
import { onRequestPost as issue, onRequestDelete as revoke } from './desktop/qurilma';
import { onRequestPost as lease } from './desktop/lease';

const env = { SUPABASE_URL: 'https://synthetic.supabase.co', SUPABASE_KEY: 'synthetic-only', SESSIYA_KALIT: 'synthetic-only'.repeat(3),
  GAS_URL: 'https://synthetic.invalid', GAS_TOKEN: 'synthetic', DESKTOP_LEASE_SK: '', DESKTOP_LEASE_KID: 'desktop-lease-v1' };
const deviceId = '00000000-0000-4000-8000-000000000001';
const op = '00000000-0000-4000-8000-000000000002';
const rights = ['company.read','smeta.read','f2.read','narx.read'];
const token = base64url(new Uint8Array(32).fill(21));
let pk = '';
let revoked = false;
let expires = 0;
let objectCompany = 8;
let permissions = [...rights];
let calls: { path: string; body: any }[] = [];
beforeAll(async () => {
  const pair = await crypto.subtle.generateKey('Ed25519', true, ['sign','verify']) as CryptoKeyPair;
  env.DESKTOP_LEASE_SK = base64url(new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey) as ArrayBuffer));
  pk = base64url(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey) as ArrayBuffer));
});
beforeEach(() => {
  revoked = false; expires = Date.now() + 7 * 86400_000; objectCompany = 8; permissions = [...rights]; calls = [];
  vakolatKeshTozala(); otaKeshTozala();
  vi.stubGlobal('fetch', vi.fn(async (raw: string, init?: RequestInit) => {
    const u = new URL(String(raw));
    const b = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ path: u.pathname, body: b });
    if (u.pathname.endsWith('/t2_desktop_qurilma_tekshir_v1')) return Response.json(!revoked && b.p_token_hash === await deviceHash(token) ?
      { ok: true, device_id: deviceId, foydalanuvchi_id: 7, tugaydi: expires, sessiya_exp: expires, versiya: 1 } : { ok: false });
    if (u.pathname.endsWith('/t2_desktop_qurilma_yarat_v1')) return Response.json({ ok: true, device_id: b.p_device_id, tugaydi: b.p_sessiya_exp });
    if (u.pathname.endsWith('/t2_desktop_qurilma_bekor_v1')) { revoked = true; return Response.json({ ok: true }); }
    if (u.pathname.endsWith('/t2_men_v1')) return Response.json({ ok: true, platform_role: 'none', foydalanuvchi: { holat: 'faol' },
      context_kompaniyalar: [{ kompaniya_id: 8, effective_role: 'pto', permissions }] });
    if (u.pathname === '/rest/v1/t2_obyekt') return Response.json([{ kompaniya_id: objectCompany }]);
    if (u.pathname.endsWith('/t2_obyekt_paket_v1')) return Response.json({ ok: true, packet: 'synthetic' });
    throw new Error('Unexpected synthetic upstream: ' + u.pathname);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vakolatKeshTozala(); otaKeshTozala(); });
function native(path: string, body?: unknown, origin = DESKTOP_ORIGIN) {
  return new Request('https://site.test' + path, { method: 'POST', headers: { Authorization: 'Bearer ' + token, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
}
const ctx = (request: Request, overrides = {}) => ({ request, env: { ...env, ...overrides }, data: {}, next: vi.fn() } as never);
const bff = (path: string, method = 'GET', body?: unknown) => gateway(ctx(native('/api/desktop/bff', { path, method, ...(body == null ? {} : { body }) })));
async function cookie() { return 'sess=' + await imzola({ rol: 'superadmin', foydalanuvchi_id: 7 }, env.SESSIYA_KALIT); }
async function web(body: unknown, origin: string | null = 'https://site.test', method = 'POST') {
  return new Request('https://site.test/api/desktop/qurilma', { method, headers: { Cookie: await cookie(), 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) });
}

describe('M3 native bearer and unchanged BFF gates', () => {
  it('cookie entry remains valid and an explicit revoked bearer cannot fall back to a valid cookie', async () => {
    expect(await sessiyaOl(await web({}), env)).toMatchObject({ foydalanuvchi_id: 7 });
    revoked = true;
    const r = native('/api/desktop/bff'); r.headers.set('Cookie', await cookie());
    expect(await sessiyaOl(r, env)).toBeNull();
    expect((await gateway(ctx(r))).status).toBe(401);
  });
  it.each(['https://tauri.localhost','http://tauri.localhost:80','http://tauri.localhost.evil','null',''])('refuses nonexact native origin %s', async origin => {
    expect(await sessiyaOl(native('/api/desktop/bff', {}, origin), env)).toBeNull();
  });
  it('refuses expired devices and fails closed on DB errors', async () => {
    expires = Date.now() - 1;
    expect((await bff('/api/sessiya')).status).toBe(401);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect((await bff('/api/sessiya')).status).toBe(401);
  });
  it('routes /sessiya through live authority and preserves expiry; no internal cookie leaks', async () => {
    const r = await bff('/api/sessiya');
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ foydalanuvchi_id: 7, rol: 'pto', tugaydi: expires });
    expect(r.headers.get('Set-Cookie')).toBeNull();
    expect(calls.some(c => c.path.endsWith('/t2_men_v1'))).toBe(true);
  });
  it('packet actor comes from bearer and other-company object is denied by existing gates', async () => {
    expect((await bff('/api/obyekt-paket?obyekt_id=4')).status).toBe(200);
    otaKeshTozala(); objectCompany = 9;
    expect((await bff('/api/obyekt-paket?obyekt_id=4&kompaniya_id=8')).status).toBe(403);
  });
  it('retains packet permission denial and unregistered write denial', async () => {
    permissions = rights.filter(p => p !== 'f2.read');
    expect((await bff('/api/obyekt-paket?obyekt_id=4')).status).toBe(403);
    expect((await bff('/api/sb-yoz','POST',{ amal: 'not_registered', kompaniya_id: 8 })).status).toBe(403);
  });
  it.each([{ path: 'https://evil.test/api/sessiya', method: 'GET' }, { path: '/api/kirish', method: 'POST' },
    { path: '/api/desktop/lease', method: 'POST' }, { path: '/api/sessiya', method: 'DELETE' },
    { path: '/api/sessiya', method: 'GET', headers: { Cookie: 'forged' } }])('refuses nonwhitelisted target or caller headers %j', async body => {
    expect((await gateway(ctx(native('/api/desktop/bff',body)))).status).toBe(400);
  });
  it('bounds envelope size', async () => {
    expect((await gateway(ctx(native('/api/desktop/bff',{ path: '/api/sb', method: 'POST', body: 'a'.repeat(2 * 1024 * 1024) })))).status).toBe(413);
  });
});

describe('M3 cookie-only enrollment/revoke and CSRF', () => {
  it('issues random 256-bit token and sends only hash/server actor to DB', async () => {
    const r = await issue(ctx(await web({ operation_id: op, foydalanuvchi_id: 999, rol: 'superadmin' })));
    expect(r.status).toBe(200);
    const issued = await r.json() as any;
    expect(issued).toMatchObject({ ok: true }); expect(issued.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const args = calls.find(c => c.path.endsWith('/t2_desktop_qurilma_yarat_v1'))!.body;
    expect(args.p_actor_id).toBe(7); expect(args.p_token_hash).toBe(await deviceHash(issued.token));
    expect(JSON.stringify(args)).not.toContain(issued.token);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
  });
  it.each([null,'https://evil.test',DESKTOP_ORIGIN])('refuses cookie command origin %s', async origin => {
    expect((await issue(ctx(await web({ operation_id: op },origin)))).status).toBe(403);
  });
  it('bearer cannot enroll or revoke; missing operation is rejected', async () => {
    expect((await issue(ctx(native('/api/desktop/qurilma',{ operation_id: op })))).status).toBe(403);
    expect((await issue(ctx(await web({})))).status).toBe(400);
  });
  it('cookie revoke invalidates subsequent bearer requests without cache', async () => {
    expect((await bff('/api/sessiya')).status).toBe(200);
    expect((await revoke(ctx(await web({ operation_id: op, device_id: deviceId }, 'https://site.test', 'DELETE')))).status).toBe(200);
    expect((await bff('/api/sessiya')).status).toBe(401);
  });
  it('CSRF exemption appears only after verified native credential lookup', async () => {
    const r = native('/api/desktop/lease');
    expect(desktopCsrfAllowed(r)).toBe(false);
    await sessiyaOl(r, env); expect(desktopCsrfAllowed(r)).toBe(true);
    const bad = native('/api/desktop/lease'); revoked = true;
    await sessiyaOl(bad, env); expect(desktopCsrfAllowed(bad)).toBe(false);
  });
});

describe('M3 signed offline lease', () => {
  async function issued(overrides = {}) {
    return lease(ctx(native('/api/desktop/lease',{ kompaniya_id: 8, obyekt_idlar: [4], foydalanuvchi_id: 999, permissions: ['f2.approve'] }),overrides));
  }
  const scope = { device_id: deviceId, foydalanuvchi_id: 7, kompaniya_id: 8, obyekt_id: 4 };
  it('signs the agreed envelope and read-only scoped snapshot, <=72h', async () => {
    const r = await issued(); expect(r.status).toBe(200);
    const { lease: e } = await r.json() as { lease: DesktopLeaseEnvelope };
    expect(Object.keys(e).sort()).toEqual(['alg','imzo','kid','payload']);
    const p = JSON.parse(new TextDecoder().decode(unbase64url(e.payload))) as DesktopLeasePayload;
    expect(p).toMatchObject({ format: 'smeta-desktop-lease/1', foydalanuvchi_id: 7, permissions: rights, device_id: deviceId, obyekt_idlar: [4] });
    expect(p.tugaydi - p.berildi).toBeLessThanOrEqual(LEASE_MAX_MS);
    expect(await verifyDesktopLease(e,{ [env.DESKTOP_LEASE_KID]: pk },scope)).toBe(true);
    expect(await verifyDesktopLease(e,{ [env.DESKTOP_LEASE_KID]: pk },scope,p.tugaydi)).toBe(false);
    expect(await verifyDesktopLease({ ...e, payload: e.payload.slice(0,-1)+'A' },{ [e.kid]: pk },scope)).toBe(false);
    expect(await verifyDesktopLease(e,{ [e.kid]: pk },{ ...scope, kompaniya_id: 9 })).toBe(false);
    expect(await verifyDesktopLease(e,{ [e.kid]: pk },{ ...scope, obyekt_id: 5 })).toBe(false);
  });
  it('refuses wrong-company object and missing read permission before signing', async () => {
    objectCompany = 9; expect((await issued()).status).toBe(403);
    objectCompany = 8; otaKeshTozala(); permissions = ['company.read','smeta.read']; vakolatKeshTozala();
    expect((await issued()).status).toBe(403);
  });
  it('has no key/kid fallback and clamps lease to device/session expiry', async () => {
    expect((await issued({ DESKTOP_LEASE_SK: '' })).status).toBe(503);
    expect((await issued({ DESKTOP_LEASE_KID: '' })).status).toBe(503);
    expires = Date.now() + 10_000;
    const { lease: e } = await (await issued()).json() as any;
    expect(JSON.parse(new TextDecoder().decode(unbase64url(e.payload))).tugaydi).toBe(expires);
  });
  it('rejects expired/overlong/write-capability payloads at the signer', async () => {
    const now = Date.now();
    const p: DesktopLeasePayload = { format: 'smeta-desktop-lease/1', foydalanuvchi_id: 7, kompaniya_id: 8, device_id: deviceId,
      obyekt_idlar: [4], permissions: rights, berildi: now-1000, tugaydi: now-1, versiya: 1 };
    await expect(signDesktopLease(p,env)).rejects.toThrow();
    await expect(signDesktopLease({ ...p, berildi: now, tugaydi: now+LEASE_MAX_MS+1 },env)).rejects.toThrow();
    await expect(signDesktopLease({ ...p, tugaydi: now+1000, permissions: ['smeta.write'] },env)).rejects.toThrow();
  });
});
