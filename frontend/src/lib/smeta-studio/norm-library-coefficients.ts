import type { EstimateDoc, WorkSource } from './model';
import { koefKatalogi, type KoefKatalog, type KoefYozuv } from './koef-katalog';

export const COEFFICIENT_SOURCE_REVISION = '66bb1a23bd18c63006d447b5';
export type SourceTarget = { correction_id: number; otdel: string; tbl: string; n_from: number; n_to: number };
type SourceRule = { id: number; kind: string; cc: string; code: string; title: string; basis: string; labour: number; machines: number; materials: number };
export type SourceRules = { revision: string; rules: SourceRule[]; targets: SourceTarget[]; status: string };
export type CoefficientCatalogs = KoefKatalog | readonly KoefKatalog[];
export const isLibrarySource = (source: WorkSource) => source.workId.startsWith('norm-library:') || source.catalogRevision === COEFFICIENT_SOURCE_REVISION;

/** Exact native key grammar (NormRepository.Corrections); no transliteration or zero-padding. */
export function libraryCoefficientKey(source: WorkSource): string | null {
  const prefix = `norm-library:${COEFFICIENT_SOURCE_REVISION}:`;
  if (source.catalogRevision !== COEFFICIENT_SOURCE_REVISION || !source.workId.startsWith(prefix)) return null;
  const key = source.workId.slice(prefix.length);
  return key === source.code && /^([ЕЦУ])(\d{2})-(\d{2})-(\d{3})-(\d+)$/.test(key) ? key : null;
}

export function sourceCoefficientCatalog(data: SourceRules): KoefKatalog {
  if (data.revision !== COEFFICIENT_SOURCE_REVISION || data.status !== 'SOURCE_CANDIDATES_NOT_AUTOMATIC_ACCEPTANCE' || !Array.isArray(data.rules) || !Array.isArray(data.targets)) throw new Error('COEFFICIENT_SOURCE_INVALID');
  const catalog: KoefKatalog = { schema: 'koef-katalog-v1', manba: 'ШНҚ', sourceRevision: data.revision, koef: {}, jadval: {}, sourceScopes: {} };
  const targets = new Map<number, SourceTarget[]>();
  for (const target of data.targets) {
    if (!Number.isSafeInteger(target.correction_id) || typeof target.otdel !== 'string' || typeof target.tbl !== 'string' || !Number.isSafeInteger(target.n_from) || !Number.isSafeInteger(target.n_to)) continue;
    if (!(target.otdel === '*' || (/^\d{2}$/.test(target.otdel) && /^\d{3}$/.test(target.tbl) && target.n_from >= 0 && target.n_to >= target.n_from))) continue;
    const list = targets.get(target.correction_id) ?? []; list.push(target); targets.set(target.correction_id, list);
  }
  const codeCounts = new Map<string, number>();
  for (const rule of data.rules) { const code = `${rule.cc}-${rule.code}`; codeCounts.set(code, (codeCounts.get(code) ?? 0) + 1); }
  for (const rule of data.rules) {
    if (!Number.isSafeInteger(rule.id) || !/^[ЕЦУ]$/.test(rule.kind) || !/^\d{2}$/.test(rule.cc) || !rule.code || !rule.title || !rule.basis || ![rule.labour, rule.machines, rule.materials].every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0)) continue;
    const scopes = targets.get(rule.id); if (!scopes?.length) continue;
    if ([rule.code, rule.title, rule.basis].some(text => text.includes('\uFFFD'))) continue;
    const displayCode = `${rule.cc}-${rule.code}`;
    // Source contains multiple distinct records with the same display code. Keep their source IDs.
    const code = codeCounts.get(displayCode)! > 1 ? `${displayCode}#${rule.id}` : displayCode;
    if (catalog.koef[code]) throw new Error('COEFFICIENT_SOURCE_DUPLICATE');
    // Native Corrections returns fixed factors, including rule 71 (ЭМ × 1.1) for bounded target rows.
    // Its «каждые последующие 5 м» describes those norms, not a multiplier formula.
    const record: KoefYozuv = { a: rule.basis, t: rule.title, s: rule.title, q: rule.basis, k: { ЧЕЛ: rule.labour, МАШ: rule.machines, МАТ: rule.materials }, op: 'MUL' };
    catalog.koef[code] = record;
    catalog.sourceScopes![code] = scopes;
    const collection = `${rule.kind}${rule.cc}`;
    (catalog.jadval[collection] ??= []).push(code);
  }
  return catalog;
}

type Fetcher = (url: string) => Promise<Response>;
const authenticatedFetch: Fetcher = url => fetch(url, { credentials: 'same-origin' });
const cache = new WeakMap<Fetcher, Promise<KoefKatalog>>();
/** Verify the response bytes before decoding JSON; failed requests are retryable. */
export function normLibraryCoefficients(fetcher: Fetcher = authenticatedFetch): Promise<KoefKatalog> {
  let pending = cache.get(fetcher);
  if (!pending) {
    pending = (async () => {
      const manifestResponse = await fetcher('/api/norm-library?f=manifest.json');
      if (!manifestResponse.ok) throw new Error('COEFFICIENT_MANIFEST_UNAVAILABLE');
      const manifest = await manifestResponse.json() as { schema: string; revision: string; objects: { file: string; bytes: number; sha256: string }[] };
      if (manifest.schema !== 'norm-library-release-v1' || manifest.revision !== COEFFICIENT_SOURCE_REVISION || !Array.isArray(manifest.objects)) throw new Error('COEFFICIENT_MANIFEST_INVALID');
      const entries = manifest.objects.filter(o => o.file === 'coefficient-rules.json');
      const entry = entries[0];
      if (entries.length !== 1 || !Number.isSafeInteger(entry.bytes) || entry.bytes <= 0 || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error('COEFFICIENT_MANIFEST_INVALID');
      const response = await fetcher('/api/norm-library?f=coefficient-rules.json');
      if (!response.ok) throw new Error('COEFFICIENT_RULES_UNAVAILABLE');
      const bytes = await response.arrayBuffer();
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
      if (bytes.byteLength !== entry.bytes || digest !== entry.sha256) throw new Error('COEFFICIENT_INTEGRITY_FAILED');
      return sourceCoefficientCatalog(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as SourceRules);
    })().catch(error => { cache.delete(fetcher); throw error; });
    cache.set(fetcher, pending);
  }
  return pending;
}

/** Only fetch catalogues represented in the document; callers guard stale document results. */
export async function coefficientCatalogsForDoc(doc: EstimateDoc, legacyLoader = koefKatalogi, libraryLoader = normLibraryCoefficients): Promise<readonly KoefKatalog[]> {
  const sources = Object.values(doc.occurrences).map(o => o.source);
  return Promise.all([...(sources.some(s => !isLibrarySource(s)) ? [legacyLoader()] : []), ...(sources.some(s => libraryCoefficientKey(s) !== null) ? [libraryLoader()] : [])]);
}

