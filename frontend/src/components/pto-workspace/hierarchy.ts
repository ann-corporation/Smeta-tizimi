import type { T2Obyekt } from '../../api/supabase';
import type { Liniya } from '../../api/t2-shartnoma-liniya';

export const METRICS = ['jami', 'qator_soni', 'razdel', 'ish', 'resurs', 'narxsiz'] as const;
export type Metric = typeof METRICS[number];
export type Aggregate = { known: number; unknown: number; present: number; total: number };
/** Projection of canonical object summaries. A shared object counts once per parent.
 * Missing summaries/NULL remain explicitly incomplete; no financial values are fabricated. */
export function aggregateObjects(ids: readonly number[], objects: readonly T2Obyekt[]): Record<Metric, Aggregate> {
  return makeSummarizer(objects)(ids);
}
export function makeSummarizer(objects: readonly T2Obyekt[]) {
  const byId = new Map(objects.map(o => [o.id, o]));
  return (ids: readonly number[]): Record<Metric, Aggregate> => {
  const unique = [...new Set(ids)];
  return Object.fromEntries(METRICS.map(key => {
    let known = 0, unknown = 0, present = 0;
    for (const id of unique) {
      const value = byId.get(id)?.[key];
      if (value == null || !Number.isFinite(value)) unknown++;
      else { known += value; present++; if (key === 'jami' && (byId.get(id)?.narxsiz == null || byId.get(id)!.narxsiz! > 0)) unknown++; }
    }
    return [key, { known, unknown, present, total: unique.length }];
  })) as Record<Metric, Aggregate>;
  };
}

export function projectObjects(line: Liniya, projectId: number | null): number[] {
  return line.obyektlar.filter(o => o.loyiha_id === projectId).map(o => o.id);
}
export function contractObjects(line: Liniya, contractId: number): number[] {
  const contract = line.shartnomalar.find(s => s.id === contractId);
  if (!contract) return [];
  const valid = new Set(projectObjects(line, contract.loyiha_id));
  return [...new Set(contract.obyektlar)].filter(id => valid.has(id));
}
export function unassignedObjects(line: Liniya, projectId: number | null): number[] {
  const assigned = new Set(line.shartnomalar.filter(s => s.loyiha_id === projectId).flatMap(s => contractObjects(line, s.id)));
  return projectObjects(line, projectId).filter(id => !assigned.has(id));
}
