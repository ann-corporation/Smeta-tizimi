import { describe, expect, it } from 'vitest';
import { OQISH, YOZISH, oqishYuki, xatoJavobi, yozishYuki } from './loyihachi';
import { SCOPED_APIS, requestPermission } from '../_shared/permission-policy';

const U = '123e4567-e89b-42d3-a456-426614174000';

describe('loyihachi shlyuzi: whitelist', () => {
  it('faqat sanab o‘tilgan RPC lar; hammasi t2_ ... _v1', () => {
    for (const nom of [...Object.values(OQISH), ...Object.values(YOZISH)]) expect(nom).toMatch(/^t2_[a-z_]+_v1$/);
    expect(YOZISH['t2_obyekt_yoz']).toBeUndefined();
  });
  it('permission siyosatida ro‘yxatga olingan (document.read chegarasi, aniq capability bazada)', () => {
    expect(SCOPED_APIS.has('loyihachi')).toBe(true);
    expect(requestPermission('loyihachi', 'POST', { amal: 'chiqar' }, new URLSearchParams())).toBe('document.read');
  });
});

describe('yozishYuki', () => {
  it('kompaniya_id majburiy; noma’lum amal rad', () => {
    expect(yozishYuki('chiqar', { revizya_id: 1 })).toBe('kompaniya_id kerak');
    expect(yozishYuki('ochirish', { kompaniya_id: 1 })).toBe('Amal ochiq emas');
  });
  it('toplam_saqla: bosqich PD/RD, marka va varaq kerak', () => {
    expect(yozishYuki('toplam_saqla', { kompaniya_id: 1, aloqa_id: 2, obyekt_id: 3, bosqich: 'XX', marka: 'КЖ', varaq: '1' })).toBe('bosqich: PD yoki RD');
    const y = yozishYuki('toplam_saqla', { kompaniya_id: 1, aloqa_id: 2, obyekt_id: 3, bosqich: 'RD', marka: ' КЖ ', varaq: '12', operation_id: U }) as Record<string, unknown>;
    expect(y).toMatchObject({ p_kompaniya_id: 1, p_marka: 'КЖ', p_varaq: '12', p_operation_id: U });
  });
  it('chiqar: aloqa ro‘yxati cheklanadi', () => {
    expect(yozishYuki('chiqar', { kompaniya_id: 1, revizya_id: 4, aloqa_idlar: [1, 'x'] })).toMatch(/aloqa_idlar/);
    expect(yozishYuki('chiqar', { kompaniya_id: 1, revizya_id: 4, aloqa_idlar: [7, 8], izoh: 'ok' })).toMatchObject({ p_revizya_id: 4, p_aloqa_idlar: [7, 8], p_izoh: 'ok' });
  });
  it('taklif_yoz: tur, nom va manfiy bo‘lmagan hajm; narx YO‘Q', () => {
    expect(yozishYuki('taklif_yoz', { kompaniya_id: 1, revizya_id: 1, tur: 'narx', nom: 'Beton' })).toMatch(/tur/);
    expect(yozishYuki('taklif_yoz', { kompaniya_id: 1, revizya_id: 1, tur: 'hajm', nom: 'Beton', hajm: -1 })).toMatch(/manfiy/);
    const y = yozishYuki('taklif_yoz', { kompaniya_id: 1, revizya_id: 1, tur: 'qoshimcha', nom: 'Beton B25', hajm: '12.5', birlik: 'm3', narx: 999 }) as Record<string, unknown>;
    expect(y.p_hajm).toBe(12.5);
    expect(Object.keys(y).some((k) => /narx/.test(k))).toBe(false);
  });
  it('boglash: aynan bitta manba va revizya raqami (0 ruxsat)', () => {
    expect(yozishYuki('boglash', { kompaniya_id: 1, toplam_id: 1, obyekt_id: 2, revizya: 0, harakat: 'qosh' })).toMatch(/Aynan bittasini/);
    expect(yozishYuki('boglash', { kompaniya_id: 1, toplam_id: 1, obyekt_id: 2, revizya: 0, harakat: 'qosh', qator_id: 5, aosr_id: 6 })).toMatch(/Aynan bittasini/);
    expect(yozishYuki('boglash', { kompaniya_id: 1, toplam_id: 1, obyekt_id: 2, revizya: 0, harakat: 'qosh', aosr_id: 6 })).toMatchObject({ p_aosr_id: 6, p_qator_id: null, p_revizya: 0 });
  });
  it('taklif_pto: o‘zgarishga aylantirishda obyekt kerak, rad — kerak emas', () => {
    expect(yozishYuki('taklif_pto', { kompaniya_id: 1, taklif_id: 3, qaror: 'ozgarishga' })).toBe('obyekt_id kerak');
    expect(yozishYuki('taklif_pto', { kompaniya_id: 1, taklif_id: 3, qaror: 'rad', izoh: 'sabab' })).toMatchObject({ p_qaror: 'rad' });
  });
});

describe('oqishYuki / xatoJavobi', () => {
  it('bo‘limlar', () => {
    expect(oqishYuki('royxat', new URLSearchParams({ kompaniya_id: '5' }))).toEqual({ p_kompaniya_id: 5, p_obyekt_id: null });
    expect(oqishYuki('takliflar', new URLSearchParams({ kompaniya_id: '5' }))).toBe('revizya_id kerak');
    expect(oqishYuki('boshqa', new URLSearchParams({ kompaniya_id: '5' }))).toBe('Bo‘lim ochiq emas');
  });
  it('42501 ruxsat xatosi tushunarli', () => {
    expect(xatoJavobi(JSON.stringify({ code: '42501', message: 'PERMISSION_DENIED' })).body.code).toBe('RUXSAT_YETARLI_EMAS');
    expect(xatoJavobi('xato').status).toBe(502);
  });
});
