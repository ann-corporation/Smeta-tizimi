/**
 * BUYURTMA (zayavka -> yetkazuvchi) amallari — /api/sb-yoz uchun RPC argumentlarini yig'uvchi (maydon OQ RO'YXATI).
 * Server: 20261108410000_t2_buyurtma_p3_v1 (prodda qo'llangan). Mijoz yuborgan ixtiyoriy JSON RPC ga xom uzatilmaydi:
 * har maydon turi/uzunligi tekshiriladi, ortiqchasi tashlanadi. Actor (p_actor_id) FAQAT sessiyadan.
 * RPC lar a'zolik, ruxsat, faol aloqa, egalik va holat mashinasini o'zi ham tekshiradi.
 *
 * Nega o'qish ham shu yerda: t2_buyurtmalar_v1 / t2_buyurtma_tafsilot_v1 prodda VOLATILE (provolatile = 'v'), /api/sb esa
 * faqat GET (STABLE) chaqiradi - GET bilan volatile RPC rad etiladi. Migratsiyasiz yo'l: POST /api/sb-yoz (faqat o'qiydi).
 * `stable` ga o'tkazilgach (migratsiya, L0) o'qish /api/sb ga ko'chiriladi va bu ikki amal olib tashlanadi.
 */
export const BUYURTMA_AMALLAR: ReadonlySet<string> = new Set([
  'buyurtma_yarat_v1', 'buyurtma_otish_v1', 'buyurtma_olish_yoz_v1', 'buyurtma_qabul_v1', 'buyurtma_qabul_yakunla_v1', 'buyurtma_royxat_v1', 'buyurtma_tafsilot_v1', 'buyurtma_tolov_holati_v1',
]);
/** Faqat o'qiydigan amallar (operation_id talab qilinmaydi). */
export const BUYURTMA_OQISH_AMALLAR: ReadonlySet<string> = new Set(['buyurtma_royxat_v1', 'buyurtma_tafsilot_v1', 'buyurtma_tolov_holati_v1']);

/** DB holatlari (`t2_buyurtma.holat` CHECK). Yetkazuvchi o'tkazadiganlar va xaridor o'tkazadiganlar — `_t2_buyurtma_otish_ruxsat`. */
export const BUYURTMA_HOLATLAR = ['yuborildi', 'qabul_qilindi', 'rad', 'bajarilmoqda', 'tayyor', 'topshirildi', 'qabul_qilindi_yakuniy', 'qisman', 'nizo', 'bekor'] as const;
export const IJROCHI_HOLATLARI: readonly string[] = ['qabul_qilindi', 'rad', 'bajarilmoqda', 'tayyor', 'topshirildi'];
const OTISH_HOLATLARI = ['qabul_qilindi', 'rad', 'bajarilmoqda', 'tayyor', 'topshirildi', 'qabul_qilindi_yakuniy', 'qisman', 'nizo', 'bekor'];
const YONALISH = ['meniki', 'menga'];

export type BuyurtmaYuk = { ok: true; yuk: Record<string, unknown> } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TUR = /^[a-z_]{2,40}$/;
const bad = (error: string): BuyurtmaYuk => ({ ok: false, error });
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null);
const id = (v: unknown): number | null => { const n = Number(v); return v != null && v !== '' && typeof v !== 'boolean' && Number.isSafeInteger(n) && n > 0 ? n : null; };
const matn = (v: unknown, max: number): string | null => (v == null || v === '' ? null : typeof v === 'string' ? v.slice(0, max) : null);
const bosh = (v: unknown): boolean => v == null || v === '';
/** Manfiy bo'lmagan son (0 ruxsat — ongli kiritilgan); noto'g'ri — 'XATO'; bo'sh — null. Narx noma'lum bo'lsa null, 0 emas. */
const son = (v: unknown): number | null | 'XATO' => {
  if (bosh(v)) return null;
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^[0-9]+(\.[0-9]+)?$/.test(v) ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 && n < 1e15 ? n : 'XATO';
};
const sana = (v: unknown): string | null | 'XATO' => (bosh(v) ? null : typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) && !Number.isNaN(Date.parse(v)) ? v.slice(0, 40) : 'XATO');

function idlar(v: unknown, max: number): number[] | null | 'XATO' {
  if (v == null) return null;
  if (!Array.isArray(v) || v.length > max) return 'XATO';
  const r = v.map(id);
  return r.some((n) => n == null) ? 'XATO' : r as number[];
}

export function buyurtmaYuk(amal: string, so: Record<string, unknown>, actorId: number | undefined | null): BuyurtmaYuk {
  if (!actorId || !Number.isSafeInteger(actorId)) return bad('Sessiyada foydalanuvchi yo‘q');
  const kompaniya = id(so.kompaniya_id);
  if (!kompaniya) return bad('kompaniya_id noto‘g‘ri');
  const oqish = BUYURTMA_OQISH_AMALLAR.has(amal);
  if (!oqish && (typeof so.operation_id !== 'string' || !UUID.test(so.operation_id))) {
    return bad('operation_id (UUID) majburiy — usiz takroriy so‘rov ikkinchi buyurtma yaratadi');
  }
  const asos = { p_actor_id: actorId, p_kompaniya_id: kompaniya };
  const asosYoz = { ...asos, p_operation_id: so.operation_id };
  const buyurtma = id(so.buyurtma_id);
  const versiya = so.kutilgan_versiya == null || so.kutilgan_versiya === '' ? null : Number(so.kutilgan_versiya);
  if (versiya != null && (!Number.isSafeInteger(versiya) || versiya < 0)) return bad('kutilgan_versiya noto‘g‘ri');

  switch (amal) {
    case 'buyurtma_royxat_v1': {
      if (typeof so.yonalish !== 'string' || !YONALISH.includes(so.yonalish)) return bad('yonalish noto‘g‘ri');
      if (!bosh(so.tur) && (typeof so.tur !== 'string' || !TUR.test(so.tur))) return bad('tur noto‘g‘ri');
      if (!bosh(so.holat) && (typeof so.holat !== 'string' || !(BUYURTMA_HOLATLAR as readonly string[]).includes(so.holat))) return bad('holat noto‘g‘ri');
      const lim = bosh(so.limit) ? 50 : Number(so.limit);
      if (!Number.isInteger(lim) || lim < 1 || lim > 100) return bad('limit noto‘g‘ri');
      if (!bosh(so.keyin_id) && !id(so.keyin_id)) return bad('keyin_id noto‘g‘ri');
      return { ok: true, yuk: { ...asos, p_yonalish: so.yonalish, p_tur: bosh(so.tur) ? null : so.tur, p_holat: bosh(so.holat) ? null : so.holat, p_limit: lim, p_keyin_id: id(so.keyin_id) } };
    }
    case 'buyurtma_tolov_holati_v1': return { ok: true, yuk: { ...asos } };   // yetkazuvchi: o'z qarzining to'lov holati (grant bo'yicha, 20261214600300)
    case 'buyurtma_tafsilot_v1': {
      if (!buyurtma) return bad('buyurtma_id noto‘g‘ri');
      return { ok: true, yuk: { ...asos, p_buyurtma_id: buyurtma } };
    }
    case 'buyurtma_yarat_v1': {
      const ijrochi = id(so.ijrochi_kompaniya_id);
      if (!ijrochi || ijrochi === kompaniya) return bad('ijrochi_kompaniya_id noto‘g‘ri');
      const tur = bosh(so.tur) ? 'material' : so.tur;
      if (typeof tur !== 'string' || !TUR.test(tur)) return bad('tur noto‘g‘ri');
      for (const k of ['aloqa_id', 'taklif_id', 'obyekt_id'] as const) if (!bosh(so[k]) && !id(so[k])) return bad(k + ' noto‘g‘ri');
      if (!Array.isArray(so.qatorlar) || so.qatorlar.length === 0 || so.qatorlar.length > 200) return bad('qatorlar: 1–200 ta bo‘lishi kerak');
      const qatorlar: Record<string, unknown>[] = [];
      for (const x of so.qatorlar) {
        const o = obj(x); if (!o) return bad('qatorlar noto‘g‘ri');
        const nom = matn(o.nom, 300)?.trim(), birlik = matn(o.birlik, 40)?.trim();
        const miqdor = son(o.miqdor), narx = son(o.narx);
        if (!nom || !birlik) return bad('Har qatorda nom va birlik majburiy');
        if (miqdor == null || miqdor === 'XATO' || miqdor <= 0) return bad('Miqdor musbat son bo‘lishi kerak');
        if (narx === 'XATO') return bad('Narx noto‘g‘ri');
        const muddat = bosh(o.muddat_kun) ? null : (Number(o.muddat_kun) === 0 ? 0 : id(o.muddat_kun));
        if (!bosh(o.muddat_kun) && (muddat == null || muddat > 3650)) return bad('muddat_kun noto‘g‘ri');
        if (!bosh(o.zayavka_id) && !id(o.zayavka_id)) return bad('zayavka_id noto‘g‘ri');
        if (!bosh(o.resurs_kodi) && (typeof o.resurs_kodi !== 'string' || o.resurs_kodi.length > 80)) return bad('resurs_kodi noto‘g‘ri');
        qatorlar.push({ nom, birlik, miqdor, narx, muddat_kun: muddat, resurs_kodi: matn(o.resurs_kodi, 80), zayavka_id: id(o.zayavka_id), izoh: matn(o.izoh, 1000) });
      }
      const s = obj(so.shart) ?? {};
      const oynaDan = sana(s.oyna_dan), oynaGacha = sana(s.oyna_gacha);
      if (oynaDan === 'XATO' || oynaGacha === 'XATO') return bad('shart sanalari noto‘g‘ri');
      const shart = Object.fromEntries(Object.entries({ manzil: matn(s.manzil, 300), oyna_dan: oynaDan, oyna_gacha: oynaGacha }).filter(([, v]) => v != null));
      return { ok: true, yuk: { ...asosYoz, p_tur: tur, p_ijrochi_kompaniya_id: ijrochi, p_aloqa_id: id(so.aloqa_id), p_taklif_id: id(so.taklif_id), p_obyekt_id: id(so.obyekt_id), p_qatorlar: qatorlar, p_shart: shart } };
    }
    case 'buyurtma_otish_v1': {
      if (!buyurtma || versiya == null) return bad('buyurtma_id va kutilgan_versiya majburiy');
      if (typeof so.holat !== 'string' || !OTISH_HOLATLARI.includes(so.holat)) return bad('holat noto‘g‘ri');
      if (!bosh(so.bosqich) && (typeof so.bosqich !== 'string' || !TUR.test(so.bosqich))) return bad('bosqich noto‘g‘ri');
      const h = idlar(so.dalil_hujjat_idlar, 10); if (h === 'XATO') return bad('dalil_hujjat_idlar noto‘g‘ri');
      return { ok: true, yuk: { ...asosYoz, p_buyurtma_id: buyurtma, p_kutilgan_versiya: versiya, p_holat: so.holat, p_bosqich: bosh(so.bosqich) ? null : so.bosqich, p_izoh: matn(so.izoh, 1000), p_dalil_hujjat_idlar: h } };
    }
    case 'buyurtma_olish_yoz_v1': {
      if (!buyurtma || versiya == null) return bad('buyurtma_id va kutilgan_versiya majburiy');
      const o = obj(so.olish); if (!o) return bad('olish noto‘g‘ri');
      const lat = bosh(o.lat) ? null : Number(o.lat), lng = bosh(o.lng) ? null : Number(o.lng);
      if ((lat == null) !== (lng == null)) return bad('lat va lng birga berilishi kerak');
      if (lat != null && lng != null && (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180)) return bad('koordinata noto‘g‘ri');
      const dan = sana(o.tayyor_dan), gacha = sana(o.tayyor_gacha);
      if (dan === 'XATO' || gacha === 'XATO') return bad('tayyor sanalari noto‘g‘ri');
      const olish = Object.fromEntries(Object.entries({ ombor_nomi: matn(o.ombor_nomi, 200), manzil: matn(o.manzil, 300), lat, lng, aloqa_tel: matn(o.aloqa_tel, 40), tayyor_dan: dan, tayyor_gacha: gacha }).filter(([, v]) => v != null));
      if (Object.keys(olish).length === 0) return bad('Olib ketish joyi (manzil yoki ombor nomi) majburiy');
      return { ok: true, yuk: { ...asosYoz, p_buyurtma_id: buyurtma, p_kutilgan_versiya: versiya, p_olish: olish } };
    }
    case 'buyurtma_qabul_v1': {
      if (!buyurtma || versiya == null) return bad('buyurtma_id va kutilgan_versiya majburiy');
      if (!Array.isArray(so.qatorlar) || so.qatorlar.length === 0 || so.qatorlar.length > 200) return bad('qatorlar: 1–200 ta bo‘lishi kerak');
      const qatorlar: Record<string, unknown>[] = [];
      for (const x of so.qatorlar) {
        const o = obj(x); const qid = o ? id(o.buyurtma_qator_id) : null; const m = o ? son(o.qabul_miqdor) : null;
        if (!o || !qid || m == null || m === 'XATO') return bad('Har qator uchun buyurtma_qator_id va qabul_miqdor (>= 0) majburiy');
        const h = bosh(o.holat) ? 'butun' : o.holat;
        if (typeof h !== 'string' || !['butun', 'shikast', 'kam'].includes(h)) return bad('qator holati noto‘g‘ri');
        qatorlar.push({ buyurtma_qator_id: qid, qabul_miqdor: m, holat: h, izoh: matn(o.izoh, 1000) });
      }
      const h = idlar(so.hujjat_idlar, 10); if (h === 'XATO') return bad('hujjat_idlar noto‘g‘ri');
      return { ok: true, yuk: { ...asosYoz, p_buyurtma_id: buyurtma, p_kutilgan_versiya: versiya, p_qatorlar: qatorlar, p_hujjat_idlar: h, p_izoh: matn(so.izoh, 1000) } };
    }
    case 'buyurtma_qabul_yakunla_v1': {
      /* Qabuldan keyin sklad kirimi + qarz asosi (20261211100000). Faqat id lar: miqdor/narx serverda buyurtma qatoridan olinadi. */
      if (!buyurtma) return bad('buyurtma_id noto‘g‘ri');
      if (!bosh(so.shartnoma_id) && !id(so.shartnoma_id)) return bad('shartnoma_id noto‘g‘ri');
      return { ok: true, yuk: { ...asosYoz, p_buyurtma_id: buyurtma, p_shartnoma_id: id(so.shartnoma_id) } };
    }
    default: return bad('Noma‘lum buyurtma amali');
  }
}
