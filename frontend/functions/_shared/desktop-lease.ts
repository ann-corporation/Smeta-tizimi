import { base64url, positiveId, unbase64url, uuid } from './desktop-device';

export const LEASE_MAX_MS = 72 * 3600_000;
export type DesktopLeasePayload = {
  format: 'smeta-desktop-lease/1'; foydalanuvchi_id: number; kompaniya_id: number;
  obyekt_idlar: number[]; permissions: string[]; device_id: string;
  berildi: number; tugaydi: number; versiya: number;
};
export type DesktopLeaseEnvelope = { alg: 'Ed25519'; kid: string; payload: string; imzo: string };
export type DesktopLeaseEnv = { DESKTOP_LEASE_SK?: string; DESKTOP_LEASE_KID?: string };

export function leasePayloadValid(p: DesktopLeasePayload, now: number): boolean {
  return p?.format === 'smeta-desktop-lease/1' && positiveId(p.foydalanuvchi_id) && positiveId(p.kompaniya_id) &&
    uuid(p.device_id) && positiveId(p.versiya) && Number.isSafeInteger(p.berildi) && Number.isSafeInteger(p.tugaydi) &&
    p.berildi <= now && p.tugaydi > now && p.tugaydi > p.berildi && p.tugaydi - p.berildi <= LEASE_MAX_MS &&
    Array.isArray(p.obyekt_idlar) && p.obyekt_idlar.length > 0 && p.obyekt_idlar.length <= 100 && p.obyekt_idlar.every(positiveId) &&
    new Set(p.obyekt_idlar).size === p.obyekt_idlar.length && Array.isArray(p.permissions) && p.permissions.length > 0 &&
    p.permissions.every(v => typeof v === 'string' && /^[a-z][a-z0-9_.]*\.read$/.test(v));
}

export async function signDesktopLease(payload: DesktopLeasePayload, env: DesktopLeaseEnv): Promise<DesktopLeaseEnvelope> {
  if (!env.DESKTOP_LEASE_SK || !env.DESKTOP_LEASE_KID || !/^[A-Za-z0-9._-]{1,80}$/.test(env.DESKTOP_LEASE_KID)) throw new Error('DESKTOP_LEASE_CONFIG');
  if (!leasePayloadValid(payload, Date.now())) throw new Error('DESKTOP_LEASE_INVALID');
  // PKCS#8 base64url, server env only. No cookie/HMAC/development fallback key.
  const key = await crypto.subtle.importKey('pkcs8', unbase64url(env.DESKTOP_LEASE_SK), { name: 'Ed25519' }, false, ['sign']);
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const imzo = await crypto.subtle.sign('Ed25519', key, bytes);
  return { alg: 'Ed25519', kid: env.DESKTOP_LEASE_KID, payload: base64url(bytes), imzo: base64url(new Uint8Array(imzo)) };
}

/** Contract verifier for synthetic acceptance. Verification keys must be pinned by kid. */
export async function verifyDesktopLease(envelope: DesktopLeaseEnvelope, publicKeys: Record<string, string>, scope: { device_id: string; foydalanuvchi_id: number; kompaniya_id: number; obyekt_id: number }, now = Date.now()): Promise<boolean> {
  try {
    if (envelope.alg !== 'Ed25519' || !Object.hasOwn(publicKeys, envelope.kid)) return false;
    const key = await crypto.subtle.importKey('raw', unbase64url(publicKeys[envelope.kid]), { name: 'Ed25519' }, false, ['verify']);
    const bytes = unbase64url(envelope.payload);
    if (!(await crypto.subtle.verify('Ed25519', key, unbase64url(envelope.imzo), bytes))) return false;
    const p = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)) as DesktopLeasePayload;
    return leasePayloadValid(p, now) && p.device_id === scope.device_id && p.foydalanuvchi_id === scope.foydalanuvchi_id &&
      p.kompaniya_id === scope.kompaniya_id && p.obyekt_idlar.includes(scope.obyekt_id);
  } catch { return false; }
}
