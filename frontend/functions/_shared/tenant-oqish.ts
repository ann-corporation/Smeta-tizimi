/**
 * O'QISH IZOLYATSIYASI — /api/sb uchun yagona siyosat (egasi 2026-10-02: "man NTB ning PTO si bo'la turib hech
 * qachon tasodifan ham Discover Invest ning hujjatlarini ko'rishim kerak emas").
 *
 * Qonun: DEFAULT DENY. Har ochiq jadvalning aniq siyosati bor; siyosati yo'q jadval o'qilmaydi.
 *   kompaniya        — server har so'rovga `kompaniya_id=in.(a'zo kompaniyalar)` ni MAJBURAN qo'shadi
 *                      (brauzer filtri nima bo'lishidan qat'i nazar — AND bilan).
 *   platforma        — o'z kompaniyasi + platforma qatorlari (kompaniya_id IS NULL: katalog, umumiy aliaslar).
 *   ozi              — t2_kompaniya: faqat a'zo bo'lgan kompaniyalar (`id=in.(...)`).
 *   ota              — jadvalda kompaniya ustuni yo'q: `ustun=eq.N` MAJBURIY, N ning ota yozuvi a'zo kompaniyaniki
 *                      ekani serverda tekshiriladi (masalan obyekt_id → t2_obyekt.kompaniya_id).
 *   global           — tenant'siz ma'lumotnoma (hujjat turlari).
 *   superadmin       — eski TIZIM_01 ko'zgusi (kompaniya ustuni yo'q) — faqat platforma superadmini.
 *
 * Avvalgi bo'shliq (2026-10-02 auditi): anchorsiz `t2_*` o'qishlar ("id=eq.5", "obyekt_id=in.(...)") va eski
 * jadvallar (holat: 58 obyekt, 51 ming qator) tizimga kirgan HAR KIMGA ochiq edi.
 */
import type { Sess } from './auth';

export type OqishSiyosat =
  | { tur: 'kompaniya' } | { tur: 'platforma' } | { tur: 'ozi' } | { tur: 'global' } | { tur: 'superadmin' }
  | { tur: 'ota'; ustun: string; otaJadval: string };

const K: OqishSiyosat = { tur: 'kompaniya' };
const OBYEKT: OqishSiyosat = { tur: 'ota', ustun: 'obyekt_id', otaJadval: 't2_obyekt' };

export const OQISH_SIYOSATI: Readonly<Record<string, OqishSiyosat>> = {
  /* Eski TIZIM_01 ko'zgusi — faqat superadmin (Tezlik sinovi). */
  holat: { tur: 'superadmin' }, obyektlar: { tur: 'superadmin' }, v_sklad_nomlar: { tur: 'superadmin' },
  /* Kompaniya ustunli jadval/ko'rinishlar. */
  t2_obyekt: K, t2_obyekt_jami: K, t2_daraxt: K, t2_qator: K, t2_narx: K, t2_manba: K, t2_xom: K,
  t2_kozgu: K, t2_ozgarish: K, t2_sozlama: K,
  t2_akt: K, t2_akt_qator: K, t2_akt_reestr: K, t2_faktura: K, t2_ish_turi: K, t2_shaxsiy_smeta: K,
  v_erp_kadrlar_dashboard: K, v_erp_texnika_dashboard: K, v_erp_taminot_dashboard: K, v_erp_sifat_dashboard: K,
  t2_grafik_holat: K, v_boss_init: K, v_boss_data: K,
  t2_birja_rfq: K, t2_birja_taklif: K, t2_sklad_qoldiq: K, t2_sklad_harakat: K,
  t2_narx_markaz: K, t2_topilmaganlar: K, t2_narx_sana: K, t2_narx_qol_xavf: K,
  t2_f2_kat_oy: K, t2_f2_tafsilot: K,
  t2_viborka: K, t2_viborka_holat: K,
  t2_shartnoma: K, t2_nakrutka: K, t2_qoshimcha_ish: K,
  t2_tolov: K, t2_xarajat: K, t2_bux_dashboard: K, t2_debitor_aging: K, t2_bux_umumiy: K,
  t2_aosr_reestr: K, t2_aosr_reestr_v2: K, t2_lab_protokol_reestr: K, t2_kompaniya_logo: K,
  t2_nakrutka_podval_royxat: K, t2_narx_taklif: K, t2_narx_dalil_holat: K,
  t2_korzinka: K, t2_audit_reestr: K, t2_obyekt_hujjat_royxat: K,
  t2_sklad_royxat: K, t2_kadr_royxat: K, t2_texnika_royxat: K, t2_loyiha_royxat: K,
  t2_kontragent_royxat: K, t2_azolik_royxat: K, t2_zayavka_royxat: K, t2_hodisa_lenta: K,
  t2_papka_daraxt: K, t2_overbilling_radar: K, t2_sklad_konsolidatsiya: K,
  /* Platforma qatorlari bor (kompaniya_id IS NULL). */
  t2_narx_manba_royxat: { tur: 'platforma' }, t2_narx_manba_qator: { tur: 'platforma' },
  t2_material_alias_royxat: { tur: 'platforma' },
  t2_kompaniya: { tur: 'ozi' },
  /* Kompaniya ustuni yo'q — ota orqali. */
  t2_qator_holat: OBYEKT, t2_aosr_coverage: OBYEKT, t2_lrv: OBYEKT, t2_obyekt_nakrutka: OBYEKT, t2_shartnoma_bog: OBYEKT,
  t2_loyiha_qatnashchilar_royxat: { tur: 'ota', ustun: 'loyiha_id', otaJadval: 't2_loyiha' },
  t2_viborka_qabul: { tur: 'ota', ustun: 'viborka_id', otaJadval: 't2_viborka' },
  t2_hujjat_turi: { tur: 'global' },
  /* Platforma katalogi ro'yxati — faqat kompaniya_id IS NULL qatorlar (ko'rinish shuni beradi); hamma uchun umumiy. */
  t2_platforma_narx_manba: { tur: 'global' },
  /* Platforma katalogi qatorlari (kompaniya_id IS NULL) — katalogdan qidirish (2026-10-03). */
  t2_platforma_narx_manba_qator: { tur: 'global' },
};

/** PostgREST filtri — faqat oddiy `ustun=op.qiymat` shakllari (`or=`, embedding va h.k. yo'q). */
export function filtrXavfsizmi(f: string): boolean {
  if (!f) return true;
  return f.split('&').every((qism) => /^[a-z_][a-z0-9_]*=(eq|neq|gt|gte|lt|lte|like|ilike|in|is)\.[^&]*$/i.test(qism));
}
/** `select` — faqat ustun nomlari (embedding `x(*)`, alias `a:b`, cast `::` yo'q). */
export const ustunlarXavfsizmi = (s: string) => !s || /^[a-z0-9_*,\s]+$/i.test(s);
/** `order` — `ustun.asc,ustun.desc.nullslast` shakli. */
export const tartibXavfsizmi = (s: string) => !s || /^[a-z0-9_.,]+$/i.test(s);

export type OqishQaror =
  | { ok: true; qoshimchaFiltr: string[]; ota?: { jadval: string; id: number } }
  | { ok: false; status: number; code: string; error: string };

export function azoKompaniyalar(sess: Sess): number[] {
  return Array.isArray(sess.kompaniyalar)
    ? [...new Set(sess.kompaniyalar.map((a) => Number(a.kompaniya_id)).filter((x) => Number.isSafeInteger(x) && x > 0))]
    : [];
}

const rad = (status: number, code: string, error: string): OqishQaror => ({ ok: false, status, code, error });

/** Jadval o'qishi uchun qaror: rad yoki majburiy qo'shimcha filtrlar (+ tekshiriladigan ota yozuv). */
export function oqishQarori(jadval: string, so: { filtr?: string; ustunlar?: string; tartib?: string }, sess: Sess): OqishQaror {
  const s = OQISH_SIYOSATI[jadval];
  if (!s) return rad(403, 'JADVAL_YOPIQ', 'Jadval ochiq emas: ' + jadval);
  const filtr = so.filtr || '';
  if (!filtrXavfsizmi(filtr)) return rad(400, 'FILTR', 'Filtr shakli qabul qilinmadi');
  if (!ustunlarXavfsizmi(so.ustunlar || '')) return rad(400, 'USTUNLAR', 'Ustunlar shakli qabul qilinmadi');
  if (!tartibXavfsizmi(so.tartib || '')) return rad(400, 'TARTIB', 'Tartib shakli qabul qilinmadi');

  if (s.tur === 'global') return { ok: true, qoshimchaFiltr: [] };
  if (s.tur === 'superadmin') {
    return sess.rol === 'superadmin' ? { ok: true, qoshimchaFiltr: [] } : rad(403, 'TENANT_FORBIDDEN', 'Bu ma’lumot faqat platforma administratoriga ochiq');
  }
  if (!Array.isArray(sess.kompaniyalar)) return rad(401, 'SESSION_STALE', 'Sessiyani yangilang — chiqib, qaytadan kiring.');
  const azo = azoKompaniyalar(sess);
  const mosKomp = filtr.match(/(?:^|&)kompaniya_id=eq\.(-?\d+)(?=&|$)/);
  if (mosKomp && !azo.includes(Number(mosKomp[1]))) {
    return rad(403, 'TENANT_FORBIDDEN', 'Bu kompaniyaga a’zo emassiz (kompaniya_id: ' + Number(mosKomp[1]) + ')');
  }
  const royxat = `(${azo.join(',')})`;
  if (s.tur === 'kompaniya') {
    if (!azo.length) return rad(403, 'TENANT_FORBIDDEN', 'Hech bir kompaniyaga a’zo emassiz');
    return { ok: true, qoshimchaFiltr: [`kompaniya_id=in.${royxat}`] };
  }
  if (s.tur === 'platforma') {
    return { ok: true, qoshimchaFiltr: [azo.length ? `or=(kompaniya_id.in.${royxat},kompaniya_id.is.null)` : 'kompaniya_id=is.null'] };
  }
  if (s.tur === 'ozi') {
    if (!azo.length) return rad(403, 'TENANT_FORBIDDEN', 'Hech bir kompaniyaga a’zo emassiz');
    return { ok: true, qoshimchaFiltr: [`id=in.${royxat}`] };
  }
  // ota: `ustun=eq.N` majburiy (bitta aniq ota), ota yozuvning kompaniyasi chaqiruvchida tekshiriladi.
  const m = filtr.match(new RegExp(`(?:^|&)${s.ustun}=eq\\.(\\d+)(?=&|$)`));
  if (!m) return rad(400, 'ANCHOR_MAJBURIY', `Bu o‘qish uchun ${s.ustun}=eq.<id> filtri majburiy`);
  if (!azo.length) return rad(403, 'TENANT_FORBIDDEN', 'Hech bir kompaniyaga a’zo emassiz');
  return { ok: true, qoshimchaFiltr: [], ota: { jadval: s.otaJadval, id: Number(m[1]) } };
}

/** O'qish-RPC lar uchun: obyekt / kompaniya a'zoligi. `kompaniya` turida kompaniya MAJBURIY
 *  (berilmasa va foydalanuvchi bitta kompaniyada bo'lsa — o'shasi; aks holda rad). */
export function rpcKompaniyasi(sess: Sess, berilgan: unknown): { ok: true; id: number } | { ok: false; status: number; error: string } {
  const azo = azoKompaniyalar(sess);
  if (berilgan == null || berilgan === '') {
    if (azo.length === 1) return { ok: true, id: azo[0] };
    return { ok: false, status: 400, error: 'kompaniya_id majburiy' };
  }
  const id = Number(berilgan);
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, status: 400, error: 'kompaniya_id noto‘g‘ri' };
  if (!azo.includes(id)) return { ok: false, status: 403, error: 'Bu kompaniyaga ruxsat yo‘q' };
  return { ok: true, id };
}
