import { describe, it, expect } from 'vitest';
import { normativeWorkUnit, resourceFacts } from './index';
describe('resource category and physical unit', () => {
  it('real R/619 excavator is machine, not material', () => {
    expect(resourceFacts({ name: 'ЭКСКАВАТОРЫ ОДНОКОВШОВЫЕ 0,65 М3', type: 'R', unitCode: '619' }))
      .toMatchObject({ kind: 'MACHINE', unit: 'маш-ч', costCategory: 'МАШ', pricingSource: 'MACHINE_HOUR' });
  });
  it('R/011 and M/011 hours never go into material pricing', () => {
    for (const type of ['R', 'M', 'X', null])
      expect(resourceFacts({ name: 'Механизм', type, unitCode: '011' }).kind).toBe('MACHINE');
  });
  it('all human labour stays human-hours, including machinists', () => {
    for (const name of ['ЗАТРАТЫ ТРУДА РАБОЧИХ', 'ЗАТРАТЫ ТРУДА МАШИНИСТОВ', 'ЗАТРАТЫ ТРУДА НА СВАРОЧНЫЕ РАБОТЫ'])
      expect(resourceFacts({ name, type: 'R', unitCode: '001' })).toMatchObject({ kind: 'LABOUR', unit: 'чел-ч', pricingSource: 'LABOUR_HOUR' });
    expect(resourceFacts({ name: 'ЗАТРАТЫ ТРУДА МАШИНИСТОВ', type: 'R', unitCode: '001' }).costCategory).toBe('МАШ');
  });
  it('materials keep their own units, not work-unit or machine-unit', () => {
    for (const [unitCode, unit] of [['003', 'м3'], ['006', 'т'], ['021', 'м2'], ['025', '100 шт']])
      expect(resourceFacts({ name: 'Материал', type: 'R', unitCode })).toMatchObject({ kind: 'MATERIAL', unit });
  });
  it('unknown unit/type and machine with physical unit are explicit review', () => {
    expect(resourceFacts({ name: 'ЭКСКАВАТОР', type: 'R', unitCode: '006' }).pricingSource).toBeNull();
    expect(resourceFacts({ name: 'Механизм', type: 'X', unitCode: '433' }).kind).toBe('UNRESOLVED');
    expect(resourceFacts(null).unit).toBeNull();
  });
  it('caller supplies source-proven unit, not work unit fallback', () => {
    expect(resourceFacts({ name: 'Материал', type: 'R', unitCode: 'unknown' }, () => 'л').unit).toBe('л');
  });
  it('keeps literal source units isolated from legacy numeric codes', () => {
    const unitCode = 'norm-unit:66bb1a23bd18c63006d447b5:' + encodeURIComponent('маш-ч');
    expect(resourceFacts({ name: 'Механизм', type: 'X', unitCode })).toMatchObject({ kind: 'MACHINE', unit: 'маш-ч', costCategory: 'МАШ' });
    expect(resourceFacts({ name: 'Материал', type: 'M', unitCode: 'norm-unit:other:003' }).unit).toBeNull();
    expect(resourceFacts({ name: 'Материал', type: 'M', unitCode: 'norm-unit:66bb1a23bd18c63006d447b5:%ZZ' }).unit).toBeNull();
    expect(resourceFacts({ name: 'Материал', type: 'M', unitCode: '003' }).unit).toBe('м3');
  });
  it('classifies source groups without rewriting Uzbek machinist names or physical units', () => {
    const unit = (s: string) => 'norm-unit:66bb1a23bd18c63006d447b5:' + encodeURIComponent(s);
    expect(resourceFacts({ name: 'Машинистларнинг меҳнат', type: 'NORM_MACHINIST', unitCode: unit('чел.-ч') })).toMatchObject({kind:'LABOUR',costCategory:'МАШ',unit:'чел.-ч'});
    expect(resourceFacts({ name: 'Механизм', type: 'NORM_MACHINE', unitCode: unit('маш.ч') })).toMatchObject({kind:'MACHINE',costCategory:'МАШ'});
    expect(resourceFacts({ name: 'Механизм', type: 'NORM_MACHINE', unitCode: unit('т') }).kind).toBe('UNRESOLVED');
    expect(resourceFacts({ name: 'Машинист', type: 'NORM_MACHINIST', unitCode: unit('маш.-ч') }).kind).toBe('UNRESOLVED');
    expect(resourceFacts({ name: 'Материал', type: 'NORM_MATERIAL', unitCode: unit('1000м2') })).toMatchObject({kind:'MATERIAL',unit:'1000м2'});
  });
});
describe('normative work basis is separate from resource units', () => {
  it('1000m3 scale displayed without modifying entered physical quantity', () => {
    const basis = { scale: '1000', unitLabel: 'м3' };
    expect(normativeWorkUnit(basis)).toBe('1000 м3');
    expect(basis).toEqual({ scale: '1000', unitLabel: 'м3' });
  });
  it('unknown/zero scale never invented as 1', () => {
    expect(normativeWorkUnit({ scale: null, unitLabel: 'м3' })).toBeNull();
    expect(normativeWorkUnit({ scale: '0', unitLabel: 'м3' })).toBeNull();
    expect(normativeWorkUnit({ scale: '1', unitLabel: 'т' })).toBe('т');
  });
});
