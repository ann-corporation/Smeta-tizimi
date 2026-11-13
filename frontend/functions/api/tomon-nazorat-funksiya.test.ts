import { describe, it, expect } from 'vitest';
import { oqishYuki, yozishYuki } from './tomon';

describe('tomon shlyuzi: nazorat = funksiya (buyurtmachi xodimi / vakil / ichki)', () => {
  it('vakolat_ber: doira va amallar tozalanadi', () => {
    expect(yozishYuki('vakolat_ber', { kompaniya_id: 3, aloqa_id: 5, obyekt_id: 7, resurslar: ['f2', 'lab_natija'], amallar: ['korish', 'qaror'] }))
      .toMatchObject({ p_kompaniya_id: 3, p_aloqa_id: 5, p_obyekt_id: 7, p_resurslar: ['f2', 'lab_natija'], p_amallar: ['korish', 'qaror'] });
    expect(yozishYuki('vakolat_ber', { kompaniya_id: 3, aloqa_id: 5, obyekt_id: 7, resurslar: ['f2'], amallar: ['hammasi'] })).toMatch(/amallar/);
    expect(yozishYuki('vakolat_ber', { kompaniya_id: 3, aloqa_id: 5, obyekt_id: 7, resurslar: [], amallar: ['korish'] })).toMatch(/resurslar/);
  });
  it('nazorat_qaror, ichki_sorov, ichki_qaror, tayinlash', () => {
    expect(yozishYuki('nazorat_qaror', { kompaniya_id: 3, taqdim_id: 9, qaror: 'qabul' })).toMatchObject({ p_taqdim_id: 9, p_qaror: 'qabul' });
    expect(yozishYuki('nazorat_qaror', { kompaniya_id: 3, taqdim_id: 9, qaror: 'korilmoqda' })).toMatch(/qaror/);
    expect(yozishYuki('ichki_sorov', { kompaniya_id: 3, resurs: 'f2', manba_id: 11 })).toMatchObject({ p_resurs: 'f2', p_manba_id: 11 });
    expect(yozishYuki('ichki_qaror', { kompaniya_id: 3, resurs: 'f2', manba_id: 11, qaror: 'rad', izoh: 'x' })).toMatchObject({ p_qaror: 'rad' });
    expect(yozishYuki('tayinlash', { kompaniya_id: 3, obyekt_id: 7, foydalanuvchi_id: 4 })).toMatchObject({ p_obyekt_id: 7, p_foydalanuvchi_id: 4 });
    expect(yozishYuki('tayinlash', { kompaniya_id: 3, obyekt_id: 7 })).toMatch(/foydalanuvchi_id/);
  });
  it('sozlama: ichki_majburiy faqat mantiqiy, texnik_bosqich cheklangan', () => {
    expect(yozishYuki('nazorat_sozlama_saqla', { kompaniya_id: 3, ichki_majburiy: true })).toMatchObject({ p_ichki_majburiy: true, p_texnik_bosqich: null });
    expect(yozishYuki('nazorat_sozlama_saqla', { kompaniya_id: 3, texnik_bosqich: 'har_doim' })).toMatch(/texnik_bosqich/);
  });
  it('oqish: tayinlar, sozlama, navbat, holat', () => {
    expect(oqishYuki('nazorat_tayinlar', new URLSearchParams('kompaniya_id=3'))).toEqual({ p_kompaniya_id: 3 });
    expect(oqishYuki('ichki_navbat', new URLSearchParams('kompaniya_id=3'))).toEqual({ p_kompaniya_id: 3 });
    expect(oqishYuki('nazorat_holat', new URLSearchParams('kompaniya_id=3&taqdim_id=9'))).toEqual({ p_kompaniya_id: 3, p_taqdim_id: 9 });
    expect(oqishYuki('nazorat_holat', new URLSearchParams('kompaniya_id=3'))).toBe('taqdim_id kerak');
  });
});
