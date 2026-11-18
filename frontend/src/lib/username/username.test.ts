import { describe, expect, it } from 'vitest';
import { qiymatTuri, telegramUsernameTaklifi, usernameNorm, usernameTakliflari, usernameXato } from './username';
import * as server from '../../../functions/_shared/username';

describe('username qoidalari', () => {
  it('norm: @ olib tashlanadi, kichik harf', () => {
    expect(usernameNorm('  @Ali_Sinov ')).toBe('ali_sinov');
    expect(usernameNorm('@@')).toBeNull();
  });
  it('format qoidalari', () => {
    expect(usernameXato('abcd')).toBe('USERNAME_QISQA');
    expect(usernameXato('a'.repeat(33))).toBe('USERNAME_UZUN');
    expect(usernameXato('ab-cde')).toBe('USERNAME_FORMAT');
    expect(usernameXato('1abcde')).toBe('USERNAME_BOSHLANISH');
    expect(usernameXato('_abcde')).toBe('USERNAME_BOSHLANISH');
    expect(usernameXato('ab__cde')).toBe('USERNAME_UNDERSCORE');
    expect(usernameXato('abcde_')).toBe('USERNAME_UNDERSCORE');
    expect(usernameXato('admin')).toBe('USERNAME_BAND_SOZ');
    expect(usernameXato('qurai_help')).toBe('USERNAME_BAND_SOZ');
    expect(usernameXato('sinov_01')).toBeNull();
  });
  it('mijoz va server qoidalari bir xil', () => {
    for (const s of ['abcd', 'a_b_c_d', 'admin', 'Sinov', 'sinov_1', 'x'.repeat(40), '1sinov', 'sinov__a', 'qurai', 'telegram']) {
      expect(server.usernameXato(server.usernameNorm(s))).toBe(usernameXato(usernameNorm(s)));
    }
    for (const s of ['@ali_sinov', '+998 90 123 45 67', 'a@b.uz', '901234567', 'ab', 'sinov01']) expect(server.qiymatTuri(s)).toBe(qiymatTuri(s));
  });
  it('qiymat turi avtomatik aniqlanadi', () => {
    expect(qiymatTuri('@ali_sinov')).toBe('username');
    expect(qiymatTuri('+998 90 123 45 67')).toBe('telefon');
    expect(qiymatTuri('90 123 45 67')).toBe('telefon');
    expect(qiymatTuri('ali@firma.uz')).toBe('email');
    expect(qiymatTuri('')).toBe('noaniq');
    expect(qiymatTuri('ab')).toBe('noaniq');
  });
  it('ismdan takliflar yaroqli va takrorsiz', () => {
    const v = usernameTakliflari('Алишер Навоий');
    expect(v.length).toBeGreaterThan(2);
    expect(new Set(v).size).toBe(v.length);
    for (const x of v) expect(usernameXato(x)).toBeNull();
    expect(v[0]).toBe('alisher_navoiy');
    expect(usernameTakliflari('')).toEqual([]);
  });
  it('Telegram username faqat mos bo‘lsa taklif qilinadi', () => {
    expect(telegramUsernameTaklifi('Sinov_User')).toBe('sinov_user');
    expect(telegramUsernameTaklifi('abc')).toBeNull();
    expect(telegramUsernameTaklifi(null)).toBeNull();
  });
});