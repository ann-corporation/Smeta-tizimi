/**
 * YOZISH IZOLYATSIYASI — /api/sb-yoz uchun yagona "ega tekshiruvi" (egasi 2026-10-02: NTB ↔ Discover Invest).
 *
 * 2026-10-02 auditi: ~70 ta yozuvchi RPC kompaniya a'zoligini O'ZI tekshirmaydi va yozuvni faqat ID bo'yicha topadi
 * (p_tolov_id, p_qator_id, p_id…). Shlyuz esa faqat so'rovdagi `kompaniya_id` ni tekshirardi — o'z kompaniyasi ID si
 * + BOSHQA kompaniyaning to'lov/qator/akt ID si bilan kelgan so'rov o'tib ketardi.
 *
 * Endi: RPC ga ketadigan YAKUNIY argumentlar (yuk) dagi har ID ning egasi bazadan aniqlanadi va foydalanuvchi o'sha
 * kompaniyaga a'zo bo'lishi shart. `p_id` ning ma'nosi amalga bog'liq — P_ID_JADVAL da aniq yozilgan; yozilmagan amalda
 * `p_id` kelsa — rad (DEFAULT DENY).
 */

/** Argument nomi → jadval (har jadvalda `id` va `kompaniya_id` bor). */
export const ID_JADVAL: Readonly<Record<string, string>> = {
  p_obyekt_id: 't2_obyekt',
  p_qator_id: 't2_qator', p_ota_qator_id: 't2_qator', p_almashtirilayotgan_qator_id: 't2_qator',
  p_keyin_qator_id: 't2_qator', p_ota_id: 't2_qator', p_keyin_id: 't2_qator',
  p_akt_id: 't2_akt', p_source_akt_id: 't2_akt',
  p_job_id: 't2_f2_import_job',
  p_viborka_id: 't2_viborka',
  p_shartnoma_id: 't2_shartnoma',
  p_tolov_id: 't2_tolov',
  p_xarajat_id: 't2_xarajat',
  p_loyiha_id: 't2_loyiha',
  p_aosr_id: 't2_aosr',
  p_protokol_id: 't2_lab_protokol',
  p_azolik_id: 't2_azolik',
  p_document_id: 't2_document_registry',
};
/** Massiv argumentlar. */
export const IDLAR_JADVAL: Readonly<Record<string, string>> = { p_aosr_ids: 't2_aosr', p_qator_ids: 't2_qator', p_obyektlar: 't2_obyekt' };

/** `p_id` — amalga qarab qaysi jadval (null = p_id bu amalda ishlatilmaydi / mindmap kabi o'zi tekshiradi). */
export const P_ID_JADVAL: Readonly<Record<string, string>> = {
  aosr_yoz: 't2_aosr', aosr_bekor: 't2_aosr', aosr_yoz_v2: 't2_aosr',
  lab_protokol_yoz: 't2_lab_protokol', lab_protokol_bekor: 't2_lab_protokol',
  nakrutka_podval_saqla: 't2_nakrutka_podval', nakrutka_podval_ochir: 't2_nakrutka_podval',
  narx_manba_yoz: 't2_narx_manba', narx_manba_bekor: 't2_narx_manba',
  hujjat_ochir: 't2_obyekt_hujjat',
  loyiha_yangila: 't2_loyiha', loyiha_ochir: 't2_loyiha',
  obyekt_yangila: 't2_obyekt',
  kontragent_ochir: 't2_kontragent',
  material_alias_ochir: 't2_material_alias',
  loyiha_qatnashchi_ochir: 't2_loyiha_qatnashchi',
  faktura_yoz: 't2_faktura',
  ish_turi_yoz: 't2_ish_turi', ish_turi_saqla_v1: 't2_ish_turi',
  shartnoma_saqla_v2: 't2_shartnoma',
  grafik_yangilash: 't2_grafik_qator', grafik_sozlama_saqla: 't2_grafik_qator',
  kompaniya_yangila: 't2_kompaniya',
  narx_protokol_tasdiqla: 't2_price_basis', narx_protokol_bekor: 't2_price_basis',
};
/** `p_id` ni o'zi a'zolik bilan tekshiradigan (kompaniya + actor bilan chaqiriladigan) amallar. */
const P_ID_OZI_TEKSHIRADI = new Set(['mindmap_tugun_ochir', 'resurs_yangila_v2', 'resurs_bekor_v2',
  /* platforma katalogi (kompaniya_id NULL) — RPC superadminlikni tekshiradi (_t2_boshqaruv_tekshir). */
  'platforma_narx_manba_yoz', 'platforma_narx_manba_bekor']);
/** Korzinka: `p_jadval` + `p_id` (jadval shlyuzda oq ro'yxatdan). */
const KORZINKA = new Set(['korzinkaga_tashlash', 'korzinkadan_tiklash', 'butunlay_ochirish']);
/** `p_kompaniya_id` — maqsad kompaniya (superadmin to'ldiradi/obuna beradi; RPC superadminligini tekshiradi). */
const MAQSAD_KOMPANIYA = new Set(['token_toldir_v1', 'obuna_belgila_v1']);
const RESURS_JADVAL: Readonly<Record<string, string>> = { sklad: 't2_sklad_mustaqil', kadr: 't2_kadr_mustaqil', texnika: 't2_texnika_mustaqil' };

export type EgaSorov = { jadval: string; idlar: number[] };
export type YozishQaror = { ok: true; kompaniyalar: number[]; sorovlar: EgaSorov[] } | { ok: false; status: number; error: string };

const musbat = (v: unknown): number | null => {
  const n = Number(v);
  return v != null && v !== '' && Number.isSafeInteger(n) && n > 0 ? n : null;
};

/** Yuk dan: to'g'ridan tekshiriladigan kompaniyalar va egasi bazadan aniqlanadigan (jadval, id) lar. */
export function yozishTalablari(amal: string, xom: Record<string, unknown>): YozishQaror {
  // Bitta jsonb so'rov (`p_request`) bilan chaqiriladigan RPC lar: ichki maydonlar ham xuddi shunday tekshiriladi.
  const ichki = xom.p_request && typeof xom.p_request === 'object' && !Array.isArray(xom.p_request)
    ? Object.fromEntries(Object.entries(xom.p_request as Record<string, unknown>).map(([k, v]) => ['p_' + k, v])) : {};
  const yuk: Record<string, unknown> = { ...ichki, ...xom };
  const kompaniyalar: number[] = [];
  const map = new Map<string, Set<number>>();
  const qosh = (jadval: string, id: number) => { if (!map.has(jadval)) map.set(jadval, new Set()); map.get(jadval)!.add(id); };

  if (!MAQSAD_KOMPANIYA.has(amal)) {
    const k = musbat(yuk.p_kompaniya_id);
    if (k) kompaniyalar.push(k);
  }
  for (const [arg, jadval] of Object.entries(ID_JADVAL)) {
    const id = musbat(yuk[arg]);
    if (id) qosh(jadval, id);
  }
  for (const [arg, jadval] of Object.entries(IDLAR_JADVAL)) {
    const v = yuk[arg];
    if (Array.isArray(v)) for (const x of v) { const id = musbat(x); if (id) qosh(jadval, id); }
  }
  // p_qatorlar: [{qator_id}] — smeta qatorlari ham tekshiriladi (fakt/akt/F2 qoralama).
  if (Array.isArray(yuk.p_qatorlar)) {
    for (const q of yuk.p_qatorlar) {
      const id = q && typeof q === 'object' ? musbat((q as Record<string, unknown>).qator_id) : null;
      if (id) qosh('t2_qator', id);
    }
  }
  const pId = musbat(yuk.p_id);
  if (pId) {
    if (KORZINKA.has(amal)) {
      const j = String(yuk.p_jadval || '');
      if (!['t2_obyekt', 't2_shaxsiy_smeta', 't2_sklad_harakat'].includes(j)) return { ok: false, status: 400, error: 'Bu jadval boshqarilmaydi' };
      qosh(j, pId);
    } else if (amal === 'kompaniya_yangila') {
      kompaniyalar.push(pId);
    } else if (P_ID_JADVAL[amal]) {
      qosh(P_ID_JADVAL[amal], pId);
    } else if (!P_ID_OZI_TEKSHIRADI.has(amal)) {
      return { ok: false, status: 403, error: 'Bu amal uchun yozuv egasini aniqlab bo‘lmadi' };
    }
  }
  const resursId = musbat(yuk.p_resurs_id);
  if (resursId) {
    const j = RESURS_JADVAL[String(yuk.p_tur || '')];
    if (!j) return { ok: false, status: 400, error: 'Resurs turi noto‘g‘ri' };
    qosh(j, resursId);
  }
  return { ok: true, kompaniyalar, sorovlar: [...map].map(([jadval, s]) => ({ jadval, idlar: [...s] })) };
}

/** Egalik tekshiriladigan jadvallar — FAQAT shular o'qiladi (GET, `id,kompaniya_id`). */
export const EGA_JADVALLARI: ReadonlySet<string> = new Set([
  ...Object.values(ID_JADVAL), ...Object.values(IDLAR_JADVAL), ...Object.values(P_ID_JADVAL),
  ...Object.values(RESURS_JADVAL), 't2_shaxsiy_smeta', 't2_sklad_harakat',
]);

/** Egalarni bazadan o'qiydi (service_role, faqat o'qish). Xato bo'lsa — null (chaqiruvchi fail-closed qiladi). */
export async function egalarniOqi(baseUrl: string, kalit: string, sorovlar: readonly EgaSorov[]): Promise<Map<string, Map<number, number | null>> | null> {
  const topilgan = new Map<string, Map<number, number | null>>();
  for (const s of sorovlar) {
    if (!EGA_JADVALLARI.has(s.jadval) || s.idlar.length > 2000) return null;
    const m = new Map<number, number | null>();
    for (let i = 0; i < s.idlar.length; i += 300) {
      const bolak = s.idlar.slice(i, i + 300);
      const r = await fetch(`${baseUrl}/rest/v1/${s.jadval}?select=id,kompaniya_id&id=in.(${bolak.join(',')})`,
        { headers: { apikey: kalit, Authorization: 'Bearer ' + kalit } });
      if (!r.ok) return null;
      for (const row of await r.json() as Array<{ id: number; kompaniya_id: number | null }>) {
        m.set(Number(row.id), row.kompaniya_id == null ? null : Number(row.kompaniya_id));
      }
    }
    topilgan.set(s.jadval, m);
  }
  return topilgan;
}

/** Bazadan topilgan egalar bo'yicha yakuniy qaror: har id topilishi va a'zo kompaniyaniki bo'lishi shart. */
export function egaQarori(azo: readonly number[], talab: { kompaniyalar: number[]; sorovlar: EgaSorov[] },
  topilgan: ReadonlyMap<string, ReadonlyMap<number, number | null>>): { ok: true } | { ok: false; status: number; error: string } {
  for (const k of talab.kompaniyalar) if (!azo.includes(k)) return { ok: false, status: 403, error: 'Bu kompaniyaga a’zo emassiz' };
  for (const s of talab.sorovlar) {
    const t = topilgan.get(s.jadval);
    for (const id of s.idlar) {
      const k = t?.get(id);
      if (k == null) return { ok: false, status: 403, error: 'Yozuv topilmadi yoki ruxsat yo‘q' };
      if (!azo.includes(k)) return { ok: false, status: 403, error: 'Bu ma’lumot boshqa kompaniyaga tegishli' };
    }
  }
  return { ok: true };
}
