/**
 * /api/mutaxassis shlyuzining SOF mantiqi (Pages turlarisiz; testlar shuni import qiladi).
 * T6 «Mutaxassis profili va xizmat taklifi» (egasi 2026-10-22: «PTO bo'lib kompaniyaga xizmatlarimni taklif qilish kuchi»).
 */
type Yuk = Record<string, unknown>;
export const KASBLAR = ['pto', 'smetachi', 'prorab', 'loyihachi', 'bugalter', 'muhandis'] as const;
export const XIZMAT_ROLLARI = ['pto', 'prorab', 'bugalter', 'kuzatuvchi'] as const;
const sonmi = (v: unknown) => v != null && v !== '' && Number.isSafeInteger(Number(v)) && Number(v) > 0;
const matn = (v: unknown, n: number) => (v == null || String(v).trim() === '' ? null : String(v).replace(/\s+/g, ' ').trim().slice(0, n));

/** O'qish bo'limi → RPC va yuk (actor shlyuzda qo'shiladi). */
export function oqishYuki(bolim: string, q: URLSearchParams): { rpc: string; yuk: Yuk } | string {
  switch (bolim) {
    case 'profil': return { rpc: 't2_mutaxassis_profil_ol_v1', yuk: {} };
    case 'takliflarim': return { rpc: 't2_xizmat_takliflarim_v1', yuk: {} };
    case 'kompaniya_qidir': return { rpc: 't2_xizmat_kompaniya_qidir_v1', yuk: { p_matn: matn(q.get('matn'), 120) ?? '' } };
    case 'kelgan':
      if (!sonmi(q.get('kompaniya_id'))) return 'kompaniya_id kerak';
      return { rpc: 't2_xizmat_takliflar_kelgan_v1', yuk: { p_kompaniya_id: Number(q.get('kompaniya_id')) } };
    case 'mutaxassislar': {
      if (!sonmi(q.get('kompaniya_id'))) return 'kompaniya_id kerak';
      const kasb = q.get('kasb') ?? '';
      if (kasb && !(KASBLAR as readonly string[]).includes(kasb)) return 'Kasb noto‘g‘ri';
      return { rpc: 't2_mutaxassislar_qidir_v1', yuk: { p_kompaniya_id: Number(q.get('kompaniya_id')), p_kasb: kasb, p_matn: matn(q.get('matn'), 120) ?? '' } };
    }
    default: return 'Bo‘lim ochiq emas';
  }
}

/** Yozish amali → RPC va yuk. Actor yukka qo'shilmaydi (faqat sessiyadan). */
export function yozishYuki(amal: string, so: Yuk): { rpc: string; yuk: Yuk } | string {
  switch (amal) {
    case 'profil_saqla': {
      const kasb = String(so.kasb ?? '');
      if (!(KASBLAR as readonly string[]).includes(kasb)) return 'Kasbni tanlang';
      const yil = so.tajriba_yil == null || so.tajriba_yil === '' ? null : Number(so.tajriba_yil);
      if (yil != null && (!Number.isInteger(yil) || yil < 0 || yil > 60)) return 'Tajriba 0–60 yil';
      const xizmatlar = Array.isArray(so.xizmatlar) ? (so.xizmatlar as unknown[]).map((x) => matn(x, 60)).filter((x): x is string => !!x).slice(0, 20) : [];
      return { rpc: 't2_mutaxassis_profil_saqla_v1', yuk: { p_ochiq: so.ochiq === true, p_kasb: kasb, p_hudud: matn(so.hudud, 80), p_tajriba_yil: yil,
        p_xizmatlar: xizmatlar, p_haqida: so.haqida == null ? null : String(so.haqida).trim().slice(0, 1500), p_statistika_korsat: so.statistika_korsat !== false } };
    }
    case 'taklif_yubor': {
      if (!sonmi(so.kompaniya_id)) return 'Kompaniyani tanlang';
      const rol = String(so.rol ?? 'pto');
      if (!(XIZMAT_ROLLARI as readonly string[]).includes(rol)) return 'Rol noto‘g‘ri';
      return { rpc: 't2_xizmat_taklif_yubor_v1', yuk: { p_kompaniya_id: Number(so.kompaniya_id), p_rol: rol, p_xabar: so.xabar == null ? null : String(so.xabar).trim().slice(0, 1000) } };
    }
    case 'taklif_bekor':
      if (!sonmi(so.taklif_id)) return 'taklif_id kerak';
      return { rpc: 't2_xizmat_taklif_bekor_v1', yuk: { p_taklif_id: Number(so.taklif_id) } };
    case 'taklif_javob':
      if (!sonmi(so.kompaniya_id) || !sonmi(so.taklif_id) || typeof so.qabul !== 'boolean') return 'kompaniya_id, taklif_id va qabul kerak';
      return { rpc: 't2_xizmat_taklif_javob_v1', yuk: { p_kompaniya_id: Number(so.kompaniya_id), p_taklif_id: Number(so.taklif_id), p_qabul: so.qabul,
        p_izoh: so.izoh == null ? null : String(so.izoh).trim().slice(0, 500) } };
    case 'ochiq_profil':
      if (!sonmi(so.kompaniya_id) || typeof so.ochiq !== 'boolean') return 'kompaniya_id va ochiq kerak';
      return { rpc: 't2_kompaniya_ochiq_profil_v1', yuk: { p_kompaniya_id: Number(so.kompaniya_id), p_ochiq: so.ochiq } };
    default: return 'Amal ochiq emas';
  }
}
