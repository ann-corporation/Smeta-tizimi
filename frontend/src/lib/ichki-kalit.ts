/**
 * Ichki (mashina) kalitlarni foydalanuvchiga tushunarli yorliqqa aylantiradi (QA 2026-11-15: `company.context.read`,
 * `muddati_otgan_tolanmagan`, `v_boss_init` va h.k. xom holda ko'rinardi).
 * Tarjima — `i18n/lugat/qism/ichki-kalitlar.json` (ru/en). Lug'atda yo'q kalit — o'qiladigan matnga keltiriladi
 * («ish_haqi» → «Ish haqi»); to'liq texnik kalit title (tooltip) uchun `ichkiKalitTitle` bilan olinadi.
 * Faqat ko'rsatish — hisob/saqlash qiymatlariga tegmaydi.
 */
import { t } from '../i18n/til';

const NOM: Record<string, () => string> = {
  'company.context.read': () => t('Kompaniya kontekstini o‘qish'),
  'membership.read': () => t('A’zoliklarni o‘qish'),
  'permission.analyze': () => t('Ruxsatlarni tahlil qilish'),
  'finance.payment.prepare': () => t('To‘lovni tayyorlash'),
  muddati_otgan_tolanmagan: () => t('Muddati o‘tgan, to‘lanmagan'),
  nk_manba: () => t('Ustama manbasi'),
  document_missing: () => t('Majburiy hujjat qayd etilmagan'),
  muddat_tugadi: () => t('Muddat tugadi'),
  ai_sarf: () => t('AI sarfi'),
  sklad_kirim: () => t('Ombor kirimi'),
  tolov_majburiyatlari: () => t('To‘lov majburiyatlari'),
  ish_haqi: () => t('Ish haqi'),
  v_boss_init: () => t('Rahbar bosh ko‘rinishi'),
  warehouse_receipt: () => t('Ombor kirim hujjati'),
  smeta_res: () => t('Resurs vedomosti (RES)'),
  smeta_lrv: () => t('LRV'),
  document_canonical_stored: () => t('Hujjat saqlandi'),
  akt_podval_yoz: () => t('Akt podvalini yozish'),
};

const MASHINA_KALIT = /^[a-z][a-z0-9]*([._][a-z0-9]+)+$/;

/** Mashina kaliti (snake_case / nuqtali) ekanmi. */
export function ichkiKalitMi(kod: string | null | undefined): boolean {
  return !!kod && (kod in NOM || MASHINA_KALIT.test(kod));
}

/** Foydalanuvchi uchun yorliq. Kalit bo'lmagan oddiy matn o'zgarishsiz qaytadi. */
export function ichkiKalitNomi(kod: string | null | undefined): string {
  if (kod == null || kod === '') return '';
  const nom = NOM[kod];
  if (nom) return nom();
  if (!MASHINA_KALIT.test(kod)) return kod;
  const s = kod.replace(/[._]+/g, ' ').trim();
  return t(s.charAt(0).toUpperCase() + s.slice(1));
}

/** Tooltip uchun to'liq texnik kalit (faqat kalit bo'lsa; aks holda undefined). */
export function ichkiKalitTitle(kod: string | null | undefined): string | undefined {
  return ichkiKalitMi(kod) ? kod ?? undefined : undefined;
}
