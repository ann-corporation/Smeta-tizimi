type Source = { id: number; akt_ids: number[] };
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const id = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
function source(v: unknown): Source | null {
  return record(v) && v.tur === 'f2-reestr' && id(v.id) && Array.isArray(v.akt_ids) && v.akt_ids.every(id)
    ? { id: v.id, akt_ids: v.akt_ids } : null;
}

/** A partial/ambiguous register is never evidence for opening the first act. Authorization remains server-owned. */
export function f2NavigationSelection(evidence: unknown): { obyekt: number; akt: number } | null {
  const single = source(evidence);
  let sources: Source[];
  if (single) sources = [single];
  else {
    if (!record(evidence) || evidence.tur !== 'shartnoma-f2' || evidence.truncated !== false ||
        !Array.isArray(evidence.sources) || !Array.isArray(evidence.obyektlar) || evidence.total_objects !== evidence.sources.length ||
        evidence.obyektlar.length !== evidence.sources.length) return null;
    const objects = evidence.obyektlar.map(row => record(row) && id(row.id) ? row.id : null);
    const rows = evidence.sources.map(source);
    if (objects.some(row => row === null) || new Set(objects).size !== objects.length || rows.some(row => row === null)) return null;
    sources = rows.filter((row): row is Source => row !== null);
    if (new Set(sources.map(row => row.id)).size !== sources.length || sources.some(row => !objects.includes(row.id))) return null;
  }
  const acts = sources.flatMap(row => row.akt_ids.map(akt => ({ obyekt: row.id, akt })));
  return acts.length === 1 ? acts[0] : null;
}
