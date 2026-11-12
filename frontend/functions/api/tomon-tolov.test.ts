import { describe, expect, it } from 'vitest';
import { oqishYuki, yozishYuki } from './tomon';

describe('tomon shlyuzi — buyurtmachi bugun va to‘lov xabari', () => {
  it('bugun va tolovlar o‘qish yuki', () => {
    expect(oqishYuki('bugun', new URLSearchParams('kompaniya_id=3'))).toEqual({ p_kompaniya_id: 3 });
    expect(oqishYuki('bugun', new URLSearchParams(''))).toMatch(/kompaniya_id/);
    expect(oqishYuki('tolovlar', new URLSearchParams('kompaniya_id=3&yonalish=menga&holat=xabar'))).toEqual({ p_kompaniya_id: 3, p_yonalish: 'menga', p_holat: 'xabar', p_limit: 100 });
    expect(oqishYuki('tolovlar', new URLSearchParams('kompaniya_id=3&yonalish=x'))).toMatchObject({ p_yonalish: null });
  });

  it('to‘lov xabari: summa musbat, sana formati, forma3 ixtiyoriy', () => {
    const y = yozishYuki('tolov_xabar', { kompaniya_id: 3, obyekt_id: 7, summa: '1500000.5', sana: '2026-11-10', forma3_id: 4, hujjat_raqam: ' 12 ', p_actor_id: 99 }) as Record<string, unknown>;
    expect(y).toMatchObject({ p_kompaniya_id: 3, p_obyekt_id: 7, p_forma3_id: 4, p_summa: 1500000.5, p_sana: '2026-11-10', p_hujjat_raqam: '12', p_izoh: null });
    expect(y).not.toHaveProperty('p_actor_id');
    expect(yozishYuki('tolov_xabar', { kompaniya_id: 3, obyekt_id: 7, summa: 10, sana: '2026-11-10' })).toMatchObject({ p_forma3_id: null });
    expect(yozishYuki('tolov_xabar', { kompaniya_id: 3, obyekt_id: 7, summa: 0, sana: '2026-11-10' })).toMatch(/Summa/);
    expect(yozishYuki('tolov_xabar', { kompaniya_id: 3, obyekt_id: 7, summa: -5, sana: '2026-11-10' })).toMatch(/Summa/);
    expect(yozishYuki('tolov_xabar', { kompaniya_id: 3, obyekt_id: 7, summa: 10, sana: '10.11.2026' })).toMatch(/sana/);
    expect(yozishYuki('tolov_xabar', { kompaniya_id: 3, summa: 10, sana: '2026-11-10' })).toMatch(/obyekt_id/);
  });

  it('qaror va bekor', () => {
    expect(yozishYuki('tolov_qaror', { kompaniya_id: 3, tolov_id: 5, qaror: 'tasdiq' })).toEqual({ p_kompaniya_id: 3, p_id: 5, p_qaror: 'tasdiq', p_izoh: null });
    expect(yozishYuki('tolov_qaror', { kompaniya_id: 3, tolov_id: 5, qaror: 'rad', izoh: 'Summa mos emas' })).toMatchObject({ p_qaror: 'rad', p_izoh: 'Summa mos emas' });
    expect(yozishYuki('tolov_qaror', { kompaniya_id: 3, tolov_id: 5, qaror: 'qabul' })).toMatch(/qaror/);
    expect(yozishYuki('tolov_xabar_bekor', { kompaniya_id: 3, tolov_id: 5 })).toEqual({ p_kompaniya_id: 3, p_id: 5 });
  });
});
