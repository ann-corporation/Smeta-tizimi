/**
 * Ombor = alohida mahsulot, obyekt tabi emas (egasi, «Bozor/Logistika» qoidasi).
 * Yuqori tanlov — OMBOR («Barcha omborlar»); obyekt faqat «Obyekt qoldiqlari»da (nimaga sarflandi) filtr bo'ladi.
 * Hech qaysi joyda jimgina «birinchi obyekt» tanlanmaydi.
 */
export const SKLAD_HAMMASI = 'hamma' as const;
export type SkladTanlovi = typeof SKLAD_HAMMASI | number;

/** Boshlang'ich ombor tanlovi: bitta ombor bo'lsa — o'sha, aks holda «Barcha omborlar». Avvalgi tanlov saqlanadi (agar hali bor bo'lsa). */
export function boshSkladTanlovi(skladlar: readonly { id: number }[], oldingi?: SkladTanlovi | null): SkladTanlovi {
  if (oldingi === SKLAD_HAMMASI && skladlar.length > 1) return SKLAD_HAMMASI;
  if (typeof oldingi === 'number' && skladlar.some((s) => s.id === oldingi)) return oldingi;
  return skladlar.length === 1 ? skladlar[0].id : SKLAD_HAMMASI;
}

/** Bitta omborga bog'liq amallar (kirim, chiqim, qoldiq) uchun aniq ombor; «Barcha omborlar»da — null (foydalanuvchi tanlaydi). */
export function aniqSklad<T extends { id: number }>(skladlar: readonly T[], tanlov: SkladTanlovi): T | null {
  return typeof tanlov === 'number' ? skladlar.find((s) => s.id === tanlov) ?? null : null;
}

export type ObyektQoldiqQator = { obyekt_id: number; qoldiq: number | null; oxirgi_harakat?: string | null };

/** «Obyekt qoldiqlari» filtri: null — barcha obyektlar; aks holda faqat shu obyekt. */
export function obyektFiltri<T extends ObyektQoldiqQator>(qatorlar: readonly T[], obyektId: number | null): T[] {
  return obyektId == null ? [...qatorlar] : qatorlar.filter((q) => q.obyekt_id === obyektId);
}

/** Obyekt bo'yicha: nechta pozitsiya berilgan (qoldiq yozuvi bor). Obyekti ro'yxatda yo'q qatorlar tashlanmaydi. */
export function obyektlarBoyicha(qatorlar: readonly ObyektQoldiqQator[], nomlar: ReadonlyMap<number, string>): { obyekt_id: number; nom: string; pozitsiya: number }[] {
  const m = new Map<number, number>();
  for (const q of qatorlar) m.set(q.obyekt_id, (m.get(q.obyekt_id) ?? 0) + 1);
  return [...m].map(([obyekt_id, pozitsiya]) => ({ obyekt_id, nom: nomlar.get(obyekt_id) ?? `#${obyekt_id}`, pozitsiya }))
    .sort((a, b) => b.pozitsiya - a.pozitsiya || a.nom.localeCompare(b.nom));
}

/** Chiqim (BERDIM): obyekt MAJBURIY va oldindan tanlanmaydi. */
export const berdimBoshObyekti = (): null => null;
export const chiqimObyektiBor = (obyektId: number | null | undefined): obyektId is number => Number.isSafeInteger(obyektId) && (obyektId as number) > 0;
