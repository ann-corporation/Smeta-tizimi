export const DESKTOP_LEASE_FORMAT = 'smeta-desktop-lease/1';
export const DESKTOP_LEASE_TTL = 72 * 3600_000;
export type DesktopLease = Readonly<{
  format: typeof DESKTOP_LEASE_FORMAT;
  foydalanuvchi_id: number;
  kompaniya_id: number;
  obyekt_idlar: readonly number[];
  permissions: readonly string[];
  device_id: string;
  berildi: number;
  tugaydi: number;
  versiya: number;
}>;
export type LeaseEnvelope = { alg: 'Ed25519'; kid: string; payload: string; imzo: string };
export type LeaseScope = { foydalanuvchiId: number; kompaniyaId: number; deviceId: string };
export const DESKTOP_READ_PERMISSIONS = ['smeta.read', 'f2.read', 'narx.read'] as const;
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;

export function base64urlDecode(value: string): Uint8Array<ArrayBuffer> {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('DESKTOP_LEASE_ENCODING');
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
}

/** Public key and kid come from the installed build, never from an HTTP response or lease. */
export async function verifyDesktopLease(
  input: unknown, scope: LeaseScope, publicKey: Uint8Array, kid: string, now = Date.now(),
): Promise<DesktopLease> {
  if (!input || typeof input !== 'object' || !kid || publicKey.byteLength !== 32) throw new Error('DESKTOP_LEASE_CONFIG');
  const e = input as LeaseEnvelope;
  if (e.alg !== 'Ed25519' || e.kid !== kid || typeof e.payload !== 'string' || e.payload.length > 65536 ||
      typeof e.imzo !== 'string' || e.imzo.length !== 86) throw new Error('DESKTOP_LEASE_INVALID');
  const bytes = base64urlDecode(e.payload), signature = base64urlDecode(e.imzo);
  const key = await crypto.subtle.importKey('raw', new Uint8Array(publicKey), { name: 'Ed25519' }, false, ['verify']);
  if (signature.length !== 64 || !await crypto.subtle.verify('Ed25519', key, signature, bytes)) throw new Error('DESKTOP_LEASE_SIGNATURE');
  const p = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)) as DesktopLease;
  if (!p || p.format !== DESKTOP_LEASE_FORMAT || !positive(p.foydalanuvchi_id) || !positive(p.kompaniya_id) ||
      p.foydalanuvchi_id !== scope.foydalanuvchiId || p.kompaniya_id !== scope.kompaniyaId ||
      typeof p.device_id !== 'string' || p.device_id !== scope.deviceId || !p.device_id ||
      !positive(p.versiya) || !positive(p.berildi) || !positive(p.tugaydi) ||
      !Number.isSafeInteger(now) || p.berildi > now || p.tugaydi <= now ||
      p.tugaydi <= p.berildi || p.tugaydi - p.berildi > DESKTOP_LEASE_TTL ||
      !Array.isArray(p.obyekt_idlar) || p.obyekt_idlar.length === 0 || p.obyekt_idlar.length > 100 ||
      !p.obyekt_idlar.every(positive) || new Set(p.obyekt_idlar).size !== p.obyekt_idlar.length ||
      !Array.isArray(p.permissions) || !p.permissions.every(v => typeof v === 'string') ||
      !DESKTOP_READ_PERMISSIONS.every(v => p.permissions.includes(v))) throw new Error('DESKTOP_LEASE_SCOPE_OR_EXPIRY');
  return Object.freeze({ ...p, obyekt_idlar: Object.freeze([...p.obyekt_idlar]), permissions: Object.freeze([...p.permissions]) });
}

/** Wall-clock rollback and in-process monotonic expiry both fail closed. Persist highWater in encrypted storage. */
export class DesktopLeaseGuard {
  private highWater: number;
  private readonly monotonicExpiry: number;
  private invalid = false;
  private readonly lease: DesktopLease;
  private readonly clock: () => number;
  private readonly monotonic: () => number;
  constructor(lease: DesktopLease, highWater: number, clock = Date.now, monotonic = () => performance.now()) {
    this.lease = lease; this.clock = clock; this.monotonic = monotonic;
    this.invalid = !Number.isSafeInteger(highWater) || highWater < lease.berildi;
    this.highWater = Math.max(highWater, lease.berildi);
    this.monotonicExpiry = monotonic() + Math.max(0, lease.tugaydi - clock());
  }
  allow(objectId: number): number {
    const now = this.clock();
    if (this.invalid || now < this.highWater || now >= this.lease.tugaydi || this.monotonic() >= this.monotonicExpiry ||
        !positive(objectId) || !this.lease.obyekt_idlar.includes(objectId)) {
      this.invalid = true;
      throw new Error('DESKTOP_OFFLINE_DENIED');
    }
    this.highWater = now;
    return now;
  }
  revoke() { this.invalid = true; }
}
