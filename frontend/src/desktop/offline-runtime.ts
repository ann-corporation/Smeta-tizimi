import { paketDekod, type Paket, type PaketXom } from '../ombor/paket';
import type { NativeInvoke } from './fetch-shim';
import { NativeDesktopCache } from './native-cache';
import { DesktopLeaseGuard, verifyDesktopLease, type DesktopLease, type LeaseEnvelope, type LeaseScope } from './offline-lease';

export type NativeSessionInfo = { device_id: string | null; foydalanuvchi_id: number | null; generation: number };
type StoredLease = { envelope: LeaseEnvelope; highWater: number };
type StoredPacket = { raw: PaketXom; etag: string | null };
type Active = { scope: LeaseScope; generation: number; stored: StoredLease; lease: DesktopLease; guard: DesktopLeaseGuard };
export type DesktopOpenedPacket = { paket: Paket; offline: boolean; etag: string | null; leaseUntil: number; permissions: readonly string[] };
const id = (v: number | null): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const networkError = (e: unknown) => e instanceof TypeError || /DESKTOP_HTTP_(FAILED|UNAVAILABLE)/.test(String(e));
export async function invalidatesDesktopSession(response: Response): Promise<boolean> {
  if (response.status === 401) return true;
  if (response.ok) return false;
  const body = await response.clone().json().catch(() => null);
  return /^(AUTH_REQUIRED|DEVICE_(AUTH_REQUIRED|REVOKED|EXPIRED|INVALID|SESSION_INVALID|TOKEN_INVALID))$/.test(String(body?.code));
}

/** Desktop-only, read-only package lifecycle. Every disk read follows a verified scoped lease. */
export class DesktopOfflineRuntime {
  private readonly invoke: NativeInvoke;
  private readonly request: typeof fetch;
  private readonly publicKey: Uint8Array;
  private readonly kid: string;
  private readonly onInvalidate: () => void;
  private readonly onExpire: () => void;
  private readonly clock: () => number;
  private readonly cache: NativeDesktopCache;
  private active?: Active;
  private revision = 0;
  private busy = false;
  private blocked = false;
  private timer?: ReturnType<typeof setTimeout>;

  constructor(options: { invoke: NativeInvoke; request: typeof fetch; publicKey: Uint8Array; kid: string; onInvalidate: () => void; onExpire?: () => void; clock?: () => number }) {
    this.invoke = options.invoke; this.request = options.request; this.publicKey = options.publicKey;
    this.kid = options.kid; this.onInvalidate = options.onInvalidate; this.clock = options.clock ?? Date.now;
    this.cache = new NativeDesktopCache(options.invoke);
    this.onExpire = options.onExpire ?? options.onInvalidate;
  }
  private invalidate() {
    this.revision++;
    this.active?.guard.revoke(); this.active = undefined;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.onInvalidate();
  }
  private async session(company: number) {
    if (this.blocked) throw new Error('DESKTOP_REVOKED');
    const session = await this.invoke<NativeSessionInfo>('desktop_session_info');
    if (!id(company) || !id(session.foydalanuvchi_id) || !session.device_id || !Number.isSafeInteger(session.generation)) throw new Error('DESKTOP_SESSION_REQUIRED');
    return { session, scope: { kompaniyaId: company, foydalanuvchiId: session.foydalanuvchi_id, deviceId: session.device_id } };
  }
  private async bind(scope: LeaseScope, generation: number, saved: StoredLease, revision: number) {
    if (!saved || !Number.isSafeInteger(saved.highWater)) throw new Error('DESKTOP_LEASE_CHECKPOINT');
    const lease = await verifyDesktopLease(saved.envelope, scope, this.publicKey, this.kid, this.clock());
    if (revision !== this.revision) throw new Error('DESKTOP_STALE');
    const active = { scope, generation, stored: saved, lease, guard: new DesktopLeaseGuard(lease, saved.highWater, this.clock) };
    this.active = active;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.invalidate(); this.onExpire(); }, Math.max(1, lease.tugaydi - this.clock()));
    return active;
  }
  private async checkpoint(active: Active, objectId: number, revision: number) {
    if (revision !== this.revision || this.active !== active) throw new Error('DESKTOP_STALE');
    const info = await this.invoke<NativeSessionInfo>('desktop_session_info');
    if (info.generation !== active.generation || info.device_id !== active.scope.deviceId || info.foydalanuvchi_id !== active.scope.foydalanuvchiId) {
      this.invalidate(); throw new Error('DESKTOP_SESSION_CHANGED');
    }
    if (revision !== this.revision || this.active !== active) throw new Error('DESKTOP_STALE');
    active.stored.highWater = active.guard.allow(objectId);
    await this.cache.set('lease/' + active.scope.kompaniyaId, active.stored);
    if (revision !== this.revision || this.active !== active) throw new Error('DESKTOP_STALE');
  }
  private decode(raw: PaketXom, company: number, objectId: number): Paket {
    if (raw?.kompaniya_id !== company || raw.obyekt_id !== objectId ||
        !Array.isArray(raw.h?.f2_summa_yoq) || raw.h.f2_summa_yoq.length !== raw.soni ||
        raw.h.f2_summa_yoq.some(v => v !== null && (!Number.isSafeInteger(v) || v < 0)) ||
        !Array.isArray(raw.meta?.akt_podval)) throw new Error('DESKTOP_PACKET_SCHEMA');
    return paketDekod(raw);
  }
  async open(company: number, objectId: number): Promise<DesktopOpenedPacket> {
    if (this.busy) throw new Error('DESKTOP_BUSY');
    this.busy = true;
    try { return await this.openOnce(company, objectId); }
    finally { this.busy = false; }
  }
  private async openOnce(company: number, objectId: number): Promise<DesktopOpenedPacket> {
    this.invalidate();
    const revision = this.revision;
    if (!id(objectId)) throw new Error('DESKTOP_OBJECT_INVALID');
    const { session, scope } = await this.session(company);
    const prior = await this.cache.get<StoredLease>('lease/' + company);
    let active: Active | undefined;
    if (prior) {
      try { active = await this.bind(scope, session.generation, prior, revision); }
      catch { if (revision !== this.revision) throw new Error('DESKTOP_STALE'); }
    }
    // Reconnect always renews/revalidates before exposing any business snapshot.
    let offline = false;
    try {
      const ids: number[] = [];
      for (const priorId of active?.lease.obyekt_idlar ?? []) {
        if (priorId !== objectId && !await this.cache.get('denied/' + company + '/' + priorId)) ids.push(priorId);
      }
      ids.push(objectId);
      if (ids.length > 100) ids.splice(0, ids.length - 100);
      const response = await this.request('/api/desktop/lease', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kompaniya_id: company, obyekt_idlar: ids }) });
      if (await invalidatesDesktopSession(response)) { await this.revoke(); throw new Error('DESKTOP_ACCESS_REVOKED'); }
      if (response.status === 403) { await this.denyObject(company, objectId); throw new Error('DESKTOP_OBJECT_FORBIDDEN'); }
      if (!response.ok) throw new Error('DESKTOP_LEASE_SERVER_REJECTED');
      const body = await response.json();
      if (body?.ok !== true) throw new Error('DESKTOP_LEASE_INVALID');
      active = await this.bind(scope, session.generation, { envelope: body.lease, highWater: this.clock() }, revision);
    } catch (e) {
      if (!networkError(e) || !active) throw e;
      if (await this.cache.get('denied/' + company + '/' + objectId)) throw new Error('DESKTOP_OBJECT_FORBIDDEN');
      offline = true;
    }
    if (!active) throw new Error('DESKTOP_OFFLINE_DENIED');
    await this.checkpoint(active, objectId, revision);
    const key = 'packet/' + company + '/' + objectId;
    const cached = await this.cache.get<StoredPacket>(key);
    await this.checkpoint(active, objectId, revision);
    let raw: PaketXom, etag: string | null;
    if (offline) {
      if (!cached) throw new Error('DESKTOP_PACKET_NOT_CACHED');
      raw = cached.raw; etag = cached.etag;
    } else {
      try {
        const response = await this.request('/api/obyekt-paket?obyekt_id=' + objectId, {
          cache: 'no-store', ...(cached?.etag ? { headers: { 'If-None-Match': cached.etag } } : {}),
        });
        if (await invalidatesDesktopSession(response)) { await this.revoke(); throw new Error('DESKTOP_ACCESS_REVOKED'); }
        if (response.status === 403) { await this.denyObject(company, objectId); throw new Error('DESKTOP_OBJECT_FORBIDDEN'); }
        if (response.status === 304) {
          if (!cached?.etag || response.headers.get('ETag') !== cached.etag) throw new Error('DESKTOP_PACKET_ETAG');
          raw = cached.raw; etag = cached.etag;
        } else {
          if (!response.ok) throw new Error('DESKTOP_PACKET_SERVER_REJECTED');
          raw = await response.json() as PaketXom; etag = response.headers.get('ETag');
          this.decode(raw, company, objectId);
          await this.checkpoint(active, objectId, revision);
          await this.cache.set(key, { raw, etag });
        }
      } catch (e) {
        if (!networkError(e) || !cached) throw e;
        raw = cached.raw; etag = cached.etag; offline = true;
      }
    }
    const paket = this.decode(raw, company, objectId);
    await this.checkpoint(active, objectId, revision);
    if (!offline) await this.cache.delete('denied/' + company + '/' + objectId);
    return { paket, offline, etag, leaseUntil: active.lease.tugaydi, permissions: active.lease.permissions };
  }
  dispose() { this.invalidate(); }
  private async denyObject(company: number, objectId: number) {
    this.invalidate();
    await this.cache.set('denied/' + company + '/' + objectId, true);
    for (const prefix of ['packet/', 'pages/']) await this.cache.delete(prefix + company + '/' + objectId);
  }
  async revoke() {
    this.blocked = true;
    this.invalidate();
    try { for (const key of await this.cache.keys()) await this.cache.delete(key); }
    finally {
      try { await this.invoke('desktop_session_clear'); }
      finally { if (typeof window !== 'undefined') window.dispatchEvent(new Event('desktop-session-ended')); }
    }
  }
}
