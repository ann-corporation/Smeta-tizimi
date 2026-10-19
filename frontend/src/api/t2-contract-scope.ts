import type { ScopeBasis } from '../lib/contract-scope/model';
export type ScopeRecord = ScopeBasis & { revision: number };
export type ScopeData = { bases: ScopeRecord[]; contracts: Array<{id:number;nom:string|null;raqam:string|null}> };
export async function contractScopeRead(object: number, signal?: AbortSignal): Promise<ScopeData> {
  const response = await fetch(`/api/contract-scope?obyekt_id=${object}`, { signal });
  const data = await response.json() as { ok: boolean; bases?: ScopeRecord[]; contracts?: ScopeData['contracts']; code?: string };
  if (!response.ok || !data.ok || !Array.isArray(data.bases) || !Array.isArray(data.contracts)) throw new Error(data.code ?? 'SCOPE_UNAVAILABLE');
  return { bases: data.bases, contracts: data.contracts };
}
export async function contractScopeSet(object: number, rowVersion: number, basisVersion: number, basis: ScopeBasis, operation: string) {
  const response = await fetch('/api/contract-scope', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ obyekt_id: object, qator_id: basis.qator_id, qator_version: rowVersion, basis_version: basisVersion, basis, operation_id: operation }) });
  const data = await response.json() as { ok: boolean; code?: string };
  if (!response.ok || !data.ok) throw new Error(data.code ?? 'SCOPE_UNAVAILABLE');
}
