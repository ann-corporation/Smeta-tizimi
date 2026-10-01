/**
 * t2-narx-dalil.ts — narx manbalari (katalog, faktura, КП, kalkulyatsiyalar) va smeta
 * narxlarining dalili (egasi Q4/Q5, 2026-10-01). Migratsiya: 20261105130000_t2_narx_dalil_v1.
 * Takliflar qoidalari: lib/narx-dalil/taklif.ts. Hujjat: lib/narx-asoslash-export.ts.
 */
import { sbOqi } from './supabase';

export type NarxManbaTur = 'katalog' | 'faktura' | 'kp' | 'kalkulyatsiya_mash' | 'chel_chas' | 'boshqa';

export const NARX_MANBA_TUR_NOMI: Record<NarxManbaTur, string> = {
  katalog: 'Каталог (текущие цены)',
  faktura: 'Счет-фактура',
  kp: 'Коммерческое предложение',
  kalkulyatsiya_mash: 'Калькуляция стоимости маш.-часа',
  chel_chas: 'Стоимость чел.-часа (публикация)',
  boshqa: 'Иной документ',
};

export type NarxManba = {
  id: number; kompaniya_id: number; tur: NarxManbaTur; nom: string; raqam: string | null; sana: string | null;
  yetkazuvchi: string | null; yetkazuvchi_inn: string | null; region: string | null;
  yil: number | null; kvartal: number | null; nds_holati: 'nds_siz' | 'nds_bilan' | 'nomalum';
  fayl_document_id: string | null; izoh: string | null; holat: 'faol' | 'bekor'; versiya: number;
  kim: string | null; yaratildi: string; yangilandi: string; qator_soni: number; dalil_soni: number;
};

export type NarxManbaMalumot = Partial<Pick<NarxManba, 'tur' | 'nom' | 'raqam' | 'sana' | 'yetkazuvchi' | 'yetkazuvchi_inn' | 'region' | 'yil' | 'kvartal' | 'nds_holati' | 'fayl_document_id' | 'izoh'>>;
export type NarxManbaQatorKirish = { kod?: string | null; nom: string; birlik?: string | null; narx?: number | null; izoh?: string | null };
export type NarxManbaQidiruvQatori = {
  id: number; manba_id: number; kompaniya_id: number; kod: string | null; nom: string;
  birlik: string | null; narx: number | null; izoh: string | null;
};

export type NarxTaklif = {
  kompaniya_id: number; obyekt_id: number; qator_id: number; tur: string; kat: string | null;
  kod: string | null; nom: string | null; birlik: string | null; smeta_narx: number | null;
  manba_qator_id: number; manba_id: number; manba_tur: NarxManbaTur; manba_nom: string; manba_raqam: string | null;
  manba_sana: string | null; yil: number | null; kvartal: number | null; region: string | null; yetkazuvchi: string | null;
  nds_holati: NarxManba['nds_holati']; manba_kod: string | null; manba_nom_qator: string; manba_birlik: string | null;
  manba_narx: number; moslik: 'kod' | 'nom_birlik';
};

export type NarxDalilHolat = {
  id: number; kompaniya_id: number; obyekt_id: number; qator_id: number; tur: string; kat: string | null;
  kod: string | null; nom: string | null; birlik: string | null; hajm: number | null; hozirgi_narx: number | null;
  smeta_narx: number | null; manba_narx: number | null; izoh: string | null; kim: string | null; vaqt: string;
  manba_id: number; manba_tur: NarxManbaTur; manba_nom: string; manba_raqam: string | null; manba_sana: string | null;
  yil: number | null; kvartal: number | null; region: string | null; yetkazuvchi: string | null; yetkazuvchi_inn: string | null;
  nds_holati: NarxManba['nds_holati']; fayl_document_id: string | null;
  manba_kod: string | null; manba_nom_qator: string; manba_birlik: string | null;
};

export function sbNarxManbalarOl(kompaniyaId: number) {
  return sbOqi<NarxManba>({ jadval: 't2_narx_manba_royxat', filtr: 'kompaniya_id=eq.' + kompaniyaId + '&holat=eq.faol', tartib: 'yangilandi.desc', limit: 1000 });
}
/** Source rows are read-only evidence. They are used for semantic suggestions;
 * this read never changes smeta/Fakt/F2 prices. */
export function sbNarxManbaQidiruvQatorlariOl(kompaniyaId: number) {
  return sbOqi<NarxManbaQidiruvQatori>({
    jadval: 't2_narx_manba_qator',
    ustunlar: 'id,manba_id,kompaniya_id,kod,nom,birlik,narx,izoh',
    filtr: 'kompaniya_id=eq.' + kompaniyaId,
    tartib: 'id.asc',
    limit: 50000,
  });
}
export function sbNarxTakliflarOl(kompaniyaId: number, obyektId: number) {
  return sbOqi<NarxTaklif>({ jadval: 't2_narx_taklif', filtr: 'kompaniya_id=eq.' + kompaniyaId + '&obyekt_id=eq.' + obyektId, limit: 50000 });
}
export function sbNarxDalillarOl(kompaniyaId: number, obyektId: number) {
  return sbOqi<NarxDalilHolat>({ jadval: 't2_narx_dalil_holat', filtr: 'kompaniya_id=eq.' + kompaniyaId + '&obyekt_id=eq.' + obyektId, limit: 50000 });
}

type Natija = { ok: boolean; error?: string; sabab?: string; id?: number; versiya?: number; qator_qoshildi?: number; boglandi?: number; olib_tashlandi?: number };

async function yoz(yuk: Record<string, unknown>): Promise<Natija> {
  try {
    const r = await fetch('/api/sb-yoz', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(yuk) });
    return (await r.json()) as Natija;
  } catch (e) {
    return { ok: false, error: 'Tarmoq: ' + (e instanceof Error ? e.message : String(e)) };
  }
}

/** Bitta chaqiruv (metama'lumot + ixtiyoriy qatorlar bo'lagi). */
export function sbNarxManbaYoz(p: { kompaniyaId: number; malumot: NarxManbaMalumot; qatorlar?: NarxManbaQatorKirish[] | null; rejim?: 'almashtir' | 'qosh'; id?: number; kutilganVersiya?: number; operationId?: string }) {
  return yoz({
    amal: 'narx_manba_yoz', kompaniya_id: p.kompaniyaId, malumot: p.malumot, qatorlar: p.qatorlar ?? null, rejim: p.rejim ?? 'almashtir',
    id: p.id, kutilgan_versiya: p.kutilganVersiya, operation_id: p.operationId,
  });
}

/** Katta manba (katalog 25–30 ming qator): yaratadi va qatorlarni bo'laklab yuklaydi. */
export async function narxManbaniYukla(kompaniyaId: number, malumot: NarxManbaMalumot, qatorlar: NarxManbaQatorKirish[], operationId: string, bolak = 5000, jarayon?: (yuklandi: number, jami: number) => void): Promise<Natija> {
  const birinchi = await sbNarxManbaYoz({ kompaniyaId, malumot, qatorlar: qatorlar.slice(0, bolak), rejim: 'almashtir', operationId });
  if (!birinchi.ok || !birinchi.id) return birinchi;
  let versiya = 1;
  let yuklandi = Math.min(bolak, qatorlar.length);
  jarayon?.(yuklandi, qatorlar.length);
  for (let i = bolak; i < qatorlar.length; i += bolak) {
    const r = await sbNarxManbaYoz({ kompaniyaId, malumot: {}, qatorlar: qatorlar.slice(i, i + bolak), rejim: 'qosh', id: birinchi.id, kutilganVersiya: versiya });
    if (!r.ok) return { ...r, id: birinchi.id, error: `${yuklandi} ta qator yuklangandan keyin to'xtadi: ${r.error ?? r.sabab ?? ''}` };
    versiya++;
    yuklandi = Math.min(i + bolak, qatorlar.length);
    jarayon?.(yuklandi, qatorlar.length);
  }
  return { ok: true, id: birinchi.id, qator_qoshildi: yuklandi };
}

export function sbNarxManbaBekor(kompaniyaId: number, id: number, kutilganVersiya: number) {
  return yoz({ amal: 'narx_manba_bekor', kompaniya_id: kompaniyaId, id, kutilgan_versiya: kutilganVersiya });
}

/** Operator tanlagan dalillarni yozish (smeta narxi o'zgarmaydi). */
export function sbNarxDalilBogla(kompaniyaId: number, obyektId: number, boglar: { qator_id: number; manba_qator_id: number; izoh?: string }[]) {
  return yoz({ amal: 'narx_dalil_bogla', kompaniya_id: kompaniyaId, obyekt_id: obyektId, boglar });
}

export function sbNarxDalilOchir(kompaniyaId: number, obyektId: number, qatorIds: number[]) {
  return yoz({ amal: 'narx_dalil_ochir', kompaniya_id: kompaniyaId, obyekt_id: obyektId, qator_ids: qatorIds });
}
