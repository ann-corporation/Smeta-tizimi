import { describe, expect, it } from 'vitest';
import { holatHosilalari } from './holat';

describe('t2_qator_holat hosila parity — sintetik SQL oracle', () => {
  it('exact source F2 amount hajm × narxga almashtirilmaydi', () => {
    const h = holatHosilalari({ hajm:10, summa:100, faktH:8, faktS:90, f2H:3, f2S:31.07, alH:2, alS:20 });
    expect(h.qoldiq_hajm).toBe(5);
    expect(h.qoldiq_summa).toBe(100 - 31.07 - 20);
    expect(h.f2_mumkin_hajm).toBe(5);
    expect(h.f2_mumkin_summa).toBe(90 - 31.07);
  });
  it('NULL, GREATEST va manfiy qoldiq SQL bilan bir xil', () => {
    expect(holatHosilalari({ hajm:null, summa:null, faktH:null, faktS:null, f2H:3, f2S:5, alH:null, alS:null }))
      .toEqual({ smeta_hajm:null, smeta_summa:null, qoldiq_hajm:null, qoldiq_summa:null, f2_mumkin_hajm:0, f2_mumkin_summa:0 });
    expect(holatHosilalari({ hajm:1, summa:2, faktH:1, faktS:2, f2H:3, f2S:5, alH:0, alS:0 }))
      .toMatchObject({ qoldiq_hajm:-2, qoldiq_summa:-3, f2_mumkin_hajm:0, f2_mumkin_summa:0 });
  });
});
