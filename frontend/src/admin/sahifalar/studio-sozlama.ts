/** Small Studio page helpers: per-viewer settings and unit dictionaries (shared by the studio steps). */
import type { RemoteNormCatalog } from '../../lib/catalog-extraction/norm-remote';
import { resourceUnitText } from '../../lib/smeta-studio/resource-units';

export const HUDUD_KALIT = 'smeta-studio:hudud';
export const lsGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
export const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

/** Resource unit: ONLY the observed resource dictionary — an unknown resource KodI is never filled from the
 *  work-unit dictionary (different code spaces). */
export function unitTextOf(_katalog?: RemoteNormCatalog | null) {
  return (code: string | null) => resourceUnitText(code);
}
/** Work unit as the normative catalogue observed it (e.g. "1000 М3"). */
export function workUnitOf(katalog: RemoteNormCatalog | null) {
  return (code: string | null) => { if (!code || !katalog) return null; const u = katalog.unit(code); return u ? u.text : null; };
}
