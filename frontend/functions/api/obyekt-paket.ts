/**
 * obyekt-paket.ts — OBYEKT PAKETI SHLYUZI (ADR docs/architecture/OBYEKT_PAKET_OFFLINE_DESKTOP_V1.md §1.4, PR1)
 *
 *   GET /api/obyekt-paket?obyekt_id=N&rev_faqat=1   → probe {rev, meta_rev, toliq_rev, min_rev}
 *   GET /api/obyekt-paket?obyekt_id=N               → butun paket (ustunli JSON, t2_obyekt_paket_v1)
 *   GET /api/obyekt-paket?obyekt_id=N&dan_rev=R     → delta (PR3; hozircha 501)
 *
 * Qoidalar:
 *   - Auth/tenant `sb.ts` bilan bir xil: tekshir → roleAuthority → otaKompaniyasi (a'zolik). `p_actor_id` doim sessiyadan.
 *   - Paket kompaniya bo'yicha bir xil (R2 kesh umumiy) — shuning uchun smeta.read + f2.read + narx.read hammasi shart.
 *   - Function ichida JSON PARSE YO'Q (free tarif 10 ms CPU): yuqori oqim tanasi to'g'ridan-to'g'ri uzatiladi.
 *     Faqat birinchi bo'lakdan rev/meta_rev o'qiladi (paket ular bilan boshlanadi).
 *   - ETag `"rev.meta_rev"`; If-None-Match mos bo'lsa 304 (bazaga paket so'rovi ketmaydi).
 *   - R2_KESH (ixtiyoriy binding): `paket/{kompaniya}/{obyekt}/{rev}.{meta_rev}.json.gz`. Binding yo'q — keshsiz ishlaydi.
 */
import { cachedAuthority } from '../_shared/permission-policy';
import { tekshir } from '../_shared/auth';
import { supabaseBaseUrl } from '../_shared/supabase-url';
import { xavfsizUpstream } from '../_shared/xato';
import { azoKompaniyalar } from '../_shared/tenant-oqish';
import { roleAuthority, sessiyaYaroqsizmi, yaroqsizSessiyaJavob } from '../_shared/role-authority';
import { otaKompaniyasi } from '../_shared/ota-kompaniya';

type Env = { SUPABASE_URL: string; SUPABASE_KEY: string; SESSIYA_KALIT: string; R2_KESH?: R2Bucket };

/** Paket uchun kerakli ruxsatlar (kompaniyada hammasi bo'lishi shart). */
export const PAKET_RUXSATLARI = ['smeta.read', 'f2.read', 'narx.read'] as const;

const xato = (status: number, code: string, error: string) => Response.json({ ok: false, code, error }, { status });

/** Paket/probe boshidan rev va meta_rev (JSON parse qilmasdan). */
export function revOqi(bosh: string): { rev: number; meta_rev: number } | null {
  const m = /"rev"\s*:\s*(\d+)\s*,\s*"meta_rev"\s*:\s*(\d+)/.exec(bosh);
  return m ? { rev: Number(m[1]), meta_rev: Number(m[2]) } : null;
}

export const etagYasa = (rev: number, metaRev: number) => `"${rev}.${metaRev}"`;

/** If-None-Match da shu ETag bormi (W/ prefiksi va ro'yxat qo'llab-quvvatlanadi). */
export function etagMos(sarlavha: string | null, etag: string): boolean {
  if (!sarlavha) return false;
  return sarlavha.split(',').some((x) => x.trim().replace(/^W\//, '') === etag || x.trim() === '*');
}

export const keshKaliti = (kompaniyaId: number, obyektId: number, rev: number, metaRev: number) =>
  `paket/${kompaniyaId}/${obyektId}/${rev}.${metaRev}.json.gz`;

/** Oqimni birinchi bo'lakni o'qib (rev uchun) qayta yig'adi — qolgani tegilmasdan uzatiladi. */
async function boshiBilan(body: ReadableStream<Uint8Array>): Promise<{ bosh: string; oqim: ReadableStream<Uint8Array> }> {
  const reader = body.getReader();
  const birinchi = await reader.read();
  const bolak = birinchi.value;
  const bosh = bolak ? new TextDecoder().decode(bolak.subarray(0, 512)) : '';
  const oqim = new ReadableStream<Uint8Array>({
    start(c) { if (bolak) c.enqueue(bolak); if (birinchi.done) c.close(); },
    async pull(c) { const r = await reader.read(); if (r.done) c.close(); else c.enqueue(r.value); },
    cancel(sabab) { return reader.cancel(sabab); },
  });
  return { bosh, oqim };
}

/** Gzip qilib R2 ga yozadi (fonda). R2.put uzunligi noma'lum oqimni qabul qilmaydi — bufer orqali. */
async function r2gaYoz(r2: R2Bucket, kalit: string, oqim: ReadableStream<Uint8Array>): Promise<void> {
  try {
    const gz = oqim.pipeThrough(new CompressionStream('gzip'));
    const bayt = await new Response(gz).arrayBuffer();
    await r2.put(kalit, bayt, { httpMetadata: { contentType: 'application/json', contentEncoding: 'gzip' } });
  } catch (e) {
    console.warn(JSON.stringify({ hodisa: 'obyekt_paket_r2_yozilmadi', kalit, xato: e instanceof Error ? e.message : String(e) }));
  }
}

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
    if (sess.permissionsByCompany && sess.rol !== 'superadmin') {
      const bor = sess.permissionsByCompany[kid] ?? [];
      if (!PAKET_RUXSATLARI.every((p) => bor.includes(p))) return xato(403, 'PERMISSION_DENIED', 'Obyekt paketi uchun ruxsat yetarli emas');
    }

    if (url.searchParams.has('dan_rev')) return xato(501, 'DELTA_HALI_YOQ', 'Delta (PR3) hali yoqilmagan — to\'liq paket oling');

    const rpc = (nom: string) => fetch(
      supabaseBaseUrl(env.SUPABASE_URL) + '/rest/v1/rpc/' + nom + '?p_obyekt_id=' + obyektId + '&p_actor_id=' + sess!.foydalanuvchi_id,
      { headers: { apikey: env.SUPABASE_KEY, Authorization: 'Bearer ' + env.SUPABASE_KEY, Accept: 'application/json' } });

    // Probe — kichik, har doim.
    const pr = await rpc('t2_obyekt_rev_v1');
    if (!pr.ok) return xavfsizUpstream(pr.status, await pr.text(), upstreamHolat(pr.status));
    const probeMatn = await pr.text();
    const rv = revOqi(probeMatn);
    if (!rv) return xavfsizUpstream(502, 'PROBE_SHAKLI');
    const etag = etagYasa(rv.rev, rv.meta_rev);
    const sarlavha = { ETag: etag, 'Cache-Control': 'private, no-cache', 'Content-Type': 'application/json; charset=utf-8' };

    if (url.searchParams.get('rev_faqat') === '1') return new Response(probeMatn, { headers: sarlavha });
    if (etagMos(ctx.request.headers.get('If-None-Match'), etag)) return new Response(null, { status: 304, headers: { ETag: etag, 'Cache-Control': 'private, no-cache' } });

    const r2 = env.R2_KESH;
    const kalit = keshKaliti(kid, obyektId, rv.rev, rv.meta_rev);
    if (r2) {
      try {
        const obj = await r2.get(kalit);
        if (obj) {
          return new Response(obj.body, { headers: { ...sarlavha, 'Content-Encoding': 'gzip', 'X-Paket-Kesh': 'r2' }, encodeBody: 'manual' } as ResponseInit);
        }
      } catch { /* kesh ixtiyoriy — bazadan */ }
    }

    const up = await rpc('t2_obyekt_paket_v1');
    if (!up.ok || !up.body) return xavfsizUpstream(up.status, await up.text().catch(() => ''), upstreamHolat(up.status));
    const { bosh, oqim } = await boshiBilan(up.body);
    const tanadagi = revOqi(bosh);
    // Probe va paket orasida yozuv bo'lgan bo'lsa — ETag paketning o'z rev idan; keshga faqat mos bo'lsa yoziladi.
    const mos = !!tanadagi && tanadagi.rev === rv.rev && tanadagi.meta_rev === rv.meta_rev;
    const h: Record<string, string> = { ...sarlavha, 'X-Paket-Kesh': 'miss' };
    if (tanadagi) h.ETag = etagYasa(tanadagi.rev, tanadagi.meta_rev); else delete h.ETag;
    if (r2 && mos && typeof CompressionStream === 'function') {
      const [mijozga, keshga] = oqim.tee();
      ctx.waitUntil(r2gaYoz(r2, kalit, keshga));
      return new Response(mijozga, { headers: h });
    }
    return new Response(oqim, { headers: h });
  } catch (err: unknown) {
    return xavfsizUpstream(502, err);
  }
};
