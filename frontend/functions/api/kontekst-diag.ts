/**
 * VAQTINCHALIK diagnostika — T2-COMPANY-CONTEXT-P0-FIX-001 owner smoke FAIL.
 * ═══════════════════════════════════════════════════════════════════════
 * "Kompaniya ma'lumotini o'qib bo'lmadi" — `/api/company?me=1` pipeline
 * qayerda uzilayotganini AUTHENTICATED sessiyada aniqlaydi. HECH QANDAY
 * secret qiymatini (SUPABASE_URL/KEY/SESSIYA_KALIT) chiqarmaydi — faqat
 * boolean/kategoriya/status. Tekshirilgach OLIB TASHLANADI (Section 6).
 *
 * Foydalanish: brauzerda login qiling, so'ng /api/kontekst-diag ga o'ting.
 */
import { tekshir } from '../_shared/auth';
import { supabaseBaseUrl } from '../_shared/supabase-url';
import { superadminActor } from '../_shared/superadmin';

type Env = { SUPABASE_URL?: string; SUPABASE_KEY?: string; SESSIYA_KALIT: string };

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  /* Egasi 2026-10-27: texnik diagnostika (server sozlamalari holati) — faqat platforma superadmini (bazada qayta tekshiriladi). */
  const sa = await superadminActor(ctx.request, { SESSIYA_KALIT: ctx.env.SESSIYA_KALIT, SUPABASE_URL: ctx.env.SUPABASE_URL ?? '', SUPABASE_KEY: ctx.env.SUPABASE_KEY ?? '' });
  if ('code' in sa) return Response.json({ ok: false, code: sa.code }, { status: sa.status });
  const out: Record<string, unknown> = {
    supabase_url_set: !!ctx.env.SUPABASE_URL,
    supabase_key_set: !!ctx.env.SUPABASE_KEY,
    sessiya_kalit_set: !!ctx.env.SESSIYA_KALIT,
    supabase_url_has_rest_v1_suffix:
      !!ctx.env.SUPABASE_URL && /\/rest\/v1\/?$/i.test(ctx.env.SUPABASE_URL),
  };

  // ── 1. SESSIYA ──
  let sess: any = null;
  try {
    sess = await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT);
  } catch (e) {
    out.sessiya_tekshir_xato = e instanceof Error ? e.message : String(e);
  }
  if (!sess) {
    out.sessiya = 'YO_Q (401) — brauzerda login qilib, keyin shu manzilga keling';
    return Response.json(out);
  }
  out.sessiya = {
    rol: sess.rol ?? null,
    foydalanuvchi_id_bor: sess.foydalanuvchi_id != null,
    foydalanuvchi_id_qiymati: typeof sess.foydalanuvchi_id === 'number' ? sess.foydalanuvchi_id : null,
    kompaniyalar_bor: Array.isArray(sess.kompaniyalar),
    kompaniyalar_soni: Array.isArray(sess.kompaniyalar) ? sess.kompaniyalar.length : null,
    exp: sess.exp ?? null,
  };

  // ── 2. actor ID yo'q bo'lsa — SPLIT-BRAIN auth (login GAS-OK, Supabase actor FAIL) ──
  if (sess.foydalanuvchi_id == null) {
    out.tashxis = 'SPLIT_BRAIN_AUTH — sessiyada foydalanuvchi_id YO\'Q. Login vaqtida '
      + 't2_kirish_royxatga_ol muvaffaqiyatsiz bo\'lgan yoki eski sessiya. '
      + '/api/company?me=1 (foydalanuvchi_id majburiy) shu sabab 401 beradi.';
    return Response.json(out);
  }

  // ── 3. t2_men_v1 ni AYNAN /api/company kabi chaqiramiz (xavfsiz: STABLE, yozmaydi) ──
  if (!ctx.env.SUPABASE_URL || !ctx.env.SUPABASE_KEY) {
    out.men_probe = 'CONFIG_MISSING';
    return Response.json(out);
  }
  try {
    const url = supabaseBaseUrl(ctx.env.SUPABASE_URL) + '/rest/v1/rpc/t2_men_v1';
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: ctx.env.SUPABASE_KEY,
        Authorization: 'Bearer ' + ctx.env.SUPABASE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_actor_id: sess.foydalanuvchi_id }),
    });
    out.men_probe_http_status = r.status;
    const body = await r.text();
    try {
      const j: any = JSON.parse(body);
      out.men_probe_ok = j && j.ok === true;
      out.men_probe_code = j && typeof j === 'object' && 'code' in j ? j.code : null;
      out.men_probe_pgrst_code = j && typeof j === 'object' && 'code' in j && String(j.code).startsWith('PGRST') ? j.code : null;
      out.men_probe_azoliklar_soni = j && j.ok === true && Array.isArray(j.azoliklar) ? j.azoliklar.length : null;
      out.men_probe_category = r.ok && j && j.ok === true ? 'MEN_OK'
        : r.ok ? 'MEN_RETURNED_NOT_OK'
        : 'MEN_HTTP_ERROR';
      // t2_men_v1 faqat service_role ga grant qilingan. anon/publishable kalit
      // -> 401/403/PGRST301 -> butun kanonik /api/* buziladi.
      if (r.status === 401 || r.status === 403 || (out.men_probe_code && /PGRST(301|302|000)/.test(String(out.men_probe_code)))) {
        out.tashxis = 'SUPABASE_KEY_ANON — Cloudflare Pages env dagi SUPABASE_KEY '
          + 'service_role kaliti EMAS (anon/publishable). t2_men_v1 va boshqa '
          + 'kanonik RPC lar faqat service_role ga ochiq. Cloudflare Pages -> '
          + 'Settings -> Environment variables -> SUPABASE_KEY ni service_role '
          + 'kalitiga o\'zgartiring (Production VA Preview), keyin qayta deploy.';
      }
    } catch {
      out.men_probe_category = 'MEN_INVALID_JSON';
      out.men_probe_body_head = body.slice(0, 200);
    }
  } catch (err) {
    out.men_probe_category = 'MEN_TRANSPORT_ERROR';
    out.men_probe_transport_error = err instanceof Error ? err.message : String(err);
  }

  return Response.json(out);
};
