import { describe, expect, it } from 'vitest';
import { harakatMuhr, limitHolati, soniyaMatn, tokenMatn } from './ai-korinish';

describe('ai-korinish', () => {
  it('tokenMatn: so‘z bilan, 0 — sarflanmadi, noma‘lum — 0 emas', () => {
    expect(tokenMatn(0).kalit).toBe('token sarflanmadi');
    expect(tokenMatn(null).kalit).toBe('token noma’lum');
    expect(tokenMatn(950)).toEqual({ kalit: '{n} token', n: '950' });
    expect(tokenMatn(12_400)).toEqual({ kalit: '{n} ming token', n: '12,4' });
    expect(tokenMatn(3_200_000)).toEqual({ kalit: '{n} mln token', n: '3,2' });
  });
  it('soniyaMatn', () => {
    expect(soniyaMatn(1234)).toBe('1,2');
    expect(soniyaMatn(null)).toBeNull();
  });
  it('harakat muhri — noma‘lum holat o‘z nomi bilan', () => {
    expect(harakatMuhr('bajarildi').cls).toBe('fz-stamp--ok');
    expect(harakatMuhr('boshqa')).toEqual({ matn: 'boshqa', cls: '' });
  });
  it('limitHolati', () => {
    expect(limitHolati(10, null).daraja).toBe('yoq');
    expect(limitHolati(40, 50).daraja).toBe('ogoh');
    expect(limitHolati(60, 50)).toMatchObject({ ulush: 1, daraja: 'tugadi' });
    expect(limitHolati(10, 50)).toMatchObject({ foiz: 20, daraja: 'ok' });
  });
});
