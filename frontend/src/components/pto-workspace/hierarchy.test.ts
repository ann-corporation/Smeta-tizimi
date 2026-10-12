import { describe, expect, it } from 'vitest';
import type { T2Obyekt } from '../../api/supabase';
import type { Liniya } from '../../api/t2-shartnoma-liniya';
import { aggregateObjects, contractObjects, projectObjects, unassignedObjects } from './hierarchy';

const o = (id: number, price: number | null, unpriced: number | null = 0) => ({ id, jami: price, narxsiz: unpriced, ish: 3, resurs: 8, razdel: 2, qator_soni: 13 } as T2Obyekt);
const line = { loyihalar: [{id:1,nom:'A'},{id:2,nom:'B'}], obyektlar: [{id:10,loyiha_id:1},{id:11,loyiha_id:1},{id:12,loyiha_id:2},{id:13,loyiha_id:1}], shartnomalar: [
  {id:100,loyiha_id:1,obyektlar:[10,11,11,12]}, {id:101,loyiha_id:1,obyektlar:[11]},
] } as unknown as Liniya;
describe('canonical hierarchy totals', () => {
  it('sums unique descendants once, regardless of overlapping contracts', () => {
    expect(aggregateObjects([10,11,11], [o(10,100),o(11,200)]).jami).toMatchObject({known:300,unknown:0,present:2,total:2});
    expect(aggregateObjects(projectObjects(line,1),[o(10,100),o(11,200),o(13,0)]).jami.known).toBe(300);
  });
  it('retains known subtotal beside NULL/missing descendants and explicit zero', () => {
    expect(aggregateObjects([10,11,13,14],[o(10,100),o(11,null),o(13,0)]).jami).toEqual({known:100,present:2,unknown:2,total:4});
  });
  it('marks a non-NULL source total incomplete when prices are missing or unknown', () => {
    expect(aggregateObjects([10],[o(10,100,3)]).jami).toEqual({known:100,present:1,unknown:1,total:1});
    expect(aggregateObjects([10],[o(10,100,null)]).jami.unknown).toBe(1);
  });
  it('aggregates work/resource/section/count columns at every layer', () => {
    const sum = aggregateObjects([10,11],[o(10,100),o(11,200)]);
    expect(sum.ish.known).toBe(6); expect(sum.resurs.known).toBe(16); expect(sum.razdel.known).toBe(4); expect(sum.qator_soni.known).toBe(26);
  });
  it('rejects cross-project membership and exposes unassigned objects', () => {
    expect(contractObjects(line,100)).toEqual([10,11]);
    expect(unassignedObjects(line,1)).toEqual([13]);
    expect(contractObjects(line,999)).toEqual([]);
  });
});
