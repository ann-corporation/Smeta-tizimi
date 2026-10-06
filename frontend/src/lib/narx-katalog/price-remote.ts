/**
 * Platform price catalogue client (R2 shards via /api/narx-katalog). Loads the whole catalogue once per
 * revision (~2 MB gzip, HTTP immutable cache), verifies every file against the manifest sha256, then answers
 * catalogue search and smeta↔catalogue offers locally — the same results the former DB views produced.
 */
import { birlikKalit, nomKalit } from './kalit';
import type { PriceDict, PriceRow } from './price-shards';

type Fetcher = (url: string) => Promise<Response>;
type FileMeta = { path: string; sha256: string; bytes: number };
export type PriceManifest = { schema: string; revision: string; status: string; counts: { rows: number };
  source: { manba: PriceDict['manba'] }; files: { dict: FileMeta; rows: FileMeta[] } };

/** Shape of the former t2_platforma_narx_manba_qator view row. */
export type KatalogQatori = {
  id: number; manba_id: number; kod: string | null; nom: string; birlik: string | null; narx: number | null; hudud: string | null;
  ishlab_chiqaruvchi: string | null; nds_holati: string | null; nds_izoh: string | null; yil: number | null; kvartal: number | null;
  narx_varianti: string | null; guruh: string | null; hudud_kalit: string | null; manba_nom: string; manba_tur: string;
};
/** Smeta resource as needed for offers (t2_qator rs/mat/ob). */
export type SmetaResurs = { id: number; kompaniya_id: number; obyekt_id: number; tur: string; kat: string | null; kod: string | null;
  nom: string | null; birlik: string | null; narx: number | null; nom_key: string | null; birlik_key: string | null };

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
async function getJson<T>(f: Fetcher, url: string, meta?: FileMeta): Promise<T> {
  const r = await f(url);
  if (!r.ok) throw new Error(r.status === 401 ? 'AUTH_REQUIRED' : r.status === 404 ? 'PRICE_CATALOG_NOT_FOUND' : 'PRICE_FETCH_FAILED');
  const text = await r.text();
  if (meta) {
    const bytes = new TextEncoder().encode(text);
    if (bytes.length !== meta.bytes || hex(await crypto.subtle.digest('SHA-256', bytes)) !== meta.sha256) throw new Error('PRICE_INTEGRITY_FAILED');
  }
  return JSON.parse(text) as T;
}
const at = <T,>(list: T[], i: number): T | null => (i < 0 ? null : list[i] ?? null);

/** Same tokenisation as the former DB search: lower-case words ≥2 chars, at most 6. */
export function katalogQidirSozlar(matn: string): string[] {
  return matn.toLowerCase().replace(/[*&,()%.\\"]/g, ' ').split(/\s+/).map(w => w.trim()).filter(w => w.length >= 2).slice(0, 6);
}

export class PriceCatalog {
  readonly manifest: PriceManifest; readonly dict: PriceDict; readonly rows: PriceRow[];
  private lower: string[]; private byKey = new Map<string, number[]>();
  private constructor(manifest: PriceManifest, dict: PriceDict, rows: PriceRow[]) {
    this.manifest = manifest; this.dict = dict; this.rows = rows;
    this.lower = rows.map(r => r[3].toLowerCase());
    rows.forEach((r, i) => {
      const o = dict.keyOverrides[r[0]];
      const k = o ? o[0] + '\u0001' + o[1] : nomKalit(r[3]) + '\u0001' + birlikKalit(at(dict.birlik, r[4]));
      const l = this.byKey.get(k); if (l) l.push(i); else this.byKey.set(k, [i]);
    });
  }

  static async open(fetcher: Fetcher = u => fetch(u, { credentials: 'same-origin' }), base = '/api/narx-katalog') {
    const { revision } = await getJson<{ revision: string }>(fetcher, `${base}?f=current`);
    if (!/^[a-f0-9]{16}$/.test(revision)) throw new Error('PRICE_REVISION_INVALID');
    const url = (f: string) => `${base}?rev=${revision}&f=${encodeURIComponent(f)}`;
    const manifest = await getJson<PriceManifest>(fetcher, url('manifest.json'));
    if (manifest.revision !== revision) throw new Error('PRICE_MANIFEST_INVALID');
    const [dict, ...parts] = await Promise.all([
      getJson<PriceDict>(fetcher, url('dict.json'), manifest.files.dict),
      ...manifest.files.rows.map(m => getJson<{ rows: PriceRow[] }>(fetcher, url(m.path), m)),
    ]) as [PriceDict, ...Array<{ rows: PriceRow[] }>];
    const rows = parts.flatMap(p => p.rows);
    if (rows.length !== manifest.counts.rows) throw new Error('PRICE_ROW_COUNT_MISMATCH');
    return new PriceCatalog(manifest, dict, rows);
  }

  qator(i: number): KatalogQatori {
    const r = this.rows[i], d = this.dict, m = d.manba;
    return { id: r[0], manba_id: m.id, kod: r[2], nom: r[3], birlik: at(d.birlik, r[4]), narx: r[5] == null ? null : Number(r[5]),
      hudud: at(d.hudud, r[6]), ishlab_chiqaruvchi: at(d.zavod, r[7]), nds_holati: at(d.ndsHolati, r[8]), nds_izoh: at(d.ndsIzoh, r[9]),
      yil: r[10], kvartal: r[11], narx_varianti: at(d.variant, r[12]), guruh: at(d.guruh, r[13]), hudud_kalit: at(d.hududKalit, r[6]),
      manba_nom: m.nom, manba_tur: m.tur };
  }

  /** Every word must occur in the name (former ilike semantics); optional region; sorted by name; ≤ limit. */
  qidir(matn: string, hudud?: string | null, limit = 200): KatalogQatori[] {
    const words = katalogQidirSozlar(matn);
    const hit: number[] = [];
    for (let i = 0; i < this.rows.length; i++) {
      if (hudud && at(this.dict.hududKalit, this.rows[i][6]) !== hudud) continue;
      const s = this.lower[i];
      if (words.every(w => s.includes(w))) hit.push(i);
    }
    const coll = new Intl.Collator('en-US');
    hit.sort((a, b) => coll.compare(this.rows[a][3], this.rows[b][3]) || this.rows[a][0] - this.rows[b][0]);
    return hit.slice(0, limit).map(i => this.qator(i));
  }

  /** Catalogue rows (with a price) whose name+unit key equals the given resource exactly. */
  aniqMoslik(nom: string | null, birlik: string | null): KatalogQatori[] {
    return (this.byKey.get(nomKalit(nom) + '\u0001' + birlikKalit(birlik)) ?? []).filter(i => this.rows[i][5] != null).map(i => this.qator(i));
  }

  /** Offers for smeta resources by exact name+unit key (former t2_narx_taklif platform branch). Rows without price are skipped. */
  takliflar(resurslar: SmetaResurs[]) {
    const m = this.dict.manba;
    return resurslar.filter(q => ['rs', 'mat', 'ob'].includes(q.tur) && q.nom_key != null).flatMap(q =>
      (this.byKey.get(q.nom_key + '\u0001' + (q.birlik_key ?? '')) ?? []).filter(i => this.rows[i][5] != null).map(i => {
        const k = this.qator(i);
        return { kompaniya_id: q.kompaniya_id, obyekt_id: q.obyekt_id, qator_id: q.id, tur: q.tur, kat: q.kat, kod: q.kod, nom: q.nom, birlik: q.birlik,
          smeta_narx: q.narx, manba_qator_id: k.id, manba_id: m.id, manba_tur: m.tur, manba_nom: m.nom, manba_raqam: m.raqam, manba_sana: m.sana,
          yil: k.yil ?? m.yil, kvartal: k.kvartal ?? m.kvartal, region: k.hudud ?? m.region, yetkazuvchi: m.yetkazuvchi,
          nds_holati: k.nds_holati ?? m.nds_holati, manba_kod: k.kod, manba_nom_qator: k.nom, manba_birlik: k.birlik, manba_narx: k.narx as number,
          moslik: 'nom_birlik' as const, ishlab_chiqaruvchi: k.ishlab_chiqaruvchi, nds_izoh: k.nds_izoh, narx_varianti: k.narx_varianti,
          manba_guruh: k.guruh, platforma: true };
      }));
  }
}

let cached: Promise<PriceCatalog> | null = null;
/** One shared instance per page session; a failed load can be retried. */
export function narxKatalogi(): Promise<PriceCatalog> {
  if (!cached) cached = PriceCatalog.open().catch(e => { cached = null; throw e; });
  return cached;
}
