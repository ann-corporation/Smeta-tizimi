import { paketdanHolatlar, paketdanQatorlar, type Paket } from '../ombor/paket';
import { NativeDesktopCache } from './native-cache';
import { DesktopOfflineRuntime, invalidatesDesktopSession, type NativeSessionInfo } from './offline-runtime';
import type { NativeInvoke } from './fetch-shim';
import { t } from '../i18n/til';
import { DesktopLeaseGuard, verifyDesktopLease, type LeaseEnvelope } from './offline-lease';

type Json = Record<string, unknown>;
type Context = { company: number; object: number; paket: Paket; offline: boolean; permissions: readonly string[] };
type Snapshot = { body: Json; until: number };
const positive = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) > 0;
const network = (e: unknown) => e instanceof TypeError || /DESKTOP_HTTP_(FAILED|UNAVAILABLE)/.test(String(e));
const tables = new Set(['t2_daraxt', 't2_qator_holat', 't2_qator', 't2_akt_reestr', 't2_f2_tafsilot', 't2_akt_qator', 't2_obyekt_jami']);
const named = new Set(['akt_podval_ol_v1', 'price_control_v1', 'f2_exact_qatorlar_v1']);
const failure = (code: string) => Response.json({ ok: false, code, error: t('Oflayn rejimda faqat oʻqish mumkin.') }, { status: 503 });

/** Same web pages; allowlisted reads only. Disk access follows an independently verified lease. */
export function desktopPageFetch(base: typeof fetch, invoke: NativeInvoke, options: {
  publicKey: Uint8Array; kid: string; status: (offline: boolean) => void; invalidate?: () => void;
}): typeof fetch {
  let bound: NativeSessionInfo | undefined;
  const scopedInvoke: NativeInvoke = (command, args) => invoke(command, command.startsWith('desktop_cache_') ? { ...args, expectedGeneration: bound?.generation } : args);
  const cache = new NativeDesktopCache(scopedInvoke);
  let serial: Promise<unknown> = Promise.resolve(), offline = false;
  const pending = new Map<string, Promise<Context>>();
  const warmed = new Map<number, { at: number; value: Context }>();
  const expiry = new Map<string, ReturnType<typeof setTimeout>>();
  const queue = <T>(work: () => Promise<T>): Promise<T> => {
    const next = serial.then(work, work); serial = next.catch(() => undefined); return next;
  };
  const runtime = new DesktopOfflineRuntime({ invoke: scopedInvoke, request: base, publicKey: options.publicKey, kid: options.kid, onExpire: options.invalidate,
    onInvalidate: () => { /* open() also invalidates before revalidation; expiry is checked on each read */ } });
  const setStatus = (value: boolean) => { offline = value; options.status(value); };
  const session = async () => {
    const info = await invoke<NativeSessionInfo>('desktop_session_info');
    if (bound && !same(bound, info)) { options.invalidate?.(); throw new Error('DESKTOP_SESSION_CHANGED'); }
    if (positive(info.foydalanuvchi_id)) bound ??= info;
    return info;
  };
  const same = (a: NativeSessionInfo, b: NativeSessionInfo) => a.foydalanuvchi_id === b.foydalanuvchi_id && a.device_id === b.device_id && a.generation === b.generation;
  const latest = new Map<string, number>();
  const save = (key: string, field: string, value: unknown, before: NativeSessionInfo, signature: string, sequence: number) => queue(async () => {
    if (latest.get(signature) !== sequence || !same(before, await session())) return;
    const data = await cache.get<Record<string, unknown>>(key) ?? {};
    data[field] = value; await cache.set(key, data);
  });
  async function context(object: number, company?: number): Promise<Context> {
    await session();
    if (!positive(object)) throw new Error('DESKTOP_OBJECT_INVALID');
    const key = company + '/' + object;
    const existing = pending.get(key); if (existing) return existing;
    const task = queue(async () => {
      if (!company) {
        const keys = (await cache.keys()).filter(k => /^packet\/[1-9]\d*\/[1-9]\d*$/.test(k) && Number(k.split('/')[2]) === object);
        if (keys.length === 1) company = Number(keys[0].split('/')[1]);
        else {
          const r = await base('/api/sb', { method: 'POST', body: JSON.stringify({ jadval: 't2_obyekt_jami', filtr: 'id=eq.' + object, ustunlar: 'id,kompaniya_id', limit: 1 }) });
          if (await invalidatesDesktopSession(r)) { await runtime.revoke(); throw new Error('DESKTOP_REVOKED'); }
          if (r.status === 403) throw new Error('DESKTOP_OBJECT_FORBIDDEN');
          const j = await r.json(); company = j.ok === true && j.qatorlar?.length === 1 ? j.qatorlar[0].kompaniya_id : undefined;
        }
      }
      if (!positive(company)) throw new Error('DESKTOP_SCOPE_REQUIRED');
      const opened = await runtime.open(company, object);
      const expiryKey = company + '/' + object;
      clearTimeout(expiry.get(expiryKey));
      expiry.set(expiryKey, setTimeout(() => options.invalidate?.(), Math.max(1, opened.leaseUntil - Date.now())));
      return { company, object, paket: opened.paket, offline: opened.offline, permissions: opened.permissions };
    });
    pending.set(key, task); try { return await task; } finally { pending.delete(key); }
  }
  async function contexts(): Promise<Context[]> {
    const out: Context[] = [];
    for (const key of (await cache.keys()).filter(k => /^packet\/[1-9]\d*\/[1-9]\d*$/.test(k))) {
      const [, c, o] = key.split('/');
      try { out.push(await context(Number(o), Number(c))); } catch { /* invalid/expired scope is never exposed */ }
    }
    return out;
  }
  function readBody(url: URL, method: string, body: Json | null) {
    const q = url.searchParams;
    const companyRead = q.get('authorize') === '1' && q.get('permission') === 'company.read' && positive(Number(q.get('kompaniya_id'))) &&
      [...q.keys()].length === 3 && [...q.keys()].every(k => ['authorize', 'permission', 'kompaniya_id'].includes(k));
    if (method === 'GET') return url.pathname === '/api/sessiya' && !url.search || url.pathname === '/api/company' && url.search === '?me=1' ||
      url.pathname === '/api/company' && companyRead ||
      url.pathname === '/api/obyekt-paket' && /^\?obyekt_id=[1-9]\d*$/.test(url.search);
    return method === 'POST' && url.pathname === '/api/sb' && !url.search && body &&
      (tables.has(String(body.jadval)) && Object.keys(body).every(k => ['jadval', 'filtr', 'ustunlar', 'tartib', 'limit', 'versiya'].includes(k)) ||
       named.has(String(body.soro)) && Object.keys(body).every(k => ['soro', 'obyekt_id', 'akt_id'].includes(k)));
  }
  function objectId(url: URL, body: Json | null) {
    const direct = Number(url.searchParams.get('obyekt_id') ?? body?.obyekt_id);
    if (positive(direct)) return direct;
    const found = String(body?.filtr ?? '').match(/(?:^|&)obyekt_id=eq\.([1-9]\d*)(?:&|$)/);
    return found ? Number(found[1]) : undefined;
  }
  function project(body: Json, c: Context): Json | undefined {
    if (body.soro === 'akt_podval_ol_v1') return { ok: true, natija: { ok: true, podvallar: c.paket.meta.akt_podval } };
    if (!['t2_daraxt', 't2_qator_holat'].includes(String(body.jadval)) || body.versiya === 'tarix' || typeof body.ustunlar !== 'string') return;
    const key = body.jadval === 't2_daraxt' ? 'id' : 'qator_id';
    let rows: Json[] = (key === 'id' ? paketdanQatorlar(c.paket) : paketdanHolatlar(c.paket)) as unknown as Json[];
    const filters = String(body.filtr ?? '').split('&');
    for (const f of filters) {
      if (f === 'obyekt_id=eq.' + c.object) continue;
      const m = f.match(/^(id|qator_id)=(gt|gte|lte|eq)\.([1-9]\d*)$/); if (!m || m[1] !== key) return;
      const n = Number(m[3]); rows = rows.filter(r => m[2] === 'gt' ? Number(r[key]) > n : m[2] === 'gte' ? Number(r[key]) >= n : m[2] === 'lte' ? Number(r[key]) <= n : Number(r[key]) === n);
    }
    const order = String(body.tartib ?? key + '.asc');
    if (![key + '.asc', key + '.desc', 'tartib.asc,id.asc'].includes(order)) return;
    rows.sort((a, b) => order === 'tartib.asc,id.asc' ? Number(a.tartib ?? Infinity) - Number(b.tartib ?? Infinity) || Number(a.id) - Number(b.id) : (Number(a[key]) - Number(b[key])) * (order.endsWith('.desc') ? -1 : 1));
    const total = rows.length, limit = body.limit === undefined ? 200000 : Number(body.limit);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200000) return;
    if (typeof body.ustunlar === 'string') {
      const columns = body.ustunlar.split(',');
      if (rows.some(r => columns.some(col => !Object.hasOwn(r, col)))) return;
      rows = rows.map(r => Object.fromEntries(columns.map(col => [col, r[col]])));
    }
    return { ok: true, qatorlar: rows.slice(0, limit), soni: Math.min(total, limit), jamiServerda: total, toliq: total <= limit };
  }
  const identity = (url: URL) => url.pathname === '/api/sessiya' || url.pathname === '/api/company';
  async function bootstrap(url: URL): Promise<Response> {
    const allowed = await contexts(); if (!allowed.length) return failure('DESKTOP_LEASE_REQUIRED');
    const info = await session(), saved = await cache.get<Record<string, Snapshot>>('bootstrap/' + info.foydalanuvchi_id);
    const snapshot = saved?.[url.pathname + url.search]; if (!snapshot || snapshot.until <= Date.now()) return failure('DESKTOP_NOT_CACHED');
    const companies = new Set(allowed.map(c => c.company)), j = { ...snapshot.body, platform_role: 'none' } as Json;
    if (url.pathname === '/api/sessiya') {
      if (j.foydalanuvchi_id !== info.foydalanuvchi_id) return failure('DESKTOP_SCOPE_REQUIRED');
      j.kompaniyalar = (Array.isArray(j.kompaniyalar) ? j.kompaniyalar : []).filter(c => companies.has(Number(c.kompaniya_id))); j.yozaOladi = false;
    } else if (url.searchParams.get('authorize') === '1') {
      const company = Number(url.searchParams.get('kompaniya_id'));
      if (!allowed.some(c => c.company === company && c.permissions.includes('company.read')) || j.allowed !== true ||
        j.company_id !== undefined && j.company_id !== company) return failure('DESKTOP_SCOPE_REQUIRED');
      j.permissions = ['company.read']; // Only this signed read claim; never restore write authorization.
    } else {
      if ((j.foydalanuvchi as Json)?.id !== info.foydalanuvchi_id) return failure('DESKTOP_SCOPE_REQUIRED');
      for (const k of ['azoliklar', 'context_kompaniyalar']) if (Array.isArray(j[k])) j[k] = (j[k] as Json[]).filter(c => companies.has(Number(c.kompaniya_id)));
    }
    if (!same(info, await session())) return failure('DESKTOP_SESSION_CHANGED');
    return Response.json(j);
  }
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), 'http://tauri.localhost');
    if (url.origin !== 'http://tauri.localhost' || !url.pathname.startsWith('/api/')) return base(input, init);
    const req = new Request(input instanceof Request ? input : url, init), method = req.method;
    if (req.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (url.pathname === '/api/chiqish') { runtime.dispose(); expiry.forEach(clearTimeout); expiry.clear(); return base(input, init); }
    let body: Json | null = null;
    if (method === 'POST') { try { body = await req.clone().json(); } catch { /* not a cacheable read */ } }
    const readable = readBody(url, method, body), object = objectId(url, body);
    const signature = url.pathname + url.search + '|' + JSON.stringify(body);
    const sequence = (latest.get(signature) ?? 0) + 1; latest.set(signature, sequence);
    if (offline && !readable && url.pathname !== '/api/kirish') return failure('DESKTOP_OFFLINE_READ_ONLY');
    try {
      const before = await session(), response = await base(req);
      if (await invalidatesDesktopSession(response)) { await runtime.revoke(); return response; }
      // A background session ping must not relabel the currently displayed saved object as fresh.
      if (!readable || !response.ok || !same(before, await session())) return response;
      const j = await response.clone().json(); if (j?.ok === false) return response;
      try {
        if (identity(url) && positive(before.foydalanuvchi_id)) {
          await save('bootstrap/' + before.foydalanuvchi_id, url.pathname + url.search,
            { body: j, until: Number(j.tugaydi) || Date.now() + 72 * 3600_000 }, before, signature, sequence);
        } else if (object) {
          // A burst of existing keyset/projection reads must not download the full package for every page.
          const prior = warmed.get(object);
          const c = !offline && prior && Date.now() - prior.at < 10_000 ? prior.value : await context(object);
          if (!c.offline) warmed.set(object, { at: Date.now(), value: c });
          await save('pages/' + c.company + '/' + object, signature, j, before, signature, sequence);
          if (!c.offline) setStatus(false);
        } else if (body?.jadval === 't2_obyekt_jami' && Array.isArray(j.qatorlar)) {
          const guards = new Map<number, DesktopLeaseGuard | undefined>();
          for (const o of j.qatorlar) if (positive(o.id) && positive(o.kompaniya_id)) {
            // Navigation rows are stored only inside the independently verified cached lease.
            if (!guards.has(o.kompaniya_id)) {
              let guard: DesktopLeaseGuard | undefined;
              try {
                const saved = await cache.get<{ envelope: LeaseEnvelope; highWater: number }>('lease/' + o.kompaniya_id);
                if (saved && positive(before.foydalanuvchi_id) && before.device_id) {
                  const lease = await verifyDesktopLease(saved.envelope, { kompaniyaId: o.kompaniya_id,
                    foydalanuvchiId: before.foydalanuvchi_id, deviceId: before.device_id }, options.publicKey, options.kid);
                  guard = new DesktopLeaseGuard(lease, saved.highWater);
                }
              } catch { /* No verified scope, no navigation cache. */ }
              guards.set(o.kompaniya_id, guard);
            }
            const guard = guards.get(o.kompaniya_id);
            if (!guard || await cache.get('denied/' + o.kompaniya_id + '/' + o.id)) continue;
            try { guard.allow(o.id); } catch { continue; }
            await save('pages/' + o.kompaniya_id + '/' + o.id, 'object', o, before, signature, sequence);
          }
        }
      } catch { /* cache failure must not replace the live server response */ }
      if (!same(before, await session())) return failure('DESKTOP_SESSION_CHANGED');
      return response;
    } catch (error) {
      if (!network(error)) throw error;
      setStatus(true);
      if (!readable) return failure('DESKTOP_OFFLINE_READ_ONLY');
      const before = await session();
      let result: Response;
      if (identity(url)) result = await bootstrap(url);
      else if (object) {
        const c = await context(object), projected = body ? project(body, c) : undefined;
        const saved = await cache.get<Record<string, Json>>('pages/' + c.company + '/' + object);
        if (url.pathname === '/api/obyekt-paket') {
          const raw = await cache.get<{ raw: Json; etag: string | null }>('packet/' + c.company + '/' + object);
          result = raw ? Response.json(raw.raw, { headers: raw.etag ? { ETag: raw.etag } : {} }) : failure('DESKTOP_NOT_CACHED');
        } else result = projected || saved?.[signature] ? Response.json(projected ?? saved![signature]) : failure('DESKTOP_NOT_CACHED');
      } else if (body?.jadval === 't2_obyekt_jami') {
        const match = String(body.filtr).match(/^kompaniya_id=eq\.([1-9]\d*)$/), rows: Json[] = [];
        for (const c of await contexts()) if (match && c.company === Number(match[1])) {
          const saved = await cache.get<Record<string, Json>>('pages/' + c.company + '/' + c.object); if (saved?.object) rows.push(saved.object);
        }
        result = match && rows.length ? Response.json({ ok: true, qatorlar: rows, soni: rows.length, jamiServerda: rows.length, toliq: true }) : failure('DESKTOP_NOT_CACHED');
      } else result = failure('DESKTOP_NOT_CACHED');
      if (req.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      return same(before, await session()) ? result : failure('DESKTOP_SESSION_CHANGED');
    }
  };
}
