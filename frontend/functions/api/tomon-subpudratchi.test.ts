import { describe, expect, it } from 'vitest';
import { oqishYuki, yozishYuki } from './tomon';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('tomon shlyuzi - subpudratchi yozish yuki', () => {
  it('sub_topshir: qator + narx; narx kaliti bo‘lmasa yuborilmaydi (mavjud narx saqlanadi), null - narxni tozalaydi', () => {
    const y = yozishYuki('sub_topshir', { kompaniya_id: 3, aloqa_id: 5, obyekt_id: 9, qatorlar: [{ qator_id: 11, hajm: 60, narx: 800 }, { qator_id: 12 }, { qator_id: 13, narx: null }], shartnoma_id: 4, qqs_foiz: 12 }) as Record<string, unknown>;
    expect(y).toMatchObject({ p_kompaniya_id: 3, p_aloqa_id: 5, p_obyekt_id: 9, p_bolim_id: null, p_shartnoma_id: 4, p_qqs_foiz: 12 });
    expect(y.p_qatorlar).toEqual([{ qator_id: 11, hajm: 60, narx: 800 }, { qator_id: 12 }, { qator_id: 13, narx: null }]);
  });
  it('sub_topshir: butun bo‘lim; bo‘sh so‘rov, manfiy narx va noto‘g‘ri QQS rad etiladi', () => {
    expect(yozishYuki('sub_topshir', { kompaniya_id: 3, aloqa_id: 5, obyekt_id: 9, qatorlar: [], bolim_id: 77 })).toMatchObject({ p_bolim_id: 77, p_qatorlar: [] });
    expect(typeof yozishYuki('sub_topshir', { kompaniya_id: 3, aloqa_id: 5, obyekt_id: 9, qatorlar: [] })).toBe('string');
    expect(typeof yozishYuki('sub_topshir', { kompaniya_id: 3, aloqa_id: 5, obyekt_id: 9, qatorlar: [{ qator_id: 1, narx: -1 }] })).toBe('string');
    expect(typeof yozishYuki('sub_topshir', { kompaniya_id: 3, aloqa_id: 5, obyekt_id: 9, qatorlar: [{ qator_id: 1 }], qqs_foiz: 120 })).toBe('string');
    expect(typeof yozishYuki('sub_topshir', { kompaniya_id: 3, aloqa_id: 5, obyekt_id: 9, qatorlar: [{ qator_id: 1, hajm: 0 }] })).toBe('string');
  });
  it('sub_akt_yoz: musbat hajm, operation_id avtomatik; noto‘g‘ri hajm va sana rad etiladi', () => {
    const y = yozishYuki('sub_akt_yoz', { kompaniya_id: 3, aloqa_id: 5, obyekt_id: 9, oy: '2026-11-01', qatorlar: [{ topshiriq_id: 2, hajm: 40.5, izoh: ' x ' }] }) as Record<string, unknown>;
    expect(y).toMatchObject({ p_kompaniya_id: 3, p_oy: '2026-11-01', p_akt_id: null, p_qatorlar: [{ topshiriq_id: 2, hajm: 40.5, izoh: 'x' }] });
    expect(String(y.p_operation_id)).toMatch(UUID);
    expect(typeof yozishYuki('sub_akt_yoz', { kompaniya_id: 3, aloqa_id: 5, obyekt_id: 9, oy: '2026-11-01', qatorlar: [{ topshiriq_id: 2, hajm: -1 }] })).toBe('string');
    expect(typeof yozishYuki('sub_akt_yoz', { kompaniya_id: 3, aloqa_id: 5, obyekt_id: 9, oy: 'noyabr', qatorlar: [] })).toBe('string');
    expect(typeof yozishYuki('sub_akt_yoz', { kompaniya_id: 3, aloqa_id: 5, obyekt_id: 9, qatorlar: [] })).toBe('string');
    expect(yozishYuki('sub_akt_yoz', { kompaniya_id: 3, aloqa_id: 5, obyekt_id: 9, akt_id: 8, qatorlar: [] })).toMatchObject({ p_akt_id: 8, p_oy: null });
  });
  it('sub_akt_yubor, sub_qaror, sub_topshiriq_bekor', () => {
    expect(yozishYuki('sub_akt_yubor', { kompaniya_id: 3, sub_akt_id: 8, izoh: 'tekshiring' })).toMatchObject({ p_sub_akt_id: 8, p_izoh: 'tekshiring' });
    expect(typeof yozishYuki('sub_akt_yubor', { kompaniya_id: 3 })).toBe('string');
    expect(yozishYuki('sub_qaror', { kompaniya_id: 3, taqdim_id: 4, qaror: 'tuzatish', izoh: 'hajm' })).toEqual({ p_kompaniya_id: 3, p_taqdim_id: 4, p_qaror: 'tuzatish', p_izoh: 'hajm' });
    expect(typeof yozishYuki('sub_qaror', { kompaniya_id: 3, taqdim_id: 4, qaror: 'tasdiq' })).toBe('string');
    expect(yozishYuki('sub_topshiriq_bekor', { kompaniya_id: 3, topshiriq_id: 6 })).toEqual({ p_kompaniya_id: 3, p_topshiriq_id: 6 });
  });
});

describe('tomon shlyuzi - subpudratchi o‘qish yuki', () => {
  const q = (s: string) => new URLSearchParams(s);
  it('bo‘limlar', () => {
    expect(oqishYuki('sub_ishlarim', q('kompaniya_id=3'))).toEqual({ p_kompaniya_id: 3 });
    expect(oqishYuki('sub_tolov', q('kompaniya_id=3'))).toEqual({ p_kompaniya_id: 3 });
    expect(oqishYuki('sub_boshqaruv', q('kompaniya_id=3&obyekt_id=9'))).toEqual({ p_kompaniya_id: 3, p_obyekt_id: 9 });
    expect(typeof oqishYuki('sub_boshqaruv', q('kompaniya_id=3'))).toBe('string');
    expect(oqishYuki('sub_aktlar', q('kompaniya_id=3&yonalish=kelgan'))).toEqual({ p_kompaniya_id: 3, p_yonalish: 'kelgan' });
    expect(oqishYuki('sub_aktlar', q('kompaniya_id=3&yonalish=boshqa'))).toEqual({ p_kompaniya_id: 3, p_yonalish: 'yuborilgan' });
    expect(oqishYuki('sub_akt', q('kompaniya_id=3&sub_akt_id=8'))).toEqual({ p_kompaniya_id: 3, p_sub_akt_id: 8 });
  });
});
