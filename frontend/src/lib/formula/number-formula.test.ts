import { describe, expect, it } from 'vitest';
import { numberFormula } from './number-formula';

describe('Excel-uslubidagi son formula', () => {
  it('oddiy son va arifmetikani hisoblaydi', () => {
    expect(numberFormula('12,5')).toMatchObject({ ok: true, value: 12.5, formula: false });
    expect(numberFormula('=ROUND((10+2)*3/7;2)')).toMatchObject({ ok: true, value: 5.14, formula: true });
  });
  it('qator kontekstidagi qiymatlardan foydalanadi', () => {
    expect(numberFormula('=FAKT+QOLDIQ*0.25', { FAKT: 60, QOLDIQ: 40 })).toMatchObject({ ok: true, value: 70 });
    expect(numberFormula('=SUM(SMETA;FAKT;F2_MUMKIN)', { SMETA: 100, FAKT: 60, F2_MUMKIN: 30 })).toMatchObject({ ok: true, value: 190 });
  });
  it('NULL, noma’lum nom va 0 ga bo‘lishni fail-closed qiladi', () => {
    expect(numberFormula('=SMETA+1', { SMETA: null })).toMatchObject({ ok: false, error: 'MISSING_VALUE' });
    expect(numberFormula('=TASHQI_API()', {})).toMatchObject({ ok: false, error: 'UNKNOWN_NAME' });
    expect(numberFormula('=10/0')).toMatchObject({ ok: false, error: 'DIVIDE_BY_ZERO' });
  });
  it('kod bajarish va property accessni sintaksis sifatida rad qiladi', () => {
    expect(numberFormula('=window.alert(1)')).toMatchObject({ ok: false });
    expect(numberFormula('=SMETA.__proto__')).toMatchObject({ ok: false });
  });
});
