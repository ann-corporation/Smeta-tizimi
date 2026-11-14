import { describe, expect, it } from 'vitest';
import { oqishYuki, xatoJavobi, yozishYuki } from './grafik';

describe('grafik shlyuzi', () => {
  it('o‘qish: pudratchi va tomon RPC si', () => {
    expect(oqishYuki(new URLSearchParams('kompaniya_id=3&obyekt_id=9'))).toEqual({ rpc: 't2_grafik_reja_v1', yuk: { p_kompaniya_id: 3, p_obyekt_id: 9 } });
    expect(oqishYuki(new URLSearchParams('kompaniya_id=3&obyekt_id=9&beruvchi_kompaniya_id=5'))).toEqual({ rpc: 't2_tomon_grafik_v1', yuk: { p_kompaniya_id: 3, p_beruvchi_kompaniya_id: 5, p_obyekt_id: 9 } });
    expect(typeof oqishYuki(new URLSearchParams('kompaniya_id=3'))).toBe('string');
    expect(typeof oqishYuki(new URLSearchParams('kompaniya_id=3&obyekt_id=9&beruvchi_kompaniya_id=x'))).toBe('string');
  });
  it('yozish: oq ro‘yxat va chegaralar', () => {
    const y = yozishYuki({ amal: 'sozlama', kompaniya_id: 1, obyekt_id: 2, razdel_id: 0, brigada: 12, smena_soat: 8, boshlanish_sana: '2030-01-05', kutilgan_versiya: 2 });
    expect(y).toMatchObject({ rpc: 't2_grafik_sozlama_saqla_v1', yuk: { p_razdel_id: 0, p_brigada: 12, p_smena_soat: 8, p_kun: null, p_kutilgan_versiya: 2, p_tozala: false } });
    expect(typeof yozishYuki({ amal: 'boshqa', kompaniya_id: 1, obyekt_id: 2 })).toBe('string');
    expect(typeof yozishYuki({ amal: 'sozlama', kompaniya_id: 1, obyekt_id: 2, brigada: 0 })).toBe('string');
    expect(typeof yozishYuki({ amal: 'sozlama', kompaniya_id: 1, obyekt_id: 2, brigada: 2.5 })).toBe('string');
    expect(typeof yozishYuki({ amal: 'sozlama', kompaniya_id: 1, obyekt_id: 2, boshlanish_sana: '2030/01/05' })).toBe('string');
    expect(typeof yozishYuki({ amal: 'sozlama', kompaniya_id: 1, obyekt_id: 2, razdel_id: -4 })).toBe('string');
  });
  it('xato javoblari ichki matnni sizdirmaydi', () => {
    expect(xatoJavobi(JSON.stringify({ code: '42501', message: 'TOMON_RUXSAT_YOQ' })).status).toBe(403);
    expect(xatoJavobi(JSON.stringify({ code: '42501', message: 'GRAFIK_RUXSAT_YOQ' })).body.code).toBe('RUXSAT_YOQ');
    const e = xatoJavobi(JSON.stringify({ code: 'XX000', message: 'select * from secret' }));
    expect(e.status).toBe(502);
    expect(JSON.stringify(e.body)).not.toContain('secret');
  });
});
