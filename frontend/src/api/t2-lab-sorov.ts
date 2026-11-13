/**
 * t2-lab-sorov.ts — sinov so'rovi (pudratchi) ↔ laboratoriya protokoli klienti. Shlyuz: /api/laboratoriya.
 * Hamma ruxsat serverda (a'zolik, rol, faol aloqa); bu fayl faqat so'rov yuboradi va javobni tiplaydi.
 */
import { yangiOperationId } from './supabase';

export type MaydonTuri = 'matn' | 'son' | 'sana';
export type SinovMaydon = { kalit: string; nom: string; tur: MaydonTuri; birlik?: string; majburiy?: boolean };
export type SinovTuri = { kalit: string; nom: string; nom_ru: string | null; standart: string | null; norma_izoh: string | null; maydonlar: SinovMaydon[] };
export type SorovHolat = 'ochiq' | 'bajarildi' | 'yopildi' | 'bekor';
export type SorovNatija = 'kutilmoqda' | 'mos' | 'mos_emas';

export type SorovQisqa = {
  id: number; sinov_turi: string; sinov_nom: string; sarlavha: string; holat: SorovHolat; natija: SorovNatija; muhimlik: string; muddat: string | null; kechikkan: boolean;
  majburiy: boolean; qayta_sinov: boolean; obyekt_id: number; obyekt_nom: string | null; aosr_id: number | null; aosr_raqam: string | null; qator_id: number | null;
  joy: string | null; konstruksiya: string | null; qarshi_nom: string | null; protokol_raqam: string | null; summa: number | null; versiya: number; yaratildi: string;
};
export type SorovTafsilot = {
  sorov: {
    id: number; sinov_turi: string; sinov_nom: string; standart: string | null; maydonlar: SinovMaydon[]; holat: SorovHolat; natija: SorovNatija; matn: string | null; joy: string | null;
    muddat: string | null; konstruksiya: string | null; namuna_soni: number | null; majburiy: boolean; asl_sorov_id: number | null; obyekt_nom: string | null;
    aosr_id: number | null; aosr_raqam: string | null; qator_id: number | null; protokol_raqam: string | null; protokol_sana: string | null;
    natija_maydon: Record<string, string | number>; xulosa: string | null; summa: number | null; invoys_raqam: string | null; invoys_sana: string | null;
    fayl_document_id: number | null; predpisaniya_id: number | null; qarz_yozildi: boolean; versiya: number; men_laboratoriyaman: boolean; beruvchi_nom: string | null; lab_nom: string | null;
  };
  hujjatlar: Array<{ document_id: number; fayl: string | null; mime: string | null; olcham: number | null }>;
};
export type AosrSinovHolati = { aosr_id: number; bloklangan: boolean; holat: { nomos: Array<{ murojaat_id: number; nom: string; protokol_raqam: string | null }>; kutilmoqda: Array<{ murojaat_id: number; nom: string }> } };

export type LabJavob<T> = { ok: true; natija: T } | { ok: false; error: string; code?: string };
type Xom = { ok?: boolean; natija?: unknown; error?: string; code?: string } & Record<string, unknown>;

async function chaqir(url: string, init?: RequestInit): Promise<Xom> {
  try {
    const r = await fetch(url, init);
    const matn = await r.text();
    try { return JSON.parse(matn) as Xom; } catch { return { ok: false, error: `Server javob bermadi (HTTP ${r.status})` }; }
  } catch (e) { return { ok: false, error: 'Tarmoq: ' + (e instanceof Error ? e.message : String(e)) }; }
}

async function oqi<T>(bolim: string, kompaniyaId: number, params: Record<string, string | number | null | undefined> = {}): Promise<LabJavob<T>> {
  const q = new URLSearchParams({ bolim, kompaniya_id: String(kompaniyaId) });
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') q.set(k, String(v));
  const d = await chaqir('/api/laboratoriya?' + q.toString(), { credentials: 'same-origin' });
  if (d.ok === false) return { ok: false, error: d.error || 'Xato', code: d.code };
  return { ok: true, natija: ('natija' in d ? d.natija : d) as T };
}

async function yoz<T = Record<string, unknown>>(amal: string, kompaniyaId: number, yuk: Record<string, unknown>): Promise<LabJavob<T>> {
  const d = await chaqir('/api/laboratoriya', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amal, kompaniya_id: kompaniyaId, ...yuk }) });
  if (d.ok === false) return { ok: false, error: d.error || 'Xato', code: d.code };
  return { ok: true, natija: d as unknown as T };
}

export const sinovTurlariOl = (k: number) => oqi<SinovTuri[]>('turlar', k);
export const sorovlarOl = (k: number, p: { yonalish: 'kelgan' | 'yuborilgan'; holat?: string; obyektId?: number | null; aosrId?: number | null }) =>
  oqi<SorovQisqa[]>('royxat', k, { yonalish: p.yonalish, holat: p.holat, obyekt_id: p.obyektId, aosr_id: p.aosrId });
export const sorovTafsilotOl = async (k: number, id: number): Promise<LabJavob<SorovTafsilot>> => {
  const r = await oqi<SorovTafsilot & { ok?: boolean }>('tafsilot', k, { murojaat_id: id });
  return r;
};
export const aosrSinovHolatiOl = async (k: number, obyektId: number): Promise<LabJavob<AosrSinovHolati[]>> => {
  const r = await oqi<{ aktlar?: AosrSinovHolati[] }>('aosr_holat', k, { obyekt_id: obyektId });
  return r.ok ? { ok: true, natija: r.natija.aktlar ?? [] } : r;
};

/** Uchinchi tomon (texnadzor, buyurtmachi): faol lab_natija granti bo'yicha laboratoriya natijalari (faqat o'qish; summa/hisob yo'q). */
export type LabNatija = {
  id: number; kompaniya_id: number; sinov_turi: string; sinov_nom: string; holat: string; natija: 'mos' | 'mos_emas'; protokol_raqam: string | null; protokol_sana: string | null;
  xulosa: string | null; maydon: Record<string, string | number> | null; obyekt_id: number; obyekt_nom: string | null; konstruksiya: string | null; qayta_sinov: boolean;
};
export const labNatijalarOl = (k: number, obyektId?: number | null) => oqi<LabNatija[]>('natija_royxat', k, { obyekt_id: obyektId });

export type SorovYuborish = {
  aloqaId: number; sinovTuri?: string; obyektId?: number | null; aosrId?: number | null; qatorId?: number | null; konstruksiya?: string; joy?: string;
  namunaSoni?: number | null; muddat?: string; izoh?: string; majburiy?: boolean; aslSorovId?: number | null;
};
export const sorovYubor = (k: number, p: SorovYuborish) =>
  yoz<{ id: number; holat: SorovHolat; qayta?: boolean }>('sorov_yarat', k, {
    aloqa_id: p.aloqaId, sinov_turi: p.sinovTuri || null, obyekt_id: p.obyektId ?? null, aosr_id: p.aosrId ?? null, qator_id: p.qatorId ?? null,
    konstruksiya: p.konstruksiya || null, joy: p.joy || null, namuna_soni: p.namunaSoni ?? null, muddat: p.muddat || null, izoh: p.izoh || null,
    majburiy: p.majburiy ?? true, asl_sorov_id: p.aslSorovId ?? null, operation_id: yangiOperationId(),
  });

export type NatijaYuborish = {
  murojaatId: number; versiya: number; natija: 'mos' | 'mos_emas'; protokolRaqam: string; protokolSana?: string; maydon: Record<string, string | number>;
  xulosa?: string; summa?: string; invoysRaqam?: string; invoysSana?: string; bartarafMuddati?: string; documentIds: number[];
};
export const natijaYubor = (k: number, p: NatijaYuborish) =>
  yoz<{ id: number; natija: 'mos' | 'mos_emas'; predpisaniya_id: number | null; qarz: 'yozildi' | 'summa_yoq' | 'shartnoma_yoq' | 'shartnoma_noaniq'; versiya: number }>('natija', k, {
    murojaat_id: p.murojaatId, versiya: p.versiya, natija: p.natija, protokol_raqam: p.protokolRaqam, protokol_sana: p.protokolSana || null, maydon: p.maydon,
    xulosa: p.xulosa || null, summa: p.summa || null, invoys_raqam: p.invoysRaqam || null, invoys_sana: p.invoysSana || null, bartaraf_muddati: p.bartarafMuddati || null, document_ids: p.documentIds,
  });
