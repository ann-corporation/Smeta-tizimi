import { describe, expect, it } from 'vitest';
import { HR_ROL_BAZA_TURI, KPI_PULGA_SUKUT, boshlashHolati, kpiQiymatMatn } from './qarorlar';
import { kpiJamlari } from './hisob';
import type { HrKpiQator, HrXodim } from '../../api/t2-hr';

const xodim = (hr_bor: boolean) => ({ hr_bor } as HrXodim);

describe('HR qarorlari (D1-D3)', () => {
  it('D1: brigada donabay, ofis oklad; D3: KPI pulga ta’siri sukut bo‘yicha o‘chiq', () => {
    expect(HR_ROL_BAZA_TURI.brigadir).toBe('donabay');
    expect(HR_ROL_BAZA_TURI.usta).toBe('donabay');
    expect(HR_ROL_BAZA_TURI.prorab).toBe('oylik');
    expect(HR_ROL_BAZA_TURI.pto).toBe('oylik');
    expect(KPI_PULGA_SUKUT).toBe(false);
  });
  it('birinchi ishga tushirish: stavka va xodim bo‘lmaguncha ko‘rsatiladi', () => {
    expect(boshlashHolati({ sozlama: null, xodimlar: [] })).toEqual({ kerak: true, stavka: false, xodim: false });
    const soz = { ndfl_foiz: 12, inps_foiz: 0.1, kun_soat: 8, versiya: 1 };
    expect(boshlashHolati({ sozlama: soz, xodimlar: [xodim(false)] }).kerak).toBe(true);
    expect(boshlashHolati({ sozlama: soz, xodimlar: [xodim(true)] }).kerak).toBe(false);
    expect(boshlashHolati({ sozlama: { ...soz, ndfl_foiz: null }, xodimlar: [xodim(true)] }).kerak).toBe(true);
  });
  it('KPI qiymati noma’lum bo‘lsa «—» (0 emas)', () => {
    expect(kpiQiymatMatn({ qiymat: null, birlik: '%' }, String)).toBe('—');
    expect(kpiQiymatMatn({ qiymat: 0, birlik: '%' }, String)).toBe('0%');
    expect(kpiQiymatMatn({ qiymat: 3, birlik: 'ta' }, String)).toBe('3');
  });
  it('jamlar: naryad qismi noma’lum bo‘lsa jamiga 0 deb kirmaydi', () => {
    const q = [{ naryad_summa: 400000 }, { naryad_summa: null }, {}] as unknown as HrKpiQator[];
    expect(kpiJamlari(q).naryad).toBe(400000);
  });
});
