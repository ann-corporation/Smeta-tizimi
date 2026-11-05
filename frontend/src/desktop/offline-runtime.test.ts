// @vitest-environment node
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DesktopOfflineRuntime, invalidatesDesktopSession } from './offline-runtime';
import type { NativeInvoke } from './fetch-shim';
import { son, type PaketXom } from '../ombor/paket';

const b64 = (v: Uint8Array) => btoa(String.fromCharCode(...v)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const device = '00000000-0000-4000-8000-000000000001';
let pair: CryptoKeyPair, pk: Uint8Array;
const runtimes: DesktopOfflineRuntime[] = [];
beforeAll(async () => {
  pair = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']) as CryptoKeyPair;
  pk = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
});
afterEach(() => { runtimes.splice(0).forEach(r => r.dispose()); });
const raw = (): PaketXom => ({ format: 't2-paket/1', obyekt_id: 4, obyekt_nom: 'SYNTHETIC', kompaniya_id: 3, soni: 1,
  lugat: { nom: ['SYNTHETIC'], kod: [], birlik: [], tur: ['rs'], kat: [] },
  q: { id: [1], ota_id: [null], daraja: [0], tartib: [1], tur: [0], kat: [null], kod: [null], nom: [0], birlik: [null],
    hajm: [1], narx: [null], summa: [null], norma: [null], narx_usul: [null], versiya: [1], qoshimcha: [0], zamena: [0], xom_qator: {} },
  h: { fakt_hajm: [0], fakt_summa: [null], f2_hajm: [0], f2_summa: [null], f2_summa_yoq: [null],
    f2_summa_nomalum: [null], direct_fakt_hajm: [0], fakt_manbasi: [0], almashtirilgan_hajm: {}, almashtirilgan_summa: {} },
  f2: [], meta: { akt_podval: [{ akt_id: 1, nk: { НДС: null } }] } });

async function setup() {
  let now = Date.now();
  const disk = new Map<string, number[]>();
  const session = { device_id: device as string | null, foydalanuvchi_id: 2 as number | null, generation: 0 };
  let phase: '200' | '304' | 'offline' | 'revoked' = '200';
  const invoke = vi.fn(async (command: string, args?: Record<string, unknown>) => {
    if (command === 'desktop_session_info') return { ...session };
    if (command === 'desktop_cache_read') return disk.get(String(args?.key)) ?? null;
    if (command === 'desktop_cache_write') { disk.set(String(args?.key), args?.value as number[]); return; }
    if (command === 'desktop_cache_keys') return [...disk.keys()];
    if (command === 'desktop_cache_delete') { disk.delete(String(args?.key)); return; }
    if (command === 'desktop_session_clear') { session.generation++; session.device_id = null; session.foydalanuvchi_id = null; return; }
    throw new Error('UNEXPECTED_IPC');
  });
  const request = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    if (phase === 'offline') throw new TypeError('network offline');
    if (phase === 'revoked') return Response.json({ ok: false }, { status: 401 });
    if (String(input) === '/api/desktop/lease') {
      const bytes = new TextEncoder().encode(JSON.stringify({ format: 'smeta-desktop-lease/1', foydalanuvchi_id: 2,
        kompaniya_id: 3, obyekt_idlar: JSON.parse(String(_init?.body)).obyekt_idlar, permissions: ['smeta.read', 'f2.read', 'narx.read'], device_id: device,
        berildi: now, tugaydi: now + 3600_000, versiya: 1 }));
      return Response.json({ ok: true, lease: { alg: 'Ed25519', kid: 'test', payload: b64(bytes),
        imzo: b64(new Uint8Array(await crypto.subtle.sign('Ed25519', pair.privateKey, bytes))) } });
    }
    return phase === '304' ? new Response(null, { status: 304, headers: { ETag: 'v1' } }) : Response.json({ ...raw(), obyekt_id: Number(new URL(String(input), 'http://tauri.localhost').searchParams.get('obyekt_id')) }, { headers: { ETag: 'v1' } });
  });
  const invalidate = vi.fn();
  const create = () => {
    const r = new DesktopOfflineRuntime({ invoke: invoke as NativeInvoke, request: request as typeof fetch, publicKey: pk,
      kid: 'test', onInvalidate: invalidate, clock: () => now });
    runtimes.push(r); return r;
  };
  return { create, disk, invoke, request, session, invalidate, phase: (p: typeof phase) => { phase = p; }, advance: (ms: number) => { now += ms; } };
}

describe('M3 lease to M4 native package lifecycle', () => {
  it.each(['AUTH_REQUIRED', 'DEVICE_AUTH_REQUIRED', 'DEVICE_REVOKED', 'DEVICE_EXPIRED', 'DEVICE_INVALID'])('recognizes explicit invalidation %s', async code => {
    expect(await invalidatesDesktopSession(Response.json({ code }, { status: 403 }))).toBe(true);
  });
  it.each(['lease', 'packet'].flatMap(endpoint => ['PERMISSION_DENIED', 'TENANT_FORBIDDEN', 'DEVICE_FORBIDDEN'].map(code => [endpoint, code])))('ordinary %s403 %s only denies the requested object and preserves another cached object', async (endpoint, code) => {
    const h = await setup(), r = h.create(); await r.open(3, 4); await r.open(3, 5);
    if (endpoint === 'packet') h.request.mockImplementationOnce(h.request.getMockImplementation()!);
    h.request.mockResolvedValueOnce(Response.json({ ok: false, code }, { status: 403 }));
    if (endpoint === 'lease') h.request.mockResolvedValueOnce(Response.json({ ok: false, code }, { status: 403 }));
    await expect(r.open(3, 4)).rejects.toThrow('DESKTOP_OBJECT_FORBIDDEN');
    expect(h.invoke).not.toHaveBeenCalledWith('desktop_session_clear'); expect(h.session.foydalanuvchi_id).toBe(2);
    expect(h.disk.has('packet/3/4')).toBe(false); expect(h.disk.has('packet/3/5')).toBe(true);
    h.phase('offline');
    await expect(h.create().open(3, 4)).rejects.toThrow('DESKTOP_OBJECT_FORBIDDEN');
    expect((await r.open(3, 5)).offline).toBe(true);
    h.phase('200'); expect((await r.open(3, 5)).offline).toBe(false);
    const leaseCall = h.request.mock.calls.filter(([url]) => url === '/api/desktop/lease').at(-1)!;
    expect(JSON.parse(String(leaseCall[1]?.body)).obyekt_idlar).toEqual([5]);
    expect((await r.open(3, 4)).offline).toBe(false);
  });
  it('batch403 retries current B, preserves B, and only marks A after A is individually denied', async () => {
    const h = await setup(), r = h.create(); await r.open(3, 4); await r.open(3, 5);
    const live = h.request.getMockImplementation()!;
    h.request.mockImplementation(async (input, init) => String(input) === '/api/desktop/lease' &&
      JSON.parse(String(init?.body)).obyekt_idlar.includes(5) ? Response.json({ code: 'PERMISSION_DENIED' }, { status: 403 }) : live(input, init));
    expect((await r.open(3, 4)).offline).toBe(false);
    const scopes = h.request.mock.calls.filter(([u]) => u === '/api/desktop/lease').map(([, i]) => JSON.parse(String(i?.body)).obyekt_idlar);
    expect(scopes.slice(-2)).toEqual([[5, 4], [4]]);
    expect(h.disk.has('denied/3/4')).toBe(false); expect(h.disk.has('denied/3/5')).toBe(false);
    await expect(r.open(3, 5)).rejects.toThrow('DESKTOP_OBJECT_FORBIDDEN');
    expect(h.disk.has('packet/3/4')).toBe(true); expect(h.disk.has('packet/3/5')).toBe(false);
    expect(h.session.foydalanuvchi_id).toBe(2); h.phase('offline');
    expect((await h.create().open(3, 4)).offline).toBe(true);
  });
  it.each([429, 503])('lease%s uses only an unexpired verified cached lease, without extending it', async status => {
    const h = await setup(), r = h.create(), opened = await r.open(3, 4);
    h.request.mockResolvedValueOnce(Response.json({ code: 'TEMPORARY' }, { status }));
    const cached = await r.open(3, 4);
    expect(cached.offline).toBe(true); expect(cached.leaseUntil).toBe(opened.leaseUntil);
    h.advance(3600_001); h.request.mockResolvedValueOnce(Response.json({}, { status }));
    await expect(r.open(3, 4)).rejects.toThrow('DESKTOP_LEASE_TEMPORARY');
    const fresh = await setup(); fresh.request.mockResolvedValueOnce(Response.json({}, { status }));
    await expect(fresh.create().open(3, 4)).rejects.toThrow('DESKTOP_LEASE_TEMPORARY');
  });
  it('batch403 retry401 revokes rather than using cached data', async () => {
    const h = await setup(), r = h.create(); await r.open(3, 4); await r.open(3, 5);
    h.request.mockResolvedValueOnce(Response.json({}, { status: 403 })).mockResolvedValueOnce(Response.json({}, { status: 401 }));
    await expect(r.open(3, 4)).rejects.toThrow('DESKTOP_ACCESS_REVOKED'); expect(h.session.device_id).toBeNull(); expect(h.disk.size).toBe(0);
  });
  it('opens 200, resumes offline with the same native cache, then refreshes via authorized 304', async () => {
    const h = await setup(), online = h.create();
    expect((await online.open(3, 4)).offline).toBe(false);
    online.dispose(); h.phase('offline');
    const restarted = h.create(), saved = await restarted.open(3, 4);
    expect(saved.offline).toBe(true);
    expect(son(saved.paket.f2_summa, 0)).toBeNull();
    expect(saved.paket.meta.akt_podval).toEqual(raw().meta.akt_podval);
    h.phase('304');
    expect((await restarted.open(3, 4)).offline).toBe(false);
    expect(h.request).toHaveBeenLastCalledWith('/api/obyekt-paket?obyekt_id=4', { cache: 'no-store', headers: { 'If-None-Match': 'v1' } });
  });
  it('does not expose business cache on forged lease, expired lease or another company', async () => {
    const h = await setup(), first = h.create(); await first.open(3, 4); first.dispose();
    h.phase('offline'); h.advance(3600_001); h.invoke.mockClear();
    await expect(h.create().open(3, 4)).rejects.toThrow();
    expect(h.invoke.mock.calls.some(([c, a]) => c === 'desktop_cache_read' && a?.key === 'packet/3/4')).toBe(false);
    await expect(h.create().open(9, 4)).rejects.toThrow();
  });
  it('rejects a tampered signed envelope before reading packet bytes', async () => {
    const h = await setup(), first = h.create(); await first.open(3, 4); first.dispose();
    const saved = JSON.parse(new TextDecoder().decode(Uint8Array.from(h.disk.get('lease/3')!)));
    saved.envelope.imzo = 'A'.repeat(86);
    h.disk.set('lease/3', Array.from(new TextEncoder().encode(JSON.stringify(saved))));
    h.phase('offline'); h.invoke.mockClear();
    await expect(h.create().open(3, 4)).rejects.toThrow();
    expect(h.invoke.mock.calls.some(([c, a]) => c === 'desktop_cache_read' && a?.key === 'packet/3/4')).toBe(false);
  });
  it('on reconnect revocation clears UI, encrypted cache and the native credential', async () => {
    const h = await setup(), r = h.create(); await r.open(3, 4);
    h.phase('revoked');
    await expect(r.open(3, 4)).rejects.toThrow('REVOKED');
    expect(h.disk.size).toBe(0); expect(h.session.device_id).toBeNull();
    expect(h.invalidate).toHaveBeenCalled();
  });
  it('blocks clock rollback across runtime restart', async () => {
    const h = await setup(), r = h.create(); await r.open(3, 4); r.dispose();
    h.phase('offline'); h.advance(-1);
    h.invoke.mockClear();
    await expect(h.create().open(3, 4)).rejects.toThrow();
    expect(h.invoke.mock.calls.some(([c, a]) => c === 'desktop_cache_read' && a?.key === 'packet/3/4')).toBe(false);
  });
});
