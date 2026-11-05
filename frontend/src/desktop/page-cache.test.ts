// @vitest-environment node
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { desktopPageFetch } from './page-cache';
import { paketdanQatorlar, paketDekod, type PaketXom } from '../ombor/paket';
import { t2ToliqOqiParallel } from '../api/t2-toliq-oqish';
import type { NativeInvoke } from './fetch-shim';
const b64 = (v: Uint8Array) => Buffer.from(v).toString('base64url');
let pair: CryptoKeyPair, pk: Uint8Array;
beforeAll(async () => { pair = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']) as CryptoKeyPair; pk = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
const raw: PaketXom = { format: 't2-paket/1', obyekt_id: 4, obyekt_nom: 'SYNTHETIC', kompaniya_id: 3, soni: 1,
  lugat: { nom: ['WORK'], kod: [], birlik: [], tur: ['bl'], kat: [] },
  q: { id: [7], ota_id: [null], daraja: [0], tartib: [1], tur: [0], kat: [null], kod: [null], nom: [0], birlik: [null],
    hajm: [10], narx: [null], summa: [null], norma: [null], narx_usul: [null], versiya: [1], qoshimcha: [0], zamena: [0], xom_qator: {} },
  h: { fakt_hajm: [2], fakt_summa: [null], f2_hajm: [1], f2_summa: [null], f2_summa_yoq: [1],
    f2_summa_nomalum: [1], direct_fakt_hajm: [2], fakt_manbasi: [0], almashtirilgan_hajm: {}, almashtirilgan_summa: {} },
  f2: [], meta: { akt_podval: [{ akt_id: 8, manba: 'import', podval: { НДС: null } }] } };
async function setup() {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  const disk = new Map<string, number[]>(), info = { foydalanuvchi_id: 2 as number | null, device_id: '00000000-0000-4000-8000-000000000001', generation: 0 };
  let phase: 'online' | 'offline' | '403' | '503' = 'online';
  const invoke: NativeInvoke = vi.fn(async (command, args) => {
    if (command === 'desktop_session_info') return { ...info } as never;
    if (args?.expectedGeneration !== undefined && args.expectedGeneration !== info.generation) throw new Error('DESKTOP_SESSION_STALE');
    if (command === 'desktop_cache_keys') return [...disk.keys()] as never;
    if (command === 'desktop_cache_read') return (disk.get(String(args?.key)) ?? null) as never;
    if (command === 'desktop_cache_write') { disk.set(String(args?.key), args?.value as number[]); return undefined as never; }
    if (command === 'desktop_cache_delete') { disk.delete(String(args?.key)); return undefined as never; }
    if (command === 'desktop_session_clear') { info.generation++; info.foydalanuvchi_id = null; return undefined as never; }
    throw new Error('UNEXPECTED_IPC');
  });
  const base = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (phase === 'offline') throw new TypeError('offline');
    if (phase === '403' || phase === '503') return Response.json({ ok: false }, { status: Number(phase) });
    const r = new Request(input instanceof Request ? input : new URL(String(input), 'http://tauri.localhost'), init), path = new URL(r.url).pathname;
    if (path === '/api/desktop/lease') {
      const payload = new TextEncoder().encode(JSON.stringify({ format: 'smeta-desktop-lease/1', foydalanuvchi_id: 2, kompaniya_id: 3, obyekt_idlar: [4],
        permissions: ['company.read', 'smeta.read', 'f2.read', 'narx.read'], device_id: info.device_id, berildi: Date.now(), tugaydi: Date.now() + 3600_000, versiya: 1 }));
      return Response.json({ ok: true, lease: { alg: 'Ed25519', kid: 'test', payload: b64(payload), imzo: b64(new Uint8Array(await crypto.subtle.sign('Ed25519', pair.privateKey, payload))) } });
    }
    if (path === '/api/obyekt-paket') return Response.json(raw, { headers: { ETag: 'v1' } });
    if (path === '/api/sessiya') return Response.json({ ok: true, foydalanuvchi_id: 2, tugaydi: Date.now() + 7200_000, yozaOladi: true, kompaniyalar: [{ kompaniya_id: 3 }, { kompaniya_id: 9 }] });
    if (path === '/api/company' && new URL(r.url).searchParams.has('authorize')) return Response.json({ ok: true, allowed: true, company_id: 3, permissions: ['company.read', 'document.write'] });
    if (path === '/api/company') return Response.json({ ok: true, foydalanuvchi: { id: 2 }, azoliklar: [{ kompaniya_id: 3 }, { kompaniya_id: 9 }] });
    const q = r.method === 'POST' ? await r.json() : {};
    return Response.json({ ok: true, qatorlar: q.jadval === 't2_obyekt_jami' ? [{ id: 4, kompaniya_id: 3, nom: 'SYNTHETIC' }] : q.jadval === 't2_daraxt' ? paketdanQatorlar(paketDekod(raw)) : [{ id: 8, hujjat_jami: null }], toliq: true, jamiServerda: 1 });
  });
  const status = vi.fn(), invalidate = vi.fn();
  const create = () => desktopPageFetch(base, invoke, { publicKey: pk, kid: 'test', status, invalidate });
  return { disk, info, invoke, base, status, invalidate, create, phase: (p: typeof phase) => { phase = p; } };
}
const sb = (f: typeof fetch, body: unknown) => f('/api/sb', { method: 'POST', body: JSON.stringify(body) }).then(r => r.json());
const tree = { jadval: 't2_daraxt', filtr: 'obyekt_id=eq.4', ustunlar: 'id,hajm,narx,summa', limit: 200000 };
it('existing SB reader works after restart: scoped bootstrap, F2 exact response, NULL and own footer', async () => {
  const h = await setup(), live = h.create(); await live('/api/sessiya'); await live('/api/company?me=1');
  const guard = '/api/company?authorize=1&permission=company.read&kompaniya_id=3'; await live(guard);
  await sb(live, { jadval: 't2_obyekt_jami', filtr: 'kompaniya_id=eq.3', tartib: 'nom.asc', limit: 5000 });
  await sb(live, tree); const f2 = { jadval: 't2_akt_reestr', filtr: 'obyekt_id=eq.4', tartib: 'oy.desc', limit: 500 };
  await sb(live, f2); h.phase('offline'); const cached = h.create();
  const result = await t2ToliqOqiParallel((q) => sb(cached, q), tree, 'id');
  expect(result.ok).toBe(true); expect(result.qatorlar).toEqual([{ id: 7, hajm: 10, narx: null, summa: null }]);
  expect((await sb(cached, { jadval: 't2_qator_holat', filtr: 'obyekt_id=eq.4', ustunlar: 'qator_id,f2_summa,f2_summa_yoq' })).qatorlar).toEqual([{ qator_id: 7, f2_summa: null, f2_summa_yoq: 1 }]);
  expect((await (await cached('/api/sessiya')).json()).kompaniyalar).toEqual([{ kompaniya_id: 3 }]);
  expect((await (await cached('/api/company?me=1')).json()).azoliklar).toEqual([{ kompaniya_id: 3 }]);
  expect(await (await cached(guard)).json()).toMatchObject({ allowed: true, company_id: 3, permissions: ['company.read'], platform_role: 'none' });
  expect((await cached('/api/company?authorize=1&permission=document.write&kompaniya_id=3')).status).toBe(503);
  expect((await sb(cached, f2)).qatorlar).toEqual([{ id: 8, hujjat_jami: null }]);
  expect((await sb(cached, { soro: 'akt_podval_ol_v1', obyekt_id: 4 })).natija.podvallar).toEqual(raw.meta.akt_podval);
  const calls = h.base.mock.calls.length;
  expect((await cached('/api/sb-yoz', { method: 'POST', body: '{}' })).status).toBe(503); expect(h.base.mock.calls.length).toBe(calls);
  h.phase('online'); await cached('/api/sessiya'); expect(h.status).toHaveBeenLastCalledWith(true);
  await sb(cached, tree); expect(h.status).toHaveBeenLastCalledWith(false);
});
it('does not replace server403/503 or missing/expired/foreign data with cached success', async () => {
  const h = await setup(), f = h.create(); await sb(f, tree);
  h.phase('503'); expect((await f('/api/sb', { method: 'POST', body: JSON.stringify(tree) })).status).toBe(503);
  h.phase('offline'); expect((await sb(f, { jadval: 't2_akt_reestr', filtr: 'obyekt_id=eq.4' })).ok).toBe(false);
  await expect(sb(f, { ...tree, filtr: 'obyekt_id=eq.5' })).rejects.toThrow();
  vi.setSystemTime(Date.now() + 3600_001); await expect(sb(f, tree)).rejects.toThrow();
});
it('server403 closes native access and old renderer generation cannot restore data', async () => {
  const h = await setup(), f = h.create(); await sb(f, tree);
  h.phase('403'); expect((await f('/api/sb', { method: 'POST', body: JSON.stringify(tree) })).status).toBe(403);
  expect(h.info.foydalanuvchi_id).toBeNull(); h.phase('offline'); await expect(sb(f, tree)).rejects.toThrow('DESKTOP_SESSION_CHANGED');
});
