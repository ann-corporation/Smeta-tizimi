/**
 * AMAL ADAPTERI (ekotizim V2, 3-qadam): mindmap kartasi (tugun «⋯» menyusi, chiziq tortish) va boshqa "tugma yuzalari" uchun amallar
 * AMAL REESTRIDAN (lib/reestr/amal.ts) tugun/obyekt turi bo'yicha olinadi — ikkinchi qo'lda yozilgan ro'yxat o'rniga. Sof funksiyalar.
 * Mindmap PR #378 (useTugunAmallar, lib/mindmap-boglanish.ts) tushgach: shu funksiyalar chaqiriladi, natija `kalit: 'reestr:' + amal.kalit`
 * bilan menyuga qo'shiladi; bosilganda `amalIshga(amal)` (Jarvis oqimi) yoki `amal.yol` (navigatsiya) bajariladi.
 */
import { AMALLAR, type Amal, type AmalMavzu } from './amal';
import { amalRoyxati, type AmalKontekst } from './amal-motor';

type Korish = Pick<AmalKontekst, 'permissions' | 'superadmin'>;

/** Mindmap tugun turi (graf) -> amal mavzusi. */
export const TUGUN_MAVZU: Readonly<Record<string, AmalMavzu>> = {
  kompaniya: 'kompaniya', loyiha: 'loyiha', obyekt: 'obyekt', shartnoma: 'shartnoma', kontragent: 'kontragent', zayavka: 'zayavka', tomon: 'tomon',
};

/** Tugun «⋯» menyusi: shu turdagi tugunda foydalanuvchi bajara oladigan amallar (ruxsat bo'yicha). */
export function tugunAmallari(tugunTuri: string, korish: Korish, royxat: readonly Amal[] = AMALLAR): Amal[] {
  const mavzu = TUGUN_MAVZU[tugunTuri];
  if (!mavzu) return [];
  return amalRoyxati(korish, royxat).filter((a) => a.mavzu?.includes(mavzu));
}

/** Chiziq tortish: ikki tugun turi orasida amal (ikkala mavzu ham amalda bo'lsa). Masalan obyekt + shartnoma -> «Shartnoma qo'shish». */
export function juftAmallari(a: string, b: string, korish: Korish, royxat: readonly Amal[] = AMALLAR): Amal[] {
  const x = TUGUN_MAVZU[a]; const y = TUGUN_MAVZU[b];
  if (!x || !y) return [];
  return amalRoyxati(korish, royxat).filter((m) => m.mavzu?.includes(x) && m.mavzu.includes(y));
}

/** Jarvis oqimini shu amal nomi bilan ochish uchun hodisa (AiHelper `ai:ochish` ni tinglaydi) — kartaning «bajar» tugmasi shuni chaqiradi. */
export function amalIshga(amal: Pick<Amal, 'nom' | 'kalit'>): void {
  try { window.dispatchEvent(new CustomEvent('ai:ochish', { detail: { savol: amal.nom ?? amal.kalit } })); } catch { /* SSR/test */ }
}