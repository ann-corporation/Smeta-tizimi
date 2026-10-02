import { describe, expect, it } from 'vitest';
import { originRuxsatmi } from './GoogleKirish';

/* Egasi (2026-10-02): origin_mismatch production'da chiqmasin — ro'yxatda yo'q manzilda Google tugmasi chizilmaydi. */
describe('Google tugmasi — faqat ruxsat etilgan manzilda', () => {
  const o = ['https://smeta-tizimi.pages.dev'];
  it('asosiy manzil — ha; preview deploy, localhost — yo‘q', () => {
    expect(originRuxsatmi('https://smeta-tizimi.pages.dev', o)).toBe(true);
    expect(originRuxsatmi('https://SMETA-TIZIMI.pages.dev', o)).toBe(true);
    expect(originRuxsatmi('https://3bf7097a.smeta-tizimi.pages.dev', o)).toBe(false);
    expect(originRuxsatmi('http://localhost:5173', o)).toBe(false);
  });
});
