// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { imzola, sessiyaOl, SESSIYA_MUDDAT_MS } from '../../functions/_shared/auth';
import { vakolatKeshTozala } from '../../functions/_shared/role-authority';
import { base64url } from '../../functions/_shared/desktop-device';
import { onRequestPost as issue } from '../../functions/api/desktop/qurilma';
import { onRequestPost as lease } from '../../functions/api/desktop/lease';
import { onRequestPost as gateway } from '../../functions/api/desktop/bff';
import { verifyDesktopLease } from './offline-lease';

const env = { SUPABASE_URL: 'https://synthetic.invalid', SUPABASE_KEY: 'SYNTHETIC_SERVICE_ONLY', SESSIYA_KALIT: 'SYNTHETIC_TEST_SESSION_KEY_ONLY' };
const origin = 'https://smeta.example.invalid';
const device = '00000000-0000-4000-8000-000000000001';
const operation = '00000000-0000-4000-8000-000000000002';
const token = base64url(new Uint8Array(32).fill(1));
let revoked = false;
const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
const authority = () => ({ ok: true, platform_role: 'none', foydalanuvchi: { holat: 'faol' },
  context_kompaniyalar: [{ kompaniya_id: 3, effective_role: 'pto', permissions: ['company.read', 'smeta.read', 'f2.read', 'narx.read'] }] });
beforeEach(() => {
  revoked = false; calls.length = 0; vakolatKeshTozala();
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}'));
    calls.push({ url: String(url), body });
    if (String(url).includes('t2_desktop_qurilma_tekshir_v1')) return Response.json(revoked ? { ok: false } : {
      ok: true, device_id: device, foydalanuvchi_id: 2, tugaydi: Date.now() + SESSIYA_MUDDAT_MS,
      sessiya_exp: Date.now() + SESSIYA_MUDDAT_MS, versiya: 1,
    });
    if (String(url).includes('t2_desktop_qurilma_yarat_v1')) return Response.json({ ok: true, device_id: body.p_device_id, tugaydi: body.p_sessiya_exp });
    if (String(url).includes('t2_men_v1')) return Response.json(authority());
    if (String(url).includes('/t2_obyekt?')) return Response.json([{ kompaniya_id: String(url).includes('eq.202') ? 9 : 3 }]);
    throw new Error('UNEXPECTED_SYNTHETIC_FETCH');
  }));
});
afterEach(() => vi.unstubAllGlobals());
const request = (path: string, body?: unknown, headers: HeadersInit = {}) => new Request(origin + path, {
  method: 'POST', headers: { Origin: 'http://tauri.localhost', Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body ?? {}),
});
const ctx = (request: Request, config: unknown = env) => ({ request, env: config, data: {}, params: {}, waitUntil() {}, passThroughOnException() {} }) as never;

describe('device BFF authority boundary', () => {
  it('looks up only SHA256 and resolves actor from server storage', async () => {
    const session = await sessiyaOl(request('/api/desktop/lease'), env);
    expect(session?.foydalanuvchi_id).toBe(2);
    expect(session?.rol).toBe('rahbar');
    expect(calls[0].body.p_token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(calls)).not.toContain(token);
  });
  it('never falls back to a valid cookie when a device is revoked', async () => {
    revoked = true;
    const cookie = await imzola({ rol: 'superadmin', foydalanuvchi_id: 2 }, env.SESSIYA_KALIT);
    expect(await sessiyaOl(request('/api/sessiya', {}, { Cookie: 'sess=' + cookie }), env)).toBeNull();
  });
  it('rejects browser-origin Bearer without accessing storage', async () => {
    expect(await sessiyaOl(request('/api/sessiya', {}, { Origin: origin }), env)).toBeNull();
    expect(calls).toHaveLength(0);
  });
  it('requires a cookie and same origin to enroll, never caller actor/role', async () => {
    expect((await issue(ctx(request('/api/desktop/qurilma', { operation_id: operation })))).status).toBe(403);
    const cookie = await imzola({ rol: 'rahbar', foydalanuvchi_id: 2 }, env.SESSIYA_KALIT);
    const r = new Request(origin + '/api/desktop/qurilma', { method: 'POST', headers: { Origin: origin, Cookie: 'sess=' + cookie },
      body: JSON.stringify({ operation_id: operation, foydalanuvchi_id: 999, rol: 'superadmin' }) });
    const response = await issue(ctx(r));
    expect(response.status).toBe(200);
    const issued = await response.json();
    expect(issued.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const stored = calls.find(c => c.url.includes('qurilma_yarat'))!.body;
    expect(stored.p_actor_id).toBe(2);
    expect(JSON.stringify(stored)).not.toContain(issued.token);
  });
  it('refuses an object of another company before signing a lease', async () => {
    const response = await lease(ctx(request('/api/desktop/lease', { kompaniya_id: 3, obyekt_idlar: [202] })));
    expect(response.status).toBe(403);
  });
  it('issues a client-verifiable lease only after existing membership and object guards', async () => {
    const pair = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']) as CryptoKeyPair;
    const config = { ...env, DESKTOP_LEASE_KID: 'synthetic', DESKTOP_LEASE_SK: base64url(new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey))) };
    const response = await lease(ctx(request('/api/desktop/lease', { kompaniya_id: 3, obyekt_idlar: [101] }), config));
    expect(response.status).toBe(200);
    const body = await response.json();
    const checked = await verifyDesktopLease(body.lease, { foydalanuvchiId: 2, kompaniyaId: 3, deviceId: device },
      new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)), 'synthetic');
    expect(checked.obyekt_idlar).toEqual([101]);
  });
  it('routes verified Bearer through unchanged middleware and strips internal cookies', async () => {
    const response = await gateway(ctx(request('/api/desktop/bff', { path: '/api/sessiya', method: 'GET', body: null, etag: null })));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.foydalanuvchi_id).toBe(2); expect(body.rol).toBe('pto');
    expect(response.headers.has('Set-Cookie')).toBe(false);
  });
  it('refuses arbitrary destinations and caller authority headers', async () => {
    for (const body of [
      { path: 'https://evil.invalid/api/sessiya', method: 'GET' },
      { path: '/api/sessiya', method: 'GET', headers: { Authorization: 'forged' } },
    ]) expect((await gateway(ctx(request('/api/desktop/bff', body)))).status).toBe(400);
  });
});
