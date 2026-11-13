/**
 * Tender ochiq rejim (P1) — gateway mijozi: `/api/tender-ochiq` (kirmasdan GET) va `/api/tender-p1` (xaridor amallari).
 * Mavjud tender amallari (taklif berish, ochish, g'olib) `api/t2-tender.ts` da qoladi — bu yerda faqat YANGI t2_tn_* RPC lar. Narx QQS siz; NULL = noma'lum.
 */
import { yangiOperationId } from './supabase';

export type TnNatija<T> = { ok: true; natija: T } | { ok: false; code: string };
export type OchiqLotQator = { id?: number; qator_no: number; lot_no: number; lot_nom: string | null; nom: string; birlik: string; miqdor: number; talab_sana: string | null; yetkazish_joyi: string | null; spets: string | null };
export type OchiqLotRoyxat = { id: number; raqam: string | null; nom: string; tur: string; muddat: string | null; valyuta: string; qator_soni: number; takliflar_soni: number; egasi_nom?: string };
export type OchiqLot = {
  lot: { id: number; raqam: string | null; nom: string; tur: string; muddat: string | null; muddat_otgan: boolean; izoh: string | null; tolov_sharti: string | null; valyuta: string; qqs_foiz: number;
         baholash_usuli: string; takliflar_soni: number; egasi_nom?: string };
  qatorlar: OchiqLotQator[];
};
export type Ogohlantirish = { tur: 'bir_foydalanuvchi' | 'bir_xil_jami' | 'bir_xil_nisbat'; taklif_idlar: number[] };
export type Bayonnoma = {
  xesh: string;
  tender: { id: number; raqam: string | null; nom: string; tur: string; doira: string; holat: string; muddat: string | null; ochilgan_vaqt: string | null; ochgan_actor_id: number | null; valyuta: string; qqs_foiz: number; baholash_usuli: string; golib_asos: string | null; golib_vaqt: string | null };
  qatorlar: Array<{ qator_no: number; nom: string; birlik: string; miqdor: number; golib_taklif_qator_id: number | null }>;
  takliflar: Array<{ taklif_id: number; kompaniya: string; holat: string; qqs_foiz: number; amal_kun: number | null; kafolat_oy: number | null; yetkazish_narx: number | null; yaratildi: string;
                     qatorlar: Array<{ qator_no: number; nom: string; birlik: string; miqdor: number; narx: number | null; muddat_kun: number | null }> | null }>;
  jurnal: Array<{ id: number; hodisa: string; vaqt: string; actor_id: number | null; payload: Record<string, unknown> }>;
  ogohlantirishlar: Ogohlantirish[];
};
export type NarxManbaNatija = { narx_manba_id: number; ogohlantirish: 'urtacha' | null; takror?: boolean };

function ochish<T>(j: { ok?: boolean; natija?: T & { ok?: boolean; code?: string }; code?: string } | null, status: number): TnNatija<T> {
  if (!j?.ok || !j.natija) return { ok: false, code: j?.code ?? 'HTTP_' + status };
  if ((j.natija as { ok?: boolean }).ok === false) return { ok: false, code: (j.natija as { code?: string }).code ?? 'XATO' };
  return { ok: true, natija: j.natija };
}
async function ochiq<T>(p: Record<string, string | number | undefined>): Promise<TnNatija<T>> {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v != null && v !== '') u.set(k, String(v));
  try { const r = await fetch('/api/tender-ochiq?' + u.toString()); return ochish<T>(await r.json().catch(() => null), r.status); } catch { return { ok: false, code: 'NETWORK' }; }
}
async function chaqir<T>(amal: string, kompaniyaId: number, data: Record<string, unknown>, yozish: boolean): Promise<TnNatija<T>> {
  try {
    const r = await fetch('/api/tender-p1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
      body: JSON.stringify({ amal, kompaniya_id: kompaniyaId, data, ...(yozish ? { operation_id: yangiOperationId() } : {}) }) });
    return ochish<T>(await r.json().catch(() => null), r.status);
  } catch { return { ok: false, code: 'NETWORK' }; }
}

export const tnOchiqRoyxat = (f: { tur?: string; q?: string } = {}) => ochiq<{ lotlar: OchiqLotRoyxat[] }>({ amal: 'royxat', ...f });
export const tnOchiqLot = (id: number) => ochiq<OchiqLot>({ amal: 'lot', id });

export type LotSmetadan = { obyekt_id: number; bolim_id?: number | null; tur: 'material' | 'subpudrat' | 'texnika_ijara'; doira: 'ochiq' | 'taklif'; muddat: string; nom?: string; izoh?: string; qabul?: number[] };
export const tnLotSmetadan = (kid: number, d: LotSmetadan) => chaqir<{ id: number; versiya: number; qator_soni: number }>('lot_smetadan', kid, d as unknown as Record<string, unknown>, true);
export const tnKorsatish = (kid: number, rfqId: number, korsat: boolean) => chaqir<{ rfq_id: number; korsat: boolean }>('korsatish', kid, { rfq_id: rfqId, korsat }, true);
export const tnAloqa = (kid: number, rfqId: number, taklifId: number) => chaqir<{ aloqa_id: number; takror?: boolean }>('aloqa', kid, { rfq_id: rfqId, taklif_id: taklifId }, true);
export const tnNarxManba = (kid: number, rfqId: number) => chaqir<NarxManbaNatija>('narx_manba', kid, { rfq_id: rfqId }, true);
export const tnTopshiriq = (kid: number, rfqId: number, umumiySumma?: string) => chaqir<{ yangi?: number; yangilandi?: number }>('ish_qadam', kid, { rfq_id: rfqId, qadam: 'topshiriq', ...(umumiySumma ? { umumiy_summa: umumiySumma } : {}) }, true);
export type ShartnomaHavola = { shartnoma: { turi: string; nom: string; taraf: string | null; loyiha_id: number | null; summa_bez_nds: number | null; qqs_foiz: number | null; rfq_id: number } };
export const tnShartnomaHavola = (kid: number, rfqId: number, umumiySumma?: string) => chaqir<ShartnomaHavola>('ish_qadam', kid, { rfq_id: rfqId, qadam: 'shartnoma', ...(umumiySumma ? { umumiy_summa: umumiySumma } : {}) }, true);
export const tnOgohlantirish = (kid: number, rfqId: number) => chaqir<{ ogohlantirishlar: Ogohlantirish[] }>('ogohlantirish', kid, { rfq_id: rfqId }, false);
export const tnBayonnoma = (kid: number, rfqId: number) => chaqir<Bayonnoma>('bayonnoma', kid, { rfq_id: rfqId }, false);
