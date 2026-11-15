// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { base64url, deviceHash, ANDROID_ORIGIN } from '../_shared/desktop-device';
import { vakolatKeshTozala } from '../_shared/role-authority';
import { otaKeshTozala } from '../_shared/ota-kesh';

const seen: { url: string; cookie: string | null; type: string | null; bytes: Uint8Array }[] = [];
vi.mock('./hujjat-yukla', () => ({
  onRequestPost: vi.fn(async (c: { request: Request }) => {
    seen.push({ url: c.request.url, cookie: c.request.headers.get('Cookie'), type: c.request.headers.get('Content-Type'), bytes: new Uint8Array(await c.request.arrayBuffer()) });
    return Response.json({ ok: true, document_id: 55 });
  }),
}));
import { onRequestPost as gateway, MOBIL_YUKLA_MAX_BYTES } from './mobil/yukla';

const env = { SUPABASE_URL: 'https://synthetic.supabase.co', SUPABASE_KEY: 'synthetic-only', SESSIYA_KALIT: 'synthetic-only'.repeat(3),
  GAS_URL: 'https://synthetic.invalid', GAS_TOKEN: 'synthetic' };
const deviceId = '00000000-0000-4000-8000-000000000001';
const token = base64url(new Uint8Array(32).fill(33));
const BOUNDARY = 'qurai-test-boundary';
let permissions: string[] = [];
beforeEach(() => {
  seen.length = 0; permissions = ['company.read', 'document.write'];
  vakolatKeshTozala(); otaKeshTozala();
  vi.stubGlobal('fetch', vi.fn(async (raw: string, init?: RequestInit) => {
    const u = new URL(String(raw));
    const b = init?.body ? JSON.parse(String(init.body)) : {};
    if (u.pathname.endsWith('/t2_desktop_qurilma_tekshir_v2')) return Response.json(b.p_token_hash === await deviceHash(token) ?
      { ok: true, device_id: deviceId, foydalanuvchi_id: 7, tugaydi: Date.now() + 86400_000, sessiya_exp: Date.now() + 86400_000, versiya: 1 } : { ok: false });
    if (u.pathname.endsWith('/t2_men_v1')) return Response.json({ ok: true, platform_role: 'none', foydalanuvchi: { holat: 'faol' },
      context_kompaniyalar: [{ kompaniya_id: 8, effective_role: 'prorab', permissions }] });
    if (u.pathname.includes('/rest/v1/t2_obyekt')) return Response.json([{ kompaniya_id: 8 }]);
    throw new Error('Unexpected synthetic upstream: ' + u.pathname);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vakolatKeshTozala(); otaKeshTozala(); });

const multipart = (payload: Uint8Array) => {
  const enc = new TextEncoder();
  const head = enc.encode(`--${BOUNDARY}\r\nContent-Disposition: form-data; name="fayl"; filename="a.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`);
  const tail = enc.encode(`\r\n--${BOUNDARY}--\r\n`);
  const out = new Uint8Array(head.length + payload.length + tail.length);
  out.set(head); out.set(payload, head.length); out.set(tail, head.length + payload.length);
  return out;
};
function upload(opts: { query?: string; origin?: string; bearer?: string; type?: string; body?: Uint8Array } = {}) {
  const body = opts.body ?? multipart(new Uint8Array([1, 2, 3, 4]));
  const req = new Request('https://site.test/api/mobil/yukla' + (opts.query ?? '?kompaniya_id=8&obyekt_id=21'), {
    method: 'POST', body,
    headers: { Authorization: 'Bearer ' + (opts.bearer ?? token), Origin: opts.origin ?? ANDROID_ORIGIN,
      'Content-Type': opts.type ?? `multipart/form-data; boundary=${BOUNDARY}`, 'Content-Length': String(body.byteLength) },
  });
  return gateway({ request: req, env, data: {}, next: vi.fn() } as never);
}

describe('mobil/yukla (Android multipart upload)', () => {
  it('rejects an unknown device token and a wrong origin with 401', async () => {
    expect((await upload({ bearer: base64url(new Uint8Array(32).fill(9)) })).status).toBe(401);
    expect((await upload({ origin: 'https://smeta-tizimi.pages.dev' })).status).toBe(401);
    expect(seen).toHaveLength(0);
  });
  it.each(['', '?kompaniya_id=8', '?kompaniya_id=0&obyekt_id=21', '?kompaniya_id=8&obyekt_id=abc', '?kompaniya_id=8&obyekt_id=21%20x'])('refuses bad query %s', async q => {
    expect((await upload({ query: q })).status).toBe(400);
    expect(seen).toHaveLength(0);
  });
  it('refuses a non-multipart content type', async () => {
    expect((await upload({ type: 'application/json' })).status).toBe(400);
  });
  it('caps the body at 12 MB', async () => {
    expect(MOBIL_YUKLA_MAX_BYTES).toBe(12 * 1024 * 1024);
    const big = new Uint8Array(MOBIL_YUKLA_MAX_BYTES + 1);
    expect((await upload({ body: big })).status).toBe(413);
    expect(seen).toHaveLength(0);
  });
  it('forwards the exact multipart bytes through the middleware chain with a server-made cookie and fixed target', async () => {
    const payload = multipart(new Uint8Array([9, 8, 7, 6, 5]));
    const res = await upload({ body: payload });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, document_id: 55 });
    expect(res.headers.get('Set-Cookie')).toBeNull();
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(seen).toHaveLength(1);
    const u = new URL(seen[0].url);
    expect(u.pathname).toBe('/api/hujjat-yukla');
    expect(u.searchParams.get('kompaniya_id')).toBe('8');
    expect(u.searchParams.get('obyekt_id')).toBe('21');
    expect(seen[0].cookie).toMatch(/^sess=/);
    expect(seen[0].type).toContain(BOUNDARY);
    expect(Array.from(seen[0].bytes)).toEqual(Array.from(payload));
  });
  it('the unchanged middleware still enforces document.write for the company', async () => {
    permissions = ['company.read'];
    const res = await upload();
    expect(res.status).toBe(403);
    expect(seen).toHaveLength(0);
  });
});