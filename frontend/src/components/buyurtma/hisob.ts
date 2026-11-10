import type { T2Zayavka } from '../../api/t2-zayavka';

/** Zayavkaning yetkazilmagan qismi (noma'lum bo'lsa - to'liq so'ralgan miqdor). */
export function buyurtmaMiqdori(z: Pick<T2Zayavka, 'requestedQty' | 'deliveredQty' | 'remainingQty'>): number {
  const qolgan = z.remainingQty ?? z.requestedQty - (z.deliveredQty || 0);
  return qolgan > 0 ? qolgan : z.requestedQty;
}
