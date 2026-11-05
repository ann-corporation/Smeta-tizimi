/**
 * bildirishnoma-matn.ts — bildirishnoma mavzusi → odam o'qiydigan matn (o'zbek lotin = i18n kaliti) va sahifa havolasi.
 * Bitta manba: ilova qo'ng'iroqchasi (Qongiroqcha) va Telegram yetkazuvchisi (functions/_shared/bildirishnoma-yetkaz.ts).
 * Tarjima: src/i18n/lugat/qism/bildirishnoma.json (ru/en). Sof modul — DOM/fetch yo'q.
 */

/** Mavzu → o'zbek lotin matn (t() kaliti). Yangi mavzu qo'shilsa — shu yerga va bildirishnoma.json ga. */
export const BILDIRISHNOMA_MATN: Readonly<Record<string, string>> = {
  'hujjat.tasdiq_kutmoqda': 'Hujjat tasdiqingizni kutmoqda',
  'hujjat.tasdiqlandi': 'Hujjat tasdiqlandi',
  'hujjat.rad_etildi': 'Hujjat rad etildi',
  'hujjat.qaytarildi': 'Hujjat qayta ishlashga qaytarildi',
  'hujjat.xat_keldi': 'Sizga yangi xat keldi',
  'hujjat.muddat_yaqin': 'Hujjat muddati yaqinlashmoqda',
  'hujjat.muddat_otdi': 'Hujjat muddati o‘tib ketdi',
};

/** Muddat qatori (Telegram matnida va ro'yxatda). */
export const MUDDAT_MATN = 'Muddat: {muddat}';

/** Mavzu uchun matn kaliti; noma'lum mavzu — null (chaqiruvchi o'z zaxirasini ishlatadi). */
export function bildirishnomaMatnKaliti(mavzu: string): string | null {
  return Object.prototype.hasOwnProperty.call(BILDIRISHNOMA_MATN, mavzu) ? BILDIRISHNOMA_MATN[mavzu] : null;
}

const musbatId = (v: unknown): number | null => {
  const n = typeof v === 'string' && /^\d{1,15}$/.test(v) ? Number(v) : v;
  return typeof n === 'number' && Number.isSafeInteger(n) && n > 0 ? n : null;
};

/** Bildirishnoma bosilganda o'tadigan sahifa: aniq havola → hujjatning o'zi (xat/zanjir) → mavzu bo'limi. */
export function bildirishnomaHavolasi(b: { havola?: string | null; mavzu: string; parametrlar?: Record<string, unknown> | null }): string | null {
  if (b.havola && b.havola.startsWith('/')) return b.havola;
  const p = b.parametrlar ?? {};
  if (b.mavzu.startsWith('hujjat.')) {
    const xat = musbatId(p.xat_id);
    if (xat) return `/admin/hujjat-aylanish?xat=${xat}`;
    const zanjir = musbatId(p.zanjir_id);
    if (zanjir) return `/admin/hujjat-aylanish?zanjir=${zanjir}`;
    if (musbatId(p.murojaat_id)) return '/admin/murojaatlar';
    return '/admin/hujjat-aylanish';
  }
  if (b.mavzu.startsWith('tomon.')) return '/admin/murojaatlar';
  return null;
}

/** YYYY-MM-DD → DD.MM.YYYY (boshqa ko'rinish — o'zgarishsiz, bo'sh — null). */
export function muddatKorinishi(v: unknown): string | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim());
  return m ? `${m[3]}.${m[2]}.${m[1]}` : v.trim().slice(0, 20);
}
