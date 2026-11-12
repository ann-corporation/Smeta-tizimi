/**
 * /api/bozor-rasm — e'lon fotosi.
 *  POST (sessiya kerak): multipart fayl (jpeg|png|webp, <= 2 MiB), operation_id (uuid) -> R2 (private) kalit bz/u<actor>/<operation_id>.<ext>; javob { ok, r2_kalit }.
 *  GET ?k=<kalit> (kirmasdan): faqat FAOL e'longa biriktirilgan kalit (t2_bz_ochiq_rasm_v1) bo'lsa R2 dan beriladi; boshqa fayl ochilmaydi.
 */
import { tekshir } from '../_shared/auth';
import { supabaseBaseUrl } from '../_shared/supabase-url';
import { operationIdYaroqli, rasmKalitiYaroqli, rasmPrefiks } from '../_shared/bozor';

type Env = { SESSIYA_KALIT: string; SUPABASE_URL: string; SUPABASE_KEY: string; R2_CANONICAL?: R2Bucket };
const NO_STORE = { 'Cache-Control': 'no-store' };
const json = (b: unknown, status = 200) => Response.json(b, { status, headers: NO_STORE });
const MAX = 2 * 1024 * 1024;
const TURLAR: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const sess = await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT);
  if (!sess) return json({ ok: false, code: 'AUTH_REQUIRED' }, 401);
  if (!ctx.env.R2_CANONICAL) return json({ ok: false, code: 'R2_YOQ' }, 503);
  let f: FormData;
  try { f = await ctx.request.formData(); } catch { return json({ ok: false, code: 'BODY_INVALID' }, 400); }
  const fayl = f.get('fayl') as unknown as { type: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> } | string | null;
  const op = f.get('operation_id');
  if (!fayl || typeof fayl === 'string' || typeof fayl.arrayBuffer !== 'function' || !operationIdYaroqli(op)) return json({ ok: false, code: 'FAYL_KERAK' }, 400);
  const kengaytma = TURLAR[fayl.type];
  if (!kengaytma) return json({ ok: false, code: 'TUR_NOTOGRI' }, 400);
  if (fayl.size <= 0 || fayl.size > MAX) return json({ ok: false, code: 'HAJM_NOTOGRI' }, 400);
  const kalit = `${rasmPrefiks(Number(sess.foydalanuvchi_id))}${op}.${kengaytma}`;
  await ctx.env.R2_CANONICAL.put(kalit, await fayl.arrayBuffer(), { httpMetadata: { contentType: fayl.type } });
  return json({ ok: true, r2_kalit: kalit });
};

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const k = new URL(ctx.request.url).searchParams.get('k');
  if (!rasmKalitiYaroqli(k) || !ctx.env.R2_CANONICAL) return new Response('Not found', { status: 404, headers: NO_STORE });
  try {
    const r = await fetch(supabaseBaseUrl(ctx.env.SUPABASE_URL) + '/rest/v1/rpc/t2_bz_ochiq_rasm_v1', {
      method: 'POST', headers: { apikey: ctx.env.SUPABASE_KEY, Authorization: 'Bearer ' + ctx.env.SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_kalit: k }),
    });
    if (!r.ok || (await r.json()) !== true) return new Response('Not found', { status: 404, headers: NO_STORE });
    const o = await ctx.env.R2_CANONICAL.get(k as string);
    if (!o) return new Response('Not found', { status: 404, headers: NO_STORE });
    return new Response(o.body, { headers: { 'Content-Type': o.httpMetadata?.contentType ?? 'image/jpeg', 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' } });
  } catch { return new Response('Error', { status: 500, headers: NO_STORE }); }
};
