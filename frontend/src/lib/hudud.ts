/**
 * O'zbekiston hududlari (egasi 2026-10-03: chel.-soat narxi obyekt joylashuvidan — "maps dan lokatsiyasi berilsin,
 * tizim katalogdagi mos regionni aniqlasin yoki qo'lda tanlansin"). Kalitlar SQL t2_hudud_kalit bilan bir xil.
 *
 * Xaritadan taklif — eng yaqin hudud markazi bo'yicha TAXMIN (chegaraga yaqin joyda adashishi mumkin), shuning uchun
 * avtomatik yozilmaydi: operator tasdiqlaydi yoki qo'lda tanlaydi.
 */
export type HududKalit =
  | 'qoraqalpogiston' | 'andijon' | 'buxoro' | 'jizzax' | 'qashqadaryo' | 'navoiy' | 'namangan'
  | 'samarqand' | 'surxondaryo' | 'sirdaryo' | 'toshkent_vil' | 'fargona' | 'xorazm' | 'toshkent_sh';

export const HUDUDLAR: ReadonlyArray<{ kalit: HududKalit; nom: string; lat: number; lng: number }> = [
  { kalit: 'toshkent_sh', nom: 'Toshkent shahri', lat: 41.311, lng: 69.279 },
  { kalit: 'toshkent_vil', nom: 'Toshkent viloyati', lat: 41.044, lng: 69.358 },
  { kalit: 'andijon', nom: 'Andijon viloyati', lat: 40.783, lng: 72.344 },
  { kalit: 'buxoro', nom: 'Buxoro viloyati', lat: 39.768, lng: 64.421 },
  { kalit: 'jizzax', nom: 'Jizzax viloyati', lat: 40.116, lng: 67.842 },
  { kalit: 'qashqadaryo', nom: 'Qashqadaryo viloyati', lat: 38.861, lng: 65.789 },
  { kalit: 'navoiy', nom: 'Navoiy viloyati', lat: 40.103, lng: 65.374 },
  { kalit: 'namangan', nom: 'Namangan viloyati', lat: 40.998, lng: 71.672 },
  { kalit: 'samarqand', nom: 'Samarqand viloyati', lat: 39.654, lng: 66.959 },
  { kalit: 'surxondaryo', nom: 'Surxondaryo viloyati', lat: 37.224, lng: 67.278 },
  { kalit: 'sirdaryo', nom: 'Sirdaryo viloyati', lat: 40.490, lng: 68.784 },
  { kalit: 'fargona', nom: 'Farg‘ona viloyati', lat: 40.384, lng: 71.784 },
  { kalit: 'xorazm', nom: 'Xorazm viloyati', lat: 41.550, lng: 60.631 },
  { kalit: 'qoraqalpogiston', nom: 'Qoraqalpog‘iston Respublikasi', lat: 42.460, lng: 59.603 },
];

export const hududNomi = (k: string | null | undefined) => HUDUDLAR.find((h) => h.kalit === k)?.nom ?? null;

const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const r = Math.PI / 180;
  const d = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(d));
};

/** Xaritadagi nuqtadan TAXMINIY hudud. Toshkent shahri markazidan ~15 km ichida — shahar; aks holda eng yaqin markaz. */
export function joylashuvdanHudud(lat: number | null | undefined, lng: number | null | undefined): HududKalit | null {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  // O'zbekiston chegarasidan tashqari — taklif yo'q.
  if (lat < 37 || lat > 45.7 || lng < 55.9 || lng > 73.2) return null;
  const p = { lat, lng };
  const shahar = HUDUDLAR[0];
  if (km(p, shahar) <= 15) return 'toshkent_sh';
  let eng = HUDUDLAR[1];
  for (const h of HUDUDLAR.slice(1)) if (km(p, h) < km(p, eng)) eng = h;
  return eng.kalit;
}
