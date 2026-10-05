/**
 * hujjat-ol.ts — FILE-TRUTH-001 CANONICAL DOCUMENT DOWNLOAD
 * ═══════════════════════════════════════════════════════════════════
 * UI -> Cloudflare -> authorization -> R2. Never Drive. If the Drive
 * replica is gone the document still downloads from R2.
 *
 *   GET /api/hujjat-ol?id=<document_id>     (session cookie)
 */
import { tekshir } from '../_shared/auth';
import { supabaseBaseUrl } from '../_shared/supabase-url';

type Env = { SUPABASE_URL: string; SUPABASE_KEY: string; SESSIYA_KALIT: string; R2_CANONICAL: R2Bucket };

async function rpc(env: Env, name: string, args: Record<string, unknown>) {
  const r = await fetch(supabaseBaseUrl(env.SUPABASE_URL) + '/rest/v1/rpc/' + name, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_KEY, Authorization: 'Bearer ' + env.SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const text = await r.text();
  let j: any = null;
  try { j = JSON.parse(text); } catch { /* keep raw */ }
  return { httpOk: r.ok, body: j, raw: text };
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  try {
    const sess = await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT);
    if (!sess) return Response.json({ ok: false, code: 'AUTH_REQUIRED' }, { status: 401 });
    const actorId = (sess as any).foydalanuvchi_id;
    if (actorId == null) return Response.json({ ok: false, code: 'AUTH_REQUIRED' }, { status: 401 });

    const id = Number(new URL(ctx.request.url).searchParams.get('id'));
    if (!id) return Response.json({ ok: false, code: 'DOCUMENT_CONTEXT_REQUIRED' }, { status: 400 });

    // Authorization + canonical row (RLS-equivalent check inside the RPC).
    let res = await rpc(ctx.env, 't2_document_canonical_get_v1', { p_actor_id: actorId, p_document_id: id });
    // T2-ZAKAZCHIK-TOMON-001: hujjat egasi bo'lmagan, lekin unga TAQDIM qilingan hujjatning qabul qiluvchisi (faol aloqa) —
    // faqat shu aniq hujjat. Egalik tekshiruvi o'zgarmaydi: avval canonical yo'l, u rad etsagina tomon yo'li.
    if ((!res.httpOk || !res.body || res.body.ok !== true) && (!res.body || !['DOCUMENT_NOT_FOUND', 'CANONICAL_BINARY_MISSING'].includes(res.body.code))) {
      const tomon = await rpc(ctx.env, 't2_tomon_hujjat_ol_v1', { p_actor_id: actorId, p_document_id: id });
      if (tomon.httpOk && tomon.body && tomon.body.ok === true) res = tomon;
    }
    if (!res.httpOk || !res.body || res.body.ok !== true) {
      const code = (res.body && res.body.code) || 'DOCUMENT_FORBIDDEN';
      const status = code === 'DOCUMENT_NOT_FOUND' ? 404 : code === 'CANONICAL_BINARY_MISSING' ? 502 : 403;
      return Response.json({ ok: false, code, xato: (res.body && res.body.message) || res.raw?.slice(0, 200) }, { status });
    }

    const row = res.body;
    const obj = await ctx.env.R2_CANONICAL.get(row.r2_key);
    if (!obj) {
      // Never fall back to Drive silently.
      return Response.json({ ok: false, code: 'CANONICAL_BINARY_MISSING', document_id: id, r2_key: row.r2_key }, { status: 502 });
    }

    const headers = new Headers();
    headers.set('Content-Type', row.mime_type || 'application/octet-stream');
    headers.set('Content-Disposition', 'attachment; filename*=UTF-8\'\'' + encodeURIComponent(row.original_filename || ('document-' + id)));
    if (row.size_bytes) headers.set('Content-Length', String(row.size_bytes));
    if (row.sha256) headers.set('X-Canonical-Sha256', row.sha256);
    headers.set('X-Canonical-Source', 'r2');
    headers.set('Cache-Control', 'private, max-age=60');
    return new Response(obj.body, { headers });
  } catch (err: any) {
    return Response.json({ ok: false, code: 'DOWNLOAD_FAILED', xato: String(err?.message || err) }, { status: 500 });
  }
};
