/**
 * Server-side lookup of platform price catalogue rows in R2 (owner rule 2026-10-05: immutable reference
 * data in R2). Used when a business record (narx dalili, narx protokoli) cites a catalogue row: the
 * Function verifies the row in the ACTIVE revision and passes a snapshot to the RPC, so Supabase keeps
 * the evidence without holding the 213k-row catalogue. Only small lookup files (~1000 rows) are parsed.
 */
import { searchPath } from '../../src/lib/narx-katalog/catalog-search';

type R2 = { get(key: string): Promise<{ text(): Promise<string>; arrayBuffer(): Promise<ArrayBuffer>; httpMetadata?: { contentEncoding?: string } } | null> };
type Lookup = { path: string; from: number; to: number };
type Manifest = { revision: string; files: { dict: { path: string }; lookup?: Lookup[]; search?: { path: string }[] } };
type Manba = { id: number; nom: string; tur: string; sana: string | null; yil: number | null; kvartal: number | null; region: string | null; nds_holati: string | null };
type Dict = { birlik: string[]; hudud: string[]; zavod: string[]; ndsHolati: string[]; ndsIzoh: string[]; variant: string[]; guruh: string[]; manbalar?: Manba[];
  manba: { id: number; nom: string; tur: string; sana: string | null; yil: number | null; kvartal: number | null; region: string | null; nds_holati: string | null } };
type Row = [number, number | null, string | null, string, number, string | null, number, number, number, number, number | null, number | null, number, number, number?];

export type KatalogSnapshot = {
  revision: string; id: number; manba_id: number; manba_nom: string; manba_tur: string; manba_sana: string | null;
  kod: string | null; nom: string; birlik: string | null; narx: string | null; hudud: string | null; ishlab_chiqaruvchi: string | null;
  nds_holati: string | null; nds_izoh: string | null; yil: number | null; kvartal: number | null; narx_varianti: string | null; guruh: string | null;
};

async function json<T>(r2: R2, key: string): Promise<T> {
  const o = await r2.get(key);
  if (!o) throw new Error('PRICE_CATALOG_NOT_FOUND ' + key);
  if (o.httpMetadata?.contentEncoding === 'gzip') {
    const stream = new Blob([await o.arrayBuffer()]).stream().pipeThrough(new DecompressionStream('gzip'));
    return JSON.parse(await new Response(stream).text()) as T;
  }
  return JSON.parse(await o.text()) as T;
}
const at = <T,>(l: T[], i: number): T | null => (i < 0 ? null : l[i] ?? null);

/** Returns a snapshot for every requested id found in the active revision (missing ids are simply absent). */
export async function katalogSnapshotlari(r2: R2, ids: number[]): Promise<Map<number, KatalogSnapshot>> {
  const want = [...new Set(ids.filter(n => Number.isSafeInteger(n) && n > 0))];
  return want.length ? snapshots(r2, await activeManifest(r2), want) : new Map();
}

async function activeManifest(r2: R2) {
  const { revision } = await json<{ revision: string }>(r2, 'narx-katalog/CURRENT.json');
  if (!/^[a-f0-9]{16}$/.test(revision)) throw new Error('PRICE_REVISION_INVALID');
  const manifest = await json<Manifest>(r2, `narx-katalog/${revision}/manifest.json`);
  if (manifest.revision !== revision) throw new Error('PRICE_MANIFEST_INVALID');
  return manifest;
}

export async function findKatalogSnapshots(r2: R2, keys: readonly string[]) {
  const manifest = await activeManifest(r2);
  if (!Array.isArray(manifest.files.search) || !manifest.files.search.length) return null;
  const shards = new Map<string, Record<string, unknown>>();
  for (const key of keys.slice(0, 2)) {
    const path = searchPath(key);
    if (!manifest.files.search.some(file => file.path === path)) continue;
    let shard = shards.get(path);
    if (!shard) {
      shard = await json<Record<string, unknown>>(r2, `narx-katalog/${manifest.revision}/${path}`);
      shards.set(path, shard);
    }
    const hit = shard[key] as { ids?: unknown; more?: unknown } | undefined;
    if (hit === undefined) continue;
    if (!Array.isArray(hit.ids) || hit.ids.length > 12 || !hit.ids.every(n => Number.isSafeInteger(n) && n > 0) ||
        new Set(hit.ids).size !== hit.ids.length || typeof hit.more !== 'boolean') throw new Error('PRICE_SEARCH_INVALID');
    const rows = [...(await snapshots(r2, manifest, hit.ids)).values()];
    if (rows.length !== hit.ids.length) throw new Error('PRICE_SEARCH_INCOMPLETE');
    return { key, rows, more: hit.more };
  }
  return { key: null, rows: [], more: false };
}

async function snapshots(r2: R2, manifest: Manifest, want: number[]): Promise<Map<number, KatalogSnapshot>> {
  const { revision } = manifest;
  const out = new Map<number, KatalogSnapshot>();
  const lookups = manifest.files.lookup ?? [];
  const byFile = new Map<string, number[]>();
  for (const id of want) {
    const f = lookups.find(l => id >= l.from && id <= l.to);
    if (f) byFile.set(f.path, [...(byFile.get(f.path) ?? []), id]);
  }
  if (byFile.size > 50) throw new Error('PRICE_LOOKUP_TOO_WIDE');
  if (!byFile.size) return out;
  const dict = await json<Dict>(r2, `narx-katalog/${revision}/${manifest.files.dict.path}`);
  for (const [path, idsInFile] of byFile) {
    const { rows } = await json<{ rows: Row[] }>(r2, `narx-katalog/${revision}/${path}`);
    const set = new Set(idsInFile);
    for (const r of rows) if (set.has(r[0])) { const m: Manba = (r[14] != null ? dict.manbalar?.[r[14]] : null) ?? dict.manba; out.set(r[0], {
      revision, id: r[0], manba_id: m.id, manba_nom: m.nom, manba_tur: m.tur, manba_sana: m.sana,
      kod: r[2], nom: r[3], birlik: at(dict.birlik, r[4]), narx: r[5], hudud: at(dict.hudud, r[6]) ?? m.region,
      ishlab_chiqaruvchi: at(dict.zavod, r[7]), nds_holati: at(dict.ndsHolati, r[8]) ?? m.nds_holati, nds_izoh: at(dict.ndsIzoh, r[9]),
      yil: r[10] ?? m.yil, kvartal: r[11] ?? m.kvartal, narx_varianti: at(dict.variant, r[12]), guruh: at(dict.guruh, r[13]),
    }); }
  }
  return out;
}
