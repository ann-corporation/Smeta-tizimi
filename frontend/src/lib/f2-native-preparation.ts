/** Native F2 tayyorlash: faqat kanonik Fakt qoldig'i + hujjatning aniq qiymatlari. */
export type F2NativeCandidate = {
  qatorId: number;
  /** Chegara — FAKTdan olinadi: fakt − allaqachon olingan F2. */
  f2Mumkin: number;
  /** Smeta hajmi. Berilsa, smetadan oshgan qism uchun OGOHLANTIRISH beriladi
   *  (bloklamaydi). Egasining qoidasi: smeta 10 m³, fakt 12 m³ bo'lsa
   *  Forma-2 ham 12 bo'lishi mumkin — faqat 2 m³ uchun ogohlantirish. */
  smetaHajm?: number;
  /** Shu qator bo'yicha ilgari olingan F2 (kumulyativ ogohlantirish uchun). */
  f2Olingan?: number;
};

export type F2NativeInput = {
  qatorId: number;
  quantity: string;
  unitPrice: string;
  amount: string;
  sourceReference: string;
  priceIntentionallyAbsent: boolean;
};

export type F2NativeIssue = {
  qatorId: number;
  code: 'QTY_INVALID' | 'QTY_EXCEEDS_FAKT' | 'SOURCE_REQUIRED' | 'PRICE_REQUIRED' | 'AMOUNT_REQUIRED'
    | 'ARITHMETIC_MISMATCH' | 'QTY_EXCEEDS_SMETA';
  blocking: boolean;
  /** `QTY_EXCEEDS_SMETA` uchun — smetadan qancha oshgani (ogohlantirishda ko'rsatiladi). */
  oshiq?: number;
};

export type F2NativePayloadRow = {
  qatorId: number;
  certifiedQuantity: number;
  certifiedUnitPrice?: number;
  certifiedAmount?: number;
  priceIntentionallyAbsent: boolean;
  rawSnapshot: { source: 'native_f2_preparation'; sourceReference: string; enteredQuantity: number; enteredUnitPrice?: number; enteredAmount?: number };
};

const numberOrUndefined = (value: string) => {
  const text = value.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return undefined;
  const number = Number(text);
  return Number.isFinite(number) ? number : undefined;
};

/**
 * Smeta narxi bilan hech qachon to'ldirmaydi. Faqat shu F2 hujjatidan
 * qo'lda kiritilgan exact triplet DBga o'tadi.
 */
export function f2NativePayloadQur(inputs: F2NativeInput[], candidates: F2NativeCandidate[]) {
  const limits = new Map(candidates.map((candidate) => [candidate.qatorId, candidate.f2Mumkin]));
  const nomzod = new Map(candidates.map((candidate) => [candidate.qatorId, candidate]));
  const qatorlar: F2NativePayloadRow[] = [];
  const issues: F2NativeIssue[] = [];
  for (const input of inputs) {
    const quantity = numberOrUndefined(input.quantity);
    const unitPrice = numberOrUndefined(input.unitPrice);
    const amount = numberOrUndefined(input.amount);
    const limit = limits.get(input.qatorId);
    /* Egasi: plyus ham, minus ham hajm — foydalanuvchi ishi. Faqat aynan 0 yoki son bo'lmagan kiritma rad etiladi. */
    if (quantity == null || quantity === 0) { issues.push({ qatorId: input.qatorId, code: 'QTY_INVALID', blocking: true }); continue; }
    /* «F2 ≤ fakt» qoidasi YO'Q: fakt qoldig'idan oshish — faqat bloklamaydigan ogohlantirish, qator baribir payloadga kiradi. */
    if (limit == null || quantity > limit + 1e-9) { issues.push({ qatorId: input.qatorId, code: 'QTY_EXCEEDS_FAKT', blocking: false }); }
    if (!input.sourceReference.trim()) { issues.push({ qatorId: input.qatorId, code: 'SOURCE_REQUIRED', blocking: true }); continue; }
    if (!input.priceIntentionallyAbsent && (unitPrice == null || unitPrice < 0)) { issues.push({ qatorId: input.qatorId, code: 'PRICE_REQUIRED', blocking: true }); continue; }
    if (!input.priceIntentionallyAbsent && amount == null) { issues.push({ qatorId: input.qatorId, code: 'AMOUNT_REQUIRED', blocking: true }); continue; }
    if (!input.priceIntentionallyAbsent && Math.abs(quantity * unitPrice! - amount!) > 0.005) {
      // Bu analitik istisno: hujjat summasi aynan o'z holicha saqlanadi.
      issues.push({ qatorId: input.qatorId, code: 'ARITHMETIC_MISMATCH', blocking: false });
    }
    /* Smetadan oshgan hajm — BLOKLAMAYDI. Egasining qoidasi: smeta 10 m³,
       fakt 12 m³ bo'lsa Forma-2 ham 12 bo'lishi mumkin, lekin 2 m³ uchun
       ogohlantirish chiqadi. Chegara FAKTdan olinadi (yuqorida), smeta esa
       faqat ogohlantirish uchun. Ilgari olingan F2 ham qo'shib hisoblanadi. */
    const nz = nomzod.get(input.qatorId);
    if (nz?.smetaHajm != null) {
      const jami = quantity + (nz.f2Olingan ?? 0);
      const oshiq = jami - nz.smetaHajm;
      if (oshiq > 1e-9) {
        issues.push({ qatorId: input.qatorId, code: 'QTY_EXCEEDS_SMETA', blocking: false, oshiq });
      }
    }
    qatorlar.push({
      qatorId: input.qatorId,
      certifiedQuantity: quantity,
      certifiedUnitPrice: input.priceIntentionallyAbsent ? undefined : unitPrice,
      certifiedAmount: input.priceIntentionallyAbsent ? undefined : amount,
      priceIntentionallyAbsent: input.priceIntentionallyAbsent,
      rawSnapshot: {
        source: 'native_f2_preparation', sourceReference: input.sourceReference.trim(),
        enteredQuantity: quantity,
        enteredUnitPrice: input.priceIntentionallyAbsent ? undefined : unitPrice,
        enteredAmount: input.priceIntentionallyAbsent ? undefined : amount,
      },
    });
  }
  return { qatorlar, issues, ok: qatorlar.length > 0 && !issues.some((issue) => issue.blocking) };
}
