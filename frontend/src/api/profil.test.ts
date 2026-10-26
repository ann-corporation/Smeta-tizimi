import { describe, expect, it } from 'vitest';
import { AVATAR_RANGLAR, ismTekshir, parolKuchi, parolTalablari, qurilmaNomi, rangUstidaMatn, telefonTekshir, xatoMatn } from './profil';

describe('profil yordamchilari', () => {
  it('ism 2..80', () => {
    expect(ismTekshir('A')).toBe('ISM_NOTOGRI');
    expect(ismTekshir('Al')).toBeNull();
    expect(ismTekshir('x'.repeat(81))).toBe('ISM_NOTOGRI');
  });
  it('telefon: bo‘sh — ruxsat; 7..15 raqam, ixtiyoriy +', () => {
    expect(telefonTekshir('')).toBeNull();
    expect(telefonTekshir('+998 90 123 45 67')).toBeNull();
    expect(telefonTekshir('123456')).toBe('TELEFON_NOTOGRI');
    expect(telefonTekshir('1234567890123456')).toBe('TELEFON_NOTOGRI');
    expect(telefonTekshir('90-abc')).toBe('TELEFON_NOTOGRI');
  });
  it('parol kuchi va talablar', () => {
    expect(parolKuchi('')).toBe(0);
    expect(parolKuchi('abc')).toBe(1);
    expect(parolKuchi('Yangi-parol-77')).toBe(4);
    const t = parolTalablari('short', 'short');
    expect(t.find((x) => x.id === 'uzunlik')!.bajarildi).toBe(false);
    expect(t.find((x) => x.id === 'farq')!.bajarildi).toBe(false);
  });
  it('kodlar, ranglar, qurilma', () => {
    expect(xatoMatn('ESKI_PAROL_XATO')).toBe('Joriy parol noto‘g‘ri.');
    expect(xatoMatn('NOMA_LUM_KOD')).toBe('Amal bajarilmadi. Qayta urinib ko‘ring.');
    expect(AVATAR_RANGLAR.length).toBe(10);
    expect(rangUstidaMatn('#F59E0B')).toBe('#0B1F1D');
    expect(rangUstidaMatn('#3B82F6')).toBe('#FFFFFF');
    expect(qurilmaNomi('Mozilla/5.0 (Windows NT 10.0) AppleWebKit Chrome/120 Safari/537')).toBe('Chrome · Windows');
    expect(qurilmaNomi('')).toBe('—');
  });
});
