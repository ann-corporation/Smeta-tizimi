import { yozAmali } from './supabase';

/**
 * «Bajarilmadi» qoplamasi (egasi 2026-10-24, Fakt universal): smeta qatorlari O'ZGARMAYDI — bajarilmagan hajm, sabab, sana, kim,
 * dalil hujjat (t2_document_registry → R2) alohida jadvalda (`t2_qator_bajarilmadi`). Yozish: fakt.write; o'qish: fakt.read.
 */
export const BAJARILMADI_SABABLAR = [
  { kod: 'buyurtmachi_chiqardi', nom: 'Buyurtmachi loyihadan chiqardi' },
  { kod: 'loyiha_ozgardi', nom: 'Loyiha o‘zgardi' },
  { kod: 'boshqa_pudratchi', nom: 'Boshqa pudratchiga berildi' },
  { kod: 'texnik_sabab', nom: 'Texnik sabab' },
  { kod: 'zamena', nom: 'Zamena qilindi' },
  { kod: 'material_yoq', nom: 'Material/uskuna yetkazilmadi' },
  { kod: 'boshqa', nom: 'Boshqa (izoh majburiy)' },
] as const;
export type BajarilmadiSabab = (typeof BAJARILMADI_SABABLAR)[number]['kod'];

export type BajarilmadiQator = {
  id: number; obyekt_id: number; qator_id: number; kod: string | null; nom: string | null; birlik: string | null; tur: string | null;
  smeta_hajm: number | null; fakt_hajm: number | null; hajm: number | null; bajarilmagan_hajm: number;
  sabab_kod: BajarilmadiSabab; sabab_izoh: string | null; hujjat_id: number | null; hujjat_nom: string | null;
  sana: string; zamena_qator_id: number | null; holat: 'faol' | 'bekor'; kim: string | null; yaratildi: string;
};

export async function bajarilmadiRoyxatOl(kompaniyaId: number, obyektId?: number | null): Promise<{ ok: boolean; qatorlar: BajarilmadiQator[]; error?: string }> {
  const r = await fetch('/api/sb', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ soro: 'bajarilmadi_royxat_v1', kompaniya_id: kompaniyaId, ...(obyektId ? { obyekt_id: obyektId } : {}) }),
  });
  const j = await r.json() as { ok: boolean; natija?: { ok: boolean; qatorlar?: BajarilmadiQator[] }; error?: string };
  if (!j.ok || !j.natija || j.natija.ok !== true) return { ok: false, qatorlar: [], error: j.error || 'Bajarilmadi ro‘yxati o‘qilmadi' };
  return { ok: true, qatorlar: j.natija.qatorlar || [] };
}

export type BajarilmadiNatija = { ok: boolean; yaratildi?: number; otkazildi?: number; code?: string; error?: string };

export function bajarilmadiBelgila(p: {
  kompaniyaId: number; obyektId: number; qatorlar: Array<{ qator_id: number; hajm?: number | null }>;
  sabab: BajarilmadiSabab; izoh?: string; hujjatId?: number | null; sana?: string; zamenaQatorId?: number | null; operationId: string;
}) {
  return yozAmali({
    amal: 'bajarilmadi_belgila', kompaniya_id: p.kompaniyaId, obyekt_id: p.obyektId, qatorlar: p.qatorlar, sabab_kod: p.sabab,
    sabab_izoh: p.izoh, hujjat_id: p.hujjatId ?? null, sana: p.sana, zamena_qator_id: p.zamenaQatorId ?? null, operation_id: p.operationId,
  }) as Promise<BajarilmadiNatija>;
}

export function bajarilmadiBekor(p: { kompaniyaId: number; id: number; sabab?: string; operationId: string }) {
  return yozAmali({ amal: 'bajarilmadi_bekor', kompaniya_id: p.kompaniyaId, id: p.id, sabab: p.sabab, operation_id: p.operationId }) as Promise<BajarilmadiNatija>;
}

/** Server kodlari → tushunarli matn. */
export function bajarilmadiXato(r: BajarilmadiNatija): string {
  switch (r.code) {
    case 'SABAB_IZOH_MAJBURIY': return 'Sabab «Boshqa» bo‘lsa izoh yozish shart.';
    case 'QATOR_SCOPE_MISMATCH': return 'Tanlangan qator bu obyektga tegishli emas.';
    case 'HUJJAT_SCOPE_MISMATCH': return 'Dalil hujjat topilmadi yoki boshqa kompaniyaniki.';
    case 'TOPILMADI_YOKI_BEKOR': return 'Yozuv topilmadi yoki allaqachon bekor qilingan.';
    default: return r.error || r.code || 'Amal bajarilmadi';
  }
}
