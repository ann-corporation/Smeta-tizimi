/**
 * t2-ijro.ts — Ijro hujjatlari v2 (2026-10-01): АОСР blank maydonlari
 * (ШНК 3.01.01-22 Прил.6), laboratoriya protokollari (laboratoriya —
 * kontragent, roli `laboratoriya`), kompaniya logosi.
 * Migratsiya: 20261105100000_t2_ijro_aosr_lab_logo_v1.
 * Yozish — `/api/sb-yoz` nomli amallari (kompaniya_id majburiy, a'zolik serverda).
 */
import { sbOqi } from './supabase';

export type IjroNatija = {
  ok: boolean; error?: string; sabab?: string;
  id?: number; versiya?: number; takror?: boolean; bordagi_versiya?: number;
};

async function yoz(yuk: Record<string, unknown>): Promise<IjroNatija> {
  try {
    const r = await fetch('/api/sb-yoz', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(yuk) });
    return (await r.json()) as IjroNatija;
  } catch (e) {
    return { ok: false, error: 'Tarmoq: ' + (e instanceof Error ? e.message : String(e)) };
  }
}

/* ── АОСР ─────────────────────────────────────────────────────────── */
export type AosrKomissiyaYozuv = { rol: string; tashkilot?: string; fio?: string; lavozim?: string };
export type AosrTur = 'aosr' | 'oraliq_qabul' | 'sinov';
export type AosrHolat = 'yangi' | 'tasdiqlangan' | 'qogoz' | 'bekor';

export type AosrV2 = {
  id: number; kompaniya_id: number; obyekt_id: number; obyekt: string;
  tur: AosrTur; raqam: string | null; sana: string | null;
  ish_nomi: string | null; ish_tavsifi: string | null;
  boshlanish_sana: string | null; tugash_sana: string | null; bajarilgan: string | null;
  blank_varianti: 'subpudratchili' | 'subpudratchisiz';
  loyiha_tashkiloti: string | null; loyiha_hujjati: string | null; materiallar: string | null;
  chetlanishlar: string | null; keyingi_ishlar: string | null; komissiya: AosrKomissiyaYozuv[];
  pdf_url: string | null; izoh: string | null; holat: AosrHolat;
  versiya: number; yaratildi: string; yangilandi: string;
  boglangan_ish_soni: number; protokol_soni: number;
};

/** Tahrirlanadigan maydonlar. */
export type AosrMalumot = Partial<Pick<AosrV2,
  'tur' | 'raqam' | 'sana' | 'ish_nomi' | 'ish_tavsifi' | 'boshlanish_sana' | 'tugash_sana' | 'bajarilgan'
  | 'blank_varianti' | 'loyiha_tashkiloti' | 'loyiha_hujjati' | 'materiallar' | 'chetlanishlar'
  | 'keyingi_ishlar' | 'komissiya' | 'izoh'>> & { holat?: Exclude<AosrHolat, 'bekor'> };

export function sbAosrV2Ol(kompaniyaId: number, obyektId?: number) {
  return sbOqi<AosrV2>({
    jadval: 't2_aosr_reestr_v2',
    filtr: 'kompaniya_id=eq.' + kompaniyaId + (obyektId ? '&obyekt_id=eq.' + obyektId : ''),
    tartib: 'yaratildi.desc', limit: 2000,
  });
}

/** Yaratish (`id` yo'q — `operationId` majburiy) yoki tahrir (`id` + `kutilganVersiya`).
 *  `malumot` da faqat o'zgartiriladigan maydonlar yuboriladi. */
export function sbAosrYozV2(p: { kompaniyaId: number; obyektId: number; malumot: AosrMalumot; id?: number; kutilganVersiya?: number; operationId?: string }) {
  return yoz({
    amal: 'aosr_yoz_v2', kompaniya_id: p.kompaniyaId, obyekt_id: p.obyektId, malumot: p.malumot,
    id: p.id, kutilgan_versiya: p.kutilganVersiya, operation_id: p.operationId,
  });
}

/* ── Laboratoriya protokollari ────────────────────────────────────── */
export type SinovTuri = 'beton' | 'grunt' | 'armatura' | 'payvand' | 'material' | 'boshqa';
export type SinovNatija = 'mos' | 'mos_emas' | 'kutilmoqda';

export type LabProtokol = {
  id: number; kompaniya_id: number; obyekt_id: number; obyekt: string;
  laboratoriya_id: number | null; laboratoriya: string | null; laboratoriya_inn: string | null;
  raqam: string; sana: string | null; sinov_turi: SinovTuri;
  konstruksiya: string | null; marka: string | null; hajm: number | null; birlik: string | null;
  natija: SinovNatija; invoys_raqam: string | null; invoys_sana: string | null; summa: number | null;
  fayl_document_id: string | null; izoh: string | null; holat: 'faol' | 'bekor';
  versiya: number; yaratildi: string; yangilandi: string;
  aosr_ids: number[]; qator_ids: number[];
};

export type LabProtokolMalumot = Partial<Pick<LabProtokol,
  'laboratoriya_id' | 'raqam' | 'sana' | 'sinov_turi' | 'konstruksiya' | 'marka' | 'hajm' | 'birlik'
  | 'natija' | 'invoys_raqam' | 'invoys_sana' | 'summa' | 'fayl_document_id' | 'izoh'>>;

export const SINOV_TURI_NOM: Record<SinovTuri, string> = {
  beton: 'Бетон', grunt: 'Грунт (уплотнение)', armatura: 'Арматура', payvand: 'Сварные соединения',
  material: 'Материал', boshqa: 'Прочее',
};
export const SINOV_NATIJA_NOM: Record<SinovNatija, string> = { mos: 'Соответствует', mos_emas: 'Не соответствует', kutilmoqda: 'Ожидается' };

export function sbLabProtokollarOl(kompaniyaId: number, obyektId?: number) {
  return sbOqi<LabProtokol>({
    jadval: 't2_lab_protokol_reestr',
    filtr: 'kompaniya_id=eq.' + kompaniyaId + (obyektId ? '&obyekt_id=eq.' + obyektId : '') + '&holat=eq.faol',
    tartib: 'yaratildi.desc', limit: 5000,
  });
}

export function sbLabProtokolYoz(p: { kompaniyaId: number; obyektId: number; malumot: LabProtokolMalumot; id?: number; kutilganVersiya?: number; operationId?: string }) {
  return yoz({
    amal: 'lab_protokol_yoz', kompaniya_id: p.kompaniyaId, obyekt_id: p.obyektId, malumot: p.malumot,
    id: p.id, kutilgan_versiya: p.kutilganVersiya, operation_id: p.operationId,
  });
}

export function sbLabProtokolBekor(kompaniyaId: number, id: number, kutilganVersiya: number) {
  return yoz({ amal: 'lab_protokol_bekor', kompaniya_id: kompaniyaId, id, kutilgan_versiya: kutilganVersiya });
}

/** Protokol ↔ АОСР / smeta qatorlari — ro'yxat TO'LIQ almashtiriladi. */
export function sbLabProtokolBogSaqla(kompaniyaId: number, protokolId: number, aosrIds: number[], qatorIds: number[]) {
  return yoz({ amal: 'lab_protokol_bog_saqla', kompaniya_id: kompaniyaId, protokol_id: protokolId, aosr_ids: aosrIds, qator_ids: qatorIds });
}

/* ── Kompaniya logosi ─────────────────────────────────────────────── */
export type KompaniyaLogo = { kompaniya_id: number; mime: 'image/png' | 'image/jpeg'; data_b64: string; versiya: number; yangilandi: string };

export async function sbKompaniyaLogoOl(kompaniyaId: number): Promise<KompaniyaLogo | null> {
  const j = await sbOqi<KompaniyaLogo>({ jadval: 't2_kompaniya_logo', filtr: 'kompaniya_id=eq.' + kompaniyaId, limit: 1 });
  return j.ok && j.qatorlar?.length ? j.qatorlar[0] : null;
}

/** Logo yuklash (PNG/JPEG, base64 ≤ 300 KB) yoki olib tashlash (`dataB64: null`). Faqat boss/admin. */
export function sbKompaniyaLogoSaqla(kompaniyaId: number, mime: 'image/png' | 'image/jpeg' | null, dataB64: string | null) {
  return yoz({ amal: 'kompaniya_logo_saqla', kompaniya_id: kompaniyaId, mime, data_b64: dataB64 });
}
