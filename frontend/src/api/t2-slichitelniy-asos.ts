/**
 * t2-slichitelniy-asos.ts — slichitelniy asosi: o'qish (`/api/sb` aosr_slichitelniy_v1) va yozish (`/api/sb-yoz`
 * aosr_bog_hajm_v1, aosr_asos_qoralama_v1). Mantiq lib/slichitelniy-asos.ts da; bu yerda faqat tarmoq.
 * Texnadzorga yuborish — mavjud taqdim oqimi (`taqdimYubor`, t2-tomon.ts), parallel yo'l ochilmaydi.
 */
import type { AsosJavob } from '../lib/slichitelniy-asos';
import { yangiOperationId } from './supabase';
import { taqdimYubor } from './t2-tomon';

export async function slichitelniyAsosOl(kompaniyaId: number, obyektId: number, limit = 200): Promise<AsosJavob> {
  try {
    const r = await fetch('/api/sb', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ soro: 'aosr_slichitelniy_v1', kompaniya_id: kompaniyaId, obyekt_id: obyektId, limit }),
    });
    const j = await r.json() as { ok?: boolean; natija?: AsosJavob; error?: string };
    if (!j.ok || !j.natija) return { ok: false, error: j.error || 'Asoslar o‘qilmadi' };
    return j.natija;
  } catch (e) { return { ok: false, error: 'Tarmoq: ' + (e instanceof Error ? e.message : String(e)) }; }
}

type YozNatija = { ok: boolean; error?: string; code?: string; [k: string]: unknown };
async function yoz(yuk: Record<string, unknown>): Promise<YozNatija> {
  try {
    const r = await fetch('/api/sb-yoz', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(yuk) });
    const j = await r.json() as { ok?: boolean; natija?: YozNatija; error?: string };
    const n = j.natija && typeof j.natija === 'object' ? j.natija : (j as YozNatija);
    return { ...n, ok: j.ok !== false && n.ok !== false };
  } catch (e) { return { ok: false, error: 'Tarmoq: ' + (e instanceof Error ? e.message : String(e)) }; }
}

export type BogYozuvi = { qator_id: number; hajm?: number | null; ochir?: boolean };
/** АОСР ↔ qator bog'ini hajm bilan saqlaydi (hajm null = ko'rsatilmagan; ochir:true — bog'ni olib tashlaydi). */
export const aosrBogHajm = (kompaniyaId: number, aosrId: number, bog: BogYozuvi[]) =>
  yoz({ amal: 'aosr_bog_hajm_v1', kompaniya_id: kompaniyaId, aosr_id: aosrId, bog, operation_id: yangiOperationId() });

export type QoralamaNatija = YozNatija & {
  natija?: unknown;
  yaratildi?: Array<{ qator_id: number; aosr_id: number; raqam: string; hajm: number }>;
  otkazildi?: Array<{ qator_id: number; sabab: string }>;
};
/** Tanlangan ish qatorlari uchun АОСР qoralamalari (hajm = fakt − allaqachon asoslangan). Qayta chaqirish bir xil operation_id bilan takror yaratmaydi. */
export const aosrQoralamalarYarat = (kompaniyaId: number, obyektId: number, qatorIds: number[], operationId: string): Promise<QoralamaNatija> =>
  yoz({ amal: 'aosr_asos_qoralama_v1', kompaniya_id: kompaniyaId, obyekt_id: obyektId, qator_ids: qatorIds, operation_id: operationId }) as Promise<QoralamaNatija>;

/** Qoralama АОСР larni mavjud taqdim oqimi bilan texnadzorga yuboradi (har biri alohida; natija — muvaffaqiyat/rad ro'yxati). */
export async function aosrlarniYubor(kompaniyaId: number, aloqaId: number, aosrIdlar: number[]): Promise<{ yuborildi: number[]; rad: Array<{ id: number; sabab: string }> }> {
  const yuborildi: number[] = [];
  const rad: Array<{ id: number; sabab: string }> = [];
  for (const id of aosrIdlar) {
    const r = await taqdimYubor(kompaniyaId, aloqaId, 'aosr', id, undefined);
    if (r.ok) yuborildi.push(id); else rad.push({ id, sabab: String((r as { error?: string }).error ?? 'rad etildi') });
  }
  return { yuborildi, rad };
}
