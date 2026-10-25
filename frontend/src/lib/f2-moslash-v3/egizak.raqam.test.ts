import { describe, expect, it } from 'vitest';
import { egizakAktRaqami, egizakRaqamMasalasi } from './egizak';

describe('egizak nusxa: F2 raqami ko‘chmaydi', () => {
  it('nusxadan keyin bo‘sh raqam — blok (yangi raqam so‘raladi)', () => {
    expect(egizakRaqamMasalasi(true, '49', '')?.daraja).toBe('blok');
    expect(egizakRaqamMasalasi(true, '49', '   ')?.daraja).toBe('blok');
  });
  it('egizakdagi raqamning o‘zi — blok (harf katta-kichikligi va bo‘shliqsiz)', () => {
    expect(egizakRaqamMasalasi(true, 'F2-7', ' f2-7 ')?.daraja).toBe('blok');
  });
  it('yangi raqam — ruxsat; nusxa olinmagan bo‘lsa — hech narsa', () => {
    expect(egizakRaqamMasalasi(true, '49', '52')).toBeNull();
    expect(egizakRaqamMasalasi(false, '49', '49')).toBeNull();
  });
  it('cursor.aktRaqam o‘qiladi', () => {
    expect(egizakAktRaqami({ aktRaqam: ' 49 ' })).toBe('49');
    expect(egizakAktRaqami(null)).toBe('');
    expect(egizakAktRaqami({ aktRaqam: 5 })).toBe('');
  });
});