/** /api/qulf mijozi + WebAuthn (Windows Hello / Touch ID / Face ID / Android biometrik) o'ramalari. PIN hech qayerda saqlanmaydi. */
import { b64uDan, b64uGa } from './mantiq';

export type QulfJavob = { ok: boolean; code?: string; error?: string; [k: string]: unknown };
export type QulfKalit = { id: number; tur: 'webauthn' | 'android'; nom: string | null; yaratildi: string; oxirgi: string | null };
export type QulfHolatJavob = QulfJavob & {
  pin_bor?: boolean; bosh_vaqt_daq?: number; kalitlar?: QulfKalit[]; rejim?: 'off' | 'pin' | 'biometric_or_pin'; talab?: boolean;
  usullar?: string[]; pin_holat?: string; qolgan_soniya?: number; tasdiq_bor?: boolean;
};

/** Interseptorli fetch: /api/qulf so'rovlariga interseptor aralashmaydi (STEP_UP qayta urinishi yo'q), lekin Windows ilovada tasdiq tokenini yozib oladi. */
export async function qulfSoz<T extends QulfJavob = QulfJavob>(amal: string, body: Record<string, unknown> = {}): Promise<T & { status: number }> {
  try {
    const r = amal === 'holat'
      ? await fetch('/api/qulf?amal=holat', { credentials: 'same-origin', cache: 'no-store' })
      : await fetch('/api/qulf', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amal, ...body }) });
    const j = await r.json().catch(() => ({})) as T;
    return { ...j, ok: r.ok && (j as QulfJavob).ok !== false, status: r.status };
  } catch { return { ok: false, code: 'TARMOQ', status: 0, error: 'Aloqa yo‘q' } as T & { status: number }; }
}

/** Windows ilova (Tauri) qobig'ida WebAuthn hozircha o'chiq: origin (tauri.localhost) sayt rpId siga mos kelmaydi -- ochiq masala (docs). Brauzer/sayt: ishlaydi. */
export const tauriMi = () => typeof window !== 'undefined' && !!(window as unknown as { __TAURI__?: unknown }).__TAURI__;
export const webauthnBormi = () => typeof window !== 'undefined' && !tauriMi() && !!window.PublicKeyCredential && !!navigator.credentials?.create;
export async function platformBiometrikBormi(): Promise<boolean> {
  try { return webauthnBormi() && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); } catch { return false; }
}

type Opts = { challenge: string; rp?: { id: string; name: string }; user?: { id: string; name: string; displayName: string }; rpId?: string; timeout?: number;
  pubKeyCredParams?: PublicKeyCredentialParameters[]; authenticatorSelection?: AuthenticatorSelectionCriteria; attestation?: AttestationConveyancePreference;
  userVerification?: UserVerificationRequirement; excludeCredentials?: { type: 'public-key'; id: string; transports?: AuthenticatorTransport[] }[];
  allowCredentials?: { type: 'public-key'; id: string; transports?: AuthenticatorTransport[] }[] };
const kredLar = (l?: Opts['allowCredentials']) => l?.map((c) => ({ type: c.type, id: b64uDan(c.id), transports: c.transports }));

/** Bu brauzer/qurilmaga biometrik (passkey) qo'shish. Natija: { ok } yoki server xatosi. */
export async function passkeyQosh(nom: string): Promise<QulfJavob> {
  const b = await qulfSoz<QulfJavob & { chaqiriq?: string; options?: Opts }>('webauthn_reg_boshla');
  if (!b.ok || !b.options || !b.chaqiriq) return b;
  const o = b.options;
  let cred: PublicKeyCredential | null;
  try {
    cred = await navigator.credentials.create({ publicKey: {
      challenge: b64uDan(o.challenge), rp: o.rp!, user: { id: b64uDan(o.user!.id), name: o.user!.name, displayName: o.user!.displayName },
      pubKeyCredParams: o.pubKeyCredParams!, timeout: o.timeout, attestation: o.attestation, authenticatorSelection: o.authenticatorSelection,
      excludeCredentials: kredLar(o.excludeCredentials),
    } }) as PublicKeyCredential | null;
  } catch (e) { return { ok: false, code: e instanceof DOMException && e.name === 'NotAllowedError' ? 'BEKOR' : 'WEBAUTHN', error: 'Biometrik ro‘yxatdan o‘tmadi' }; }
  if (!cred) return { ok: false, code: 'BEKOR' };
  const r = cred.response as AuthenticatorAttestationResponse;
  return qulfSoz('webauthn_reg_tugat', {
    chaqiriq: b.chaqiriq, id: cred.id, clientDataJSON: b64uGa(r.clientDataJSON), attestationObject: b64uGa(r.attestationObject),
    transports: r.getTransports?.() ?? [], nom,
  });
}

/** Biometrik tasdiq (assertion). Muvaffaqiyatda server tasdiq cookie/tokenini beradi. */
export async function passkeyKirish(): Promise<QulfJavob & { tasdiq_token?: string }> {
  const b = await qulfSoz<QulfJavob & { chaqiriq?: string; options?: Opts }>('webauthn_kirish_boshla');
  if (!b.ok || !b.options || !b.chaqiriq) return b;
  const o = b.options;
  let cred: PublicKeyCredential | null;
  try {
    cred = await navigator.credentials.get({ publicKey: {
      challenge: b64uDan(o.challenge), rpId: o.rpId, timeout: o.timeout, userVerification: 'required', allowCredentials: kredLar(o.allowCredentials),
    } }) as PublicKeyCredential | null;
  } catch (e) { return { ok: false, code: e instanceof DOMException && e.name === 'NotAllowedError' ? 'BEKOR' : 'WEBAUTHN', error: 'Biometrik tasdiq o‘tmadi' }; }
  if (!cred) return { ok: false, code: 'BEKOR' };
  const r = cred.response as AuthenticatorAssertionResponse;
  return qulfSoz('webauthn_kirish_tugat', {
    chaqiriq: b.chaqiriq, id: cred.id, clientDataJSON: b64uGa(r.clientDataJSON), authenticatorData: b64uGa(r.authenticatorData), signature: b64uGa(r.signature),
  });
}
