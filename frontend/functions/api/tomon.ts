/**
 * tomon.ts — TOMON ALOQASI shlyuzi (zakazchik ↔ pudratchi va kelajakdagi barcha tomonlar), egasi 2026-10-05.
 *
 * Nega alohida shlyuz: /api/sb va /api/sb-yoz QAT'IY bir-kompaniyali (tenant izolyatsiyasi). Kompaniyalararo
 * ko'rinish (grant) va taqdim faqat shu yerdan, faqat sanab o'tilgan RPC lar orqali o'tadi; ixtiyoriy jadval/RPC
 * nomi qabul qilinmaydi. Actor HAR DOIM sessiyadan. A'zolik, rol, grant va doira tekshiruvi BAZADA (RPC birinchi
 * qatori) — shlyuz ruxsat bermaydi, faqat tekshirilgan parametrlarni uzatadi.
 * Taklif kodi: shlyuz yaratadi, bazaga faqat SHA-256 xeshi boradi, ochiq kod foydalanuvchiga BIR MARTA qaytadi.
 */
import { cachedAuthority } from '../_shared/permission-policy';
import { tekshir } from '../_shared/auth';
import { supabaseBaseUrl } from '../_shared/supabase-url';

type Env = { SUPABASE_URL?: string; SUPABASE_KEY?: string; SESSIYA_KALIT: string };
type Yuk = Record<string, unknown>;

/** O'qish bo'limlari: bolim → RPC. */
const OQISH: Record<string, string> = {
  aloqalar: 't2_tomon_aloqalar_v1',
  aloqa: 't2_tomon_aloqa_tafsilot_v1',
  taqdimlar: 't2_tomon_taqdimlar_v1',
  taqdim: 't2_tomon_taqdim_tafsilot_v1',
  obyektlar: 't2_zakazchik_obyektlar_v1',
  qidir: 't2_tomon_kompaniya_qidir_v1',
  resurslar: 't2_tomon_resurslar_v1',
  murojaatlar: 't2_tomon_murojaat_royxat_v1',
  murojaat: 't2_tomon_murojaat_tafsilot_v1',
  murojaat_turlari: 't2_tomon_murojaat_turlari_v1',
  ulashlar: 't2_obyekt_ulashlar_v1',
  izohlar: 't2_izohlar_v1',
  imzochilar: 't2_obyekt_imzochilar_v1',
  imzochi_tarix: 't2_imzochi_tarix_v1',
  /* SUBPUDRATCHI tomoni (20261216300000): topshirilgan ishlar, aktlar, to'lov holati. */
  sub_boshqaruv: 't2_sub_boshqaruv_v1',
  sub_ishlarim: 't2_sub_ishlarim_v1',
  sub_aktlar: 't2_sub_akt_royxat_v1',
  sub_akt: 't2_sub_akt_tafsilot_v1',
  sub_tolov: 't2_sub_tolov_holati_v1',
  /* Texnik nazorat (texnadzor) */
  nazorat_uy: 't2_nazorat_uy_v1',
  tekshiruvlar: 't2_nazorat_tekshiruvlar_v1',
  tekshiruv: 't2_nazorat_tekshiruv_tafsilot_v1',
  aosr_korik: 't2_nazorat_aosr_korik_v1',
  f2_tekshiruv: 't2_nazorat_f2_tekshiruv_v1',
};
/** Yozish amallari: amal → RPC. */
const YOZISH: Record<string, string> = {
  taklif: 't2_tomon_taklif_v1',
  javob: 't2_tomon_javob_v1',
  kod_qabul: 't2_tomon_kod_qabul_v1',
  holat: 't2_tomon_holat_v1',
  grant_saqla: 't2_tomon_grant_saqla_v1',
  grant_bekor: 't2_tomon_grant_bekor_v1',
  taqdim_yarat: 't2_tomon_taqdim_yarat_v1',
  qaror: 't2_tomon_qaror_v1',
  taqdim_qaytar: 't2_tomon_taqdim_qaytar_v1',
  izoh: 't2_tomon_izoh_v1',
  murojaat_yarat: 't2_tomon_murojaat_yarat_v1',
  murojaat_javob: 't2_tomon_murojaat_javob_v1',
  murojaat_hujjat: 't2_tomon_murojaat_hujjat_v1',
  murojaat_qaror: 't2_tomon_murojaat_qaror_v1',
  murojaat_bekor: 't2_tomon_murojaat_bekor_v1',
  loyiha_umumiy: 't2_loyiha_umumiy_v1',
  ulash: 't2_obyekt_ulash_v1',
  qator_izoh: 't2_izoh_yoz_v1',
  qator_izoh_hal: 't2_izoh_hal_v1',
  imzochi_saqla: 't2_obyekt_imzochi_saqla_v1',
  sub_topshir: 't2_sub_topshir_v1',
  sub_topshiriq_bekor: 't2_sub_topshiriq_bekor_v1',
  sub_akt_yoz: 't2_sub_akt_yoz_v1',
  sub_akt_yubor: 't2_sub_akt_yubor_v1',
  sub_akt_qaytar: 't2_sub_akt_qaytar_v1',
  sub_qaror: 't2_sub_akt_qaror_v1',
  tekshiruv_yoz: 't2_nazorat_tekshiruv_yoz_v1',
  aosr_foto: 't2_aosr_foto_biriktir_v1',
};
/** T5: obyektni havola bilan ulashishda ochiladigan resurslar (faqat ko'rish). */
const ULASH_RESURSLARI = ['shartnoma_xulosa', 'f2'];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sonmi = (v: unknown) => v != null && v !== '' && Number.isSafeInteger(Number(v)) && Number(v) > 0;
const son = (v: unknown) => Number(v);
const ixtSon = (v: unknown) => (sonmi(v) ? Number(v) : null);
const matn = (v: unknown, n: number) => (v == null || String(v).trim() === '' ? null : String(v).trim().slice(0, n));
const rolMatn = (v: unknown) => { const s = String(v ?? '').trim(); return s.length >= 2 && s.length <= 40 ? s : null; };
const opId = (v: unknown) => (typeof v === 'string' && UUID.test(v) ? v : crypto.randomUUID());
const IMZO_DARAJALAR = ['loyiha', 'obyekt', 'razdel'];
const IMZO_ROLLAR = ['zakazchik', 'pudratchi', 'subpudratchi', 'texnadzor', 'loyihachi'];
const KALIT = /^[a-z][a-z0-9_]{1,40}$/;
const AMAL = /^[a-z_]{2,20}$/;

/** Ochiq taklif kodi alifbosi: o'xshash belgilarsiz (0/O, 1/I/L yo'q). */
const KOD_ALIFBO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function yangiKod(): string {
  const b = new Uint8Array(12);
  crypto.getRandomValues(b);
  let s = '';
  for (const x of b) s += KOD_ALIFBO[x % KOD_ALIFBO.length];
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}
const kodTozala = (k: string) => k.toUpperCase().replace(/[^A-Z0-9]/g, '');
export async function kodXeshi(kod: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('tomon-taklif:' + kodTozala(kod)));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Doira bo'yicha tekshirilgan grant elementlari. Aynan bitta doira (loyiha/obyekt/shartnoma). */
export function grantlarniTozala(v: unknown): Yuk[] | string {
  if (!Array.isArray(v) || v.length < 1 || v.length > 200) return 'grantlar: 1–200 ta element kerak';
  const out: Yuk[] = [];
  for (const e of v as Array<Record<string, unknown>>) {
    if (!e || typeof e !== 'object' || !KALIT.test(String(e.resurs ?? ''))) return 'Har grantda resurs kerak';
    const amallar = Array.isArray(e.amallar) ? [...new Set((e.amallar as unknown[]).map(String))] : [];
    if (!amallar.length || amallar.length > 10 || !amallar.every((a) => AMAL.test(a))) return 'Har grantda amallar kerak';
    const doira = { loyiha_id: ixtSon(e.loyiha_id), obyekt_id: ixtSon(e.obyekt_id), shartnoma_id: ixtSon(e.shartnoma_id) };
    if (Object.values(doira).filter((x) => x != null).length !== 1) return 'Aynan bitta doira kerak: loyiha, obyekt yoki shartnoma';
    out.push({ resurs: String(e.resurs), amallar, ...doira });
  }
  return out;
}

const BAND_NATIJA = ['mos', 'mos_emas', 'yoq'];
/** Tekshiruv bandlari: faqat ma'lum maydonlar o'tadi (kod, nom, natija, izoh, muhimlik, document_ids). */
export function bandlarniTozala(v: unknown): Yuk[] | string {
  if (!Array.isArray(v) || v.length > 80) return 'bandlar: ko‘pi bilan 80 ta element';
  const out: Yuk[] = [];
  for (const e of v as Array<Record<string, unknown>>) {
    if (!e || typeof e !== 'object') return 'Band noto‘g‘ri';
    const kod = matn(e.kod, 60), nom = matn(e.nom, 200), natija = String(e.natija ?? '');
    if (!kod || !nom || nom.length < 2 || !BAND_NATIJA.includes(natija)) return 'Har bandda kod, nom va natija (mos | mos_emas | yoq) kerak';
    const muhimlik = e.muhimlik == null || e.muhimlik === '' ? 'yuqori' : String(e.muhimlik);
    if (!['past', 'oddiy', 'yuqori', 'kritik'].includes(muhimlik)) return 'Band muhimligi noto‘g‘ri';
    const idlar = Array.isArray(e.document_ids) ? (e.document_ids as unknown[]) : [];
    if (idlar.length > 10 || !idlar.every(sonmi)) return 'Band fotosi: ko‘pi bilan 10 ta musbat son';
    out.push({ kod, nom, natija, izoh: matn(e.izoh, 1000), muhimlik, document_ids: idlar.map(Number) });
  }
  return out;
}

/** Yozish amalini RPC yukiga aylantiradi (xato bo'lsa — matn). Kod xeshi alohida (async) `yukTayyorla` da. */
export function yozishYuki(amal: string, so: Yuk): Yuk | string {
  if (!sonmi(so.kompaniya_id)) return 'kompaniya_id kerak';
  const p_kompaniya_id = son(so.kompaniya_id);
  switch (amal) {
    case 'taklif': {
      const inn = so.qabul_inn == null || so.qabul_inn === '' ? null : String(so.qabul_inn).trim();
      if (inn != null && !/^[0-9]{9}$/.test(inn)) return 'INN 9 raqamdan iborat bo‘lishi kerak';
      const tr = rolMatn(so.taklif_rol), qr = rolMatn(so.qabul_rol);
      if (!tr || !qr) return 'Ikkala tomonning roli kerak (2–40 belgi)';
      const turi = so.turi == null || so.turi === '' ? 'shartnoma' : rolMatn(so.turi);
      if (!turi) return 'turi 2–40 belgi bo‘lishi kerak';
      if (so.qabul_kompaniya_id != null && so.qabul_kompaniya_id !== '' && (!sonmi(so.qabul_kompaniya_id) || !inn)) return 'qabul_kompaniya_id faqat INN bilan birga';
      return { p_kompaniya_id, p_qabul_kompaniya_id: ixtSon(so.qabul_kompaniya_id), p_qabul_inn: inn, p_qabul_nom: matn(so.qabul_nom, 200), p_taklif_rol: tr, p_qabul_rol: qr,
               p_turi: turi, p_nom: matn(so.nom, 200), p_izoh: matn(so.izoh, 1000), p_kod_xesh: null, p_operation_id: opId(so.operation_id) };
    }
    case 'javob':
      if (!sonmi(so.aloqa_id) || !['qabul', 'rad'].includes(String(so.qaror))) return 'aloqa_id va qaror (qabul/rad) kerak';
      return { p_kompaniya_id, p_aloqa_id: son(so.aloqa_id), p_qaror: String(so.qaror), p_izoh: matn(so.izoh, 1000) };
    case 'kod_qabul': {
      const k = kodTozala(String(so.kod ?? ''));
      if (k.length !== 12) return 'Taklif kodi 12 belgidan iborat (XXXX-XXXX-XXXX)';
      return { p_kompaniya_id, p_kod_xesh: String(so.kod) };
    }
    case 'holat':
      if (!sonmi(so.aloqa_id) || !['toxtatish', 'davom', 'yopish', 'bekor'].includes(String(so.harakat))) return 'aloqa_id va harakat (toxtatish/davom/yopish/bekor) kerak';
      return { p_kompaniya_id, p_aloqa_id: son(so.aloqa_id), p_amal: String(so.harakat), p_sabab: matn(so.sabab, 500) };
    case 'grant_saqla': {
      if (!sonmi(so.aloqa_id)) return 'aloqa_id kerak';
      const g = grantlarniTozala(so.grantlar);
      if (typeof g === 'string') return g;
      return { p_kompaniya_id, p_aloqa_id: son(so.aloqa_id), p_grantlar: g };
    }
    case 'grant_bekor':
      if (!sonmi(so.grant_id)) return 'grant_id kerak';
      return { p_kompaniya_id, p_grant_id: son(so.grant_id) };
    case 'taqdim_yarat':
      if (!sonmi(so.aloqa_id) || !sonmi(so.manba_id) || !KALIT.test(String(so.resurs ?? ''))) return 'aloqa_id, resurs va manba_id kerak';
      return { p_kompaniya_id, p_aloqa_id: son(so.aloqa_id), p_resurs: String(so.resurs), p_manba_id: son(so.manba_id), p_izoh: matn(so.izoh, 1000), p_operation_id: opId(so.operation_id) };
    case 'qaror':
      if (!sonmi(so.taqdim_id) || !['korilmoqda', 'qabul', 'rad', 'tuzatish'].includes(String(so.qaror))) return 'taqdim_id va qaror (korilmoqda/qabul/rad/tuzatish) kerak';
      return { p_kompaniya_id, p_taqdim_id: son(so.taqdim_id), p_qaror: String(so.qaror), p_izoh: matn(so.izoh, 2000) };
    case 'taqdim_qaytar':
      if (!sonmi(so.taqdim_id)) return 'taqdim_id kerak';
      return { p_kompaniya_id, p_taqdim_id: son(so.taqdim_id), p_sabab: matn(so.sabab, 500) };
    case 'izoh': {
      const t = ixtSon(so.taqdim_id), a = ixtSon(so.aloqa_id);
      if (!t && !a) return 'aloqa_id yoki taqdim_id kerak';
      const m = matn(so.matn, 2000);
      if (!m) return 'Izoh matni kerak';
      return { p_kompaniya_id, p_aloqa_id: a, p_taqdim_id: t, p_matn: m };
    }
    case 'murojaat_yarat': {
      if (!sonmi(so.aloqa_id) || !KALIT.test(String(so.turi ?? ''))) return 'aloqa_id va turi kerak';
      const sarlavha = matn(so.sarlavha, 200);
      if (!sarlavha || sarlavha.length < 3) return 'Sarlavha kamida 3 belgi';
      const muhimlik = so.muhimlik == null || so.muhimlik === '' ? 'oddiy' : String(so.muhimlik);
      if (!['past', 'oddiy', 'yuqori', 'kritik'].includes(muhimlik)) return 'muhimlik: past | oddiy | yuqori | kritik';
      const muddat = so.muddat == null || so.muddat === '' ? null : String(so.muddat);
      if (muddat != null && !/^\d{4}-\d{2}-\d{2}$/.test(muddat)) return 'muddat YYYY-MM-DD bo‘lishi kerak';
      return { p_kompaniya_id, p_aloqa_id: son(so.aloqa_id), p_turi: String(so.turi), p_sarlavha: sarlavha, p_matn: matn(so.matn, 4000), p_muhimlik: muhimlik, p_muddat: muddat,
               p_obyekt_id: ixtSon(so.obyekt_id), p_joy: matn(so.joy, 300), p_operation_id: opId(so.operation_id) };
    }
    case 'murojaat_javob': {
      if (!sonmi(so.murojaat_id)) return 'murojaat_id kerak';
      const idlar = Array.isArray(so.document_ids) ? (so.document_ids as unknown[]) : [];
      if (idlar.length > 20 || !idlar.every(sonmi)) return 'document_ids: ko‘pi bilan 20 ta musbat son';
      return { p_kompaniya_id, p_id: son(so.murojaat_id), p_matn: matn(so.matn, 4000), p_document_ids: idlar.map(Number) };
    }
    case 'murojaat_hujjat':
      if (!sonmi(so.murojaat_id) || !sonmi(so.document_id)) return 'murojaat_id va document_id kerak';
      return { p_kompaniya_id, p_id: son(so.murojaat_id), p_document_id: son(so.document_id) };
    case 'murojaat_qaror':
      if (!sonmi(so.murojaat_id) || !['yopish', 'qayta_ochish'].includes(String(so.qaror))) return 'murojaat_id va qaror (yopish/qayta_ochish) kerak';
      return { p_kompaniya_id, p_id: son(so.murojaat_id), p_qaror: String(so.qaror), p_izoh: matn(so.izoh, 2000) };
    case 'qator_izoh': {
      if (so.manba_jadval !== 't2_akt_qator' || !sonmi(so.manba_id)) return 'manba_jadval (t2_akt_qator) va manba_id kerak';
      const m = matn(so.matn, 4000);
      if (!m) return 'Izoh matni kerak';
      return { p_kompaniya_id, p_operation_id: opId(so.operation_id), p_aloqa_id: ixtSon(so.aloqa_id), p_manba_jadval: 't2_akt_qator', p_manba_id: son(so.manba_id), p_matn: m, p_ota_izoh_id: ixtSon(so.ota_izoh_id) };
    }
    case 'qator_izoh_hal':
      if (!sonmi(so.izoh_id) || !sonmi(so.versiya) || typeof so.hal !== 'boolean') return 'izoh_id, versiya va hal (true/false) kerak';
      return { p_kompaniya_id, p_operation_id: opId(so.operation_id), p_izoh_id: son(so.izoh_id), p_kutilgan_versiya: son(so.versiya), p_hal: so.hal };
    case 'imzochi_saqla': {
      if (!sonmi(so.obyekt_id) || !IMZO_ROLLAR.includes(String(so.rol))) return 'obyekt_id va rol (zakazchik/pudratchi/subpudratchi/texnadzor/loyihachi) kerak';
      const daraja = so.daraja == null || so.daraja === '' ? 'obyekt' : String(so.daraja);
      if (!IMZO_DARAJALAR.includes(daraja)) return 'daraja: loyiha | obyekt | razdel';
      if (daraja === 'razdel' && !sonmi(so.razdel_id)) return 'razdel darajasida razdel_id kerak';
      return { p_kompaniya_id, p_obyekt_id: son(so.obyekt_id), p_rol: String(so.rol), p_daraja: daraja, p_razdel_id: daraja === 'razdel' ? son(so.razdel_id) : null,
               p_tashkilot: matn(so.tashkilot, 200), p_lavozim: matn(so.lavozim, 200), p_fio: matn(so.fio, 200), p_operation_id: opId(so.operation_id) };
    }
    case 'sub_topshir': {
      if (!sonmi(so.aloqa_id) || !sonmi(so.obyekt_id)) return 'aloqa_id va obyekt_id kerak';
      const qs = Array.isArray(so.qatorlar) ? (so.qatorlar as Array<Record<string, unknown>>) : [];
      if (qs.length > 300) return 'qatorlar: ko‘pi bilan 300 ta';
      const toza: Yuk[] = [];
      for (const e of qs) {
        if (!e || typeof e !== 'object' || !sonmi(e.qator_id)) return 'Har qatorda qator_id kerak';
        const q: Yuk = { qator_id: son(e.qator_id) };
        if (e.hajm != null && e.hajm !== '') { if (!(Number(e.hajm) > 0) || !Number.isFinite(Number(e.hajm))) return 'Hajm musbat son bo‘lishi kerak'; q.hajm = Number(e.hajm); }
        if ('narx' in e) {
          if (e.narx != null && e.narx !== '' && (!(Number(e.narx) >= 0) || !Number.isFinite(Number(e.narx)))) return 'Narx 0 dan kichik bo‘lmasligi kerak';
          q.narx = e.narx == null || e.narx === '' ? null : Number(e.narx);
        }
        toza.push(q);
      }
      if (!toza.length && !sonmi(so.bolim_id)) return 'Qatorlar yoki bolim_id kerak';
      const qqs = so.qqs_foiz == null || so.qqs_foiz === '' ? null : Number(so.qqs_foiz);
      if (qqs != null && !(qqs >= 0 && qqs <= 100)) return 'QQS foizi 0 dan 100 gacha';
      const lump = so.umumiy_summa == null || so.umumiy_summa === '' ? null : Number(so.umumiy_summa);
      if (lump != null && !(Number.isFinite(lump) && lump >= 0)) return 'Umumiy summa 0 dan kichik bo‘lmasligi kerak';
      return { p_kompaniya_id, p_aloqa_id: son(so.aloqa_id), p_obyekt_id: son(so.obyekt_id), p_qatorlar: toza, p_bolim_id: ixtSon(so.bolim_id), p_shartnoma_id: ixtSon(so.shartnoma_id), p_qqs_foiz: qqs, p_umumiy_summa: lump };
    }
    case 'sub_topshiriq_bekor':
      if (!sonmi(so.topshiriq_id)) return 'topshiriq_id kerak';
      return { p_kompaniya_id, p_topshiriq_id: son(so.topshiriq_id) };
    case 'sub_akt_yoz': {
      if (!sonmi(so.aloqa_id) || !sonmi(so.obyekt_id)) return 'aloqa_id va obyekt_id kerak';
      const oy = so.oy == null || so.oy === '' ? null : String(so.oy);
      if (oy != null && !/^\d{4}-\d{2}-\d{2}$/.test(oy)) return 'oy YYYY-MM-DD bo‘lishi kerak';
      if (oy == null && !sonmi(so.akt_id)) return 'oy kerak';
      const qs = Array.isArray(so.qatorlar) ? (so.qatorlar as Array<Record<string, unknown>>) : null;
      if (!qs || qs.length > 300) return 'qatorlar: ro‘yxat, ko‘pi bilan 300 ta';
      const toza: Yuk[] = [];
      for (const e of qs) {
        if (!e || typeof e !== 'object' || !sonmi(e.topshiriq_id) || !(Number(e.hajm) > 0) || !Number.isFinite(Number(e.hajm))) return 'Har qatorda topshiriq_id va musbat hajm kerak';
        toza.push({ topshiriq_id: son(e.topshiriq_id), hajm: Number(e.hajm), izoh: matn(e.izoh, 500) });
      }
      return { p_kompaniya_id, p_aloqa_id: son(so.aloqa_id), p_obyekt_id: son(so.obyekt_id), p_oy: oy, p_qatorlar: toza, p_akt_id: ixtSon(so.akt_id),
               p_raqam: matn(so.raqam, 60), p_izoh: matn(so.izoh, 1000), p_operation_id: opId(so.operation_id) };
    }
    case 'sub_akt_yubor':
      if (!sonmi(so.sub_akt_id)) return 'sub_akt_id kerak';
      return { p_kompaniya_id, p_sub_akt_id: son(so.sub_akt_id), p_izoh: matn(so.izoh, 1000), p_operation_id: opId(so.operation_id) };
    case 'sub_akt_qaytar':
      if (!sonmi(so.sub_akt_id)) return 'sub_akt_id kerak';
      return { p_kompaniya_id, p_sub_akt_id: son(so.sub_akt_id), p_sabab: matn(so.sabab, 500) };
    case 'sub_qaror':
      if (!sonmi(so.taqdim_id) || !['korilmoqda', 'qabul', 'rad', 'tuzatish'].includes(String(so.qaror))) return 'taqdim_id va qaror (korilmoqda/qabul/rad/tuzatish) kerak';
      return { p_kompaniya_id, p_taqdim_id: son(so.taqdim_id), p_qaror: String(so.qaror), p_izoh: matn(so.izoh, 2000) };
    case 'tekshiruv_yoz': {
      if (!sonmi(so.obyekt_id)) return 'obyekt_id kerak';
      const ishTuri = matn(so.ish_turi, 80);
      if (!ishTuri || ishTuri.length < 2) return 'Ish turi kerak';
      const sana = so.sana == null || so.sana === '' ? null : String(so.sana);
      if (sana != null && !/^\d{4}-\d{2}-\d{2}$/.test(sana)) return 'sana YYYY-MM-DD bo‘lishi kerak';
      const bandlar = bandlarniTozala(so.bandlar);
      if (typeof bandlar === 'string') return bandlar;
      const kun = so.muddat_kun == null || so.muddat_kun === '' ? null : Number(so.muddat_kun);
      if (kun != null && !(Number.isInteger(kun) && kun >= 1 && kun <= 60)) return 'muddat_kun 1–60 bo‘lishi kerak';
      return { p_kompaniya_id, p_operation_id: opId(so.operation_id), p_id: ixtSon(so.id), p_aloqa_id: ixtSon(so.aloqa_id), p_obyekt_id: son(so.obyekt_id), p_sana: sana,
               p_ish_turi: ishTuri, p_joy: matn(so.joy, 300), p_bandlar: bandlar, p_izoh: matn(so.izoh, 2000), p_yakunla: so.yakunla === true, p_muddat_kun: kun };
    }
    case 'aosr_foto': {
      if (!sonmi(so.aosr_id)) return 'aosr_id kerak';
      const idlar = Array.isArray(so.document_ids) ? (so.document_ids as unknown[]) : [];
      if (idlar.length < 1 || idlar.length > 20 || !idlar.every(sonmi)) return 'document_ids: 1–20 ta musbat son';
      return { p_kompaniya_id, p_aosr_id: son(so.aosr_id), p_document_ids: idlar.map(Number) };
    }
    case 'loyiha_umumiy':
      return { p_kompaniya_id };
    case 'murojaat_bekor':
      if (!sonmi(so.murojaat_id)) return 'murojaat_id kerak';
      return { p_kompaniya_id, p_id: son(so.murojaat_id), p_sabab: matn(so.sabab, 500) };
    case 'ulash': {
      if (!sonmi(so.obyekt_id)) return 'obyekt_id kerak';
      const r = Array.isArray(so.resurslar) ? [...new Set((so.resurslar as unknown[]).map(String))].filter((x) => ULASH_RESURSLARI.includes(x)) : [];
      return { p_kompaniya_id, p_obyekt_id: son(so.obyekt_id), p_resurslar: r, p_kod_xesh: null, p_izoh: matn(so.izoh, 1000) };
    }
    default: return 'Amal ochiq emas';
  }
}

/** O'qish bo'limini RPC yukiga aylantiradi. */
export function oqishYuki(bolim: string, q: URLSearchParams): Yuk | string {
  const k = q.get('kompaniya_id');
  if (!sonmi(k)) return 'kompaniya_id kerak';
  const p_kompaniya_id = Number(k);
  switch (bolim) {
    case 'aloqalar': case 'obyektlar': case 'resurslar': case 'murojaat_turlari': case 'imzochi_tarix': return { p_kompaniya_id };
    case 'murojaat': return sonmi(q.get('murojaat_id')) ? { p_kompaniya_id, p_id: Number(q.get('murojaat_id')) } : 'murojaat_id kerak';
    case 'murojaatlar': {
      const y = q.get('yonalish'), h = q.get('holat');
      return { p_kompaniya_id, p_yonalish: y === 'menga' || y === 'mendan' ? y : null, p_holat: h && /^[a-z_]{3,20}$/.test(h) ? h : null, p_aloqa_id: ixtSon(q.get('aloqa_id')), p_limit: ixtSon(q.get('limit')) ?? 100 };
    }
    case 'nazorat_uy': return { p_kompaniya_id };
    case 'tekshiruvlar': {
      const sana = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
      return { p_kompaniya_id, p_dan: sana(q.get('dan')), p_gacha: sana(q.get('gacha')), p_obyekt_id: ixtSon(q.get('obyekt_id')), p_limit: ixtSon(q.get('limit')) ?? 200 };
    }
    case 'tekshiruv': return sonmi(q.get('tekshiruv_id')) ? { p_kompaniya_id, p_id: Number(q.get('tekshiruv_id')) } : 'tekshiruv_id kerak';
    case 'aosr_korik': return sonmi(q.get('taqdim_id')) ? { p_kompaniya_id, p_taqdim_id: Number(q.get('taqdim_id')) } : 'taqdim_id kerak';
    case 'f2_tekshiruv': return sonmi(q.get('taqdim_id')) || sonmi(q.get('akt_id')) ? { p_kompaniya_id, p_taqdim_id: ixtSon(q.get('taqdim_id')), p_akt_id: ixtSon(q.get('akt_id')) } : 'taqdim_id yoki akt_id kerak';
    case 'aloqa': return sonmi(q.get('aloqa_id')) ? { p_kompaniya_id, p_aloqa_id: Number(q.get('aloqa_id')) } : 'aloqa_id kerak';
    case 'taqdim': return sonmi(q.get('taqdim_id')) ? { p_kompaniya_id, p_taqdim_id: Number(q.get('taqdim_id')) } : 'taqdim_id kerak';
    case 'taqdimlar': {
      const y = q.get('yonalish'), h = q.get('holat');
      return { p_kompaniya_id, p_yonalish: y === 'kelgan' || y === 'yuborilgan' ? y : null, p_holat: h && /^[a-z_]{3,20}$/.test(h) ? h : null,
               p_aloqa_id: ixtSon(q.get('aloqa_id')), p_limit: ixtSon(q.get('limit')) ?? 100 };
    }
    case 'izohlar': return sonmi(q.get('akt_id')) ? { p_kompaniya_id, p_akt_id: Number(q.get('akt_id')), p_aloqa_id: ixtSon(q.get('aloqa_id')), p_limit: ixtSon(q.get('limit')) ?? 500, p_keyin_id: ixtSon(q.get('keyin_id')) ?? 0 } : 'akt_id kerak';
    case 'imzochilar': return sonmi(q.get('obyekt_id')) ? { p_kompaniya_id, p_obyekt_id: Number(q.get('obyekt_id')), p_razdel_id: ixtSon(q.get('razdel_id')) } : 'obyekt_id kerak';
    case 'ulashlar': return sonmi(q.get('obyekt_id')) ? { p_kompaniya_id, p_obyekt_id: Number(q.get('obyekt_id')) } : 'obyekt_id kerak';
    case 'sub_ishlarim': case 'sub_tolov': return { p_kompaniya_id };
    case 'sub_boshqaruv': return sonmi(q.get('obyekt_id')) ? { p_kompaniya_id, p_obyekt_id: Number(q.get('obyekt_id')) } : 'obyekt_id kerak';
    case 'sub_aktlar': return { p_kompaniya_id, p_yonalish: q.get('yonalish') === 'kelgan' ? 'kelgan' : 'yuborilgan' };
    case 'sub_akt': return sonmi(q.get('sub_akt_id')) ? { p_kompaniya_id, p_sub_akt_id: Number(q.get('sub_akt_id')) } : 'sub_akt_id kerak';
    case 'qidir': {
      const inn = (q.get('inn') ?? '').trim();
      return /^[0-9]{9}$/.test(inn) ? { p_kompaniya_id, p_inn: inn } : 'INN 9 raqamdan iborat bo‘lishi kerak';
    }
    default: return 'Bo‘lim ochiq emas';
  }
}

const JAVOB = { headers: { 'Cache-Control': 'no-store' } };

/** PostgREST xatosini foydalanuvchiga tushunarli javobga aylantiradi (ichki matn sizdirilmaydi). */
export function xatoJavobi(text: string): { status: number; body: Yuk } {
  let code = ''; let msg = '';
  try { const j = JSON.parse(text) as { code?: string; message?: string }; code = j.code ?? ''; msg = j.message ?? ''; } catch { /* matn emas */ }
  if (/LAB_SINOV_KUTILMOQDA/.test(msg)) return { status: 409, body: { ok: false, code: 'LAB_SINOV_KUTILMOQDA', error: 'Sinov natijasi kutilmoqda — protokol kelmaguncha АОСР tasdiqqa yuborilmaydi' } };
  if (/LAB_MOS_EMAS/.test(msg)) return { status: 409, body: { ok: false, code: 'LAB_MOS_EMAS', error: 'Majburiy sinov natijasi «mos emas» — qayta sinovdan mos chiqmaguncha АОСР tasdiqqa yuborilmaydi' } };
  if (code === '42501' && /DALIL_BEGONA/.test(msg)) return { status: 403, body: { ok: false, code: 'DALIL_BEGONA', error: 'Dalil fayli sizning kompaniyangizniki emas yoki hali saqlanmagan' } };
  if (code === '42501') {
    if (/TOMON_ROL_YETARLI_EMAS/.test(msg)) return { status: 403, body: { ok: false, code: 'ROL_YETARLI_EMAS', error: 'Sizning rolingiz bu amal uchun yetarli emas' } };
    return { status: 403, body: { ok: false, code: 'AZO_EMAS', error: 'Siz bu kompaniyaning faol a’zosi emassiz' } };
  }
  if (code === '22023' && /PREDPISANIYA_XATO/.test(msg)) return { status: 409, body: { ok: false, code: 'PREDPISANIYA_XATO', error: 'Predpisaniya yaratilmadi, tekshiruv yakunlanmadi. Qayta urinib koʻring.' } };
  if (code === '22023') return { status: 400, body: { ok: false, error: 'Noto‘g‘ri so‘rov' } };
  return { status: 502, body: { ok: false, error: 'Server xatosi' } };
}

async function rpc(env: Env, nom: string, yuk: Yuk): Promise<Response> {
  const r = await fetch(supabaseBaseUrl(env.SUPABASE_URL!) + '/rest/v1/rpc/' + nom, {
    method: 'POST', headers: { apikey: env.SUPABASE_KEY!, Authorization: 'Bearer ' + env.SUPABASE_KEY!, 'Content-Type': 'application/json' }, body: JSON.stringify(yuk),
  });
  const text = await r.text();
  if (!r.ok) { const e = xatoJavobi(text); return Response.json(e.body, { status: e.status, ...JAVOB }); }
  let d: unknown = null;
  try { d = JSON.parse(text); } catch { return Response.json({ ok: false, error: 'Noto‘g‘ri javob' }, { status: 502, ...JAVOB }); }
  if (d && typeof d === 'object' && !Array.isArray(d) && typeof (d as { ok?: unknown }).ok === 'boolean') return Response.json(d, JAVOB);
  return Response.json({ ok: true, natija: d }, JAVOB);
}

async function actor(ctx: EventContext<Env, string, unknown>): Promise<number | Response> {
  if (!ctx.env.SUPABASE_URL || !ctx.env.SUPABASE_KEY) return Response.json({ ok: false, error: 'Server sozlanmagan' }, { status: 503 });
  const sess = cachedAuthority(ctx) ?? await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT).catch(() => null);
  if (!sess) return Response.json({ ok: false, error: 'Kirish talab qilinadi' }, { status: 401 });
  if (!Number.isSafeInteger(sess.foydalanuvchi_id) || (sess.foydalanuvchi_id as number) <= 0) return Response.json({ ok: false, error: 'Sessiyada foydalanuvchi yo‘q' }, { status: 401 });
  return sess.foydalanuvchi_id as number;
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const a = await actor(ctx); if (a instanceof Response) return a;
  const u = new URL(ctx.request.url);
  const bolim = u.searchParams.get('bolim') || '';
  const nom = OQISH[bolim];
  if (!nom) return Response.json({ ok: false, error: 'Bo‘lim ochiq emas' }, { status: 400 });
  const yuk = oqishYuki(bolim, u.searchParams);
  if (typeof yuk === 'string') return Response.json({ ok: false, error: yuk }, { status: 400 });
  return rpc(ctx.env, nom, { p_actor_id: a, ...yuk });
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const a = await actor(ctx); if (a instanceof Response) return a;
  let so: Yuk = {};
  try { so = await ctx.request.json(); } catch { return Response.json({ ok: false, error: 'Noto‘g‘ri so‘rov' }, { status: 400 }); }
  const amal = String(so.amal || '');
  const nom = YOZISH[amal];
  if (!nom) return Response.json({ ok: false, error: 'Amal ochiq emas' }, { status: 400 });
  const yuk = yozishYuki(amal, so);
  if (typeof yuk === 'string') return Response.json({ ok: false, error: yuk }, { status: 400 });
  // Taklif kodi: ochiq kod bazaga HECH QACHON bormaydi.
  let ochiqKod: string | null = null;
  if (amal === 'taklif' || amal === 'ulash') { ochiqKod = yangiKod(); yuk.p_kod_xesh = await kodXeshi(ochiqKod); }
  if (amal === 'kod_qabul') yuk.p_kod_xesh = await kodXeshi(String(yuk.p_kod_xesh));
  const javob = await rpc(ctx.env, nom, { p_actor_id: a, ...yuk });
  if ((amal !== 'taklif' && amal !== 'ulash') || !ochiqKod || !javob.ok) return javob;
  const d = await javob.clone().json() as { ok?: boolean; kod_kerak?: boolean; qayta?: boolean } & Yuk;
  // Kod faqat shu chaqiruv uchun yaratilgan va ishlatilgan bo'lsa qaytariladi (qayta chaqiruvda eski kod ko'rsatilmaydi).
  return Response.json(d.ok && d.kod_kerak && !d.qayta ? { ...d, kod: ochiqKod } : d, JAVOB);
};
