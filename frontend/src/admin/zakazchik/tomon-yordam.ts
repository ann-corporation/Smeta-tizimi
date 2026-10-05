/** Tomon sahifalari uchun komponent bo'lmagan yordamchilar (tomon-ui.tsx dagi komponentlar bilan birga ishlatiladi). */
import { tilOl } from '../../i18n/til';
import type { TomonResurs } from '../../api/t2-tomon';

export const ROL_TAKLIFLARI = ['pudratchi', 'zakazchik', 'subpudratchi', 'texnadzor', 'laboratoriya', 'taminotchi', 'loyihachi', 'investor', 'bank'] as const;
export const TUR_TAKLIFLARI = ['shartnoma', 'nazorat', 'ta‘minot', 'loyiha', 'moliya'] as const;

export const pul = (v: number | string | null | undefined) =>
  v == null || v === '' ? '—' : Number(v).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
export const sana = (v: string | null | undefined) => (v ? new Date(v).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : '—');
export const oyMatn = (v: string | null | undefined) => (v ? v.slice(0, 7) : '—');

/** Resurs nomi: DB katalogidan, til bo'yicha (ru → nom_ru, qolganlari — o'zbek). */
export function resursNomi(kalit: string, katalog: readonly TomonResurs[]): string {
  const r = katalog.find((x) => x.kalit === kalit);
  if (!r) return kalit;
  return (tilOl() === 'ru' && r.nom_ru) ? r.nom_ru : r.nom;
}

export const HODISA_NOMI: Record<string, string> = {
  taklif: 'Taklif yuborildi', qabul: 'Qabul qilindi', rad: 'Rad etildi', bekor: 'Taklif bekor qilindi', toxtatish: 'Aloqa to‘xtatildi', davom: 'Aloqa davom ettirildi', yopish: 'Aloqa yopildi',
  grant: 'Ruxsat berildi', grant_bekor: 'Ruxsat qaytarildi', taqdim: 'Hujjat yuborildi', korilmoqda: 'Ko‘rib chiqila boshlandi', qaror: 'Qaror', izoh: 'Izoh', qaytarish: 'Hujjat qaytarib olindi',
};

export const inp = 'rounded border border-border bg-bg px-2 py-1 text-sm outline-none focus:border-accent';
export const tugma = 'inline-flex items-center gap-1 rounded border border-border px-3 py-1 text-xs hover:border-accent disabled:opacity-40';
export const tugmaAsosiy = 'inline-flex items-center gap-1 rounded bg-accent px-3 py-1 text-xs text-white disabled:opacity-40';
