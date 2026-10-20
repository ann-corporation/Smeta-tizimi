/* Ota yozuv (obyekt / loyiha / viborka) kompaniyasining qisqa keshi — izolyat xotirasida, 60 s.
   Baza uzoqda (ap-southeast-2, ~0.3 s borib-kelish) va har `/api/sb` o'qishi shu tekshiruvni ketma-ket bajarardi.
   Faqat topilgan kompaniya saqlanadi; foydalanuvchining a'zoligi har so'rovda baribir yangidan tekshiriladi. */
const OTA_KESH_MS = 60_000;
const kesh = new Map<string, { k: number; gacha: number }>();

export function otaKeshOl(jadval: string, id: number): number | null {
  const b = kesh.get(jadval + ':' + id);
  return b && b.gacha > Date.now() ? b.k : null;
}

export function otaKeshYoz(jadval: string, id: number, k: number): void {
  if (kesh.size > 5000) kesh.clear();
  kesh.set(jadval + ':' + id, { k, gacha: Date.now() + OTA_KESH_MS });
}

/** Testlar uchun. */
export function otaKeshTozala(): void { kesh.clear(); }
