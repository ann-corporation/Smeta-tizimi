import { describe, expect, it } from 'vitest';
import { OQISH, YOZISH, elementTozala, oqishYuki, yozishYuki } from './loyiha-smeta';
import { SCOPED_APIS, requestPermission } from '../_shared/permission-policy';

describe('loyiha-smeta shlyuzi', () => {
  it('faqat sanab o‘tilgan RPC lar', () => {
    for (const nom of [...Object.values(OQISH), ...Object.values(YOZISH)]) expect(nom).toMatch(/^t2_loyiha_[a-z_]+_v1$/);
    expect(YOZISH['t2_qator_yoz']).toBeUndefined();
  });
  it('permission siyosatida ro‘yxatga olingan', () => {
    expect(SCOPED_APIS.has('loyiha-smeta')).toBe(true);
    expect(requestPermission('loyiha-smeta', 'POST', { amal: 'tasdiq' }, new URLSearchParams())).toBe('smeta.read');
  });
  it('noma‘lum miqdor null qoladi (0 emas); manfiy va noto‘g‘ri rad', () => {
    expect(elementTozala({ nom: 'A', birlik: 'м3', miqdor: null })).toMatchObject({ miqdor: null });
    expect(elementTozala({ nom: 'A', birlik: 'м3', miqdor: '' })).toMatchObject({ miqdor: null });
    expect(elementTozala({ nom: 'A', birlik: 'м3', miqdor: -1 })).toBeNull();
    expect(elementTozala({ nom: 'A', birlik: 'м3', miqdor: 'x' })).toBeNull();
    expect(elementTozala({ nom: '', birlik: 'м3', miqdor: 1 })).toBeNull();
  });
  it('yoz: kompaniya, obyekt, varaq, items tekshiriladi', () => {
    expect(yozishYuki('yoz', { obyekt_id: 1 })).toBe('kompaniya_id kerak');
    expect(yozishYuki('yoz', { kompaniya_id: 1, obyekt_id: 2, varaq: 'КР-5', items: [] })).toBe('items: 1..2000 ta');
    const y = yozishYuki('yoz', { kompaniya_id: 1, obyekt_id: 2, varaq: 'КР-5', revizya: 1, items: [{ nom: 'A', birlik: 'м3', miqdor: 2, tur: 'x' }] }) as Record<string, unknown>;
    expect(y.p_varaq).toBe('КР-5'); expect((y.p_items as { tur: string }[])[0].tur).toBe('boshqa');
  });
  it('qaror va tasdiq cheklovlari; ochiq bo‘lmagan amal rad', () => {
    expect(yozishYuki('qaror', { kompaniya_id: 1, miqdor_id: 3, tur: 'ochir' })).toMatch(/tur/);
    expect(yozishYuki('tasdiq', { kompaniya_id: 1, ids: [1, 2], holat: 'x' })).toMatch(/holat/);
    expect(yozishYuki('ochirish', { kompaniya_id: 1 })).toBe('Amal ochiq emas');
  });
  it('oqish: obyekt_id majburiy', () => {
    expect(oqishYuki('farq', new URLSearchParams('kompaniya_id=1'))).toMatch(/obyekt_id/);
    expect(oqishYuki('farq', new URLSearchParams('kompaniya_id=1&obyekt_id=2'))).toEqual({ p_kompaniya_id: 1, p_obyekt_id: 2 });
    expect(oqishYuki('x', new URLSearchParams('kompaniya_id=1&obyekt_id=2'))).toMatch(/ochiq emas/);
  });
});
