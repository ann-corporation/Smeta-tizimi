/**
 * Протокол согласования цен (egasi 2026-10-03). Mavjud t2_price_basis (PRICE_AGREEMENT_PROTOCOL) ustida:
 * qoralama → imzolangan nusxa R2 ga yuklanadi → tasdiqlanadi (kuchga kirish oyi) → shu oydan F2 narxi protokoldan.
 * Migratsiya: 20261105332000_t2_narx_protokol.
 */
import { sbOqi, yangiOperationId } from './supabase';

export type NarxProtokol = {
  id: number; kompaniya_id: number; obyekt_id: number; obyekt: string | null; raqam: string; sana: string;
  holat: 'qoralama' | 'tasdiqlangan' | 'bekor'; versiya: number; document_id: number | null; hujjat_nom: string | null;
  izoh: string | null; yaratildi: string; tasdiqlandi: string | null; qator_soni: number; kuchga_kirish: string | null;
};
export type NarxProtokolQator = {
  id: number; basis_id: number; kompaniya_id: number; obyekt_id: number; raqam: string; sana: string; holat: NarxProtokol['holat'];
  qator_id: number; kat: string | null; kod: string | null; nom: string | null; birlik: string | null;
  eski_narx: number | null; yangi_narx: number; valid_from: string | null; valid_to: string | null; manba_qator_id: number | null; izoh: string | null;
};
type Natija = { ok: boolean; error?: string; id?: number; raqam?: string };

async function yoz(yuk: Record<string, unknown>): Promise<Natija> {
  try {
    const r = await fetch('/api/sb-yoz', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(yuk) });
    const matn = await r.text();
    try { return JSON.parse(matn) as Natija; } catch { return { ok: false, error: `Server javob bermadi (HTTP ${r.status})` }; }
  } catch (e) { return { ok: false, error: 'Tarmoq: ' + (e instanceof Error ? e.message : String(e)) }; }
}

export function narxProtokollarOl(obyektId: number) {
  return sbOqi<NarxProtokol>({ jadval: 't2_narx_protokol_royxat', filtr: 'obyekt_id=eq.' + obyektId, tartib: 'id.desc', limit: 200 });
}
export function narxProtokolQatorlariOl(obyektId: number, basisId?: number) {
  return sbOqi<NarxProtokolQator>({ jadval: 't2_narx_protokol_qator', filtr: 'obyekt_id=eq.' + obyektId + (basisId ? '&basis_id=eq.' + basisId : ''), tartib: 'id.asc', limit: 20000 });
}
export function narxProtokolYarat(obyektId: number, qatorlar: Array<{ qator_id: number; yangi_narx: number; manba_qator_id?: number | null; izoh?: string | null }>, izoh?: string) {
  return yoz({ amal: 'narx_protokol_yarat', obyekt_id: obyektId, qatorlar, izoh: izoh ?? null, operation_id: yangiOperationId() });
}
export function narxProtokolTasdiqla(id: number, documentId: number, kuchgaKirish: string) {
  return yoz({ amal: 'narx_protokol_tasdiqla', id, document_id: documentId, kuchga_kirish: kuchgaKirish });
}
export function narxProtokolBekor(id: number, sabab: string) {
  return yoz({ amal: 'narx_protokol_bekor', id, sabab });
}

/** F2 uchun: shu oyda amalda bo'lgan protokol narxlari (tasdiqlangan, kuchga kirgan; bir qatorga bir nechta — eng yangisi). */
export function amaldagiProtokolNarxlari(qatorlar: readonly NarxProtokolQator[], oy: string): Map<number, { narx: number; raqam: string; sana: string }> {
  const oxiri = /^\d{4}-\d{2}/.test(oy) ? oy.slice(0, 7) : '';
  const m = new Map<number, { narx: number; raqam: string; sana: string; boshi: string; basis: number }>();
  for (const q of qatorlar) {
    if (q.holat !== 'tasdiqlangan' || !q.valid_from) continue;
    const boshi = q.valid_from.slice(0, 7);
    if (oxiri && boshi > oxiri) continue;
    if (q.valid_to && oxiri && q.valid_to.slice(0, 7) < oxiri) continue;
    const old = m.get(q.qator_id);
    // Keyinroq kuchga kirgani; bir oyda — keyin yaratilgan protokol.
    if (!old || boshi > old.boshi || (boshi === old.boshi && q.basis_id > old.basis)) {
      m.set(q.qator_id, { narx: Number(q.yangi_narx), raqam: q.raqam, sana: q.sana, boshi, basis: q.basis_id });
    }
  }
  return new Map([...m].map(([k, v]) => [k, { narx: v.narx, raqam: v.raqam, sana: v.sana }]));
}
