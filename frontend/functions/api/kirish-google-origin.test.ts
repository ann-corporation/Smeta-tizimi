import { describe, expect, it } from 'vitest';
import { googleOriginlar } from './kirish-google';

/* Egasi (2026-10-02): "Error 400: origin_mismatch — production'da chiqsa oqibati juda jiddiy". */
describe('Google kirish — ruxsat etilgan origin ro‘yxati', () => {
  it('sukut: faqat asosiy prod manzil; env bilan aniq ro‘yxat (oxirgi / tozalanadi, yaroqsiz tashlanadi)', () => {
    expect(googleOriginlar({})).toEqual(['https://smeta-tizimi.pages.dev']);
    expect(googleOriginlar({ GOOGLE_ORIGINS: 'https://smeta.uz/, https://smeta-tizimi.pages.dev , javascript:x, https://a.b/c' }))
      .toEqual(['https://smeta.uz', 'https://smeta-tizimi.pages.dev']);
  });
});
