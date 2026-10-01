/**
 * Fakt kiritishda smetadan tashqari ish (egasi, 2026-10-01): qo'shimcha ish (resurslari bilan),
 * zamena (material yoki ish), smetasiz obyekt. Server: `t2_fakt_smetadan_tashqari_v1` — qator,
 * resurslar va fakt BITTA tranzaksiyada; fakt darhol F2 qoldig'iga aylanadi.
 * Kompaniya ish turlari katalogi: `t2_ish_turi_saqla_v1`; o'qish /api/sb (`t2_ish_turi`).
 */
import { sbOqi, yozAmali, type AktNatija } from './supabase';

export type IshTuri = {
  id: number; kompaniya_id: number; kod: string; nomi: string; birligi: string;
  norma: number | null; narx: number | null; kategoriya: string | null; versiya: number;
};

export function sbIshTurlariOl(kompaniyaId: number) {
  return sbOqi<IshTuri>({ jadval: 't2_ish_turi', filtr: 'kompaniya_id=eq.' + kompaniyaId, tartib: 'kod.asc', limit: 5000 });
}

export type SmetadanTashqariResurs = { tur: 'mat' | 'ob'; nom: string; birlik: string; hajm: number; kod?: string };

export type FaktSmetadanTashqariInput = {
  kompaniyaId: number; obyektId: number;
  /** additional — yangi mustaqil ish; replacement — qatorni almashtiradi (eski o'zgarmaydi). */
  command: 'additional' | 'replacement';
  /** Qo'shimcha ish uchun bo'lim (rz). Bo'sh — "СМЕТАДАН ТАШҚАРИ ИШЛАР" bo'limi (smetasiz obyekt ham). */
  otaQatorId?: number | null;
  almashtirilayotganQatorId?: number;
  /** Ota qatorning versiyasi (optimistic lock); bo'lim tanlanmagan bo'lsa server o'zi oladi. */
  kutilganVersiya?: number | null;
  nom?: string; birlik?: string; kod?: string;
  /** Bajarilgan hajm — fakt sifatida yoziladi va F2 qoldig'i bo'ladi. */
  hajm: number; sana: string; sabab: string;
  resurslar?: SmetadanTashqariResurs[];
  ishTuriId?: number; katalogaSaqla?: boolean;
  operationId: string;
};

export function sbFaktSmetadanTashqari(p: FaktSmetadanTashqariInput): Promise<AktNatija & { resurs_ids?: number[]; ish_turi_id?: number | null; code?: string }> {
  return yozAmali({
    amal: 'fakt_smetadan_tashqari_v1', kompaniya_id: p.kompaniyaId, obyekt_id: p.obyektId,
    command: p.command, ota_qator_id: p.otaQatorId ?? null, almashtirilayotgan_qator_id: p.almashtirilayotganQatorId ?? null,
    kutilgan_versiya: p.kutilganVersiya ?? 0, nom: p.nom ?? null, birlik: p.birlik ?? null, kod: p.kod ?? null,
    hajm: p.hajm, sana: p.sana, sabab: p.sabab, resurslar: p.resurslar?.length ? p.resurslar : null,
    ish_turi_id: p.ishTuriId ?? null, katalogga_saqla: p.katalogaSaqla === true, operation_id: p.operationId,
  });
}

export function sbIshTuriSaqla(p: {
  kompaniyaId: number; id?: number; kutilganVersiya?: number;
  kod: string; nomi: string; birligi: string; narx?: number | null; norma?: number | null; kategoriya?: string | null;
}): Promise<AktNatija & { id?: number; versiya?: number; code?: string }> {
  return yozAmali({
    amal: 'ish_turi_saqla_v1', kompaniya_id: p.kompaniyaId, id: p.id ?? null, kutilgan_versiya: p.kutilganVersiya ?? null,
    kod: p.kod, nomi: p.nomi, birligi: p.birligi, narx: p.narx ?? null, norma: p.norma ?? null, kategoriya: p.kategoriya ?? null,
  });
}

/** Server xato kodlarini foydalanuvchi tiliga. */
export function smetadanTashqariXato(r: { error?: string; xabar?: string; code?: string } | null | undefined): string {
  const m = `${r?.code ?? ''} ${r?.error ?? ''} ${r?.xabar ?? ''}`;
  if (/STALE_VERSION/.test(m)) return 'Smeta shu orada o‘zgargan — jadvalni yangilab qayta urinib ko‘ring.';
  if (/TREE_STRUCTURE_INVALID|REPLACEMENT_SCOPE_INVALID/.test(m)) return 'Tanlangan bo‘lim yoki qator bu amal uchun mos emas.';
  if (/RS_FAKT_YOQ/.test(m)) return 'Mehnat/mashina (RS) qatori almashtirilmaydi — ish yoki material qatorini tanlang.';
  if (/RESURS_INVALID/.test(m)) return 'Resurs qatorida tur, nom, birlik va hajm (> 0) majburiy.';
  if (/WRITE_ROLE_REQUIRED/.test(m)) return 'Bu amal uchun PTO, rahbar yoki admin roli kerak.';
  if (/NAME_UNIT_REASON_REQUIRED/.test(m)) return 'Nom, birlik va sabab majburiy.';
  return r?.error || r?.xabar || r?.code || 'Saqlab bo‘lmadi.';
}
