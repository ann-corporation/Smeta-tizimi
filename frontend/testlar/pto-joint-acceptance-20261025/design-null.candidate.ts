import { expect, it } from 'vitest';
import type { TreeNode } from '../../src/api/types';
import { umumiyKesim } from '../../src/lib/smeta-korinish';

const row = (smeta: number | null): TreeNode => ({ type: 'rz', nom: 'Synthetic', varaq: 'v', row: 1, smetaHajm: null, smeta, narx: null, fakt: null, qoldiq: null, f2ol: 0, f2mum: 0, stFakt: smeta, stF2: smeta });
it('CONTROL design: known zero remains zero', () => expect(umumiyKesim([row(0)]).smeta).toBe(0));
it('CONTROL design: known amounts sum without inventing a formula', () => expect(umumiyKesim([row(100), row(50)]).smeta).toBe(150));
it('OPEN DESIGN-QA-01: an entirely unknown total must not become a known zero', () => {
  // A future explicit incomplete-total contract/UI may satisfy this requirement too; review that together.
  expect(umumiyKesim([row(null)]).smeta).toBeNull();
});
