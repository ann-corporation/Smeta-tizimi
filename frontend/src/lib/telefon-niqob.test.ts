import { describe, expect, it } from 'vitest';
import { loginTelefonmi, telefonE164, telefonNiqob } from './telefon-niqob';

describe('telefon niqobi (+998)', () => {
  it('yozilgan raqamni bosqichma-bosqich guruhlaydi', () => {
    expect(telefonNiqob('')).toBe('');
    expect(telefonNiqob('9')).toBe('+998 9');
    expect(telefonNiqob('90123')).toBe('+998 90 123');
    expect(telefonNiqob('901234567')).toBe('+998 90 123 45 67');
    expect(telefonNiqob('+998901234567')).toBe('+998 90 123 45 67');
    expect(telefonNiqob('+998 90 123 45 67 89 000')).toBe('+998 90 123 45 67');
  });
  it('niqob qaytadan berilganda barqaror (prefiks takror qo‘shilmaydi)', () => {
    const a = telefonNiqob('+998 99 8');
    expect(telefonNiqob(a)).toBe(a);
    expect(telefonNiqob('+998 99 812 34 56')).toBe('+998 99 812 34 56');
  });
  it('E.164 ga keltiradi, yaroqsizni rad etadi', () => {
    expect(telefonE164('+998 90 123-45-67')).toBe('+998901234567');
    expect(telefonE164('90 123 45 67')).toBe('+998901234567');
    expect(telefonE164('998901234567')).toBe('+998901234567');
    expect(telefonE164('+1 202 555 0100')).toBeNull();
    expect(telefonE164('+998 10 123 45 67')).toBeNull();
    expect(telefonE164('aziz@gmail.com')).toBeNull();
    expect(telefonE164('')).toBeNull();
  });
  it('login telefon ko‘rinishidami', () => {
    expect(loginTelefonmi('+998 90 123 45 67')).toBe(true);
    expect(loginTelefonmi('aziz@gmail.com')).toBe(false);
    expect(loginTelefonmi('Anvar')).toBe(false);
  });
});
