import { describe, expect, it } from 'vitest';
import { regexTekshir } from './moslash-sozlama';
import { MOSLASH_STANDART } from './moslash';

describe('varaq belgisi regex sozlamasi', () => {
  it('standart regex namunadan belgi oladi; boshqa nomlash uchun o‘z regex', () => {
    expect(regexTekshir(MOSLASH_STANDART.belgiRegex, 'РАЗДЕЛ ОБРАЗЕЦ (КР-5)')).toEqual({ ok: true, belgilar: ['КР-5'] });
    expect(regexTekshir('лист\\s*([А-Я]+/\\d+)', 'Раздел [лист КР/5]')).toEqual({ ok: true, belgilar: ['КР-5'] });
  });
  it('bo‘sh, yaroqsiz va guruhsiz regex rad etiladi', () => {
    expect(regexTekshir('', 'x')).toEqual({ ok: false, sabab: 'bosh' });
    expect(regexTekshir('(', 'x')).toEqual({ ok: false, sabab: 'yaroqsiz' });
    expect(regexTekshir('КР-\\d+', 'КР-5')).toEqual({ ok: false, sabab: 'guruhsiz' });
  });
});
