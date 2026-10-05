/**
 * Platform price catalogue → immutable R2 shards (owner rule 2026-10-05: unchanging reference data in R2,
 * changing business data in Supabase). Row ids are the original t2_narx_manba_qator ids, so existing
 * evidence (narx dalili / protokol) keeps pointing at the same row. Repeated strings are dictionary-encoded.
 * Matching keys are recomputed with ./kalit and verified against the DB keys; any differing row ships an
 * explicit override (never a silent mismatch).
 */
import { birlikKalit, nomKalit } from './kalit';

export const PRICE_SHARD_SCHEMA = 'narx-katalog-shards-v1';
export const PRICE_BUILD_FORMAT = 2;
export const PRICE_ROWS_PER_FILE = 25000;
/** Small id-ordered files for server-side lookup (a Function parses ~100 KB, within the Workers CPU budget). */
export const PRICE_LOOKUP_ROWS = 1000;

/** Export row (exact DB order): id, manba_id, tartib, kod, nom, birlik, narx(text), hudud, ishlab_chiqaruvchi,
 *  nds_holati, nds_izoh, yil, kvartal, narx_varianti, guruh, kod_key, nom_key, birlik_key, sarlavha */
export type ExportRow = [number, number, number | null, string | null, string, string | null, string | null, string | null, string | null,
  string | null, string | null, number | null, number | null, string | null, string | null, string | null, string | null, string | null, boolean];

/** Shard row: id, tartib, kod, nom, birlik#, narx(text|null), hudud#, zavod#, nds_holati#, nds_izoh#, yil, kvartal, variant#, guruh#
 *  (# = index into the dictionary, -1 = NULL). */
export type PriceRow = [number, number | null, string | null, string, number, string | null, number, number, number, number, number | null, number | null, number, number];
export type PriceManba = { id: number; tur: string; nom: string; raqam: string | null; sana: string | null; yil: number | null; kvartal: number | null;
  region: string | null; yetkazuvchi: string | null; nds_holati: string | null; fayl_document_id: string | null };
export type PriceDict = { birlik: string[]; hudud: string[]; hududKalit: Array<string | null>; zavod: string[]; ndsHolati: string[]; ndsIzoh: string[];
  variant: string[]; guruh: string[]; manba: PriceManba; keyOverrides: Record<string, [string, string]> };

class Dict {
  values: string[] = []; private idx = new Map<string, number>();
  add(v: string | null) { if (v == null) return -1; let i = this.idx.get(v); if (i == null) { i = this.values.length; this.values.push(v); this.idx.set(v, i); } return i; }
}

export function buildPriceShards(rows: ExportRow[], manba: PriceManba, hududKalit: Record<string, string | null>) {
  const d = { birlik: new Dict(), hudud: new Dict(), zavod: new Dict(), ndsHolati: new Dict(), ndsIzoh: new Dict(), variant: new Dict(), guruh: new Dict() };
  const keyOverrides: Record<string, [string, string]> = {};
  const seen = new Set<number>();
  const out: PriceRow[] = [];
  let skipped = 0;
  for (const r of [...rows].sort((a, b) => a[0] - b[0])) {
    if (!Number.isSafeInteger(r[0]) || seen.has(r[0])) throw new Error('ROW_ID_INVALID ' + r[0]);
    seen.add(r[0]);
    if (r[1] !== manba.id) throw new Error('MANBA_MISMATCH ' + r[0]);
    if (r[18]) { skipped++; continue; }   // header rows never reach offers (same as the DB views)
    if (r[6] != null && !/^\d+(\.\d+)?$/.test(r[6])) throw new Error('PRICE_INVALID ' + r[0]);
    const nk = r[16] ?? '', bk = r[17] ?? '';
    if (nomKalit(r[4]) !== nk || birlikKalit(r[5]) !== bk) keyOverrides[r[0]] = [nk, bk];
    if (r[7] != null && !(r[7] in hududKalit)) throw new Error('HUDUD_KALIT_MISSING ' + r[7]);
    out.push([r[0], r[2], r[3], r[4], d.birlik.add(r[5]), r[6], d.hudud.add(r[7]), d.zavod.add(r[8]), d.ndsHolati.add(r[9]), d.ndsIzoh.add(r[10]),
      r[11], r[12], d.variant.add(r[13]), d.guruh.add(r[14])]);
  }
  const dict: PriceDict = { birlik: d.birlik.values, hudud: d.hudud.values, hududKalit: d.hudud.values.map(h => hududKalit[h] ?? null),
    zavod: d.zavod.values, ndsHolati: d.ndsHolati.values, ndsIzoh: d.ndsIzoh.values, variant: d.variant.values, guruh: d.guruh.values, manba, keyOverrides };
  const files = new Map<string, string>();
  files.set('dict.json', JSON.stringify(dict));
  const rowFiles: string[] = [];
  for (let i = 0; i * PRICE_ROWS_PER_FILE < out.length; i++) {
    const path = `r/${String(i).padStart(4, '0')}.json`;
    files.set(path, JSON.stringify({ rows: out.slice(i * PRICE_ROWS_PER_FILE, (i + 1) * PRICE_ROWS_PER_FILE) }));
    rowFiles.push(path);
  }
  const lookupFiles: Array<{ path: string; from: number; to: number }> = [];
  for (let i = 0; i * PRICE_LOOKUP_ROWS < out.length; i++) {
    const part = out.slice(i * PRICE_LOOKUP_ROWS, (i + 1) * PRICE_LOOKUP_ROWS);
    const path = `i/${String(i).padStart(4, '0')}.json`;
    files.set(path, JSON.stringify({ rows: part }));
    lookupFiles.push({ path, from: part[0][0], to: part[part.length - 1][0] });
  }
  return { files, rowFiles, lookupFiles, counts: { source: rows.length, rows: out.length, headersSkipped: skipped, keyOverrides: Object.keys(keyOverrides).length } };
}
