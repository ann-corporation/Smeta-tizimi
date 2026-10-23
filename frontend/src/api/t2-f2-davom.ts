/** «Davom ettiriladigan F2 lar»: kompaniya (ixtiyoriy obyekt) bo'yicha F2 V3 server ish qoralamalari (egasi 2026-10-24).
 *  /api/sb o'qish-RPC `f2_import_job_royxat_v1` (stable, a'zolik + f2.read ichida; actor sessiyadan). */
export type T2F2DavomQator = {
  job_id: number; obyekt_id: number; obyekt_nom: string | null; raqam: string | null; oy: string | null; fayl: string | null;
  akt_idx: number | null; status: string; jami: number; aniq: number; taklif: number; topilmadi: number; otkaz: number;
  yangilandi: string; yaratildi: string; kim: string | null; yozilgan: boolean; akt_id: number | null; akt_holat: string | null;
};

export async function f2DavomRoyxatOl(kompaniyaId: number, obyektId?: number | null): Promise<{ ok: boolean; qatorlar: T2F2DavomQator[]; error?: string }> {
  const r = await fetch('/api/sb', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ soro: 'f2_import_job_royxat_v1', kompaniya_id: kompaniyaId, ...(obyektId ? { obyekt_id: obyektId } : {}) }),
  });
  const j = await r.json() as { ok: boolean; natija?: { ok: boolean; qatorlar?: T2F2DavomQator[] }; error?: string };
  if (!j.ok || !j.natija || j.natija.ok !== true) return { ok: false, qatorlar: [], error: j.error || 'F2 qoralamalari o‘qilmadi' };
  return { ok: true, qatorlar: j.natija.qatorlar || [] };
}
