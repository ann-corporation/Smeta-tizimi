import { describe, expect, it } from 'vitest';
import { sotuvAmalmi, sotuvYuk } from './sotuv-yuk';

const OP = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

describe('sotuvYuk', () => {
  it('amal ro‘yxati', () => {
    expect(sotuvAmalmi('sotuv_bron_v1')).toBe(true);
    expect(sotuvAmalmi('toString')).toBe(false);
  });
  it('actor DOIM sessiyadan; so.actor_id e’tiborsiz', () => {
    const y = sotuvYuk('sotuv_bron_v1', { kompaniya_id: 5, bitim_id: 1, birlik_id: 2, actor_id: 999, p_actor_id: 999, operation_id: OP }, 7);
    expect(y).toMatchObject({ p_kompaniya_id: 5, p_actor_id: 7, p_bitim_id: 1, p_birlik_id: 2 });
  });
  it('operation_id majburiy', () => {
    expect(typeof sotuvYuk('sotuv_bitim_saqla_v1', { kompaniya_id: 5, p: { mijoz: { fio: 'X', telefon: '1' } } }, 7)).toBe('string');
  });
  it('bitim: oq ro‘yxatdan tashqari maydon tushib qoladi', () => {
    const y = sotuvYuk('sotuv_bitim_saqla_v1', { kompaniya_id: 5, operation_id: OP,
      p: { mijoz: { fio: 'X', telefon: '1', kompaniya_id: 9 }, kompaniya_id: 9, holat: 'x', summa: 10 } }, 7) as Record<string, any>;
    expect(y.p).toEqual({ mijoz: { fio: 'X', telefon: '1' }, summa: 10 });
  });
  it('to‘lov bekor — p_sotuv_tolov_id (t2_tolov emas)', () => {
    expect(sotuvYuk('sotuv_tolov_bekor_v1', { kompaniya_id: 5, tolov_id: 3, sabab: 'xato' }, 7)).toMatchObject({ p_sotuv_tolov_id: 3 });
  });
  it('grafik: sana va musbat summa', () => {
    expect(typeof sotuvYuk('sotuv_grafik_saqla_v1', { kompaniya_id: 5, bitim_id: 1, operation_id: OP, qatorlar: [{ sana: '2026/01/01', summa: 1 }] }, 7)).toBe('string');
    expect(sotuvYuk('sotuv_grafik_saqla_v1', { kompaniya_id: 5, bitim_id: 1, operation_id: OP, qatorlar: [{ sana: '2026-01-01', summa: 1, x: 1 }] }, 7))
      .toMatchObject({ p_qatorlar: [{ sana: '2026-01-01', summa: 1 }] });
  });
  it('narx o‘zgartirish: usul oq ro‘yxati', () => {
    expect(typeof sotuvYuk('sotuv_narx_ozgartir_v1', { kompaniya_id: 5, birlik_ids: [1], usul: 'drop', qiymat: 1, operation_id: OP }, 7)).toBe('string');
  });
});
