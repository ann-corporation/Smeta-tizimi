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
});
