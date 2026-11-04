/**
 * Uy sotish (20261124000000) — yozuvchi amallar uchun yuk (RPC parametrlari) yasash va tekshirish. SOF funksiya (Pages turlarisiz),
 * sb-yoz.ts shu yerga murojaat qiladi; testlar shuni import qiladi. Actor DOIM sessiyadan; kompaniya a'zoligini sb-yoz tekshiradi;
 * ruxsat (sales.*) va biznes qoidalarini RPC o'zi tekshiradi. Maydonlar oq ro'yxatdan, matnlar kesiladi.
 */
type Yuk = Record<string, unknown>;
type So = Record<string, unknown>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SANA = /^\d{4}-\d{2}-\d{2}$/;
const id = (v: unknown) => (v != null && v !== '' && Number.isSafeInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);
const son = (v: unknown) => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : Number.NaN);
const matn = (v: unknown, n = 500) => (v == null ? null : String(v).slice(0, n));

/** Obyekt (jsonb) maydonlarini oq ro'yxat bo'yicha ko'chiradi; faqat matn/son/bool/null. */
function oq(x: unknown, kalitlar: readonly string[], ichki: Record<string, readonly string[]> = {}): Yuk | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const r: Yuk = {};
  for (const k of kalitlar) {
    const v = (x as Record<string, unknown>)[k];
    if (v === undefined) continue;
    if (ichki[k]) { const o = oq(v, ichki[k]); if (o) r[k] = o; continue; }
    if (v !== null && !['string', 'number', 'boolean'].includes(typeof v)) continue;
    r[k] = typeof v === 'string' ? v.slice(0, 1000) : v;
  }
  return r;
}

const BIRLIK_KALIT = ['raqam', 'podyezd', 'qavat', 'tur', 'xona_soni', 'maydon', 'maydon_yashash', 'maydon_oshxona', 'maydon_balkon',
  'shift', 'pardoz', 'yon', 'manzara', 'planirovka_id', 'narx_m2', 'valyuta', 'holat', 'izoh'] as const;
const MIJOZ_KALIT = ['tur', 'fio', 'telefon', 'telefon2', 'email', 'pinfl', 'pasport', 'inn', 'manzil', 'manba', 'izoh', 'rozilik'] as const;
const BITIM_KALIT = ['id', 'kutilgan_versiya', 'mijoz_id', 'mijoz', 'birlik_id', 'loyiha_id', 'bosqich', 'manba', 'utm', 'masul_actor_id', 'narx_m2',
  'chegirma_foiz', 'summa', 'valyuta', 'kurs', 'tolov_turi', 'bank', 'ipoteka_dastur', 'subsidiya_summa', 'shartnoma_raqam', 'shartnoma_sana',
  'notarius_sana', 'kadastr_sana', 'eskrou_hisob', 'topshirildi_sana', 'bekor_sabab', 'keyingi_aloqa', 'izoh'] as const;
const LOYIHA_KALIT = ['reyestr_raqam', 'reyestr_sana', 'eskrou_bank', 'eskrou_hisob', 'topshirish_sana', 'tavsif', 'sotuvda', 'bron_soat'] as const;

export const SOTUV_AMALLAR = {
  sotuv_loyiha_saqla_v1: 't2_sotuv_loyiha_saqla_v1',
  sotuv_birlik_saqla_v1: 't2_sotuv_birlik_saqla_v1',
  sotuv_narx_ozgartir_v1: 't2_sotuv_narx_ozgartir_v1',
  sotuv_birlik_holat_v1: 't2_sotuv_birlik_holat_v1',
  sotuv_bitim_saqla_v1: 't2_sotuv_bitim_saqla_v1',
  sotuv_bron_v1: 't2_sotuv_bron_v1',
  sotuv_bron_bekor_v1: 't2_sotuv_bron_bekor_v1',
  sotuv_grafik_saqla_v1: 't2_sotuv_grafik_saqla_v1',
  sotuv_tolov_yoz_v1: 't2_sotuv_tolov_yoz_v1',
  sotuv_tolov_bekor_v1: 't2_sotuv_tolov_bekor_v1',
} as const;
export type SotuvAmal = keyof typeof SOTUV_AMALLAR;
export const sotuvAmalmi = (a: string): a is SotuvAmal => Object.prototype.hasOwnProperty.call(SOTUV_AMALLAR, a);

/** Yuk yoki xato matni (400). */
export function sotuvYuk(amal: SotuvAmal, so: So, actorId: number): Yuk | string {
  const kid = id(so.kompaniya_id);
  if (!kid) return 'kompaniya_id noto‘g‘ri';
  if (!Number.isSafeInteger(actorId) || actorId <= 0) return 'Sessiyada foydalanuvchi yo‘q';
  const op = String(so.operation_id ?? '');
  const opKerak = !['sotuv_birlik_holat_v1', 'sotuv_bron_bekor_v1', 'sotuv_tolov_bekor_v1'].includes(amal);
  if (opKerak && !UUID.test(op)) return 'operation_id UUID bo‘lishi shart';
  const bosh: Yuk = { p_kompaniya_id: kid, p_actor_id: actorId };
  switch (amal) {
    case 'sotuv_loyiha_saqla_v1': {
      const lid = id(so.loyiha_id); const p = oq(so.p, LOYIHA_KALIT);
      if (!lid || !p) return 'loyiha_id va sozlama kerak';
      return { ...bosh, p_loyiha_id: lid, p, p_operation_id: op };
    }
    case 'sotuv_birlik_saqla_v1': {
      const oid = id(so.obyekt_id);
      if (!oid || !Array.isArray(so.qatorlar) || so.qatorlar.length === 0 || so.qatorlar.length > 3000) return 'obyekt_id va 1..3000 qator kerak';
      const qatorlar = so.qatorlar.map((q) => oq(q, BIRLIK_KALIT));
      if (qatorlar.some((q) => !q || !String(q.raqam ?? '').trim())) return 'Har qatorda raqam bo‘lishi shart';
      return { ...bosh, p_obyekt_id: oid, p_qatorlar: qatorlar, p_operation_id: op };
    }
    case 'sotuv_narx_ozgartir_v1': {
      const ids = Array.isArray(so.birlik_ids) ? so.birlik_ids.map(id) : null;
      const q = son(so.qiymat);
      if (!ids || ids.length === 0 || ids.length > 5000 || ids.some((x) => x == null)) return 'birlik_ids 1..5000 kerak';
      if (!['foiz', 'summa_m2', 'yangi_m2'].includes(String(so.usul)) || q == null || Number.isNaN(q)) return 'usul/qiymat noto‘g‘ri';
      return { ...bosh, p_birlik_ids: ids, p_usul: so.usul, p_qiymat: q, p_sabab: matn(so.sabab, 300), p_operation_id: op };
    }
    case 'sotuv_birlik_holat_v1': {
      const bid = id(so.birlik_id); const v = Number(so.kutilgan_versiya);
      if (!bid || !Number.isInteger(v)) return 'birlik_id va kutilgan_versiya kerak';
      return { ...bosh, p_birlik_id: bid, p_holat: matn(so.holat, 20), p_sabab: matn(so.sabab, 300), p_kutilgan_versiya: v };
    }
    case 'sotuv_bitim_saqla_v1': {
      const p = oq(so.p, BITIM_KALIT, { mijoz: MIJOZ_KALIT });
      if (!p) return 'bitim maydonlari kerak';
      if (p.utm != null && typeof so.p === 'object') { const u = oq((so.p as So).utm, ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']); if (u) p.utm = u; else delete p.utm; }
      if (p.id == null && p.mijoz_id == null && !p.mijoz) return 'Yangi bitim uchun mijoz kerak';
      if (p.id != null && !Number.isInteger(Number(p.kutilgan_versiya))) return 'kutilgan_versiya kerak';
      return { ...bosh, p, p_operation_id: op };
    }
    case 'sotuv_bron_v1': {
      const bitim = id(so.bitim_id); const birlik = id(so.birlik_id); const soat = so.soat == null ? null : Number(so.soat);
      if (!bitim || !birlik) return 'bitim_id va birlik_id kerak';
      if (soat != null && (!Number.isInteger(soat) || soat < 1 || soat > 720)) return 'soat 1..720';
      const t = son(so.tolov_summa); if (Number.isNaN(t)) return 'tolov_summa noto‘g‘ri';
      return { ...bosh, p_bitim_id: bitim, p_birlik_id: birlik, p_soat: soat, p_tolov_summa: t, p_operation_id: op };
    }
    case 'sotuv_bron_bekor_v1': {
      const bron = id(so.bron_id); if (!bron) return 'bron_id kerak';
      return { ...bosh, p_bron_id: bron, p_sabab: matn(so.sabab, 300) };
    }
    case 'sotuv_grafik_saqla_v1': {
      const bitim = id(so.bitim_id);
      if (!bitim || !Array.isArray(so.qatorlar) || so.qatorlar.length === 0 || so.qatorlar.length > 600) return 'bitim_id va 1..600 qator kerak';
      const qatorlar = so.qatorlar.map((q) => oq(q, ['sana', 'summa', 'tur']));
      if (qatorlar.some((q) => !q || !SANA.test(String(q.sana)) || !(Number(q.summa) > 0))) return 'Har qatorda sana (YYYY-MM-DD) va musbat summa kerak';
      return { ...bosh, p_bitim_id: bitim, p_qatorlar: qatorlar, p_operation_id: op };
    }
    case 'sotuv_tolov_yoz_v1': {
      const bitim = id(so.bitim_id); const s = son(so.summa);
      if (!bitim || s == null || Number.isNaN(s) || s <= 0 || !SANA.test(String(so.sana))) return 'bitim_id, sana va musbat summa kerak';
      return { ...bosh, p_bitim_id: bitim, p_sana: so.sana, p_summa: s, p_tur: matn(so.tur ?? 'tolov', 20), p_usul: matn(so.usul ?? 'bank', 20),
        p_hujjat: matn(so.hujjat, 100), p_izoh: matn(so.izoh, 500), p_operation_id: op };
    }
    case 'sotuv_tolov_bekor_v1': {
      const t = id(so.tolov_id); if (!t) return 'tolov_id kerak';
      return { ...bosh, p_sotuv_tolov_id: t, p_sabab: matn(so.sabab, 300) };
    }
  }
}
