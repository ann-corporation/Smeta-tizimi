/** Small Studio page helpers: per-viewer settings and unit dictionaries (shared by the studio steps). */
import type { StudioNormCatalog } from '../../lib/catalog-extraction/norm-library';
import { resourceUnitText } from '../../lib/smeta-studio/resource-units';

export const HUDUD_KALIT = 'smeta-studio:hudud';
export const lsGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
export const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

/** Resource unit: ONLY the observed resource dictionary — an unknown resource KodI is never filled from the
 *  work-unit dictionary (different code spaces). */
export function unitTextOf(_katalog?: StudioNormCatalog | null) {
  return (code: string | null) => resourceUnitText(code);
}
/** Observed legacy work unit, or the literal measure supplied by a source-basis catalogue. */
export function workUnitOf(katalog: StudioNormCatalog | null) {
  return (code: string | null) => { if (!code || !katalog) return null; return katalog.unit(code)?.text ?? null; };
}
