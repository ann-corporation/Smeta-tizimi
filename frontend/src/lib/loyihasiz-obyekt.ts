/**
 * Loyihasiz obyektlar (egasi qoidasi): loyihaga biriktirilmagan obyekt HECH QAYERDA yashirilmaydi.
 * Sof yordamchilar: ajratish, loyiha tanlovi bilan birga ko'rsatish va nom bo'yicha dublikat qidirish.
 */

type LoyihaBilan = { loyiha_id?: number | null };
type NomBilan = { id: number; nom: string | null; kompaniya_id?: number | null };

/** Obyekt loyihaga biriktirilmagan (NULL; 0 boshqa ma'no emas, lekin ham loyihasiz hisoblanmaydi). */
export const loyihasizMi = (o: LoyihaBilan): boolean => o.loyiha_id == null;

export function loyihasizObyektlar<T extends LoyihaBilan>(objects: readonly T[]): T[] {
  return objects.filter(loyihasizMi);
}

/**
 * Loyiha tanlanganda: shu loyihaning obyektlari + alohida guruhda loyihasizlar.
 * `projectId == null` — filtr yo'q: hamma obyekt (loyihasizlar ham) `loyihali`da, `loyihasiz` bo'sh.
 */
export function loyihaBoyichaObyektlar<T extends LoyihaBilan>(objects: readonly T[], projectId: number | null): { loyihali: T[]; loyihasiz: T[] } {
  if (projectId == null) return { loyihali: [...objects], loyihasiz: [] };
  return { loyihali: objects.filter((o) => o.loyiha_id === projectId), loyihasiz: loyihasizObyektlar(objects) };
}

/** Nomni solishtirish uchun: kichik harf, ketma-ket bo'shliqlar bitta, defis atrofidagi bo'shliqlar olib tashlanadi. */
export function obyektNomNormalla(nom: string | null | undefined): string {
  return String(nom ?? '')
    .toLocaleLowerCase('ru')
    .replace(/[‐-―−]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*/g, '-')
    .trim();
}

/** Kompaniyada normallashgan nomi bir xil obyektlar (boshqa kompaniya obyektlari hisobga olinmaydi). */
export function nomiBirXilObyektlar<T extends NomBilan>(objects: readonly T[], nom: string, kompaniyaId: number, istisnoId?: number | null): T[] {
  const kalit = obyektNomNormalla(nom);
  if (!kalit) return [];
  return objects.filter((o) => (o.kompaniya_id == null || o.kompaniya_id === kompaniyaId) && o.id !== istisnoId && obyektNomNormalla(o.nom) === kalit);
}
