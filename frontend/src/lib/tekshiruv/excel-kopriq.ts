/**
 * lib/tekshiruv/excel-kopriq.ts - qaytgan texnadzor Excel'i (eski «Texnadzor faylini solishtirish», lib/f2-texnadzor-solishtir) ->
 * bir xil TAKLIF yozuvlari. Ikki yo'l (QR panel va Excel) bitta joyda tugaydi: PTO hammasini F-2 muharririda bir xil hal qiladi.
 * Faqat tizimda mavjud qatorlar (id bor) va faqat aniq ma'noli farq: hajm farqi, «hujjat kerak» izohi, boshqa izoh. Qolgani (teng, faqat bizning
 * qo'shimcha, qo'shilmagan) taklif EMAS. «Olib tashlansin» Excel'dan taxmin qilinmaydi (qator fayldan tushib qolishi boshqa sabab ham bo'lishi mumkin).
 */
import type { Natija } from '../f2-texnadzor-solishtir';

export type ImportTaklif = { qator_id: number; bayroq: 'hajm_notogri' | 'hujjat_kerak' | null; izoh: string | null; taklif_hajm: number | null; hujjat_turi: string | null };
export const IMPORT_CHEGARA = 3000;

export function natijadanTakliflar(natijalar: readonly Natija[]): ImportTaklif[] {
  const out: ImportTaklif[] = [];
  for (const n of natijalar) {
    if (n.id == null || !n.hisobga || n.holat === 'KALITSIZ' || n.holat === 'FAYLDA_YOQ' || n.holat === 'TIZIMDA_YOQ') continue;
    const izoh = n.izoh.trim().slice(0, 1000) || null;
    const hajm = n.holat === 'HAJM_FARQ' && n.fHajm != null && n.fHajm >= 0 ? n.fHajm : null;
    const hujjat = n.izohHolat === 'HUJJAT_KERAK';
    if (hajm == null && !hujjat && !izoh) continue;
    out.push({ qator_id: n.id, bayroq: hujjat ? 'hujjat_kerak' : hajm != null ? 'hajm_notogri' : null, izoh, taklif_hajm: hajm, hujjat_turi: hujjat ? 'Hujjat (Excel izohidan)' : null });
    if (out.length >= IMPORT_CHEGARA) break;
  }
  return out;
}