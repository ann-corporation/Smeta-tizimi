import { describe, expect, it } from 'vitest';
import { sourceMeasureBasis } from './source-measure-basis';

const REV = '66bb1a23bd18c63006d447b5';
describe('explicit source measure', () => {
  it.each([['100 м3 грунта','100','м3'],['100м²','100','м2'],['шт.','1','шт'],['10 м','10','м'],['0,5 т','0.5','т']])('parses %s without changing the source', (text,scale,unitLabel) => {
    expect(sourceMeasureBasis(text,REV)).toMatchObject({scale,unitLabel,origin:'OPERATOR'});
    expect(sourceMeasureBasis(text,REV).evidence).toContain(text);
  });
  it.each([null,'','0 м3','м3/ч','100 м3 или 10 м2','1-10 м','на каждый метр','комплект оборудования','м3 неизвестного'])('requires manual basis for %s', text => {
    expect(sourceMeasureBasis(text,REV).scale).toBeNull();
  });
  it('does not reinterpret another edition', () => expect(sourceMeasureBasis('100 м3','old').scale).toBeNull());
  it.each([
    ['100 м3 бетона, бутобетона и железобетона в деле', '100', 'м3'],
    ['100 м3 грунта по проектному наружному очертанию конструкции', '100', 'м3'],
    ['100 м3 бетона по проектному наружному очертанию конструкции', '100', 'м3'],
    ['100 м3 железобетона в деле', '100', 'м3'], ['100 м3 сборных конструкций', '100', 'м3'],
    ['100 м2 окрашиваемой поверхности', '100', 'м2'], ['100 м2 отремонтированной поверхности', '100', 'м2'],
    ['100 м трубопроводов', '100', 'м'], ['100 м трубопровода', '100', 'м'],
    ['100 м қувур', '100', 'м'], ['100 м газопровода', '100', 'м'], ['100 м бурения скважины', '100', 'м'],
    ['1 км трубопровода', '1', 'км'], ['1 км труб', '1', 'км'], ['1 км пути', '1', 'км'], ['1 км траншеи', '1', 'км'],
    ['100 шт. сборных конструкций', '100', 'шт'], ['1 комплект', '1', 'комплект'],
    ['стык', '1', 'стык'], ['1 стык', '1', 'стык'], ['1 изделие', '1', 'изделие'],
    ['1 опора', '1', 'опора'], ['1 узел', '1', 'узел'], ['1 установка', '1', 'установка'],
    ['1 га', '1', 'га'], ['кран', '1', 'кран'], ['1 устройство', '1', 'устройство'],
    ['1 скважина', '1', 'скважина'], ['100 приборов', '100', 'приборов'], ['расчалка (оттяжка)', '1', 'расчалка (оттяжка)'],
  ])('recognizes the observed source measure %s without asking for its known scale again', (measure, scale, unitLabel) => {
    const basis = sourceMeasureBasis(measure, REV);
    expect(basis).toMatchObject({ scale, unitLabel });
    expect(basis.evidence).toContain(measure);
  });
  it.each(['100 м3 бетона или 10 м2 поверхности', '1 км/ч', '100 м2 покрытия толщиной 10 мм',
    '100 м3 неизвестного материала', '100 м3 сборных конструкций и 20 т', '100 шт. сборных конструкций/час',
    '0 стык', '1 комплект оборудования', '1 км трубопровода на каждый 1 м'])('keeps ambiguous or composite source measures manual: %s', measure => {
    expect(sourceMeasureBasis(measure, REV).scale).toBeNull();
  });
});
