import { describe, expect, it } from 'vitest';
import { keyingiHolatlar, mumkinOtish, qabulOgohlantirish, tolovHolati } from './buyurtma-holat';

describe('buyurtma holat', () => {
  it('asosiy yo\'l va tomonlar', () => {
    expect(mumkinOtish('tasdiqlandi', 'tayyorlanmoqda', 'yetkazuvchi')).toBe(true);
    expect(mumkinOtish('tasdiqlandi', 'tayyorlanmoqda', 'obyekt')).toBe(false);
    expect(mumkinOtish('yuklashga_tayyor', 'yetkazildi', 'logistika')).toBe(true);
    expect(mumkinOtish('yetkazildi', 'qabul_qilindi', 'obyekt')).toBe(true);
    expect(mumkinOtish('tasdiqlandi', 'yetkazildi', 'logistika')).toBe(false);
    expect(mumkinOtish('yopildi', 'bekor', 'obyekt')).toBe(false);
  });
  it('keyingi tugmalar', () => {
    expect(keyingiHolatlar('tayyorlanmoqda', 'yetkazuvchi')).toEqual(['yuklashga_tayyor', 'bekor']);
    expect(keyingiHolatlar('yetkazildi', 'yetkazuvchi')).toEqual([]);
  });
  it("to'lov: noma'lum taxmin qilinmaydi", () => {
    expect(tolovHolati(null, 5)).toBeNull();
    expect(tolovHolati(100, 0)).toBe('tolanmagan');
    expect(tolovHolati(100, 40)).toBe('qisman');
    expect(tolovHolati(100, 100)).toBe('tolangan');
  });
  it('qabul ogohlantirish', () => {
    expect(qabulOgohlantirish({ sertifikatSoni: 0, qabulMiqdor: 9, buyurtmaMiqdor: 10 })).toHaveLength(2);
    expect(qabulOgohlantirish({ sertifikatSoni: 1, qabulMiqdor: 10, buyurtmaMiqdor: 10 })).toHaveLength(0);
  });
});
