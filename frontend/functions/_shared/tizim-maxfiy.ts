/**
 * tizim-maxfiy.ts — TIZIMGA OID MA'LUMOT faqat platforma superadminiga (egasi 2026-10-27: «tizim uchun taaluqli hamma narsalar
 * superadmindan boshqada umuman chiqmasligi shart»). Server qatlami — UI yashirishga tayanilmaydi.
 *
 * Kim superadmin: middleware (`api/_middleware.ts`) bazadan (t2_men_v1.platform_role) olgan YANGI vakolat — cookie roli EMAS.
 * Vakolat yo'q bo'lsa (middleware ishlamagan) — superadmin EMAS deb hisoblanadi (fail-closed).
 *
 * Bu yerda yashiriladi:
 *   • token tannarxi, foyda foizi, platforma ustamasi (token_holat_v1, token_sarfla_v1 javoblari);
 *   • AI provayder/model nomi, model manbasi, provayder sarfi (usage, USD) — AI javoblari va AI jurnali;
 *   • tizim boshqaruv markazi (sog'liq, integratsiya, fon ishlari, imkoniyat bayroqlari) — kompaniyaga faqat o'z audit jurnali.
 */
import { cachedAuthority } from './permission-policy';

/** Platforma superadmini (bazadan olingan vakolat bo'yicha). */
export function platformaSuperadminmi(ctx: { data?: unknown }): boolean {
  return cachedAuthority(ctx)?.rol === 'superadmin';
}

const yaxlit2 = (x: number) => Math.round(x * 100) / 100;
const son = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);

/** Sarf hisobidan (NarxTafsilot) tannarx va foyda olib tashlanadi — mijozga faqat hajm va yakuniy narx qoladi. */
export function tokenHisobTozala(h: unknown): unknown {
  if (!h || typeof h !== 'object' || Array.isArray(h)) return h;
  const x = h as Record<string, unknown>;
  const qoldir = ['amal', 'nom', 'birlik_soni', 'birlik', 'qism', 'yakuniy_som', 'token_som', 'token'];
  return Object.fromEntries(qoldir.filter((k) => k in x).map((k) => [k, x[k]]));
}

/**
 * `t2_token_holat_v1` natijasi — superadmin bo'lmaganga:
 *   • narxlar: tannarx (asos_som, birlik_som) foyda bilan birlashtirilib MIJOZ narxi sifatida beriladi; foyda_foiz = 0;
 *     eski v1 maydonlari (narx, minimum) olib tashlanadi. Shunda `narxHisob` oldindan ko'rsatishi yakuniy narxni beradi,
 *     lekin tannarx ham, foyda foizi ham javobda yo'q.
 *   • sozlama: foyda_foiz = 0, usd_kurs olib tashlanadi (AI tannarxi uchun ichki kurs).
 *   • harakatlar[].meta.hisob: tokenHisobTozala.
 */
export function tokenHolatTozala(natija: unknown): unknown {
  if (!natija || typeof natija !== 'object' || Array.isArray(natija)) return natija;
  const n = natija as Record<string, unknown>;
  const sozlama = (n.sozlama && typeof n.sozlama === 'object' ? n.sozlama : {}) as Record<string, unknown>;
  const umumiyFoyda = son(sozlama.foyda_foiz);
  const narxlar = Array.isArray(n.narxlar) ? n.narxlar.map((x) => {
    if (!x || typeof x !== 'object') return x;
    const { narx: _n, minimum: _m, foyda_foiz, asos_som, birlik_som, ...qolgan } = x as Record<string, unknown>;
    const k = 1 + (foyda_foiz == null ? umumiyFoyda : son(foyda_foiz)) / 100;
    return { ...qolgan, asos_som: yaxlit2(son(asos_som) * k), birlik_som: yaxlit2(son(birlik_som) * k), foyda_foiz: 0 };
  }) : n.narxlar;
  const { usd_kurs: _u, ...sozQolgan } = sozlama;
  const harakatlar = Array.isArray(n.harakatlar) ? n.harakatlar.map((x) => {
    if (!x || typeof x !== 'object') return x;
    const r = x as Record<string, unknown>;
    const meta = r.meta && typeof r.meta === 'object' && !Array.isArray(r.meta) ? r.meta as Record<string, unknown> : null;
    return meta && 'hisob' in meta ? { ...r, meta: { ...meta, hisob: tokenHisobTozala(meta.hisob) } } : r;
  }) : n.harakatlar;
  return { ...n, narxlar, sozlama: n.sozlama ? { ...sozQolgan, foyda_foiz: 0 } : n.sozlama, harakatlar, superadmin: false };
}

/** Javobdagi `hisob` maydoni (token_sarfla_v1) tozalanadi. */
export function tokenJavobTozala(j: unknown): unknown {
  if (!j || typeof j !== 'object' || Array.isArray(j)) return j;
  const r = j as Record<string, unknown>;
  return 'hisob' in r ? { ...r, hisob: tokenHisobTozala(r.hisob) } : r;
}

/** Jonli qadam matnidagi model nomi (agent-ish kasbQuvur: «Model: X — …», «Javob olindi (X): …») olib tashlanadi. */
export function qadamMatnTozala(matn: unknown): unknown {
  if (typeof matn !== 'string') return matn;
  return matn.replace(/^Model: .*? — /, 'Model tanlandi — ').replace(/^Javob olindi \([^)]*\):/, 'Javob olindi:');
}
const qadamTozala = (q: unknown) => (q && typeof q === 'object' && !Array.isArray(q) && 'matn' in q
  ? { ...(q as Record<string, unknown>), matn: qadamMatnTozala((q as Record<string, unknown>).matn) } : q);

/** AI javobi: provayder, model manbasi va provayder sarfi (usage — USD narx bilan) olib tashlanadi; model nomi
 *  «ai» ga almashtiriladi ('local' — mahalliy javob — qoladi, UI token sarfi yo'qligini shundan biladi). */
export function aiJavobTozala(j: unknown): unknown {
  if (!j || typeof j !== 'object' || Array.isArray(j)) return j;
  const { provider: _p, usage: _u, model_manba: _mm, ...r } = j as Record<string, unknown>;
  if ('model' in r && r.model != null && r.model !== 'local') r.model = 'ai';
  if (r.t === 'qadam' && 'matn' in r) r.matn = qadamMatnTozala(r.matn);
  if (Array.isArray(r.qadamlar)) r.qadamlar = r.qadamlar.map(qadamTozala);
  if (Array.isArray(r.natija)) r.natija = r.natija.map((x) => (x && typeof x === 'object' && !Array.isArray(x) ? aiJavobTozala(x) : x));
  return r;
}

/** Tizim boshqaruv markazi (t2_system_control_v1) — kompaniyaga faqat O'Z audit jurnali (biznes amallari). */
export function tizimNazoratTozala(j: unknown): unknown {
  if (!j || typeof j !== 'object' || Array.isArray(j)) return j;
  const r = j as Record<string, unknown>;
  return { ok: r.ok, auditEvents: Array.isArray(r.auditEvents) ? r.auditEvents : [] };
}

/** Kompaniya o'zi boshqaradigan imkoniyatlar — faqat modullar (Kompaniya → Modullar). Qolgan bayroqlar tizimniki. */
export const kompaniyaModulKodimi = (kod: unknown): boolean => typeof kod === 'string' && /^module\.[a-z0-9_]+$/.test(kod);

/** AI katalog/model marshruti/ustama: GET bo'limlari va POST amallari — faqat platforma superadmini. */
export const AI_TIZIM_BOLIMLAR: ReadonlySet<string> = new Set(['modellar', 'openrouter_modellar', 'model_shaxsiy', 'model_siyosat']);
export const AI_TIZIM_AMALLAR: ReadonlySet<string> = new Set([
  'model_tanla', 'model_shaxsiy_tanla', 'model_siyosat_saqla', 'model_katalog_yoz', 'model_openrouterdan_qosh', 'ustama_belgila', 'byudjet_belgila',
]);
