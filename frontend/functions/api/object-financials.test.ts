import { describe, expect, it } from 'vitest';
import { financialRequest } from './object-financials';
import { requestPermission, SCOPED_APIS } from '../_shared/permission-policy';

describe('object financial summary boundary', () => {
  it('uses a named scoped readonly permission', () => {
    expect(SCOPED_APIS.has('object-financials')).toBe(true);
    expect(requestPermission('object-financials', 'GET', {}, new URLSearchParams())).toBe('object.read');
  });
  it('takes actor only from verified session and deduplicates objects', () => {
    expect(financialRequest(new URLSearchParams('kompaniya_id=2&obyektlar=7,8,7&actor_id=999&rpc=bad'), 5))
      .toEqual({ p_kompaniya_id: 2, p_actor_id: 5, p_object_ids: [7, 8] });
  });
  it('rejects absent, malformed and excessive ids rather than broadening scope', () => {
    for (const p of ['obyektlar=7','kompaniya_id=2','kompaniya_id=2&obyektlar=','kompaniya_id=2&obyektlar=7,','kompaniya_id=2&obyektlar=-1','kompaniya_id=2&obyektlar=1.5','kompaniya_id=2&obyektlar=1e3','kompaniya_id=2&obyektlar=9007199254740992', `kompaniya_id=2&obyektlar=${Array.from({length:201},(_,i)=>i+1).join(',')}`])
      expect(financialRequest(new URLSearchParams(p), 5)).toBeNull();
  });
});
