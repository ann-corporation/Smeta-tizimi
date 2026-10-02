import { describe, expect, it } from 'vitest';
import { yozishYuki } from './boshqaruv';

// Boshqaruv shlyuzi faqat sanab o'tilgan amallarni va tekshirilgan parametrlarni uzatadi (actor — sessiyadan, alohida).
describe('boshqaruv shlyuzi — yozish yuki', () => {
  it('foydalanuvchini bloklash', () => {
    expect(yozishYuki('foydalanuvchi_holat', { foydalanuvchi_id: 5, holat: 'bekor', sabab: 'spam' }))
      .toEqual({ p_foydalanuvchi_id: 5, p_holat: 'bekor', p_sabab: 'spam' });
    expect(yozishYuki('foydalanuvchi_holat', { foydalanuvchi_id: 5, holat: 'ochir' })).toMatch(/holat/);
    expect(yozishYuki('foydalanuvchi_holat', { foydalanuvchi_id: -1, holat: 'bekor' })).toMatch(/foydalanuvchi_id/);
  });

  it('a‘zolik: rol berish va olib tashlash (rol=null)', () => {
    expect(yozishYuki('azolik', { foydalanuvchi_id: 5, kompaniya_id: 2, rol: 'pto', sabab: 'x' }))
      .toEqual({ p_foydalanuvchi_id: 5, p_kompaniya_id: 2, p_rol: 'pto', p_sabab: 'x' });
    expect(yozishYuki('azolik', { foydalanuvchi_id: 5, kompaniya_id: 2, rol: '', sabab: 'x' })).toMatchObject({ p_rol: null });
  });

  it('narx va tarif — raqamlar majburiy', () => {
    expect(yozishYuki('narx', { amal_kod: 'hujjat', narx: 1, birlik: 500.7, minimum: 1 })).toEqual({ p_amal: 'hujjat', p_narx: 1, p_birlik: 500, p_minimum: 1, p_faol: true });
    expect(yozishYuki('narx', { amal_kod: 'hujjat; drop', narx: 1, birlik: 1, minimum: 0 })).toMatch(/amal_kod/);
    expect(yozishYuki('tarif', { kod: 'pto_start', nom: 'PTO Start', oylik_token: 1500, narx_som: 99000, faol: false }))
      .toEqual({ p_kod: 'pto_start', p_nom: 'PTO Start', p_oylik_token: 1500, p_narx_som: 99000, p_faol: false });
    expect(yozishYuki('tarif', { kod: 'x', nom: '', oylik_token: 1, narx_som: 1 })).toMatch(/kod/);
  });

  it('noma‘lum amal va actor almashtirish urinishi o‘tmaydi', () => {
    expect(yozishYuki('sql', {})).toBe('Amal ochiq emas');
    const y = yozishYuki('foydalanuvchi_holat', { foydalanuvchi_id: 5, holat: 'faol', sabab: 'x', p_actor_id: 1 }) as Record<string, unknown>;
    expect(y).not.toHaveProperty('p_actor_id');
  });
});
