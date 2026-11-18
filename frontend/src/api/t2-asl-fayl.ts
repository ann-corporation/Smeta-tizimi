/**
 * t2-asl-fayl.ts - YAGONA mijoz yo'li: foydalanuvchi yuklagan ASL fayl R2 ga (kanonik: /api/hujjat-yukla -> R2_CANONICAL + t2_document_registry).
 * Har yangi yuklash funksiyasi (fayl tanlash/drop) asl baytlarni DB qatorlariga tahlil qilishdan OLDIN yoki bilan birga shu orqali saqlaydi;
 * CI guard (src/lib/saqlash/yuklash-qoriqchi.test.ts) type="file" kiritishi bor, lekin bu modul/hujjatYukla ni ishlatmaydigan yangi fayllarni rad etadi.
 * Idempotent: operation_id = sha256(kompaniya|obyekt|tur|mazmun) - bir xil fayl qayta yuklansa yangi versiya/nusxa yaratilmaydi (server ham sha256 bo'yicha dedup qiladi).
 * Xato foydalanuvchi ishini to'xtatmaydi (ogohlantirish), Postgres'ga fayl baytlari YOZILMAYDI.
 */
import { hujjatYukla } from './t2-hujjat-canonical';
import { arxivOperationId } from './t2-hujjat-arxiv';
import { faylSha256 } from './t2-hujjat-canonical';

export type AslFaylTuri = 'asl_smeta' | 'asl_f2' | 'asl_kp' | 'asl_narx' | 'asl_oferta' | 'asl_qarzdorlik' | 'asl_bank' | 'asl_boshqa';

export async function aslFaylSaqla(file: File, p: { kompaniyaId: number | null | undefined; obyektId?: number | null; loyihaId?: number | null; turi: AslFaylTuri }):
  Promise<{ ok: true; documentId: number; takror: boolean } | { ok: false; xato: string }> {
  if (!p.kompaniyaId || !Number.isSafeInteger(p.kompaniyaId)) return { ok: false, xato: 'KOMPANIYA_YOQ' };
  try {
    const sha = await faylSha256(file);
    const r = await hujjatYukla({
      file, kompaniyaId: p.kompaniyaId, loyihaId: p.loyihaId ?? null, obyektId: p.obyektId ?? null, documentType: p.turi,
      operationId: await arxivOperationId(p.kompaniyaId, p.obyektId ?? null, p.turi, sha),
    });
    if (!r.ok) return { ok: false, xato: r.xato || r.code };
    return { ok: true, documentId: r.data.document_id, takror: Boolean((r.data as { retry?: boolean }).retry) };
  } catch (e) {
    return { ok: false, xato: e instanceof Error ? e.message : String(e) };
  }
}
