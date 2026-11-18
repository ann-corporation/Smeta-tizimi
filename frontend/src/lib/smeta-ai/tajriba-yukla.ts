/**
 * Browser-side loader of the experience index: global layer + the signed-in company's own layer from /api/tajriba-indeks.
 * Best effort and silent: when the index is not in R2 yet (or anything fails to verify) matching simply runs without it.
 */
import { kompaktBirlashtir, type KompaktMisol } from './tajriba-indeks';
import { manifestOqi, paketOch } from './tajriba-paket';
import { TajribaIndeks, tajribaOl, tajribaQoy } from './tajriba-qidir';
import type { UzRu } from './tajriba-uzru';

type Fetcher = (url: string) => Promise<Response>;
const defFetch: Fetcher = u => fetch(u, { credentials: 'same-origin' });

async function qatlamOl(f: Fetcher, kompaniyaId: number | null) {
  const q = (file: string) => `/api/tajriba-indeks?f=${encodeURIComponent(file)}${kompaniyaId != null ? `&kompaniya_id=${kompaniyaId}` : ''}`;
  const ol = async (file: string): Promise<Uint8Array | null> => {
    try { const r = await f(q(file)); return r.ok ? new Uint8Array(await r.arrayBuffer()) : null; } catch { return null; }
  };
  const mb = await ol('manifest.json.gz');
  const manifest = mb ? manifestOqi(mb) : null;
  return manifest ? paketOch(manifest, ol) : null;
}

const SORALGAN = new Map<string, Promise<TajribaIndeks | null>>();

/** Loads (once per company) and registers the index for norm-moslash. Resolves null when unavailable. */
export function tajribaYukla(kompaniyaId: number | null, f: Fetcher = defFetch): Promise<TajribaIndeks | null> {
  const key = String(kompaniyaId ?? 'global');
  const bor = SORALGAN.get(key);
  if (bor) return bor;
  const p = (async () => {
    const [g, c] = await Promise.all([qatlamOl(f, null), kompaniyaId != null ? qatlamOl(f, kompaniyaId) : Promise.resolve(null)]);
    if (!g && !c) return null;
    const misollar: KompaktMisol[] = kompaktBirlashtir(g?.misollar ?? [], c?.misollar ?? []);
    const uzru: UzRu | null = c?.uzru && g?.uzru ? { v: 1, juftlar: [...c.uzru.juftlar, ...g.uzru.juftlar] } : (c?.uzru ?? g?.uzru ?? null);
    const idx = new TajribaIndeks(misollar, uzru);
    tajribaQoy(idx);
    return idx;
  })().catch(() => null);
  SORALGAN.set(key, p);
  p.then(r => { if (!r) SORALGAN.delete(key); });   // retry later when it was unavailable
  return p;
}
export const tajribaYuklanganmi = () => tajribaOl() !== null;
