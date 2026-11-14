/**
 * t2-loyihachi.ts — loyihachi / mualliflik nazorati klienti (chizma reyestri, revizyalar, smeta o'zgarish takliflari, «Bugun»).
 * Shlyuz: /api/loyihachi. Hamma ruxsat serverda (design.*, document.write, a'zolik, aloqa/taqdim); bu fayl faqat so'rov yuboradi.
 * RFI (savol) va mualliflik remarki — mavjud murojaat oqimi (`api/t2-tomon.ts`: turi `savol` / `mualliflik_remark`).
 */
import { yangiOperationId } from './supabase';
import type { ChizmaBosqich, TaqdimHolatiK } from '../lib/loyihachi/chizma-yadro';

export type RevizyaKorinishi = {
  id: number; revizya: number; holat: 'qoralama' | 'ruxsat' | 'bekor';
  ozgarish_izohi: string | null; taasir_izoh: string | null; document_id: number | null; fayl: string | null; ruxsat_vaqti: string | null;
  taqdim_id: number | null; taqdim_holat: TaqdimHolatiK | null; qaror_izoh: string | null; qaror_vaqti: string | null;
  taklif_soni: number; taklif_yangi: number;
};
export type ToplamKorinishi = {
  id: number; bosqich: ChizmaBosqich; marka: string; varaq: string; nom: string | null; obyekt_id: number; obyekt_nom: string | null; aloqa_id: number;
  egasi: boolean; egasi_nom: string | null; boglanish_soni: number; revizyalar: RevizyaKorinishi[];
};
export type Taklif = {
  id: number; tur: 'qoshimcha' | 'zamena' | 'olib_tashlash' | 'hajm'; nom: string; birlik: string | null; hajm: number | null; izoh: string | null;
  holat: 'yangi' | 'ozgarishga' | 'rad'; pto_izoh: string | null; ozgarish_id: number | null;
};
export type Boglanish = {
  id: number; toplam_id: number; bosqich: ChizmaBosqich; marka: string; varaq: string; ishlatilgan: number; joriy: number | null;
  qator_id: number | null; qator_nom: string | null; qator_kod: string | null; aosr_id: number | null; aosr_raqam: string | null; aosr_loyiha_hujjati: string | null;
};
export type BugunSanoq = {
  qoralama_revizya: number; qaror_kutmoqda: number; tuzatish_soralgan: number; savol_menga: number; savol_kechikkan: number;
  remark_ochiq: number; remark_yopishga: number; remark_kechikkan: number; taklif_kutmoqda: number;
  kelgan_yangi: number; eskirgan_boglanish: number; taklif_yangi_menga: number;
};

export type LoyihaJavob<T> = { ok: true; natija: T } | { ok: false; error: string; code?: string };
/** UI «bajar» yordamchisi uchun: har qanday yozuv amali natijasi. */
export type YozishFn = () => Promise<LoyihaJavob<unknown>>;
type Xom = { ok?: boolean; error?: string; code?: string } & Record<string, unknown>;

async function chaqir(url: string, init?: RequestInit): Promise<Xom> {
  try {
    const r = await fetch(url, init);
    const matn = await r.text();
    try { return JSON.parse(matn) as Xom; } catch { return { ok: false, error: `Server javob bermadi (HTTP ${r.status})` }; }
  } catch (e) { return { ok: false, error: 'Tarmoq: ' + (e instanceof Error ? e.message : String(e)) }; }
}

export async function loyihaOqi<T>(bolim: string, kompaniyaId: number, params: Record<string, string | number | null | undefined> = {}): Promise<LoyihaJavob<T>> {
  const q = new URLSearchParams({ bolim, kompaniya_id: String(kompaniyaId) });
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') q.set(k, String(v));
  const d = await chaqir('/api/loyihachi?' + q.toString(), { credentials: 'same-origin' });
  if (d.ok === false) return { ok: false, error: d.error || 'Xato', code: d.code };
  return { ok: true, natija: d as unknown as T };
}

export async function loyihaYoz<T = Record<string, unknown>>(amal: string, kompaniyaId: number, yuk: Record<string, unknown> = {}): Promise<LoyihaJavob<T>> {
  const d = await chaqir('/api/loyihachi', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amal, kompaniya_id: kompaniyaId, ...yuk }) });
  if (d.ok === false) return { ok: false, error: d.error || 'Xato', code: d.code };
  return { ok: true, natija: d as unknown as T };
}

export const chizmalarOl = (k: number, obyektId?: number | null) => loyihaOqi<{ toplamlar: ToplamKorinishi[] }>('royxat', k, { obyekt_id: obyektId });
export const chizmaTakliflariOl = (k: number, revizyaId: number) => loyihaOqi<{ egasi: boolean; obyekt_id: number; takliflar: Taklif[] }>('takliflar', k, { revizya_id: revizyaId });
export const chizmaTaasiriOl = (k: number, obyektId?: number | null) => loyihaOqi<{ boglanishlar: Boglanish[] }>('taasir', k, { obyekt_id: obyektId });
export const loyihachiBugunOl = (k: number) => loyihaOqi<BugunSanoq>('bugun', k);

export const toplamSaqla = (k: number, p: { aloqaId: number; obyektId: number; bosqich: ChizmaBosqich; marka: string; varaq: string; nom?: string }) =>
  loyihaYoz<{ id: number; qayta: boolean }>('toplam_saqla', k, { aloqa_id: p.aloqaId, obyekt_id: p.obyektId, bosqich: p.bosqich, marka: p.marka, varaq: p.varaq, nom: p.nom || null, operation_id: yangiOperationId() });
export const revizyaYarat = (k: number, p: { toplamId: number; documentId?: number | null; ozgarishIzohi?: string; taasirIzoh?: string }) =>
  loyihaYoz<{ id: number; revizya: number }>('revizya_yarat', k, { toplam_id: p.toplamId, document_id: p.documentId ?? null, ozgarish_izohi: p.ozgarishIzohi || null, taasir_izoh: p.taasirIzoh || null, operation_id: yangiOperationId() });
export const revizyaTahrir = (k: number, p: { revizyaId: number; documentId?: number | null; ozgarishIzohi?: string; taasirIzoh?: string }) =>
  loyihaYoz('revizya_tahrir', k, { revizya_id: p.revizyaId, document_id: p.documentId ?? null, ozgarish_izohi: p.ozgarishIzohi || null, taasir_izoh: p.taasirIzoh || null });
export const taklifYoz = (k: number, p: { revizyaId: number; tur: Taklif['tur']; nom: string; birlik?: string; hajm?: number | null; izoh?: string }) =>
  loyihaYoz<{ id: number }>('taklif_yoz', k, { revizya_id: p.revizyaId, tur: p.tur, nom: p.nom, birlik: p.birlik || null, hajm: p.hajm ?? null, izoh: p.izoh || null });
export const revizyaChiqar = (k: number, revizyaId: number, aloqaIdlar: number[], izoh?: string) =>
  loyihaYoz<{ id: number; revizya: number; qabul_soni: number }>('chiqar', k, { revizya_id: revizyaId, aloqa_idlar: aloqaIdlar, izoh: izoh || null });
export const revizyaBekor = (k: number, revizyaId: number, sabab: string) => loyihaYoz('bekor', k, { revizya_id: revizyaId, sabab });
export const chizmaQarori = (k: number, taqdimId: number, qaror: 'korilmoqda' | 'qabul' | 'rad' | 'tuzatish', izoh?: string) => loyihaYoz('qaror', k, { taqdim_id: taqdimId, qaror, izoh: izoh || null });
export const chizmaBoglash = (k: number, p: { toplamId: number; revizya: number; obyektId: number; qatorId?: number | null; aosrId?: number | null; harakat: 'qosh' | 'ochir' }) =>
  loyihaYoz('boglash', k, { toplam_id: p.toplamId, revizya: p.revizya, obyekt_id: p.obyektId, qator_id: p.qatorId ?? null, aosr_id: p.aosrId ?? null, harakat: p.harakat });
export const taklifQarori = (k: number, p: { taklifId: number; qaror: 'ozgarishga' | 'rad'; obyektId?: number | null; qatorId?: number | null; izoh?: string }) =>
  loyihaYoz<{ ozgarish_id?: number }>('taklif_pto', k, { taklif_id: p.taklifId, qaror: p.qaror, obyekt_id: p.obyektId ?? null, qator_id: p.qatorId ?? null, izoh: p.izoh || null, operation_id: yangiOperationId() });
