/**
 * Zanjirning «To'lov» qadami uchun shartnoma darajasidagi son: F3 (sotuv) jami, to'langan, qarz — hammasi QQS bilan.
 * Yangi hisob yo'q: mavjud `shartnomaSvodi` (nakopitelniy-svod, akt-sverka bilan bir xil) ishlatiladi; bu yerda faqat
 * obyektga bog'langan shartnomalarni tanlab tiyin yig'indisini so'mga aylantiramiz. Pul shartnoma darajasida —
 * bir shartnoma bir necha obyektga bog'langan bo'lishi mumkin (izohda aytiladi). NULL ≠ 0: bog'langan shartnoma yo'q — null.
 */
import { shartnomaSvodi, somga, type SvodShartnoma } from '../nakopitelniy-svod';

export type TolovHolati = { f3Jami: number; tolangan: number; qarz: number };

export function tolovHolatiSvoddan(shartnomalar: readonly SvodShartnoma[] | null | undefined, obyektId: number): TolovHolati | null {
  if (!shartnomalar) return null;
  const mos = shartnomalar.filter((s) => s.holat !== 'bekor' && Array.isArray(s.obyektlar) && s.obyektlar.some((o) => o.id === obyektId));
  if (mos.length === 0) return null;
  let f3 = 0; let tolov = 0; let qoldiq = 0;
  for (const s of mos) {
    const v = shartnomaSvodi(s);
    f3 += v.f3; tolov += v.tolov; qoldiq += v.qoldiq;
  }
  return { f3Jami: somga(f3), tolangan: somga(tolov), qarz: somga(qoldiq) };
}
