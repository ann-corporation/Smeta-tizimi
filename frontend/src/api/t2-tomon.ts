/**
 * t2-tomon.ts — tomonlar aloqasi (zakazchik ↔ pudratchi va boshqalar) klienti. Shlyuz: /api/tomon.
 * Hamma ruxsat serverda (grant, rol, a'zolik); bu fayl faqat so'rov yuboradi va javobni tiplaydi.
 * Shartnoma: ops/handoff/T2_ZAKAZCHIK_TOMON_001.md.
 */
import { yangiOperationId } from './supabase';

export type AloqaHolat = 'taklif' | 'faol' | 'toxtatilgan' | 'yopilgan' | 'rad' | 'bekor';
export type TaqdimHolat = 'yuborilgan' | 'ko_rilmoqda' | 'qabul' | 'rad' | 'tuzatish' | 'qaytarilgan';

export type Aloqa = {
  id: number; holat: AloqaHolat; turi: string; nom: string | null;
  men_taklif_qildim: boolean; men_rol: string; qarshi_rol: string;
  qarshi_kompaniya_id: number | null; qarshi_nom: string; qarshi_inn: string | null;
  kod_kutilmoqda: boolean; kod_muddati: string | null;
  taklif_vaqti: string; javob_vaqti: string | null; yopish_sababi: string | null; izoh: string | null;
  berilgan_grant_soni: number; olingan_grant_soni: number; kelgan_ochiq_taqdim: number; yuborilgan_ochiq_taqdim: number;
};
export type GrantQatori = {
  id: number; resurs: string; amallar: string[]; loyiha_id?: number | null; obyekt_id?: number | null; shartnoma_id?: number | null;
  doira_nom: string | null; yaratildi: string;
};
export type Hodisa = { id: number; tur: string; matn: string | null; vaqt: string; taqdim_id?: number | null; meni: boolean; kompaniya_nom: string | null };
export type AloqaTafsilot = {
  aloqa: Pick<Aloqa, 'id' | 'holat' | 'turi' | 'nom' | 'men_rol' | 'qarshi_rol' | 'qarshi_kompaniya_id' | 'qarshi_nom' | 'taklif_vaqti' | 'javob_vaqti' | 'izoh'>;
  berilgan: GrantQatori[]; olingan: GrantQatori[]; hodisalar: Hodisa[];
};
export type TomonResurs = { kalit: string; nom: string; nom_ru: string | null; guruh: string; amallar: string[]; taqdim_mumkin: boolean; izoh: string | null };
export type TaqdimQisqa = {
  id: number; aloqa_id: number; resurs: string; nom: string; oy: string | null; summa: number | null; holat: TaqdimHolat; kelgan: boolean;
  qarshi_nom: string | null; obyekt_nom: string | null; taqdim_vaqti: string; qaror_vaqti: string | null; qaror_izoh: string | null; oldingi_taqdim_id: number | null;
};
export type TaqdimQator = { qator_id: number; tartib: number; kod: string | null; nom: string | null; birlik: string | null; tur: string | null; kat: string | null; hajm: number | null; narx: number | null; summa: number | null; narx_manba: string | null };
export type TaqdimTafsilot = {
  taqdim: Omit<TaqdimQisqa, 'qarshi_nom'> & {
    snapshot: Record<string, unknown>; etuvchi_nom: string | null; qabul_qiluvchi_nom: string | null; taqdim_izoh: string | null; document_id: number | null;
  };
  qatorlar: TaqdimQator[]; qator_jami: number; qisqartirilgan: boolean; butunlik_ok: boolean | null; hodisalar: Hodisa[];
};
export type ZakazchikObyekt = {
  aloqa_id: number; qarshi_kompaniya_id: number; qarshi_nom: string; qarshi_rol: string; obyekt_id: number; obyekt_nom: string;
  shartnoma: { raqam: string; nom: string | null; summa_bez_nds: number | null; jami_nds_bilan: number | null } | null;
  f2: { soni: number; jami: number; oxirgi_oy: string | null; royxat: Array<{ akt_id: number; raqam: string | null; oy: string | null; jami: number | null }> } | null;
  kutayotgan_taqdim: number;
};

export type TomonJavob<T> = { ok: true; natija: T } | { ok: false; error: string; code?: string };
type Xom = { ok?: boolean; natija?: unknown; error?: string; code?: string } & Record<string, unknown>;

async function chaqir(url: string, init?: RequestInit): Promise<Xom> {
  try {
    const r = await fetch(url, init);
    const matn = await r.text();
    try { return JSON.parse(matn) as Xom; } catch { return { ok: false, error: `Server javob bermadi (HTTP ${r.status})` }; }
  } catch (e) { return { ok: false, error: 'Tarmoq: ' + (e instanceof Error ? e.message : String(e)) }; }
}

/** O'qish: massiv javoblar `natija` da; obyekt javoblar (ok bilan) to'g'ridan. */
export async function tomonOqi<T>(bolim: string, kompaniyaId: number, params: Record<string, string | number | null | undefined> = {}): Promise<TomonJavob<T>> {
  const q = new URLSearchParams({ bolim, kompaniya_id: String(kompaniyaId) });
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') q.set(k, String(v));
  const d = await chaqir('/api/tomon?' + q.toString(), { credentials: 'same-origin' });
  if (d.ok === false) return { ok: false, error: d.error || 'Xato', code: d.code };
  return { ok: true, natija: ('natija' in d ? d.natija : d) as T };
}

export async function tomonYoz<T = Record<string, unknown>>(amal: string, kompaniyaId: number, yuk: Record<string, unknown> = {}): Promise<TomonJavob<T>> {
  const d = await chaqir('/api/tomon', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amal, kompaniya_id: kompaniyaId, ...yuk }) });
  if (d.ok === false) return { ok: false, error: d.error || 'Xato', code: d.code };
  return { ok: true, natija: d as unknown as T };
}

export const aloqalarOl = (k: number) => tomonOqi<Aloqa[]>('aloqalar', k);
export const aloqaTafsilotOl = (k: number, aloqaId: number) => tomonOqi<AloqaTafsilot>('aloqa', k, { aloqa_id: aloqaId });
export const resurslarOl = (k: number) => tomonOqi<TomonResurs[]>('resurslar', k);
export const taqdimlarOl = (k: number, p: { yonalish?: 'kelgan' | 'yuborilgan'; holat?: string; aloqaId?: number } = {}) =>
  tomonOqi<TaqdimQisqa[]>('taqdimlar', k, { yonalish: p.yonalish, holat: p.holat, aloqa_id: p.aloqaId });
export const taqdimTafsilotOl = (k: number, taqdimId: number) => tomonOqi<TaqdimTafsilot>('taqdim', k, { taqdim_id: taqdimId });
export const zakazchikObyektlarOl = (k: number) => tomonOqi<ZakazchikObyekt[]>('obyektlar', k);
export const kompaniyaQidir = (k: number, inn: string) => tomonOqi<{ topildi: boolean; kompaniya?: { id: number; nom: string; inn: string } }>('qidir', k, { inn });

export const taklifYubor = (k: number, p: { qabulKompaniyaId?: number | null; qabulInn?: string; qabulNom?: string; taklifRol: string; qabulRol: string; turi?: string; nom?: string; izoh?: string }) =>
  tomonYoz<{ id: number; holat: AloqaHolat; kod_kerak: boolean; kod?: string; qayta?: boolean }>('taklif', k, {
    qabul_kompaniya_id: p.qabulKompaniyaId ?? null, qabul_inn: p.qabulInn || null, qabul_nom: p.qabulNom || null,
    taklif_rol: p.taklifRol, qabul_rol: p.qabulRol, turi: p.turi || 'shartnoma', nom: p.nom || null, izoh: p.izoh || null, operation_id: yangiOperationId(),
  });
export const taklifgaJavob = (k: number, aloqaId: number, qaror: 'qabul' | 'rad', izoh?: string) => tomonYoz('javob', k, { aloqa_id: aloqaId, qaror, izoh: izoh || null });
export const kodBilanQabul = (k: number, kod: string) => tomonYoz<{ id: number; holat: AloqaHolat }>('kod_qabul', k, { kod });
export const aloqaHolati = (k: number, aloqaId: number, harakat: 'toxtatish' | 'davom' | 'yopish' | 'bekor', sabab?: string) => tomonYoz('holat', k, { aloqa_id: aloqaId, harakat, sabab: sabab || null });
export type GrantKirish = { resurs: string; amallar: string[]; obyekt_id?: number; loyiha_id?: number; shartnoma_id?: number };
export const grantSaqla = (k: number, aloqaId: number, grantlar: GrantKirish[]) => tomonYoz<{ saqlandi: number }>('grant_saqla', k, { aloqa_id: aloqaId, grantlar });
export const grantBekor = (k: number, grantId: number) => tomonYoz('grant_bekor', k, { grant_id: grantId });
export const taqdimYubor = (k: number, aloqaId: number, resurs: string, manbaId: number, izoh?: string) =>
  tomonYoz<{ id: number; holat: TaqdimHolat }>('taqdim_yarat', k, { aloqa_id: aloqaId, resurs, manba_id: manbaId, izoh: izoh || null, operation_id: yangiOperationId() });
export const taqdimQarori = (k: number, taqdimId: number, qaror: 'korilmoqda' | 'qabul' | 'rad' | 'tuzatish', izoh?: string) => tomonYoz('qaror', k, { taqdim_id: taqdimId, qaror, izoh: izoh || null });
export const taqdimniQaytar = (k: number, taqdimId: number, sabab?: string) => tomonYoz('taqdim_qaytar', k, { taqdim_id: taqdimId, sabab: sabab || null });
export const izohYoz = (k: number, p: { aloqaId?: number; taqdimId?: number; matn: string }) => tomonYoz('izoh', k, { aloqa_id: p.aloqaId ?? null, taqdim_id: p.taqdimId ?? null, matn: p.matn });
