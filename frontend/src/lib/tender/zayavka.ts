/** Zayavka (t2_erp_taminot) qatorlaridan tender pozitsiyalari (qoralama). Sof funksiya; narx/summa o'ylab topilmaydi. */
export type ZayavkaManba = {
  id: number; itemText: string; requestedQty: number; unit: string | null; requiredDate: string | null;
  deliveredQty?: number; remainingQty?: number | null; status?: string; note?: string | null; obyektId?: number | null;
};
export type TenderQatorQoralama = {
  nom: string; birlik: string; miqdor: number; lot_no: number; talab_sana?: string; zayavka_id: number; izoh?: string;
};
/** Tenderga qo'yish mumkin bo'lgan zayavka holatlari (tasdiqlangan, hali yetkazilmagan). */
export const TENDERGA_YARAYDI: readonly string[] = ['approved', 'procurement'];

/** Yetkazilmagan qoldiq: remainingQty (bazadan) yoki talab − yetkazilgan; ≤ 0 yoki noma'lum bo'lsa — null. */
export function qoldiqMiqdor(z: ZayavkaManba): number | null {
  const q = z.remainingQty != null ? z.remainingQty : z.requestedQty - (z.deliveredQty ?? 0);
  return Number.isFinite(q) && q > 0 ? q : null;
}

export function zayavkadanQatorlar(zayavkalar: readonly ZayavkaManba[], lotNo = 1): { qatorlar: TenderQatorQoralama[]; otkazildi: { id: number; sabab: 'holat' | 'miqdor' | 'nom' | 'birlik' }[] } {
  const qatorlar: TenderQatorQoralama[] = [];
  const otkazildi: { id: number; sabab: 'holat' | 'miqdor' | 'nom' | 'birlik' }[] = [];
  for (const z of zayavkalar) {
    if (z.status != null && !TENDERGA_YARAYDI.includes(z.status)) { otkazildi.push({ id: z.id, sabab: 'holat' }); continue; }
    const nom = (z.itemText ?? '').trim().slice(0, 300);
    if (!nom) { otkazildi.push({ id: z.id, sabab: 'nom' }); continue; }
    const birlik = (z.unit ?? '').trim().slice(0, 40);
    if (!birlik) { otkazildi.push({ id: z.id, sabab: 'birlik' }); continue; }   // birlik o'ylab topilmaydi
    const miqdor = qoldiqMiqdor(z);
    if (miqdor == null) { otkazildi.push({ id: z.id, sabab: 'miqdor' }); continue; }
    const sana = z.requiredDate && /^\d{4}-\d{2}-\d{2}/.test(z.requiredDate) ? z.requiredDate.slice(0, 10) : undefined;
    qatorlar.push({ nom, birlik, miqdor, lot_no: lotNo, zayavka_id: z.id, ...(sana ? { talab_sana: sana } : {}), ...(z.note ? { izoh: z.note.slice(0, 1000) } : {}) });
  }
  return { qatorlar, otkazildi };
}
