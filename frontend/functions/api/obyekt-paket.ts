/**
 * obyekt-paket.ts — OBYEKT PAKETI SHLYUZI (ADR docs/architecture/OBYEKT_PAKET_OFFLINE_DESKTOP_V1.md §1.4, PR1a)
 *
 *   GET /api/obyekt-paket?obyekt_id=N   → butun paket (ustunli JSON, t2_obyekt_paket_v1)
 *
 * PR1a — XAVFSIZ MINIMUM: reviziya/ETag/304 va R2 kesh YO'Q (PR1b — kompozit muhr ETag, PR1c — R2, PR3 — delta).
 * Qoidalar:
 *   - Auth/tenant `sb.ts` bilan bir xil: tekshir → roleAuthority → otaKompaniyasi (a'zolik). `p_actor_id` doim sessiyadan.
 *   - Paket smeta + F2 ro'yxati + nakrutkani birga beradi — smeta.read + f2.read + narx.read hammasi shart.
 *     Ruxsat xaritasi (permissionsByCompany) yo'q bo'lsa — YOPIQ (503), superadmin bundan mustasno.
 *   - Function ichida JSON PARSE YO'Q (free tarif 10 ms CPU): yuqori oqim tanasi to'g'ridan-to'g'ri uzatiladi.
 *   - `Cache-Control: no-store` — moliyaviy ma'lumot hech qayerda keshlanmaydi.
 */
import { cachedAuthority } from '../_shared/permission-policy';
import { tekshir } from '../_shared/auth';
import { supabaseBaseUrl } from '../_shared/supabase-url';
import { xavfsizUpstream } from '../_shared/xato';
import { azoKompaniyalar } from '../_shared/tenant-oqish';
import { roleAuthority, sessiyaYaroqsizmi, yaroqsizSessiyaJavob } from '../_shared/role-authority';
import { otaKompaniyasi } from '../_shared/ota-kompaniya';

type Env = { SUPABASE_URL: string; SUPABASE_KEY: string; SESSIYA_KALIT: string };

/** Paket uchun kerakli ruxsatlar (obyekt kompaniyasida hammasi bo'lishi shart). */
export const PAKET_RUXSATLARI = ['smeta.read', 'f2.read', 'narx.read'] as const;

const NO_STORE = { 'Cache-Control': 'no-store' };
const xato = (status: number, code: string, error: string) => Response.json({ ok: false, code, error }, { status, headers: NO_STORE });
const upstreamHolat = (s: number) => (s === 403 || s === 401 ? 403 : s === 404 ? 404 : s === 400 ? 400 : 502);

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  try {
    const env = ctx.env;
    let sess = cachedAuthority(ctx) ?? await tekshir(ctx.request.headers.get('Cookie'), env.SESSIYA_KALIT);
    if (!sess) return xato(401, 'AUTH_REQUIRED', 'Кириш талаб қилинади');
    if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return xato(503, 'SOZLANMAGAN', 'Supabase sozlanmagan');
    const tekshirilgan = sess;
    sess = cachedAuthority(ctx) ?? await roleAuthority(sess, env);
    if (!sess && sessiyaYaroqsizmi(tekshirilgan)) return yaroqsizSessiyaJavob();
    if (!sess) return xato(503, 'AUTHORITY_UNAVAILABLE', 'Joriy ruxsatlarni tekshirib bo‘lmadi. Qayta urinib ko‘ring.');
    if (!Number.isInteger(sess.foydalanuvchi_id) || (sess.foydalanuvchi_id as number) <= 0) return xato(401, 'AUTH_REQUIRED', 'Sessiyada foydalanuvchi yo\'q');
    if (!Array.isArray(sess.kompaniyalar)) return xato(401, 'SESSION_STALE', 'Sessiyani yangilang — chiqib, qaytadan kiring.');

    const url = new URL(ctx.request.url);
    const obyektId = Number(url.searchParams.get('obyekt_id'));
    if (!Number.isSafeInteger(obyektId) || obyektId <= 0) return xato(400, 'OBYEKT_ID', 'obyekt_id noto\'g\'ri');

    // Tenant: obyekt kompaniyasi a'zolikda (sb.ts bilan bir xil) + paketning barcha ruxsatlari shu kompaniyada.
    let kid: number | null;
    try { kid = await otaKompaniyasi(env, 't2_obyekt', obyektId); }
    catch { return xato(502, 'TENANT_CHECK_FAILED', 'Obyekt tegishliligini tekshirib bo\'lmadi'); }
    if (kid == null || !azoKompaniyalar(sess).includes(kid)) return xato(403, 'TENANT_FORBIDDEN', 'Bu obyektga ruxsat yo\'q');
    if (sess.rol !== 'superadmin') {
      // L2: ruxsat xaritasi yo'q (eski DB javobi) — yopiq; taxmin bilan ochilmaydi.
      if (!sess.permissionsByCompany) return xato(503, 'AUTHORITY_SCHEMA_REQUIRED', 'Ruxsatlar xaritasi yo‘q — keyinroq urinib ko‘ring.');
      const bor = sess.permissionsByCompany[kid] ?? [];
      if (!PAKET_RUXSATLARI.every((p) => bor.includes(p))) return xato(403, 'PERMISSION_DENIED', 'Obyekt paketi uchun ruxsat yetarli emas');
    }

    const up = await fetch(
      supabaseBaseUrl(env.SUPABASE_URL) + '/rest/v1/rpc/t2_obyekt_paket_v1?p_obyekt_id=' + obyektId + '&p_actor_id=' + sess.foydalanuvchi_id,
      { headers: { apikey: env.SUPABASE_KEY, Authorization: 'Bearer ' + env.SUPABASE_KEY, Accept: 'application/json' } });
    if (!up.ok || !up.body) return xavfsizUpstream(up.status, await up.text().catch(() => ''), upstreamHolat(up.status));
    return new Response(up.body, { headers: { ...NO_STORE, 'Content-Type': 'application/json; charset=utf-8' } });
  } catch (err: unknown) {
    return xavfsizUpstream(502, err);
  }
};
