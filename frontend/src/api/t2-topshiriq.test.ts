import { describe, expect, it } from 'vitest';
import { harakatlar } from './t2-topshiriq';

describe('topshiriq harakatlari', () => {
  it('ijrochi: berildi -> qabul/rad(izoh), bajarilmoqda -> bajarildi', () => {
    expect(harakatlar('berildi', 'menga').map((h) => h.holat)).toEqual(['qabul_qilindi', 'rad']);
    expect(harakatlar('berildi', 'menga')[1].izohKerak).toBe(true);
    expect(harakatlar('bajarilmoqda', 'menga').map((h) => h.holat)).toEqual(['bajarildi']);
    expect(harakatlar('qaytarildi', 'menga').map((h) => h.holat)).toEqual(['bajarilmoqda']);
  });
  it('beruvchi: bajarildi -> tasdiq/qaytarish; yakuniy holatda harakat yo‘q', () => {
    expect(harakatlar('bajarildi', 'mendan').map((h) => h.holat)).toEqual(['tasdiqlandi', 'qaytarildi']);
    expect(harakatlar('tasdiqlandi', 'mendan')).toEqual([]);
    expect(harakatlar('rad', 'menga')).toEqual([]);
  });
});
