import { describe, expect, it } from 'vitest';
import { holatHosilalari, type HolatAsos } from './holat';
const asos: HolatAsos = { hajm:10, summa:100, faktH:8, faktS:90, f2H:3, f2S:31.07, alH:2, alS:20 };
describe('active packet derivation — canonical signed/null contract', () => {
  it('frozen source amount uses canonical monetary rounding', () => {
    expect(holatHosilalari(asos)).toEqual({ smeta_hajm:10, smeta_summa:100, qoldiq_hajm:5, qoldiq_summa:48.93, f2_mumkin_hajm:5, f2_mumkin_summa:51.78 });
  });
  it('unknown fakt stays unknown; explicit zero stays zero', () => {
    expect(holatHosilalari({...asos,hajm:null,summa:null,faktH:null,faktS:null,alH:null,alS:null}))
      .toEqual({ smeta_hajm:null,smeta_summa:null,qoldiq_hajm:null,qoldiq_summa:null,f2_mumkin_hajm:null,f2_mumkin_summa:null });
    expect(holatHosilalari({...asos,faktH:0,faktS:0})).toMatchObject({f2_mumkin_hajm:0,f2_mumkin_summa:0});
  });
  it('actual missing-amount guard suppresses F2 repricing, including BL/RZ', () => {
    expect(holatHosilalari({...asos,f2S:0,f2SummaYoq:1})).toMatchObject({f2_mumkin_summa:90});
    expect(holatHosilalari({...asos,f2S:0,f2SummaYoq:0})).toMatchObject({f2_mumkin_summa:0});
    expect(holatHosilalari({...asos,f2S:0})).toMatchObject({f2_mumkin_summa:0});
    expect(holatHosilalari({...asos,f2S:null})).toMatchObject({f2_mumkin_summa:null});
  });
  it('storno availability remains signed and frozen F2 is immutable', () => {
    const a = {...asos,hajm:-10,summa:-100,faktH:-8,faktS:-90,f2H:-3,f2S:-31.07,alH:0,alS:0};
    const before = {...a};
    expect(holatHosilalari(a)).toMatchObject({qoldiq_hajm:-7,qoldiq_summa:-68.93,f2_mumkin_hajm:-5,f2_mumkin_summa:-51.78});
    expect(a).toEqual(before);
  });
});
