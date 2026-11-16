/**
 * R2 packing of the experience index (same idea as the ShNK index under normativ/shnk/v1/: gzip shards + a manifest that pins
 * every shard by sha256; the reader activates only when the manifest exists and every shard verifies).
 *
 *   <prefix>manifest.json.gz          tajriba-v1 manifest (global layer)         + cursor/companies of the nightly job
 *   <prefix>e/sNN.json.gz             exemplar shards, shard = fnv1a32(unit|text) % b   (deterministic: unchanged shards keep their hash)
 *   <prefix>uzru.json.gz              learned uz->ru pairs
 *   <prefix>c/<companyId>/manifest.json.gz, e/sNN.json.gz, uzru.json.gz   the company's own layer (everything it produced)
 *   <prefix>c/<companyId>/holat.json.gz  the company's private incremental STATE (contribution keys); never served to the client
 *
 * No tenant row, price or name is stored here: wordings, codes, counts and hashed section words only.
 */
import { gunzipSync, gzipSync } from 'fflate';
import type { KompaktMisol } from './tajriba-indeks';
import { misolId, TAJRIBA_FORMAT } from './tajriba-indeks';
import type { UzRu } from './tajriba-uzru';

export const TAJRIBA_PREFIX = 'normativ/tajriba/v1/';
const SHARD_HEDEF_BAYT = 400_000;
const MAX_SHARD = 64;
const MAX_OCHILGAN = 32 * 1024 * 1024;
const MAX_GZ = 8 * 1024 * 1024;

export type Kursor = { /** ISO time of the last object change already ingested */ obyektVaqt: string | null; /** last Studio confirmation id ingested */ tanlovId: number };
export type ShardInfo = { k: string; sha256: string; bayt: number; n: number };
export type PaketManifest = {
  format: typeof TAJRIBA_FORMAT; qatlam: 'global' | 'kompaniya'; kompaniya?: number; qurildi: string;
  b: number; misol: number; shardlar: ShardInfo[]; uzru: { k: string; sha256: string; bayt: number; juft: number } | null;
  /** the nightly job's cursor (global manifest only) */ kursor?: Kursor; kompaniyalar?: number[];
};

export function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  const b = new TextEncoder().encode(s);
  for (let i = 0; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
const hex = (d: ArrayBuffer) => Array.from(new Uint8Array(d), x => x.toString(16).padStart(2, '0')).join('');
export const sha256 = async (b: Uint8Array): Promise<string> => hex(await crypto.subtle.digest('SHA-256', b as unknown as ArrayBuffer));
const gz = (o: unknown) => gzipSync(new TextEncoder().encode(JSON.stringify(o)), { level: 9, mtime: 0 });
const shardAdi = (i: number) => `e/s${String(i).padStart(2, '0')}.json.gz`;

export type Paket = { manifest: PaketManifest; fayllar: Map<string, Uint8Array> };

export async function paketla(misollar: readonly KompaktMisol[], uzru: UzRu | null,
  o: { qatlam: 'global' | 'kompaniya'; kompaniya?: number; qurildi: string; kursor?: Kursor; kompaniyalar?: number[] }): Promise<Paket> {
  const hajm = JSON.stringify(misollar).length;
  let b = 1; while (b < MAX_SHARD && hajm / b > SHARD_HEDEF_BAYT) b *= 2;
  const bolak: KompaktMisol[][] = Array.from({ length: b }, () => []);
  for (const m of misollar) bolak[fnv1a32(misolId(m[0], m[1])) % b].push(m);
  const fayllar = new Map<string, Uint8Array>();
  const shardlar: ShardInfo[] = [];
  for (let i = 0; i < b; i++) {
    const bytes = gz({ v: 1, m: bolak[i] });
    const k = shardAdi(i);
    fayllar.set(k, bytes);
    shardlar.push({ k, sha256: await sha256(bytes), bayt: bytes.length, n: bolak[i].length });
  }
  let uzruInfo: PaketManifest['uzru'] = null;
  if (uzru && uzru.juftlar.length) {
    const bytes = gz(uzru);
    fayllar.set('uzru.json.gz', bytes);
    uzruInfo = { k: 'uzru.json.gz', sha256: await sha256(bytes), bayt: bytes.length, juft: uzru.juftlar.length };
  }
  const manifest: PaketManifest = { format: TAJRIBA_FORMAT, qatlam: o.qatlam, ...(o.kompaniya != null ? { kompaniya: o.kompaniya } : {}), qurildi: o.qurildi,
    b, misol: misollar.length, shardlar, uzru: uzruInfo, ...(o.kursor ? { kursor: o.kursor } : {}), ...(o.kompaniyalar ? { kompaniyalar: o.kompaniyalar } : {}) };
  fayllar.set('manifest.json.gz', gz(manifest));
  return { manifest, fayllar };
}

export function gzJson<T>(bytes: Uint8Array): T {
  if (bytes.length > MAX_GZ) throw new Error('TAJRIBA_OBYEKT_KATTA');
  const raw = gunzipSync(bytes);
  if (raw.length > MAX_OCHILGAN) throw new Error('TAJRIBA_OCHILGAN_KATTA');
  return JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(raw)) as T;
}
export const jsonGz = gz;

export function manifestOqi(bytes: Uint8Array): PaketManifest | null {
  try {
    const m = gzJson<PaketManifest>(bytes);
    return m && m.format === TAJRIBA_FORMAT && Array.isArray(m.shardlar) && Number.isInteger(m.b) && m.b >= 1 && m.b <= MAX_SHARD && m.shardlar.length === m.b ? m : null;
  } catch { return null; }
}

/** Reads every shard through `ol(relativeKey)`, verifies sha256 against the manifest; null when anything fails (never a partial index). */
export async function paketOch(manifest: PaketManifest, ol: (k: string) => Promise<Uint8Array | null>): Promise<{ misollar: KompaktMisol[]; uzru: UzRu | null } | null> {
  try {
    const parts = await Promise.all(manifest.shardlar.map(async s => {
      const bytes = await ol(s.k);
      if (!bytes || (await sha256(bytes)) !== s.sha256) throw new Error('SHARD_MOS_EMAS');
      const j = gzJson<{ v: number; m: KompaktMisol[] }>(bytes);
      if (j.v !== 1 || !Array.isArray(j.m)) throw new Error('SHARD_NOTOGRI');
      return j.m;
    }));
    let uzru: UzRu | null = null;
    if (manifest.uzru) {
      const bytes = await ol(manifest.uzru.k);
      if (bytes && (await sha256(bytes)) === manifest.uzru.sha256) { const u = gzJson<UzRu>(bytes); if (u.v === 1 && Array.isArray(u.juftlar)) uzru = u; }
    }
    return { misollar: parts.flat(), uzru };
  } catch { return null; }
}
