import { imzola, sessiyaOl, SESSIYA_MUDDAT_MS } from '../../_shared/auth';
import { desktopDenyCode, desktopFail, verifiedDesktopDevice, type DesktopEnv } from '../../_shared/desktop-device';
import { onRequest as existingMiddleware } from '../_middleware';
import { onRequestPost as uploadPost } from '../hujjat-yukla';

// Native Android multipart upload (P2 photo evidence). Same trust model as mobil/bff.ts: verified device Bearer -> server-only
// same-expiry cookie -> unchanged middleware + the existing canonical upload handler (hujjat-yukla: reserve -> R2 -> finalize).
// The target is fixed (no path from the client); kompaniya_id / obyekt_id travel in the query because the middleware does not
// read multipart bodies and resolves the tenant scope from the query.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Env = DesktopEnv & Record<string, any>;
export const MOBIL_YUKLA_MAX_BYTES = 12 * 1024 * 1024;
const POSITIVE = /^[1-9]\d{0,14}$/;

async function boundedBytes(request: Request): Promise<Uint8Array> {
  const declared = Number(request.headers.get('Content-Length'));
  if (declared > MOBIL_YUKLA_MAX_BYTES) throw new Error('BODY_TOO_LARGE');
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MOBIL_YUKLA_MAX_BYTES) { await reader.cancel(); throw new Error('BODY_TOO_LARGE'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

export const onRequestPost: PagesFunction<Env> = async ctx => {
  const sess = await sessiyaOl(ctx.request, ctx.env);
  if (!sess || !verifiedDesktopDevice(ctx.request)) return desktopFail(401, desktopDenyCode(ctx.request));
  const incoming = new URL(ctx.request.url);
  const kompaniya = incoming.searchParams.get('kompaniya_id') ?? '';
  const obyekt = incoming.searchParams.get('obyekt_id') ?? '';
  const contentType = ctx.request.headers.get('Content-Type') ?? '';
  if (!POSITIVE.test(kompaniya) || !POSITIVE.test(obyekt) || !/^multipart\/form-data;\s*boundary=/i.test(contentType)) return desktopFail(400, 'TARGET_INVALID');
  let bytes: Uint8Array;
  try { bytes = await boundedBytes(ctx.request); }
  catch (err) { return desktopFail(err instanceof Error && err.message === 'BODY_TOO_LARGE' ? 413 : 400, 'BODY_INVALID'); }
  try {
    const target = new URL('/api/hujjat-yukla', incoming.origin);
    target.searchParams.set('kompaniya_id', kompaniya);
    target.searchParams.set('obyekt_id', obyekt);
    const cookie = await imzola({ rol: sess.rol, foydalanuvchi_id: sess.foydalanuvchi_id }, ctx.env.SESSIYA_KALIT, sess.exp - SESSIYA_MUDDAT_MS);
    const headers = new Headers({ Cookie: 'sess=' + cookie, Origin: target.origin, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': contentType });
    const request = new Request(target.href, { method: 'POST', headers, body: bytes });
    const data = {};
    const internal = { ...ctx, request, data, next: () => uploadPost({ ...ctx, request, data } as never) as Promise<Response> };
    const response = await existingMiddleware(internal as never);
    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete('Set-Cookie');
    responseHeaders.set('Cache-Control', 'no-store');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers: responseHeaders });
  } catch { return desktopFail(503, 'MOBIL_BFF_UNAVAILABLE'); }
};