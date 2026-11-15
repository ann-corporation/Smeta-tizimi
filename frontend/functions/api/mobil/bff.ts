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
import { onRequestPost as aiSavolPost } from '../ai-savol';

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
  '/api/ai-savol': { POST: aiSavolPost },
} as never;
export const MOBIL_PATH = /^\/api\/(sessiya|ish-joyi|modullarim|company|sb|sb-yoz|obyekt-paket|hujjat-aylanish|foto-dalil|ai-savol)(?:\?[^#\s]*)?$/;
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
  if (!b || typeof b !== 'object' || Array.isArray(b) || Object.keys(b).some(k => !['path','method','body','etag'].includes(k)) ||
    typeof b.path !== 'string' || b.path.length > 8192 || !MOBIL_PATH.test(b.path) ||
    typeof b.method !== 'string' || !['GET','POST'].includes(b.method)) return desktopFail(400, 'TARGET_INVALID');
  const target = new URL(b.path, new URL(ctx.request.url).origin);
  const handler = Object.hasOwn(handlers, target.pathname) ? handlers[target.pathname][b.method] : undefined;
  if (!handler || (b.method === 'GET' && b.body != null) ||
    (b.etag != null && (typeof b.etag !== 'string' || b.etag.length > 512 || /[\x00-\x1f\x7f]/.test(b.etag)))) return desktopFail(400, 'TARGET_INVALID');
  try {
    const cookie = await imzola({ rol: sess.rol, foydalanuvchi_id: sess.foydalanuvchi_id }, ctx.env.SESSIYA_KALIT, sess.exp - SESSIYA_MUDDAT_MS);
    const headers = new Headers({ Cookie: 'sess=' + cookie, Origin: target.origin, 'Sec-Fetch-Site': 'same-origin' });
    if (typeof b.etag === 'string') headers.set('If-None-Match', b.etag);
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
