import { describe, expect, it } from 'vitest';
import { HUJJAT_VOSITALAR, hujjatVositaSorov } from './hujjat-vositalar';

describe('Jarvis hujjat vositalari', () => {
  it('ro\u2018yxat: barcha vositalar nomlangan va versiyalangan', () => {
    expect(HUJJAT_VOSITALAR.map((v) => v.nom)).toEqual(['fayl_qidir', 'fayl_royxat', 'fayl_kvota', 'fayl_faoliyat', 'fayl_yukla', 'fayl_ulash', 'fayl_savat']);
  });
  it('aktor maydoni qat\u2019iy rad etiladi', () => {
    expect(hujjatVositaSorov('fayl_qidir', { matn: 'smeta', actor_id: 5 })).toMatchObject({ xato: 'ARGUMENT_TAQIQLANGAN' });
    expect(hujjatVositaSorov('fayl_royxat', { p_actor: 5 })).toMatchObject({ xato: 'ARGUMENT_TAQIQLANGAN' });
  });
  it('qidiruv kamida 2 belgi; noma\u2019lum vosita rad', () => {
    expect(hujjatVositaSorov('fayl_qidir', { matn: 'a' })).toMatchObject({ xato: 'QIDIRUV_BOSH' });
    expect(hujjatVositaSorov('yoq', {})).toMatchObject({ xato: 'VOSITA_NOMALUM' });
  });
  it('fayl_yukla: kengaytma .txt qo\u2018shiladi, bo\u2018sh/juda uzun matn rad', () => {
    expect(hujjatVositaSorov('fayl_yukla', { nom: 'eslatma', matn: 'salom' })).toMatchObject({ amal: 'yozish', a: { nom: 'eslatma.txt' } });
    expect(hujjatVositaSorov('fayl_yukla', { nom: 'a', matn: '' })).toMatchObject({ xato: 'MATN_NOTOGRI' });
    expect(hujjatVositaSorov('fayl_yukla', { nom: 'a', matn: 'x'.repeat(200_001) })).toMatchObject({ xato: 'MATN_NOTOGRI' });
  });
  it('ulash/savat: tasdiqlayman faqat aniq true', () => {
    expect(hujjatVositaSorov('fayl_ulash', { fayl_id: 1, foydalanuvchi_id: 2, tasdiqlayman: 'true' })).toMatchObject({ a: { tasdiqlayman: false } });
    expect(hujjatVositaSorov('fayl_savat', { fayl_id: 1, tasdiqlayman: true })).toMatchObject({ a: { tasdiqlayman: true } });
    expect(hujjatVositaSorov('fayl_ulash', { fayl_id: 1, foydalanuvchi_id: 2, daraja: 'egasi' })).toMatchObject({ xato: 'DARAJA_NOTOGRI' });
  });
});