/** Murojaat dalil fayllarini (foto, PDF) R2 ga yuklaydi (kompaniyaning umumiy loyihasi ostida) va hujjat ID larini qaytaradi; xato — null + matn. */
import { sbLoyihaUmumiy } from '../../api/t2-loyiha';
import { hujjatYukla } from '../../api/t2-hujjat-canonical';

export async function murojaatDalilYukla(kompaniyaId: number, fayllar: readonly File[]): Promise<{ ok: true; idlar: number[] } | { ok: false; xato: string }> {
  if (!fayllar.length) return { ok: true, idlar: [] };
  const lr = await sbLoyihaUmumiy(kompaniyaId);
  if (!lr.ok || !lr.id) return { ok: false, xato: lr.error || 'Fayl uchun loyiha topilmadi' };
  const idlar: number[] = [];
  for (const file of fayllar) {
    const r = await hujjatYukla({ file, kompaniyaId, loyihaId: lr.id, documentType: 'murojaat_dalil' });
    if (!r.ok) return { ok: false, xato: r.xato || 'Fayl yuklanmadi' };
    idlar.push(r.data.document_id);
  }
  return { ok: true, idlar };
}
