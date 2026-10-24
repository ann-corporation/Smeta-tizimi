import { describe, expect, it } from 'vitest';
import { oqishYuki, yozishYuki } from './tomon';

describe('/api/tomon qator izohi', () => {
  it('qator_izoh: faqat t2_akt_qator, matn majburiy, actor/rol yukdan olinmaydi', () => {
    const y = yozishYuki('qator_izoh', { kompaniya_id: 3, aloqa_id: 5, manba_jadval: 't2_akt_qator', manba_id: 11, matn: '  Narx yuqori  ', p_actor_id: 99, actor_id: 99, operation_id: 'xato' }) as Record<string, unknown>;
    expect(y.p_matn).toBe('Narx yuqori');
    expect(y.p_manba_jadval).toBe('t2_akt_qator');
    expect(y.p_manba_id).toBe(11);
    expect(y.p_aloqa_id).toBe(5);
    expect(String(y.p_operation_id)).toMatch(/^[0-9a-f-]{36}$/);
    expect(y).not.toHaveProperty('p_actor_id');
    expect(yozishYuki('qator_izoh', { kompaniya_id: 3, manba_jadval: 't2_users', manba_id: 1, matn: 'x' })).toMatch(/manba_jadval/);
    expect(yozishYuki('qator_izoh', { kompaniya_id: 3, manba_jadval: 't2_akt_qator', manba_id: 1, matn: '   ' })).toMatch(/matn/);
  });
  it('ichki izoh: aloqa_id yo‘q bo‘lsa null', () => {
    const y = yozishYuki('qator_izoh', { kompaniya_id: 3, manba_jadval: 't2_akt_qator', manba_id: 11, matn: 'ICHKI' }) as Record<string, unknown>;
    expect(y.p_aloqa_id).toBeNull();
  });
  it('qator_izoh_hal: izoh_id, versiya va mantiqiy hal kerak', () => {
    const y = yozishYuki('qator_izoh_hal', { kompaniya_id: 3, izoh_id: 7, versiya: 2, hal: true }) as Record<string, unknown>;
    expect(y).toMatchObject({ p_izoh_id: 7, p_kutilgan_versiya: 2, p_hal: true });
    expect(yozishYuki('qator_izoh_hal', { kompaniya_id: 3, izoh_id: 7, versiya: 2, hal: 'ha' })).toMatch(/hal/);
    expect(yozishYuki('qator_izoh_hal', { kompaniya_id: 3, izoh_id: 7, hal: true })).toMatch(/versiya/);
  });
  it('izohlar o‘qish: akt_id majburiy, limit standart 500', () => {
    expect(oqishYuki('izohlar', new URLSearchParams({ kompaniya_id: '3' }))).toMatch(/akt_id/);
    const y = oqishYuki('izohlar', new URLSearchParams({ kompaniya_id: '3', akt_id: '9', aloqa_id: '5' })) as Record<string, unknown>;
    expect(y).toMatchObject({ p_akt_id: 9, p_aloqa_id: 5, p_limit: 500, p_keyin_id: 0 });
  });
});
