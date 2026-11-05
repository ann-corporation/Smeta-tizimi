import type { Sess } from './auth';
import { supabaseBaseUrl } from './supabase-url';

export type DesktopEnv = { SUPABASE_URL: string; SUPABASE_KEY: string; SESSIYA_KALIT: string };
export const DESKTOP_ORIGIN = 'http://tauri.localhost';
export const DESKTOP_SESSION_MS = 90 * 24 * 3600_000;
export const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export const positiveId = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
export const desktopFail = (status: number, code: string) => Response.json({ ok: false, code }, { status, headers: { 'Cache-Control': 'no-store' } });

export function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function unbase64url(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('BASE64URL_INVALID');
  const bytes = Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  if (base64url(bytes) !== value) throw new Error('BASE64URL_INVALID');
  return bytes;
}
export async function deviceHash(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

/** Fixed server-side RPC family only. Never forwards caller-selected RPC names or credentials. */
export async function desktopRpc(env: DesktopEnv, command: 't2_desktop_qurilma_yarat_v1' | 't2_desktop_qurilma_tekshir_v1' | 't2_desktop_qurilma_bekor_v1' | 't2_desktop_lease_chegara_v1', args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const r = await fetch(supabaseBaseUrl(env.SUPABASE_URL) + '/rest/v1/rpc/' + command, {
    method: 'POST', headers: { apikey: env.SUPABASE_KEY, Authorization: 'Bearer ' + env.SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error('DESKTOP_DB_UNAVAILABLE');
  const result: unknown = await r.json();
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('DESKTOP_DB_INVALID');
  return result as Record<string, unknown>;
}

export type VerifiedDevice = { device_id: string; foydalanuvchi_id: number; tugaydi: number; sessiya_exp: number; versiya: number };
// Request identity, not a caller flag, proves the native credential was checked.
const devices = new WeakMap<Request, VerifiedDevice>();
export const verifiedDesktopDevice = (request: Request) => devices.get(request);

export async function desktopSessiya(request: Request, env: DesktopEnv): Promise<Sess | null> {
  devices.delete(request);
  if (request.headers.get('Origin') !== DESKTOP_ORIGIN) return null;
  const token = request.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
  if (!token) return null;
  try {
    if (unbase64url(token).length !== 32) return null;
    const r = await desktopRpc(env, 't2_desktop_qurilma_tekshir_v1', { p_token_hash: await deviceHash(token) });
    if (r.ok !== true || !uuid(r.device_id) || !positiveId(r.foydalanuvchi_id) ||
      typeof r.tugaydi !== 'number' || r.tugaydi <= Date.now() ||
      typeof r.sessiya_exp !== 'number' || r.sessiya_exp <= Date.now() || !positiveId(r.versiya)) return null;
    const device = r as unknown as VerifiedDevice;
    devices.set(request, device);
    // Neutral role. Never restores roles/permissions from a stored cookie or caller JSON.
    return { rol: 'rahbar', foydalanuvchi_id: device.foydalanuvchi_id, exp: device.sessiya_exp, jti: device.device_id };
  } catch { return null; }
}

/** Cookie commands require same-origin CSRF. Only a verified native request is exempt. */
export function desktopCsrfAllowed(request: Request): boolean {
  if (verifiedDesktopDevice(request)) return true;
  const origin = request.headers.get('Origin');
  return request.headers.get('Sec-Fetch-Site') !== 'cross-site' &&
    (origin === new URL(request.url).origin || (!origin && request.headers.get('Sec-Fetch-Site') === 'same-origin'));
}
