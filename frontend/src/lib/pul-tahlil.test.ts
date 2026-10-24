import { describe, expect, it } from 'vitest';
import { pulBannerlar, pulFarq, pulFarqFoiz, pulUmumiyKoef, pulZanjirQiymat, xarajatQamrovFoiz, type PulKesim } from './pul-tahlil';

const kesim = (kat: string, o: Partial<PulKesim> = {}): PulKesim => ({
  kat, ota: null, smeta_ustamasiz: 1000, f2_yopilgan: 1020, xarajat: null, farq: null, farq_foiz: null, xarajat_holat: 'kiritilmagan', ...o,
});

describe('pul tahlili: NULL ≠ 0', () => {
  it('farq faqat ikkala tomon ma\'lum bo\'lsa', () => {
    expect(pulFarq(null, 1020)).toBeNull();
    expect(pulFarq(2000, null)).toBeNull();
    expect(pulFarq(undefined, undefined)).toBeNull();
    expect(pulFarq(2000, 1020)).toBe(980);
    expect(pulFarq(0, 1020)).toBe(-1020); // 0 — ma'lum nol, noma'lum emas
  });
  it('foiz: F2=0 yoki noma\'lum bo\'lsa null; boshqacha aniq', () => {
    expect(pulFarqFoiz(2000, 1020)).toBe(96.1);
    expect(pulFarqFoiz(2000, 0)).toBeNull();
    expect(pulFarqFoiz(null, 1020)).toBeNull();
    expect(pulFarqFoiz(2_000_000_000, 1_000_000_000)).toBe(100);
  });
  it('tiyin aniqligi', () => {
    expect(pulFarq(0.3, 0.1)).toBe(0.2);
  });
});

describe('pul tahlili: bannerlar', () => {
  it('xarajat yo\'q — birinchi banner xarajat haqida, hisoblanmagan SUB/OTK alohida', () => {
    const ks = [kesim('ЧЕЛ'), kesim('МАШ'), kesim('SUB', { xarajat_holat: 'hisoblanmagan', smeta_ustamasiz: null, f2_yopilgan: null })];
    expect(xarajatQamrovFoiz(ks)).toBe(0);
    const b = pulBannerlar({ kesimlar: ks, f2Nomalum: 0, smetaNomalum: 0 });
    expect(b[0].kod).toBe('xarajat');
    expect(b.map((x) => x.kod)).toContain('sub_otk');
  });
  it('qamrov: МАТ ichki qatorlari (ota) hisobga kirmaydi', () => {
    const ks = [kesim('ЧЕЛ', { xarajat: 5 }), kesim('МАТ'), kesim('М/К', { ota: 'МАТ', xarajat: 7 })];
    expect(xarajatQamrovFoiz(ks)).toBe(50);
  });
  it('noma\'lum summalar ogohlantiriladi', () => {
    const b = pulBannerlar({ kesimlar: [kesim('ЧЕЛ', { xarajat: 1 })], f2Nomalum: 3, smetaNomalum: 2 });
    expect(b.map((x) => x.kod)).toEqual(['f2_nomalum', 'smeta_nomalum']);
  });
});

describe('pul tahlili: zanjir', () => {
  const nk = { pryamye: 856, itogo4: 1000, vsego: 1120 };
  it('qiymatlar bazadan aynan', () => {
    expect(pulZanjirQiymat(nk, 'vsego')).toBe(1120);
    expect(pulZanjirQiymat(nk, 'nds')).toBeNull();
    expect(pulZanjirQiymat(null, 'vsego')).toBeNull();
  });
  it('umumiy koeffitsient = jami4 / pryamye', () => {
    expect(pulUmumiyKoef(nk)).toBe(1.1682);
    expect(pulUmumiyKoef({ pryamye: 0, itogo4: 5 })).toBeNull();
  });
});
