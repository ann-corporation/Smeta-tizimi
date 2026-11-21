import { describe, expect, it } from 'vitest';
import { auditRpcYuki, belgilaKirish, belgilaRpcYuki, kirishXatomi, yoyKirish, yoyRpcYuki } from './kirish';

// Faqat sintetik raqamlar.
const guruh = { material: 'Sintetik shag‘al', zichlik: 1.5, km: 20, kodlar: ['12303'] };
const asos = { obyekt_id: 5, rz_id: 9, tkm_narx: 100, qatorlar: [guruh] };

describe('yoyKirish', () => {
  it('to‘g‘ri kirishni normallashtiradi (sukut: majburiy=false, yoz=false)', () => {
    const k = yoyKirish(asos);
    expect(kirishXatomi(k)).toBe(false);
    expect(k).toMatchObject({ obyekt_id: 5, rz_id: 9, tkm_narx: 100, majburiy: false, yoz: false, qatorlar: [{ material: 'Sintetik shag‘al', zichlik: 1.5, km: 20, kodlar: ['12303'] }] });
  });
  it('bo‘sh narx 0 deb olinmaydi; manfiy narx va noto‘g‘ri zichlik rad', () => {
    expect(yoyKirish({ ...asos, tkm_narx: undefined })).toMatchObject({ xato: 'TKM_NARX_KERAK' });
    expect(yoyKirish({ ...asos, tkm_narx: '' })).toMatchObject({ xato: 'TKM_NARX_KERAK' });
    expect(yoyKirish({ ...asos, tkm_narx: -1 })).toMatchObject({ xato: 'TKM_NARX_KERAK' });
    expect(yoyKirish({ ...asos, tkm_narx: 0 })).toMatchObject({ tkm_narx: 0 });
    expect(yoyKirish({ ...asos, qatorlar: [{ ...guruh, zichlik: 0 }] })).toMatchObject({ xato: 'GURUH_NOTOGRI' });
    expect(yoyKirish({ ...asos, qatorlar: [{ material: 'X', zichlik: 1, km: 2 }] })).toMatchObject({ xato: 'GURUH_NOTOGRI' });
  });
  it('obyekt, bo‘lim va guruhlar soni majburiy; chegaradan oshsa rad', () => {
    expect(yoyKirish({ ...asos, obyekt_id: 0 })).toEqual({ xato: 'OBYEKT_KERAK' });
    expect(yoyKirish({ ...asos, rz_id: undefined })).toMatchObject({ xato: 'BOLIM_KERAK' });
    expect(yoyKirish({ ...asos, qatorlar: [] })).toMatchObject({ xato: 'QATORLAR_NOTOGRI' });
    expect(yoyKirish({ ...asos, qatorlar: Array(3).fill(guruh) }, { maxGuruh: 2 })).toMatchObject({ xato: 'QATORLAR_NOTOGRI' });
  });
  it('majburiy faqat aniq true bo‘lganda; yoz opsiyadan', () => {
    expect(yoyKirish({ ...asos, majburiy: 'true' })).toMatchObject({ majburiy: false });
    expect(yoyKirish({ ...asos, majburiy: true }, { yoz: true })).toMatchObject({ majburiy: true, yoz: true });
  });
  it('RPC yukiga aktor sessiyadan qo‘yiladi', () => {
    const k = yoyKirish({ ...asos, majburiy: true, yoz: true });
    if (kirishXatomi(k)) throw new Error('kutilmagan');
    expect(yoyRpcYuki(k, 77)).toEqual({ p_actor_id: 77, p_obyekt_id: 5, p_rz_id: 9, p_tkm_narx: 100, p_qatorlar: k.qatorlar, p_majburiy: true, p_yoz: true });
    expect(auditRpcYuki(5, 77)).toEqual({ p_actor_id: 77, p_obyekt_id: 5 });
  });
});

describe('belgilaKirish', () => {
  it('usul va idlarni tekshiradi, takrorlarni olib tashlaydi', () => {
    const k = belgilaKirish({ obyekt_id: 5, qator_idlar: [3, 3, '4'], usul: 'tkm' });
    expect(k).toEqual({ obyekt_id: 5, qator_idlar: [3, 4], usul: 'tkm' });
    if (kirishXatomi(k)) throw new Error('kutilmagan');
    expect(belgilaRpcYuki(k, 7)).toEqual({ p_actor_id: 7, p_obyekt_id: 5, p_qator_idlar: [3, 4], p_usul: 'tkm' });
  });
  it('noma’lum usul, bo‘sh/katta/noto‘g‘ri idlar rad', () => {
    expect(belgilaKirish({ obyekt_id: 5, qator_idlar: [1], usul: 'ish' })).toMatchObject({ xato: 'USUL_NOTOGRI' });
    expect(belgilaKirish({ obyekt_id: 5, qator_idlar: [], usul: 'foiz' })).toMatchObject({ xato: 'QATOR_IDLAR_NOTOGRI' });
    expect(belgilaKirish({ obyekt_id: 5, qator_idlar: [1, 2, 3], usul: 'foiz' }, 2)).toMatchObject({ xato: 'QATOR_IDLAR_NOTOGRI' });
    expect(belgilaKirish({ obyekt_id: 5, qator_idlar: [1, 'x'], usul: 'foiz' })).toMatchObject({ xato: 'QATOR_IDLAR_NOTOGRI' });
    expect(belgilaKirish({ qator_idlar: [1], usul: 'foiz' })).toEqual({ xato: 'OBYEKT_KERAK' });
  });
});
