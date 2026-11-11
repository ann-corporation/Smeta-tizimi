/**
 * forma3-skop.ts — Forma 3 yaratish so'rovining scope (obyekt YOKI shartnoma) tekshiruvi.
 * Obyekt rejimi: obyekt_id majburiy. Shartnoma rejimi: obyekt_id YO'Q + shartnoma_id majburiy (bitta F3 — shartnomaning barcha obyektlari).
 * Ikkalasi berilsa — obyekt rejimi (eski xulq, RPC ham obyektni ustun qo'yadi). Hamma narsa serverda qayta tekshiriladi
 * (t2_forma3_yarat_v1: a'zolik, akt-obyekt-shartnoma bog'i, davr, band); bu faqat kirish shakli.
 */
export type Forma3YaratParams = {
  obyektId: number | null;
  shartnomaId: number | null;
  loyihaId: number | null;
  aktIds: number[];
  davrBoshi: string;
  davrOxiri: string;
};

const ID = /^\d{1,15}$/;
const SANA = /^\d{4}-\d{2}-\d{2}$/;
const musbat = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const s = String(v);
  if (!ID.test(s)) return NaN;
  const n = Number(s);
  return n > 0 ? n : NaN;
};

export function forma3YaratTekshir(b: Record<string, any>): { ok: true; p: Forma3YaratParams } | { ok: false; code: string } {
  const obyektId = musbat(b.obyekt_id);
  const shartnomaId = musbat(b.shartnoma_id);
  const loyihaId = musbat(b.loyiha_id);
  if ([obyektId, shartnomaId, loyihaId].some((x) => x != null && Number.isNaN(x))) return { ok: false, code: 'PARAMS' };
  if (obyektId == null && shartnomaId == null) return { ok: false, code: 'PARAMS' };
  if (!Array.isArray(b.akt_ids) || b.akt_ids.length === 0 || b.akt_ids.length > 2000) return { ok: false, code: 'PARAMS' };
  const aktIds = b.akt_ids.map((x: unknown) => (ID.test(String(x)) && Number(x) > 0 ? Number(x) : NaN));
  if (aktIds.some((x: number) => Number.isNaN(x))) return { ok: false, code: 'PARAMS' };
  if (!SANA.test(String(b.davr_boshi ?? '')) || !SANA.test(String(b.davr_oxiri ?? '')) || String(b.davr_oxiri) < String(b.davr_boshi)) return { ok: false, code: 'PARAMS' };
  return {
    ok: true,
    p: { obyektId, shartnomaId, loyihaId, aktIds: [...new Set<number>(aktIds)], davrBoshi: String(b.davr_boshi), davrOxiri: String(b.davr_oxiri) },
  };
}
