import { imzola, sessiyaOl, SESSIYA_MUDDAT_MS } from '../../_shared/auth';
import { desktopDenyCode, desktopFail, verifiedDesktopDevice, type DesktopEnv } from '../../_shared/desktop-device';
import { onRequest as existingMiddleware } from '../_middleware';
import { onRequestGet as sessionGet } from '../sessiya';
import { onRequestGet as packetGet } from '../obyekt-paket';
import { onRequestPost as sbPost } from '../sb';
import { onRequestGet as companyGet, onRequestPost as companyPost } from '../company';
import { onRequestPost as writePost } from '../sb-yoz';
import { onRequestGet as workplaceGet, onRequestPost as workplacePost } from '../ish-joyi';
import { onRequestGet as modulesGet, onRequestPost as modulesPost } from '../modullarim';
import { onRequestGet as hujjatAylanishGet, onRequestPost as hujjatAylanishPost } from '../hujjat-aylanish';
import { onRequestGet as fotoDalilGet, onRequestPost as fotoDalilPost } from '../foto-dalil';
import { onRequestGet as profilGet, onRequestPost as profilPost } from '../profil';
import { onRequestPost as kirishTaklifPost } from '../kirish-taklif';
import { onRequestPost as aiSavolPost } from '../ai-savol';
import { onRequestPost as agentIshPost } from '../agent-ish';
import { onRequestGet as qulfGet, onRequestPost as qulfPost } from '../qulf';

// Native Android BFF (P0). Same trust model as api/desktop/bff.ts: verified device Bearer -> server-only cookie -> unchanged
// middleware + handler. Roles never come from the token; the unchanged middleware derives fresh authority from the database.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Env = DesktopEnv & Record<string, any>;
// Static imports only. This is not a network proxy and cannot reach arbitrary URLs.
const handlers: Record<string, Record<string, PagesFunction<Env>>> = {
  '/api/sessiya': { GET: sessionGet },
  '/api/ish-joyi': { GET: workplaceGet, POST: workplacePost },
  '/api/modullarim': { GET: modulesGet, POST: modulesPost },
  '/api/company': { GET: companyGet, POST: companyPost },
  '/api/sb': { POST: sbPost },
  '/api/sb-yoz': { POST: writePost },
  '/api/obyekt-paket': { GET: packetGet },
  '/api/hujjat-aylanish': { GET: hujjatAylanishGet, POST: hujjatAylanishPost },
  '/api/foto-dalil': { GET: fotoDalilGet, POST: fotoDalilPost },
  '/api/profil': { GET: profilGet, POST: profilPost },
  '/api/kirish-taklif': { POST: kirishTaklifPost },
  '/api/ai-savol': { POST: aiSavolPost },
  '/api/agent-ish': { POST: agentIshPost },
  '/api/qulf': { GET: qulfGet, POST: qulfPost },
} as never;
export const MOBIL_PATH = /^\/api\/(sessiya|ish-joyi|modullarim|company|sb|sb-yoz|obyekt-paket|hujjat-aylanish|foto-dalil|profil|kirish-taklif|ai-savol|agent-ish|qulf)(?:\?[^#\s]*)?$/;
/** /api/profil also hosts account-security actions (parol, google/telegram ulash, hisob_birlashtir, sessions): the native device token may NOT reach them.\n *  Only the @username / people-search / invite-answer actions are exposed (USERNAME_V1). */
export const MOBIL_PROFIL_AMAL: ReadonlySet<string> = new Set(['username_ol','username_tekshir','username_belgila','username_sozlama','qidir','kompaniyadosh_qidir','username_ommaviy','taklif_royxat','taklif_javob']);
/** /api/kirish-taklif is public-by-design (qabul = sign-up without a session): the device may only reach yarat (director creates a phone invite link/code). */
export const MOBIL_TAKLIF_AMAL: ReadonlySet<string> = new Set(['yarat']);
const amalRuxsat = (amallar: ReadonlySet<string>, method: string, body: unknown): boolean => {
  if (method !== 'POST') return false;
  try { const o = typeof body === 'string' ? JSON.parse(body) : body; return !!o && typeof o === 'object' && typeof (o as { amal?: unknown }).amal === 'string' && amallar.has((o as { amal: string }).amal); } catch { return false; }
};
/** /api/agent-ish also hosts admin/superadmin actions (models, budgets, rules, rivojlanish...): the device may reach ONLY the Jarvis chat (kasb_savol, same aiHisobli charging) and the server-side chat list/save (t2_jarvis_suhbat), identical to web. */
export const MOBIL_AGENT_AMAL: ReadonlySet<string> = new Set(['kasb_savol','suhbat_royxat','suhbat_ol','suhbat_saqla','suhbat_ochir']);
export const MOBIL_BFF_MAX_BYTES = 2 * 1024 * 1024;

async function boundedBody(request: Request): Promise<string> {
  if (Number(request.headers.get('Content-Length')) > MOBIL_BFF_MAX_BYTES) throw new Error('BODY_TOO_LARGE');
  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MOBIL_BFF_MAX_BYTES) { await reader.cancel(); throw new Error('BODY_TOO_LARGE'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(bytes);
}


/** Verified native bearer -> server-only same-expiry cookie -> unchanged BFF gates/handler.
 * External Cookie/headers/actor/authority are never forwarded. */
export const onRequestPost: PagesFunction<Env> = async ctx => {
  const sess = await sessiyaOl(ctx.request, ctx.env);
  if (!sess || !verifiedDesktopDevice(ctx.request)) return desktopFail(401, desktopDenyCode(ctx.request));
  let b: Record<string, unknown>;
  try { b = JSON.parse(await boundedBody(ctx.request)); }
  catch (err) { return desktopFail(err instanceof Error && err.message === 'BODY_TOO_LARGE' ? 413 : 400, 'BODY_INVALID'); }
  if (!b || typeof b !== 'object' || Array.isArray(b) || Object.keys(b).some(k => !['path','method','body','etag','tasdiq'].includes(k)) ||
    typeof b.path !== 'string' || b.path.length > 8192 || !MOBIL_PATH.test(b.path) ||
    typeof b.method !== 'string' || !['GET','POST'].includes(b.method)) return desktopFail(400, 'TARGET_INVALID');
  const target = new URL(b.path, new URL(ctx.request.url).origin);
  const handler = Object.hasOwn(handlers, target.pathname) ? handlers[target.pathname][b.method] : undefined;
  if (!handler || (target.pathname === '/api/profil' && !amalRuxsat(MOBIL_PROFIL_AMAL, b.method, b.body)) || (target.pathname === '/api/kirish-taklif' && !amalRuxsat(MOBIL_TAKLIF_AMAL, b.method, b.body)) || (target.pathname === '/api/agent-ish' && !amalRuxsat(MOBIL_AGENT_AMAL, b.method, b.body)) || (b.method === 'GET' && b.body != null) ||
    (b.etag != null && (typeof b.etag !== 'string' || b.etag.length > 512 || /[\x00-\x1f\x7f]/.test(b.etag)))) return desktopFail(400, 'TARGET_INVALID');
  try {
    const cookie = await imzola({ rol: sess.rol, foydalanuvchi_id: sess.foydalanuvchi_id }, ctx.env.SESSIYA_KALIT, sess.exp - SESSIYA_MUDDAT_MS);
    const headers = new Headers({ Cookie: 'sess=' + cookie, Origin: target.origin, 'Sec-Fetch-Site': 'same-origin' });
    if (typeof b.etag === 'string') headers.set('If-None-Match', b.etag);
    headers.set('X-Qulf-Kanal', 'mobil'); // QULF: tasdiq tokeni qurilma kanaliga bog'langan (BFF har so'rovda yangi sessiya jti beradi)
    if (typeof b.tasdiq === 'string' && b.tasdiq.length <= 600) headers.set('X-Tasdiq', b.tasdiq);
    if (b.method === 'POST') headers.set('Content-Type', 'application/json');
    const request = new Request(target.href, { method: b.method, headers,
      ...(b.method === 'POST' ? { body: typeof b.body === 'string' ? b.body : JSON.stringify(b.body ?? {}) } : {}),
    });
    const data = {};
    const internal = { ...ctx, request, data, next: () => handler({ ...ctx, request, data } as typeof ctx) as Promise<Response> };
    const response = await existingMiddleware(internal as typeof ctx);
    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete('Set-Cookie');
    responseHeaders.set('Cache-Control', 'no-store');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers: responseHeaders });
  } catch { return desktopFail(503, 'MOBIL_BFF_UNAVAILABLE'); }
};
