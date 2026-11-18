/**
 * POST /api/arxiv-tick - tungi sovuq-arxiv ishi (GitHub Actions .github/workflows/arxiv-tungi.yml, kuniga 3 jadval; Postgres R2 ga yoza olmaydi).
 *
 *  - Kirish FAQAT `X-Cron-Kalit` (BILDIRISHNOMA_CRON_KALIT, telegram-kunlik bilan bir xil sir); sozlanmagan 503, noto'g'ri 403.
 *  - Oyna: 17:00-05:59 UTC (Toshkent 22:00-10:59; GitHub cron 3-6 soatgacha kechikadi - eski 21-24 oynasi hech qachon tushmagan). Tashqarida { oyna:false }; body.majbur=true (cron kaliti bilan; workflow_dispatch ham shuni yuboradi) oynani chetlab o'tadi.
 *  - IO byudjeti: chaqiruvga <= 2 partiya/jadval, partiya <= 1000 qator, partiyalar orasida pauza; workflow `qoldi:true` bo'lsa davom etadi.
 *  - Har ish t2_arxiv_ish_jurnal ga yoziladi; xato yoki baza hajmi chegaradan oshsa - superadminga bildirishnoma (kuniga bir marta).
 *  - Javobda faqat sonlar/nomlar (qator mazmuni, sir yo'q).
 *  POST /api/arxiv-tick { amal:'tikla', jadval, r2_key, sha256 } - bitta arxiv partiyasini R2 dan bazaga qaytaradi (cron kaliti bilan).
 */
import { gunzipSync, gzipSync } from 'fflate';
import { cronKalitTekshir } from './bildirishnoma-yetkaz';
import { supabaseBaseUrl } from '../_shared/supabase-url';
import { jadvalArxivla, partiyaTikla, type ArxivDeps, type IshNatija } from '../_shared/arxiv';
import { qatorArxivRoyxati, siyosatOl } from '../_shared/arxiv-siyosat';
import { r2Bosh, r2Oqi, r2Yoz, sha256Hex } from '../_shared/r2-saqlash';
import { sovuqKalit } from '../../src/lib/snapshot-r2/sovuq';
import { jarvisArchiveBatch, jarvisArchivePurge } from '../_shared/jarvis-conversation-archive';

type Env = { SUPABASE_URL: string; SUPABASE_KEY: string; R2_CANONICAL?: R2Bucket; BILDIRISHNOMA_CRON_KALIT?: string; DB_LIMIT_MB?: string; ARXIV_OGOH_MB?: string; JARVIS_ARCHIVE_YOQILGAN?: string };
const javob = (d: unknown, status = 200) => Response.json(d, { status, headers: { 'Cache-Control': 'no-store' } });
const MB = 1024 * 1024;
export const OYNA_BOSH_SOAT = 17; // UTC, [17, 24) + [0, 6): tungi/past yuk (Toshkent 22:00-11:00)
export const OYNA_OXIR_SOAT = 6;
export const oynadaMi = (d: Date) => d.getUTCHours() >= OYNA_BOSH_SOAT || d.getUTCHours() < OYNA_OXIR_SOAT;
const SNAP_SAQLASH_KUN = 30;
/** Bitta chaqiruvdagi qator va snapshot soni (Cloudflare CPU limiti). */
export const ARXIV_PARTIYA_LIMIT = 250;
export const SNAP_CHAQIRUV_LIMIT = 2;
/** Baza hajmi ogohlantirish chegarasi (MB; Supabase Free 500). 380: arxiv/VACUUM FULL uchun vaqtincha joy zaxirasi qolsin. */
export const ARXIV_OGOH_STANDART_MB = 380;

export function depsYarat(env: Env, fetchFn: typeof fetch = fetch): ArxivDeps {
  const baza = supabaseBaseUrl(env.SUPABASE_URL) + '/rest/v1/rpc/';
  const sarlavha = { apikey: env.SUPABASE_KEY, Authorization: 'Bearer ' + env.SUPABASE_KEY, 'Content-Type': 'application/json' };
  const b = env.R2_CANONICAL as R2Bucket;
  return {
    async rpc(nom, args) {
      const r = await fetchFn(baza + nom, { method: 'POST', headers: sarlavha, body: JSON.stringify(args) });
      if (!r.ok) throw new Error('RPC_' + nom + '_' + r.status);
      return r.json();
    },
    r2: {
      put: async (k, bayt) => { await r2Yoz(b, k, bayt, { httpMetadata: { contentType: 'application/gzip' } }); },
      get: async (k) => { const o = await r2Oqi(b, k); return o ? new Uint8Array(await o.arrayBuffer()) : null; },
      boshHajm: async (k) => (await r2Bosh(b, k))?.size ?? null,
    },
    kut: (ms) => new Promise((ok) => setTimeout(ok, ms)),
  };
}

/** snapshot.bolak_mazmun sovuq mazmunini R2 ga (mavjud snapshot.sovuq_* oqimi; DB o'zi sha256 ni qayta tekshiradi). */
export async function snapshotSovut(d: ArxivDeps, limit = 10): Promise<IshNatija> {
  const n: IshNatija = { jadval: 'snapshot.bolak_mazmun', partiya: 0, qator: 0, bayt: 0, xato: null, qoldi: false };
  const nomzod = await d.rpc('t2_arxiv_snap_nomzod_v1', { p_kun: SNAP_SAQLASH_KUN, p_limit: limit });
  if (!Array.isArray(nomzod)) { n.xato = 'SNAP_NOMZOD_XATO'; return n; }
  const enc = new TextEncoder();
  for (const c of nomzod as Array<{ xesh: string }>) {
    try {
      const o = await d.rpc('t2_arxiv_snap_oqi_v1', { p_xesh: c.xesh });
      const matn = o?.matn;
      if (typeof matn !== 'string') continue;
      const sha = await sha256Hex(enc.encode(matn));
      const kalit = sovuqKalit(sha);
      const gz = gzipSync(enc.encode(matn), { level: 9 });
      await d.r2.put(kalit, gz);
      if ((await d.r2.boshHajm(kalit)) !== gz.length) { n.xato = 'R2_HEAD_HAJM_MOS_EMAS'; return n; }
      const q = await d.r2.get(kalit);
      if (!q) { n.xato = 'R2_QAYTA_OQILMADI'; return n; }
      if ((await sha256Hex(gunzipSync(q))) !== sha) { n.xato = 'R2_SHA256_MOS_EMAS'; return n; }
      const j = await d.rpc('t2_arxiv_snap_sovut_v1', { p_xesh: c.xesh, p_r2_key: kalit, p_sha256: sha, p_r2_bayt: gz.length });
      if (j?.ok !== true) { n.xato = 'SNAP_SOVUT_' + String(j?.code ?? 'XATO'); return n; }
      n.partiya++; n.qator++; n.bayt += gz.length;
    } catch (e) { n.xato = 'SNAP_' + (e instanceof Error ? e.message.slice(0, 60) : 'XATO'); return n; }
  }
  n.qoldi = nomzod.length >= limit;
  return n;
}

export async function arxivTickIsh(d: ArxivDeps, env: Pick<Env, 'DB_LIMIT_MB' | 'ARXIV_OGOH_MB' | 'R2_CANONICAL' | 'JARVIS_ARCHIVE_YOQILGAN'>, hozir: Date, o: { majbur?: boolean; pauzaMs?: number } = {}) {
  if (!o.majbur && !oynadaMi(hozir)) return { ok: true, oyna: false, ishlar: [] as IshNatija[], qoldi: false };
  const ishlar: IshNatija[] = [];
  const xatolar: string[] = [];
  // CPU byudjeti (Cloudflare 1102, 2026-11-18): bitta chaqiruvda faqat BITTA kichik partiya; workflow qoldi:true bo'lsa qayta chaqiradi.
  let ishBor = false;
  for (const s of qatorArxivRoyxati()) {
    const n = await jadvalArxivla(d, s, { maxPartiya: 1, pauzaMs: o.pauzaMs ?? 1500, limit: ARXIV_PARTIYA_LIMIT });
    ishlar.push(n);
    if (n.partiya > 0 || n.xato) { ishBor = true; if (n.partiya > 0) n.qoldi = true; break; }
  }
  if (!ishBor) ishlar.push(await snapshotSovut(d, SNAP_CHAQIRUV_LIMIT).catch((e): IshNatija => ({ jadval: 'snapshot.bolak_mazmun', partiya: 0, qator: 0, bayt: 0, xato: 'SNAP_' + String(e?.message ?? '').slice(0, 40), qoldi: false })));
  // Jarvis arxivi ham CPU byudjetiga bo'ysunadi: ish bor chaqiruvda ishga tushmaydi.
  if (!ishBor && env.JARVIS_ARCHIVE_YOQILGAN === '1' && env.R2_CANONICAL) {
    ishlar.push(await jarvisArchivePurge(d, env.R2_CANONICAL));
    ishlar.push(await jarvisArchiveBatch(d, env.R2_CANONICAL));
  }
  for (const n of ishlar) {
    await d.rpc('t2_arxiv_jurnal_yoz_v1', { p_jadval: n.jadval, p_rejim: n.jadval.startsWith('snapshot.') ? 'snapshot-sovuq' : 'qator-arxiv', p_qator: n.qator, p_r2_bayt: n.bayt, p_xato: n.xato }).catch(() => null);
    if (n.xato) xatolar.push(`${n.jadval}:${n.xato}`);
  }
  let hajmMb: number | null = null;
  try {
    const h = await d.rpc('t2_arxiv_holat_v1', {});
    hajmMb = Math.round(Number(h?.db_bytes) / MB);
    const chegara = Number(env.ARXIV_OGOH_MB) > 0 ? Number(env.ARXIV_OGOH_MB) : ARXIV_OGOH_STANDART_MB;
    if (Number.isFinite(hajmMb) && hajmMb > chegara) await d.rpc('t2_arxiv_ogohlantir_v1', { p_sabab: 'hajm', p_tafsilot: { db_mb: hajmMb, chegara_mb: chegara } });
  } catch { /* monitoring arxivni to'xtatmaydi */ }
  if (xatolar.length) await d.rpc('t2_arxiv_ogohlantir_v1', { p_sabab: 'xato', p_tafsilot: { soni: xatolar.length, birinchi: xatolar[0].slice(0, 120) } }).catch(() => null);
  return { ok: xatolar.length === 0, oyna: true, ishlar, xatolar: xatolar.length, db_mb: hajmMb, qoldi: ishlar.some((x) => x.qoldi) };
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const env = ctx.env;
  const k = cronKalitTekshir(ctx.request, env.BILDIRISHNOMA_CRON_KALIT);
  if (k === 'sozlanmagan') return javob({ ok: false, code: 'SOZLANMAGAN' }, 503);
  if (k === 'rad') return javob({ ok: false, code: 'RAD' }, 403);
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY || !env.R2_CANONICAL) return javob({ ok: false, code: 'SERVER_SOZLANMAGAN' }, 503);
  let b: { amal?: unknown; majbur?: unknown; jadval?: unknown; r2_key?: unknown; sha256?: unknown } = {};
  try { b = await ctx.request.json(); } catch { b = {}; }
  const d = depsYarat(env);
  if (b.amal === 'tikla') {
    const s = typeof b.jadval === 'string' ? siyosatOl(b.jadval) : undefined;
    if (!s || s.rejim !== 'qator-arxiv' || typeof b.r2_key !== 'string' || !/^arxiv\/[a-z0-9_]+\//.test(b.r2_key) || typeof b.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(b.sha256)) return javob({ ok: false, code: 'SOROV_NOTOGRI' }, 400);
    return javob(await partiyaTikla(d, s.jadval, b.r2_key, b.sha256));
  }
  try {
    return javob(await arxivTickIsh(d, env, new Date(), { majbur: b.majbur === true }));
  } catch {
    await d.rpc('t2_arxiv_ogohlantir_v1', { p_sabab: 'xato', p_tafsilot: { kod: 'TICK_ISTISNO' } }).catch(() => null);
    return javob({ ok: false, code: 'ISH_XATO' }, 500);
  }
};
