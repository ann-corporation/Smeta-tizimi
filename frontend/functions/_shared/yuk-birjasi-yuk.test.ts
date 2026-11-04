import { describe, expect, it } from 'vitest';
import { ybAmalmi, ybYuk } from './yuk-birjasi-yuk';

const OP = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

describe('ybYuk', () => {
  it('amal ro‘yxati', () => {
    expect(ybAmalmi('yb_yuk_elon_v1')).toBe(true);
    expect(ybAmalmi('yb_taklif_ber_v1')).toBe(false); // tashuvchi amali BFF da yo'q
    expect(ybAmalmi('toString')).toBe(false);
  });
  it('actor DOIM sessiyadan; so.actor_id e‘tiborsiz', () => {
    const y = ybYuk('yb_yuk_elon_v1', { kompaniya_id: 5, operation_id: OP, actor_id: 999, p_actor_id: 999, data: { id: 3, versiya: 1 } }, 7);
    expect(y).toEqual({ p_kompaniya_id: 5, p_actor_id: 7, p_operation_id: OP, p_data: { id: 3, versiya: 1 } });
  });
  it('operation_id va kompaniya majburiy', () => {
    expect(typeof ybYuk('yb_yuk_elon_v1', { kompaniya_id: 5, data: {} }, 7)).toBe('string');
    expect(typeof ybYuk('yb_yuk_elon_v1', { operation_id: OP, data: {} }, 7)).toBe('string');
    expect(typeof ybYuk('yb_yuk_elon_v1', { kompaniya_id: 5, operation_id: OP, data: {} }, 0)).toBe('string');
  });
  it('oq ro‘yxatdan tashqari maydon tushib qoladi; narx_hisob ichki oq ro‘yxat', () => {
    const y = ybYuk('yb_yuk_saqla_v1', { kompaniya_id: 5, operation_id: OP, data: { nom: 'X', kompaniya_id: 9, holat: 'yopildi', tanlangan_taklif_id: 1, tonna: 20,
      narx_hisob: { stavka_tkm: 1, qabul_kod: '1234', tavsiya_qqs_siz: 10 } } }, 7) as Record<string, any>;
    expect(y.p_data).toEqual({ nom: 'X', tonna: 20, narx_hisob: { stavka_tkm: 1, tavsiya_qqs_siz: 10 } });
  });
  it('javob: harakat va narx o‘tadi', () => {
    const y = ybYuk('yb_yuk_javob_v1', { kompaniya_id: 5, operation_id: OP, data: { yuk_id: 1, taklif_id: 2, harakat: 'qarshi', narx_qqs_siz: 800000, p_actor_id: 1 } }, 7) as Record<string, any>;
    expect(y.p_data).toEqual({ yuk_id: 1, taklif_id: 2, harakat: 'qarshi', narx_qqs_siz: 800000 });
  });
  it('ichki obyekt/massiv oddiy maydonlarda o‘tmaydi', () => {
    const y = ybYuk('yb_yuk_bekor_v1', { kompaniya_id: 5, operation_id: OP, data: { yuk_id: 1, sabab: { x: 1 } } }, 7) as Record<string, any>;
    expect(y.p_data).toEqual({ yuk_id: 1 });
  });
});