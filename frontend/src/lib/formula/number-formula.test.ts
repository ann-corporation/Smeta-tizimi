import { describe, expect, it } from 'vitest';
import { formulaMi, numberFormula } from './number-formula';

describe('Excel-uslubidagi son formula', () => {
  it('oddiy son va arifmetikani hisoblaydi (o‘nli vergul va nuqta)', () => {
    expect(numberFormula('12,5')).toMatchObject({ ok: true, value: 12.5, formula: false });
    expect(numberFormula('=(10+2)*3/4')).toMatchObject({ ok: true, value: 9, formula: true });
    expect(numberFormula('=0,5+.25')).toMatchObject({ ok: true, value: 0.75 });
    expect(numberFormula('=-(2+3)')).toMatchObject({ ok: true, value: -5 });
  });
  it('qator kontekstidagi qiymatlardan foydalanadi (kichik harf ham)', () => {
    expect(numberFormula('=FAKT+QOLDIQ*0.25', { FAKT: 60, QOLDIQ: 40 })).toMatchObject({ ok: true, value: 70 });
    expect(numberFormula('=smeta-fakt', { SMETA: 100, FAKT: 60 })).toMatchObject({ ok: true, value: 40 });
    expect(numberFormula('=F2_MUMKIN', { F2_MUMKIN: 30 })).toMatchObject({ ok: true, value: 30 });
  });
  it('NULL, noma’lum nom, 0 ga bo‘lish va bo‘sh formulani fail-closed qiladi', () => {
    expect(numberFormula('=SMETA+1', { SMETA: null })).toMatchObject({ ok: false, error: 'MISSING_VALUE' });
    expect(numberFormula('=SMETA+1', {})).toMatchObject({ ok: false, error: 'UNKNOWN_NAME' });
    expect(numberFormula('=10/0')).toMatchObject({ ok: false, error: 'DIVIDE_BY_ZERO' });
    expect(numberFormula('=1/(2-2)')).toMatchObject({ ok: false, error: 'DIVIDE_BY_ZERO' });
    expect(numberFormula('=')).toMatchObject({ ok: false });
    expect(numberFormula('=1+')).toMatchObject({ ok: false, error: 'SYNTAX' });
    expect(numberFormula('=(1+2')).toMatchObject({ ok: false, error: 'SYNTAX' });
    expect(numberFormula('')).toMatchObject({ ok: false, formula: false });
  });
  it('kod bajarish, funksiya chaqiruvi va prototip nomlarini rad qiladi', () => {
    expect(numberFormula('=window.alert(1)')).toMatchObject({ ok: false });
    expect(numberFormula('=SMETA.__proto__', { SMETA: 1 })).toMatchObject({ ok: false });
    expect(numberFormula('=constructor', { SMETA: 1 })).toMatchObject({ ok: false, error: 'UNKNOWN_NAME' });
    expect(numberFormula('=__proto__', { SMETA: 1 })).toMatchObject({ ok: false, error: 'UNKNOWN_NAME' });
    expect(numberFormula('=toString', {})).toMatchObject({ ok: false, error: 'UNKNOWN_NAME' });
    expect(numberFormula('=SUM(1;2)')).toMatchObject({ ok: false });
    expect(numberFormula('=SMETA(1)', { SMETA: 1 })).toMatchObject({ ok: false, error: 'UNKNOWN_NAME' });
    expect(numberFormula('=1;2')).toMatchObject({ ok: false });
  });
  it('juda uzun / chuqur formulani rad qiladi', () => {
    expect(numberFormula(`=${'1+'.repeat(200)}1`)).toMatchObject({ ok: false, error: 'TOO_COMPLEX' });
    expect(numberFormula(`=${'('.repeat(30)}1${')'.repeat(30)}`)).toMatchObject({ ok: false, error: 'TOO_COMPLEX' });
  });
  it('formulaMi faqat = bilan boshlanganini aniqlaydi', () => {
    expect(formulaMi(' =1')).toBe(true);
    expect(formulaMi('50%')).toBe(false);
  });
});
