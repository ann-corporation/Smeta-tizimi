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

describe('loyiha-smeta shlyuzi: tahrirlar', () => {
  it('tahrir amallari allow-list da, RPC nomlari t2_loyiha_tahrir_*_v1', () => {
    for (const k of ['tahrir_yarat', 'tahrir_yoz', 'tahrir_asos', 'tahrir_qaror']) expect(YOZISH[k]).toMatch(/^t2_loyiha_tahrir_[a-z]+_v1$/);
    for (const k of ['tahrir_royxat', 'tahrir_farq']) expect(OQISH[k]).toMatch(/^t2_loyiha_tahrir_[a-z]+_v1$/);
  });
  it('yozish: nom, tahrir_id, qaror turi va sabab tekshiriladi; noma‘lum miqdor null qoladi', () => {
    expect(yozishYuki('tahrir_yarat', { kompaniya_id: 1, obyekt_id: 2 })).toMatch(/nom/);
    expect(yozishYuki('tahrir_yarat', { kompaniya_id: 1, obyekt_id: 2, nom: ' Ekspertiza ', sana: '2026-01-28' })).toEqual({ p_kompaniya_id: 1, p_obyekt_id: 2, p_nom: 'Ekspertiza', p_sana: '2026-01-28' });
    expect(yozishYuki('tahrir_yarat', { kompaniya_id: 1, obyekt_id: 2, nom: 'A', sana: 'xx' })).toMatchObject({ p_sana: null });
    expect(yozishYuki('tahrir_yoz', { kompaniya_id: 1, obyekt_id: 2, varaq: 'КР-5', items: [{ nom: 'A', birlik: 'м3', miqdor: 1 }] })).toMatch(/tahrir_id/);
    const y = yozishYuki('tahrir_yoz', { kompaniya_id: 1, obyekt_id: 2, tahrir_id: 3, varaq: 'КР-5', revizya: 1, items: [{ nom: 'A', birlik: 'м3', miqdor: null }] }) as Record<string, unknown>;
    expect(y.p_tahrir_id).toBe(3); expect((y.p_items as { miqdor: null }[])[0].miqdor).toBeNull();
    expect(yozishYuki('tahrir_qaror', { kompaniya_id: 1, obyekt_id: 2, eski_id: 3, yangi_id: 4, varaq: 'КР-5', kalit: 'k', qaror: 'ochir' })).toMatch(/qaror/);
    expect(yozishYuki('tahrir_qaror', { kompaniya_id: 1, obyekt_id: 2, eski_id: 3, yangi_id: 4, varaq: 'КР-5', kalit: 'k', qaror: 'qoldir', sabab: 'x' })).toMatchObject({ p_qaror: 'qoldir', p_eski: 3, p_yangi: 4 });
  });
  it('o‘qish: farq uchun eski_id va yangi_id majburiy', () => {
    expect(oqishYuki('tahrir_farq', new URLSearchParams('kompaniya_id=1&obyekt_id=2'))).toMatch(/eski_id/);
    expect(oqishYuki('tahrir_farq', new URLSearchParams('kompaniya_id=1&obyekt_id=2&eski_id=3&yangi_id=4'))).toEqual({ p_kompaniya_id: 1, p_obyekt_id: 2, p_eski: 3, p_yangi: 4 });
    expect(oqishYuki('tahrir_royxat', new URLSearchParams('kompaniya_id=1&obyekt_id=2'))).toEqual({ p_kompaniya_id: 1, p_obyekt_id: 2 });
  });
});
