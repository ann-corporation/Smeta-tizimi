import type { NormWork } from '../catalog-extraction/norm-catalog';
import { aytilmaganShart, birlikMos, masofaOraligi, MAXSUS_TOPLAM, tanlovZidmi, type AiIsh, type AiKatalog } from './worker';
import type { TanlovNomzodi } from './protokol';

/** ShNQ tables are numbered 06-01-001. Catalogue works have a separate variant suffix. */
function tableKey(code: string, variant: boolean): string | null {
  const match = (variant ? /^[EЕ](\d{1,2})-(\d{1,2})-(\d{1,3})(?:-\d+)?$/i
    : /^(?:[EЕ])?(\d{1,2})-(\d{1,2})-(\d{1,3})$/i).exec(code.trim());
  return match ? match.slice(1).map(Number).join('-') : null;
}

function citedTable(metadata: unknown, excerpt: unknown): string | null {
  if (typeof metadata === 'string' && tableKey(metadata, false)) return metadata;
  if (typeof excerpt !== 'string') return null;
  // Many R2 pages have no table annotation. A literal table heading is usable evidence;
  // the surrounding text and isolated numeric sequences are never used as catalogue IDs.
  const headings = [...excerpt.slice(0, 1000).matchAll(
    /(?:таблица|jadval|жадвал)\s+(?:№\s*)?([EЕ]?\d{1,2}\s*[-–—]\s*\d{1,2}\s*[-–—]\s*\d{1,3})(?![\d-])/giu,
  )].map(match => match[1].replace(/\s+/g, '').replace(/[–—]/g, '-'));
  const keys = new Set(headings.map(code => tableKey(code, false)));
  return keys.size === 1 ? headings[0] : null;
}

const tableIndexes = new WeakMap<AiKatalog, Map<string, NormWork[]>>();
function tables(catalog: AiKatalog) {
  let result = tableIndexes.get(catalog);
  if (!result) {
    result = new Map();
    for (const work of catalog.allWorks?.() ?? []) {
      const key = tableKey(work.code, true);
      if (!key) continue;
      const list = result.get(key) ?? [];
      list.push(work);
      result.set(key, list);
    }
    tableIndexes.set(catalog, result);
  }
  return result;
}

export async function shnqNomzodlar(catalog: AiKatalog, company: number, work: AiIsh, related: AiIsh[], signal: AbortSignal): Promise<TanlovNomzodi[]> {
  if (!catalog.allWorks || signal.aborted) return [];
  const query = (work.qidiruv.find(q => /\p{Script=Cyrillic}{3}/u.test(q)) ??
    work.qidiruv.find(q => /\p{L}{3}/u.test(q)) ?? work.tavsif).trim().slice(0, 120);
  if (query.length < 2) return [];
  try {
    const params = new URLSearchParams({ kompaniya_id: String(company), q: query, limit: '4' });
    const response = await fetch('/api/normativ-qidir?' + params, { signal });
    if (!response.ok) return [];
    const data = await response.json() as { ok?: boolean; sabab?: string; natijalar?: unknown[] };
    if (data.ok !== true || data.sabab || !Array.isArray(data.natijalar)) return [];
    const index = tables(catalog);
    const candidates = new Map<string, TanlovNomzodi>();
    const allowedSpecial = new Set(work.toplam?.map(code => code.replace(/^Е/, 'E')));
    for (const raw of data.natijalar.slice(0, 4)) {
      if (!raw || typeof raw !== 'object') continue;
      const hit = raw as { jadval_kod?: unknown; norma_kod?: unknown; sha256?: unknown; sahifa_pdf?: unknown; iqtibos?: unknown };
      if (typeof hit.norma_kod !== 'string' ||
          typeof hit.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(hit.sha256)) continue;
      const table = citedTable(hit.jadval_kod, hit.iqtibos);
      if (table === null) continue;
      const key = tableKey(table, false);
      if (key === null) continue;
      for (const row of index.get(key) ?? []) {
        if (candidates.size >= 8) break;
        const collection = row.collection?.replace(/^Е/, 'E').replace(/^E0+(?=\d)/, 'E');
        if (collection && MAXSUS_TOPLAM.has(collection) && !allowedSpecial.has(collection)) continue;
        if (!row.name || birlikMos(catalog, row, work.birlik) !== true || aytilmaganShart(row.name, work.tavsif) ||
            masofaOraligi(row.name, work.tavsif) === false) continue;
        const candidate = {
          id: row.id, kod: row.code, nom: row.name, birlik: catalog.unit(row.unitCode)?.text ?? row.unitCode,
          jadval: catalog.tableLabel(row.id), toplam: catalog.collectionTitle?.(row.collection) ?? row.collection,
          shnq: { code: hit.norma_kod.slice(0, 60), table, page: typeof hit.sahifa_pdf === 'number' ? hit.sahifa_pdf : null },
        };
        if (!tanlovZidmi(work, candidate, related)) candidates.set(row.id, candidate);
      }
    }
    return [...candidates.values()];
  } catch { return []; }
}
