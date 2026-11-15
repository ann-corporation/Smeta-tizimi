/**
 * /api/qulf -- QULF (PIN, passkey/biometrik, qurilma kaliti) va TASDIQ (step-up) endpointi. Hujjat: docs/architecture/QULF_VA_TASDIQ_V1.md
 *   GET  ?amal=holat                      -> PIN bormi, qurilmalar, vaqt, siyosat, blok holati
 *   POST {amal, ...}                      -> qulf-amal.ts (pin_saqla, pin_tekshir, webauthn_*, qurilma_*, siyosat_*, vaqt_saqla, kalit_ochir)
 * Sessiya shart (cookie yoki native BFF). Muvaffaqiyatli tasdiq: JSON'da `tasdiq_token` (+ web uchun HttpOnly cookie qulf_tasdiq, 5 daqiqa).
 * PIN va xesh logga/javobga chiqmaydi. Same-origin shart (CSRF): Origin sarlavhasi saytniki bo'lishi kerak.
 */
import { SESSIYA_MUDDAT_MS, tekshir } from '../_shared/auth';
import { roleAuthority } from '../_shared/role-authority';
import { qulfAmal, type Kontekst } from '../_shared/qulf-amal';
import { QulfYoq, supabaseStore } from '../_shared/qulf-store';
import { rpVaOrigin } from '../_shared/qulf-webauthn';
import { tasdiqCookie, tasdiqOl } from '../_shared/qulf';
import { KANAL_HEADER } from '../_shared/qulf-darvoza';

type Env = { SUPABASE_URL: string; SUPABASE_KEY: string; SESSIYA_KALIT: string; QULF_RP_ID?: string; QULF_ORIGINS?: string };
const J = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra } });
const BODY_MAX = 32 * 1024;

async function ish(ctx: { request: Request; env: Env }, amal: string, b: Record<string, unknown>): Promise<Response> {
  const sess = await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT);
  const uid = sess?.foydalanuvchi_id;
  if (!sess || !Number.isSafeInteger(uid) || !uid) return J({ ok: false, code: 'AUTH_REQUIRED', error: 'Tizimga qayta kiring.' }, 401);
  const authority = await roleAuthority(sess, ctx.env).catch(() => null);
  const kompaniyalar = (authority?.kompaniyalar ?? sess.kompaniyalar ?? []).map(a => a.kompaniya_id);
  const k: Kontekst = {
    store: supabaseStore(ctx.env), uid: uid as number, jti: sess.jti, iat: sess.exp - SESSIYA_MUDDAT_MS, kanal: ctx.request.headers.get(KANAL_HEADER) === 'mobil' ? 'mobil' : 'web',
    kalit: ctx.env.SESSIYA_KALIT, hozir: Date.now(), ...rpVaOrigin(ctx.request.url, ctx.env), tasdiq: tasdiqOl(ctx.request), kompaniyalar,
    siyosatRuxsat: (kid) => authority?.rol === 'superadmin' || !!authority?.permissionsByCompany?.[kid]?.includes('control.company.write'),
  };
  try {
    const r = await qulfAmal(k, amal, b);
    return J(r.body, r.status, r.tasdiq && k.kanal === 'web' ? { 'Set-Cookie': tasdiqCookie(r.tasdiq) } : {});
  } catch (e) {
    if (e instanceof QulfYoq) return J({ ok: false, code: 'QULF_YOQ', error: 'Xavfsizlik moduli hali yoqilmagan.' }, 501);
    return J({ ok: false, code: 'QULF_UNAVAILABLE', error: 'Vaqtincha mavjud emas. Qayta urinib ko\'ring.' }, 503);
  }
}

export const onRequestGet: PagesFunction<Env> = async ctx => {
  const amal = new URL(ctx.request.url).searchParams.get('amal') || 'holat';
  if (amal !== 'holat') return J({ ok: false, code: 'AMAL_YOQ' }, 400);
  return ish(ctx, 'holat', {});
};

export const onRequestPost: PagesFunction<Env> = async ctx => {
  const origin = ctx.request.headers.get('Origin');
  if (origin && origin !== new URL(ctx.request.url).origin) return J({ ok: false, code: 'ORIGIN', error: 'Ruxsat yo\'q.' }, 403);
  let b: Record<string, unknown>;
  try {
    const raw = await ctx.request.text();
    if (raw.length > BODY_MAX) return J({ ok: false, code: 'BODY_TOO_LARGE' }, 413);
    const p = JSON.parse(raw); if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error('x'); b = p;
  } catch { return J({ ok: false, code: 'BODY_INVALID' }, 400); }
  return ish(ctx, String(b.amal || ''), b);
};
