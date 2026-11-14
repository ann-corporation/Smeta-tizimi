import { describe, expect, it } from 'vitest';
import { loginTelefonmi, nonceYaroqli, NONCE_PREFIKS, raqamliKod, taklifMuddatSoat, tasodifiyToken, telefonNorm, tengSatr, xesh, yoqilgan } from './kirish-emailsiz';

describe('vaqt-barqaror solishtirish (tengSatr)', () => {
  it('teng satrlar true, farqli/uzunligi boshqa false', () => {
    expect(tengSatr('abc123', 'abc123')).toBe(true);
    expect(tengSatr('abc123', 'abc124')).toBe(false);
    expect(tengSatr('abc', 'abcd')).toBe(false);
    expect(tengSatr('', '')).toBe(true);
  });
});

describe('telefon normallashtirish (SQL t2_telefon_norm_v1 bilan bir xil qoida)', () => {
  it('turli yozuvlar bitta E.164 ga keladi', () => {
    for (const s of ['+998 90 123-45-67', '90 123 45 67', '998901234567', '+998(90)1234567', '  +998901234567 ']) expect(telefonNorm(s)).toBe('+998901234567');
  });
  it('yaroqsiz: xorijiy, noto‘g‘ri operator kodi, harf, juda uzun, bo‘sh', () => {
    for (const s of ['+1 202 555 0100', '+998 10 123 45 67', '+998 90 123 45', 'abc', 'aziz@gmail.com', '9'.repeat(30), '', null, undefined, 12345]) expect(telefonNorm(s)).toBeNull();
  });
  it('login telefon ko‘rinishidami', () => {
    expect(loginTelefonmi('+998 90 123 45 67')).toBe(true);
    expect(loginTelefonmi('aziz@gmail.com')).toBe(false);
    expect(loginTelefonmi('Anvar')).toBe(false);
  });
});

describe('xesh va tasodifiy qiymatlar', () => {
  const K = 'k'.repeat(32);
  it('xesh aniq, 64 hex va qiymatni o‘zida saqlamaydi; tur/kontekst bo‘yicha ajraladi', async () => {
    const a = await xesh('taklif-kod', '12345678', K, '+998901234567');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain('12345678');
    expect(await xesh('taklif-kod', '12345678', K, '+998901234567')).toBe(a);
    expect(await xesh('taklif-token', '12345678', K, '+998901234567')).not.toBe(a);
    expect(await xesh('taklif-kod', '12345678', K, '+998901234568')).not.toBe(a);
    expect(await xesh('taklif-kod', '12345678', 'z'.repeat(32), '+998901234567')).not.toBe(a);
  });
  it('raqamli kod 8 xonali, bosh raqam 0 emas; token/nonce formati', () => {
    for (let i = 0; i < 200; i++) expect(raqamliKod(8)).toMatch(/^[1-9]\d{7}$/);
    const t1 = tasodifiyToken(24), t2 = tasodifiyToken(24);
    expect(t1).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(t1).not.toBe(t2);
    expect(nonceYaroqli(NONCE_PREFIKS + t1)).toBe(true);
    expect(nonceYaroqli(t1)).toBe(false);
    expect(nonceYaroqli(NONCE_PREFIKS + 'qisqa')).toBe(false);
    expect(NONCE_PREFIKS + t1).toHaveLength(39); // Telegram start parametri (<= 64) ichida
  });
  it('sozlama bayroqlari sukut bo‘yicha O‘CHIQ; muddat 1..720 ichida', () => {
    expect(yoqilgan(undefined)).toBe(false);
    expect(yoqilgan('0')).toBe(false);
    expect(yoqilgan('1')).toBe(true);
    expect(yoqilgan(' TRUE ')).toBe(true);
    expect(taklifMuddatSoat({})).toBe(72);
    expect(taklifMuddatSoat({ KIRISH_TAKLIF_MUDDAT_SOAT: '24' })).toBe(24);
    expect(taklifMuddatSoat({ KIRISH_TAKLIF_MUDDAT_SOAT: '100000' })).toBe(72);
    expect(taklifMuddatSoat({ KIRISH_TAKLIF_MUDDAT_SOAT: '0' })).toBe(72);
  });
});
