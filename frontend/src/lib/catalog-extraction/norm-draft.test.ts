import { it, expect } from 'vitest';
import { NormCatalog } from './norm-catalog';
import { buildNormDraftLine, sumDraftAmounts, type NormDraftRequest } from './norm-draft';
const request: NormDraftRequest = { workId: '1', quantity: '300', basisQuantity: '100', unitLabel: 'м²', unitEvidence: 'norm clause', currency: 'UZS', priceEvidence: 'price quote 2026', prices: { '3': '10.005' } };
function catalog() { const c = new NormCatalog(); c.add('basis', { Kod: 1, KodE: 'E1' }); c.add('material', { Kod: 2, KodM: 'C1' }); c.add('basisres', { Kod: 3, KodE: 'E1', KodM: 'C1', NormaR: 2 }); return c; }
it('complete recipe quantity and cents from same source', () => { const line = buildNormDraftLine(catalog(), request); expect(line.resources[0].quantity).toBe('6.000000'); expect(line.amount).toBe('60.03'); expect(line.unresolved).toBe(0); });
it('no hidden first resource choice', () => { const c = catalog(); c.add('material', { Kod: 4, KodM: 'C1' }); const line = buildNormDraftLine(c, request); expect(line.amount).toBeNull(); expect(line.resources[0].sourceResourceId).toBeNull(); });
it('missing price keeps total unknown', () => expect(buildNormDraftLine(catalog(), { ...request, prices: {} }).amount).toBeNull());
it('no empty recipe false zero total', () => { const c = new NormCatalog(); c.add('basis', { Kod: 1, KodE: 'E1' }); expect(buildNormDraftLine(c, request).amount).toBeNull(); });
it('price provenance required', () => expect(() => buildNormDraftLine(catalog(), { ...request, priceEvidence: '' })).toThrow());
it('physical unit required', () => expect(() => buildNormDraftLine(catalog(), { ...request, unitLabel: '' })).toThrow());
it('full recipe across pages not just visible first 25', () => { const c = catalog(); for (let i=4;i<34;i++) c.add('basisres', { Kod: i, KodE:'E1', KodM:'C1', NormaR:1 }); const line = buildNormDraftLine(c, request); expect(line.resources).toHaveLength(31); expect(line.amount).toBeNull(); expect(line.unresolved).toBe(30); });
it('money totals preserve huge integer cents', () => expect(sumDraftAmounts(['9007199254740993.01', '0.99'])).toBe('9007199254740994.00'));
it('unknown subtotal is never zero', () => expect(sumDraftAmounts(['1.00', null])).toBeNull());
it('source and previous draft immutable after recalculation', () => { const c=catalog(); const old = buildNormDraftLine(c,request); buildNormDraftLine(c,{...request,prices:{'3':'20'}}); expect(old.amount).toBe('60.03'); expect(c.detail('1').recipes[0].norm).toBe('2'); });
