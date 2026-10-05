import { it, expect, describe } from 'vitest';
import { NormCatalog, previewResourceQuantity as qty, previewResourceAmount as money } from './norm-catalog';
const blob = (s: string) => ({ text_cp1251: s });
const make = () => {
  const c = new NormCatalog();
  c.add('basis', { Kod: 1, KodE: 'E1', NameP: blob('Работа'), KodI: '004' });
  c.add('material', { Kod: 2, KodM: 'C1', NameP: blob('Цемент'), KodI: '015' });
  c.add('basisres', { Kod: 3, KodE: 'E1', KodM: 'C1', NormaR: 1.76 });
  return c;
};
describe('Norm source catalog', () => {
  it('exact work/resource link', () => { const d = make().detail('1'); expect(d.recipes[0].resourceStatus).toBe('EXACT'); expect(d.recipes[0].norm).toBe('1.76'); });
  it('duplicate resource code does not choose first', () => { const c = make(); c.add('material', { Kod: 4, KodM: 'C1', NameP: blob('Другой цемент') }); expect(c.detail('1').recipes[0].resourceStatus).toBe('AMBIGUOUS'); });
  it('duplicate work code flagged', () => { const c = make(); c.add('basis', { Kod: 4, KodE: 'E1', NameP: blob('Другая работа') }); expect(c.detail('1').workCodeAmbiguous).toBe(true); });
  it('missing KodM uses exact unique KodR, not name', () => { const c=make(); c.add('material',{Kod:4,KodR:'004',NameP:blob('Ресурс')}); c.add('basisres',{Kod:5,KodE:'E1',KodR:'004',NormaR:2}); expect(c.detail('1').recipes[1].resourceStatus).toBe('EXACT'); expect(c.detail('1').recipes[1].matchBasis).toBe('KodR'); });
  it('conflicting material and resource keys fail closed', () => { const c=make(); c.add('basisres',{Kod:5,KodE:'E1',KodM:'C1',KodR:'wrong',NormaR:2}); expect(c.detail('1').recipes[1].resourceStatus).toBe('MISSING'); });
  it('NULL remains unknown', () => { const c = make(); c.add('basisres', { Kod: 5, KodE: 'E1', KodM: null, NormaR: null }); expect(c.detail('1').recipes[1].norm).toBeNull(); expect(c.detail('1').recipes[1].resourceStatus).toBe('MISSING'); });
  it('source IDs never row numbers', () => { expect(make().detail('1').recipes[0].id).toBe('3'); });
  it('unknown work throws', () => { expect(() => make().detail('999')).toThrow('WORK_NOT_FOUND'); });
  it('region prices are separate candidates', () => { const c = make(); c.add('bprice', { Kod: 4, KodM: 'C1', Rajon: '40', Cena: 10 }); c.add('bprice', { Kod: 5, KodM: 'C1', Rajon: '41', Cena: 12 }); expect(c.detail('1').recipes[0].priceCount).toBe(2); });
  it('cannot overwrite duplicate id', () => { const c = make(); expect(() => c.add('basis', { Kod: 1, KodE: 'E2' })).toThrow(); });
  it('10k works, bounded search and detail', () => { const c = make(); for(let i=10; i<10010; i++) c.add('basis', { Kod: i, KodE: 'E'+i, NameP: blob('Работа '+i) }); expect(c.search('', 0).rows).toHaveLength(25); expect(c.search('10009',0).total).toBe(1); });
});
describe('New draft decimal arithmetic; never historical F2', () => {
  it.each([['300','2','100','6.000000'], ['0','2','100','0.000000'], ['1','0','1','0.000000'], ['1','0.1234567','1','0.123457'], ['1000','1e-7','1','0.000100']])('quantity %s × %s / %s', (q,n,b,want) => expect(qty(q,n,b,'verified clause')).toBe(want));
  it('NULL norm is not zero', () => expect(qty('1',null,'1','verified')).toBeNull());
  it('basis confirmation required', () => expect(() => qty('1','2','100','')).toThrow());
  it.each(['0','-1','NaN',''])('invalid basis %s', b => expect(() => qty('1','2',b,'verified')).toThrow());
  it('large integers do not lose cents', () => expect(money('9007199254740993','1')).toBe('9007199254740993.00'));
  it('rounding half cent', () => expect(money('1','10.005')).toBe('10.01'));
  it('missing price not zero', () => expect(money('1',null)).toBeNull());
  it('negative resource amount cannot be certified', () => expect(() => money('-1','2')).toThrow('QUANTITY_INVALID'));
  it('below/above estimate price separate; no source mutation', () => { const c=make(); expect(money('2','5')).toBe('10.00'); expect(money('2','15')).toBe('30.00'); expect(c.detail('1').recipes[0].norm).toBe('1.76'); });
});
