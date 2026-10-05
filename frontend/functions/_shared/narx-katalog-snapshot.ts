/**
 * Server-side lookup of platform price catalogue rows in R2 (owner rule 2026-10-05: immutable reference
 * data in R2). Used when a business record (narx dalili, narx protokoli) cites a catalogue row: the
 * Function verifies the row in the ACTIVE revision and passes a snapshot to the RPC, so Supabase keeps
 * the evidence without holding the 213k-row catalogue. Only small lookup files (~1000 rows) are parsed.
 */
type R2 = { get(key: string): Promise<{ text(): Promise<string>; arrayBuffer(): Promise<ArrayBuffer>; httpMetadata?: { contentEncoding?: string } } | null> };
type Lookup = { path: string; from: number; to: number };
type Manifest = { revision: string; files: { dict: { path: string }; lookup?: Lookup[] } };
type Dict = { birlik: string[]; hudud: string[]; zavod: string[]; ndsHolati: string[]; ndsIzoh: string[]; variant: string[]; guruh: string[];
  manba: { id: number; nom: string; tur: string; sana: string | null; yil: number | null; kvartal: number | null; region: string | null; nds_holati: string | null } };
type Row = [number, number | null, string | null, string, number, string | null, number, number, number, number, number | null, number | null, number, number];

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
  const out = new Map<number, KatalogSnapshot>();
  if (!want.length) return out;
  const { revision } = await json<{ revision: string }>(r2, 'narx-katalog/CURRENT.json');
  if (!/^[a-f0-9]{16}$/.test(revision)) throw new Error('PRICE_REVISION_INVALID');
  const manifest = await json<Manifest>(r2, `narx-katalog/${revision}/manifest.json`);
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
    for (const r of rows) if (set.has(r[0])) out.set(r[0], {
      revision, id: r[0], manba_id: dict.manba.id, manba_nom: dict.manba.nom, manba_tur: dict.manba.tur, manba_sana: dict.manba.sana,
      kod: r[2], nom: r[3], birlik: at(dict.birlik, r[4]), narx: r[5], hudud: at(dict.hudud, r[6]) ?? dict.manba.region,
      ishlab_chiqaruvchi: at(dict.zavod, r[7]), nds_holati: at(dict.ndsHolati, r[8]) ?? dict.manba.nds_holati, nds_izoh: at(dict.ndsIzoh, r[9]),
      yil: r[10] ?? dict.manba.yil, kvartal: r[11] ?? dict.manba.kvartal, narx_varianti: at(dict.variant, r[12]), guruh: at(dict.guruh, r[13]),
    });
  }
  return out;
}
