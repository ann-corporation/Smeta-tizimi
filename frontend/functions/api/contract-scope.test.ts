import { describe, expect, it } from 'vitest';
import { scopeRequest } from './contract-scope';
import { requestPermission, SCOPED_APIS } from '../_shared/permission-policy';
describe('contract scope named boundary', () => {
  const p = { obyekt_id: 4, qator_id: 5, qator_version: 1, basis_version: 0, basis: {}, operation_id: '00000000-0000-4000-8000-000000000001' };
  it('uses company-scoped estimate permissions for reads and writes', () => {
    expect(SCOPED_APIS.has('contract-scope')).toBe(true);
    expect(requestPermission('contract-scope', 'GET', {}, new URLSearchParams())).toBe('smeta.read');
    expect(requestPermission('contract-scope', 'POST', {}, new URLSearchParams())).toBe('smeta.write');
  });
  it('takes actor from verified session and ignores client actor and RPC', () => {
    expect(scopeRequest({ ...p, p_actor_id: 99, actor_id: 99, rpc: 'bad' }, 7, true)).toEqual({ p_actor_id: 7, p_obyekt_id: 4, p_qator_id: 5, p_qator_version: 1, p_basis_version: 0, p_basis: {}, p_operation_id: p.operation_id });
  });
  it('requires explicit version and stable operation id', () => {
    for (const patch of [{ qator_version: null }, { basis_version: -1 }, { operation_id: '' }, { qator_id: 0 }, { obyekt_id: true }, { obyekt_id: '4' }]) expect(scopeRequest({ ...p, ...patch }, 7, true)).toBeNull();
    expect(scopeRequest({ obyekt_id: 4 }, 7, false)).toEqual({ p_actor_id: 7, p_obyekt_id: 4 });
  });
});
