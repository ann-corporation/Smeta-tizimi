import { vaqtliOqish } from './vaqtli-fetch';
import { yozAmali, yangiOperationId } from './supabase';

/** Solishtiruv (reconciliation) navbati. O'qish: /api/sb `solishtiruv_v1` (a'zolik + financial.read, bazada). Yozuv: /api/sb-yoz (financial.write). */
export type SolishtiruvIstisno = {
  id: number; qoida: string; nom: string; domen_a: string; domen_b: string; jiddiylik: 'high' | 'medium' | 'low';
  tavsif: string; tavsiya: string; havola: string; holat: 'ochiq' | 'tushuntirildi'; sabab: string | null; ozgargan: boolean;
  obyekt_id: number | null; obyekt_nom: string | null; shartnoma_id: number | null; entity_type: string | null; entity_id: string | null;
  dalil: Record<string, unknown>; birinchi_at: string; oxirgi_at: string;
};
export type SolishtiruvJavob = {
  ok: true; generated_at: string; hisob: { yuqori_ochiq: number; ochiq: number; tushuntirildi: number; tuzatildi: number }; royxat: SolishtiruvIstisno[];
};

export async function solishtiruvOl(p: { kompaniyaId: number; obyektId?: number | null }): Promise<{ ok: true; natija: SolishtiruvJavob } | { ok: false; error: string }> {
  try {
    const r = await vaqtliOqish('/api/sb', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ soro: 'solishtiruv_v1', kompaniya_id: p.kompaniyaId, ...(p.obyektId ? { obyekt_id: p.obyektId } : {}) }),
    });
    const j = await r.json() as { ok: boolean; natija?: SolishtiruvJavob | { ok: false; code?: string }; error?: string };
    if (!j.ok || !j.natija || j.natija.ok !== true) return { ok: false, error: j.error || 'Solishtiruvni o‘qib bo‘lmadi.' };
    return { ok: true, natija: j.natija };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Tarmoq xatosi' }; }
}

/** Tushuntirish (sabab majburiy) yoki qayta ochish. Idempotent operation_id. */
export function solishtiruvTushuntir(p: { kompaniyaId: number; id: number; holat: 'tushuntirildi' | 'ochiq'; sabab?: string }) {
  return yozAmali({ amal: 'solishtiruv_tushuntir_v1', kompaniya_id: p.kompaniyaId, id: p.id, holat: p.holat, sabab: p.sabab ?? null, operation_id: yangiOperationId() });
}

/** Tekshiruvlarni hozir qayta ishga tushirish (kechasi cron ham ishlaydi). Natija ALMASHTIRILADI, qo'shilmaydi. */
export function solishtiruvYangila(p: { kompaniyaId: number; obyektId?: number | null }) {
  return yozAmali({ amal: 'solishtiruv_yangila_v1', kompaniya_id: p.kompaniyaId, obyekt_id: p.obyektId ?? null, operation_id: yangiOperationId() });
}
