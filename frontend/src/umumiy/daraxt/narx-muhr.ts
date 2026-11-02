import type { PriceState } from '../../api/t2-price-control';

/**
 * Narx nazorati holati — emoji o'rniga Firuza muhri (so'z + ton). Smeta daraxti va Narx nazorati jadvali bir xil so'z
 * va rangni ishlatadi; to'liq izoh `PRICE_STATE_BADGE[...].label` da (title sifatida beriladi).
 * `soz` — `t()` orqali tarjima qilinadi.
 */
export const NARX_MUHR: Record<PriceState, { soz: string; ton: 'ok' | 'info' | 'warn' | 'danger' }> = {
  NORMAL: { soz: 'Normal', ton: 'ok' },
  BELOW_REFERENCE: { soz: 'Muzlagan', ton: 'info' },
  ABOVE_REFERENCE_JUSTIFIED: { soz: 'Asoslangan', ton: 'info' },
  ABOVE_REFERENCE_MISSING_BASIS: { soz: 'Basis kerak', ton: 'danger' },
  ABOVE_APPROVED_BASIS: { soz: 'Asosdan yuqori', ton: 'danger' },
};
