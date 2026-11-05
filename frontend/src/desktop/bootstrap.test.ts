// @vitest-environment node
import { beforeAll, expect, it, vi } from 'vitest';
import { desktopBootstrap } from './bootstrap';
import type { NativeInvoke } from './fetch-shim';
let pair: CryptoKeyPair, pk: Uint8Array;
beforeAll(async () => { pair = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']) as CryptoKeyPair; pk = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)); });
const b64 = (v: Uint8Array) => Buffer.from(v).toString('base64url');
async function setup() {
  let now = Date.now(), phase: 'offline' | '401' | '403' | 'online' = 'offline';
  const info = { foydalanuvchi_id: 2 as number | null, device_id: 'device-synthetic', generation: 0 };
  const lease = { format: 'smeta-desktop-lease/1', foydalanuvchi_id: 2, kompaniya_id: 3, obyekt_idlar: [4],
    permissions: ['company.read', 'smeta.read', 'f2.read', 'narx.read'], device_id: info.device_id, berildi: now, tugaydi: now + 3600_000, versiya: 1 };
  const envelope = async () => { const payload = new TextEncoder().encode(JSON.stringify(lease)); return { alg: 'Ed25519', kid: 'test', payload: b64(payload), imzo: b64(new Uint8Array(await crypto.subtle.sign('Ed25519', pair.privateKey, payload))) }; };
  const raw = { format: 't2-paket/1', obyekt_id: 4, obyekt_nom: 'SYNTHETIC', kompaniya_id: 3, soni: 1,
    lugat: { nom: ['SYNTHETIC'], kod: [], birlik: [], tur: ['bl'], kat: [] },
    q: { id: [7], ota_id: [null], daraja: [0], tartib: [1], tur: [0], kat: [null], kod: [null], nom: [0], birlik: [null], hajm: [10], narx: [null], summa: [null], norma: [null], narx_usul: [null], versiya: [1], qoshimcha: [0], zamena: [0], xom_qator: {} },
    h: { fakt_hajm: [2], fakt_summa: [null], f2_hajm: [1], f2_summa: [null], f2_summa_yoq: [1], f2_summa_nomalum: [1], direct_fakt_hajm: [2], fakt_manbasi: [0], almashtirilgan_hajm: {}, almashtirilgan_summa: {} }, f2: [], meta: { akt_podval: [] } };
  const disk = new Map<string, unknown>([['packet/3/4', { raw, etag: 'v1' }], ['lease/3', { envelope: await envelope(), highWater: now }]]);
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } };
  const invoke: NativeInvoke = vi.fn(async (command, args) => {
    if (command === 'desktop_session_info') return { ...info } as never;
    if (command === 'desktop_session_clear') { info.foydalanuvchi_id = null; info.generation++; return undefined as never; }
    if (args?.expectedGeneration !== info.generation) throw new Error('STALE');
    const key = String(args?.key);
    if (command === 'desktop_cache_keys') return [...disk.keys()] as never;
    if (command === 'desktop_cache_read') return (disk.has(key) ? Array.from(new TextEncoder().encode(JSON.stringify(disk.get(key)))) : null) as never;
    if (command === 'desktop_cache_write') { disk.set(key, JSON.parse(new TextDecoder().decode(Uint8Array.from(args?.value as number[])))); return undefined as never; }
    if (command === 'desktop_cache_delete') { disk.delete(key); return undefined as never; }
    throw new Error('UNEXPECTED_IPC');
  });
  const request = vi.fn(async (path: RequestInfo | URL) => {
    if (phase === 'offline') throw new TypeError('offline');
    if (phase === '401' || phase === '403') return Response.json({ ok: false }, { status: Number(phase) });
    return String(path).includes('/lease') ? Response.json({ ok: true, lease: await envelope() }) : new Response(null, { status: 304, headers: { ETag: 'v1' } });
  });
  const create = (key = pk) => desktopBootstrap({ invoke, request, publicKey: key, kid: 'test', storage, clock: () => now });
  await create().remember('/admin/holat/4');
  return { create, disk, store, info, lease, invoke, request, storage, envelope, phase: (v: typeof phase) => { phase = v; }, time: (v: number) => { now = v; }, now };
}
it('cold native session + signed scoped snapshot restores only the existing object route', async () => {
  const h = await setup(); expect(await h.create().restore()).toBe('/admin/holat/4');
  expect(h.disk.get('pages/3/4')).toEqual({ object: { id: 4, kompaniya_id: 3, nom: 'SYNTHETIC' } });
  expect((h.disk.get('packet/3/4') as { raw: { q: { narx: null[] } } }).raw.q.narx).toEqual([null]);
  h.phase('online'); expect(await h.create().restore()).toBe('/admin/holat/4');
  expect(h.request.mock.calls.some(([p]) => String(p).includes('obyekt-paket'))).toBe(true);
});
it.each(['actor', 'device', 'missing', 'denied', 'expired', 'rollback', 'signature', 'tamper', 'malformed', 'scope', 'permission'] as const)('rejects %s and removes an untrusted hint', async mode => {
  const h = await setup();
  if (mode === 'actor') h.info.foydalanuvchi_id = 9;
  if (mode === 'device') h.info.device_id = 'other';
  if (mode === 'missing') h.disk.delete('packet/3/4');
  if (mode === 'denied') h.disk.set('denied/3/4', true);
  if (mode === 'expired') h.time(h.now + 3600_001);
  if (mode === 'rollback') h.time(h.now - 1);
  if (mode === 'tamper') h.disk.set('lease/3', { envelope: { ...await h.envelope(), payload: b64(new TextEncoder().encode('{}')) }, highWater: h.now });
  if (mode === 'malformed') h.store.set('desktop-resume-v1', '{bad');
  if (mode === 'scope' || mode === 'permission') {
    if (mode === 'scope') h.lease.obyekt_idlar = [999];
    else h.lease.permissions = h.lease.permissions.filter(p => p !== 'company.read');
    h.disk.set('lease/3', { envelope: await h.envelope(), highWater: h.now });
  }
  expect(await h.create(mode === 'signature' ? new Uint8Array(32) : pk).restore()).toBeNull();
  expect(h.store.size).toBe(0);
});
it.each(['401', '403'] as const)('online %s never falls back to the saved route', async phase => {
  const h = await setup(); h.phase(phase); expect(await h.create().restore()).toBeNull(); expect(h.store.size).toBe(0);
  if (phase === '401') expect(h.info.foydalanuvchi_id).toBeNull();
});
it('generation changes during bootstrap fail closed', async () => {
  const h = await setup(); h.request.mockImplementationOnce(async () => { h.info.generation++; throw new TypeError('offline'); });
  expect(await h.create().restore()).toBeNull();
});
it('arbitrary routes and changed object hints cannot authorize a route', async () => {
  const h = await setup(); h.create().clear(); await h.create().remember('https://evil.invalid/admin/holat/4');
  await h.create().remember('/admin/holat/4?redirect=/admin'); expect(h.store.size).toBe(0);
  h.store.set('desktop-resume-v1', JSON.stringify({ actor: 2, device: h.info.device_id, company: 3, object: 999 })); expect(await h.create().restore()).toBeNull();
});
it('blocked browser storage and absent keychain fail closed', async () => {
  const h = await setup(); h.storage.getItem = () => { throw new Error('blocked'); }; expect(await h.create().restore()).toBeNull();
  h.info.foydalanuvchi_id = null; await expect(h.create().remember('/admin/holat/4')).resolves.toBeUndefined();
});
