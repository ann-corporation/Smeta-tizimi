import { sessiyaOl } from '../../_shared/auth';
import { desktopDenyCode, desktopFail, verifiedDesktopDevice, type DesktopEnv } from '../../_shared/desktop-device';
import { roleAuthority, sessiyaYaroqsizmi } from '../../_shared/role-authority';
import { r2Ochir, r2Oqi, r2Yoz, yuklashTekshir } from '../../_shared/r2-saqlash';

/**
 * /api/mobil/avatar - the signed-in user's OWN profile photo for the native app (P10). Device Bearer only (same trust model as mobil/yukla):
 *   GET    -> image bytes (404 AVATAR_YOQ when none)
 *   POST   -> raw image body (Content-Type image/jpeg | image/png | image/webp), <= 2 MiB, magic bytes verified -> R2 key avatar/u<actor>/foto (single object, replaced in place)
 *   DELETE -> removes it
 * The key is derived from the verified device actor, never from the request. R2 is written ONLY through r2Yoz (functions/_shared/r2-saqlash.ts).
 * No database column is needed: the object's existence is the state. The app downsizes to <= 512 px before upload; the server validates type and size.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Env = DesktopEnv & { R2_CANONICAL?: any } & Record<string, any>;
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const NO_STORE = { 'Cache-Control': 'no-store' };
const json = (b: unknown, status: number) => Response.json(b, { status, headers: NO_STORE });

export const avatarKalit = (actorId: number) => `avatar/u${actorId}/foto`;

/** Real type from the first bytes (the header is only a hint and is never trusted). */
export function rasmTuri(b: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}

async function boundedBytes(request: Request): Promise<Uint8Array> {
  if (Number(request.headers.get('Content-Length')) > AVATAR_MAX_BYTES) throw new Error('BODY_TOO_LARGE');
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > AVATAR_MAX_BYTES) { await reader.cancel(); throw new Error('BODY_TOO_LARGE'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) { bytes.set(c, offset); offset += c.length; }
  return bytes;
}

/** Verified device + live account; returns the actor id or the refusal response. */
async function actor(ctx: { request: Request; env: Env }): Promise<number | Response> {
  const sess = await sessiyaOl(ctx.request, ctx.env);
  const device = verifiedDesktopDevice(ctx.request);
  if (!sess || !device) return desktopFail(401, desktopDenyCode(ctx.request));
  const live = await roleAuthority(sess, ctx.env);
  if (!live) return sessiyaYaroqsizmi(sess) ? desktopFail(401, 'DEVICE_AUTH_REQUIRED') : desktopFail(503, 'AUTHORITY_UNAVAILABLE');
  return device.foydalanuvchi_id;
}

export const onRequestGet: PagesFunction<Env> = async ctx => {
  const a = await actor(ctx); if (a instanceof Response) return a;
  if (!ctx.env.R2_CANONICAL) return json({ ok: false, code: 'R2_YOQ' }, 503);
  const o = await r2Oqi(ctx.env.R2_CANONICAL, avatarKalit(a)).catch(() => null);
  if (!o) return json({ ok: false, code: 'AVATAR_YOQ' }, 404);
  return new Response(o.body, { headers: { 'Content-Type': o.httpMetadata?.contentType ?? 'image/jpeg', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
};

export const onRequestPost: PagesFunction<Env> = async ctx => {
  const a = await actor(ctx); if (a instanceof Response) return a;
  if (!ctx.env.R2_CANONICAL) return json({ ok: false, code: 'R2_YOQ' }, 503);
  let bytes: Uint8Array;
  try { bytes = await boundedBytes(ctx.request); }
  catch (err) { return json({ ok: false, code: err instanceof Error && err.message === 'BODY_TOO_LARGE' ? 'HAJM_NOTOGRI' : 'BODY_INVALID' }, err instanceof Error && err.message === 'BODY_TOO_LARGE' ? 413 : 400); }
  const turi = rasmTuri(bytes);
  const hint = (ctx.request.headers.get('Content-Type') ?? '').split(';')[0].trim().toLowerCase();
  if (!turi || (hint !== turi)) return json({ ok: false, code: 'TUR_NOTOGRI' }, 400);
  const t = yuklashTekshir({ nom: 'avatar', mime: turi, bayt: bytes.byteLength, maxBayt: AVATAR_MAX_BYTES });
  if (!t.ok) return json({ ok: false, code: 'HAJM_NOTOGRI' }, 400);
  await r2Yoz(ctx.env.R2_CANONICAL, avatarKalit(a), bytes, { httpMetadata: { contentType: turi } });
  return json({ ok: true, hajm: bytes.byteLength, tur: turi }, 200);
};

export const onRequestDelete: PagesFunction<Env> = async ctx => {
  const a = await actor(ctx); if (a instanceof Response) return a;
  if (!ctx.env.R2_CANONICAL) return json({ ok: false, code: 'R2_YOQ' }, 503);
  await r2Ochir(ctx.env.R2_CANONICAL, avatarKalit(a)).catch(() => null);
  return json({ ok: true }, 200);
};
