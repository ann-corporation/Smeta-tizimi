import { describe, it, expect } from 'vitest';
import { oqishYuki } from './laboratoriya';

describe('laboratoriya shlyuzi: uchinchi tomon natijani faqat oqiydi', () => {
  it('natija_royxat va natija_tafsilot oqish yuki', () => {
    expect(oqishYuki('natija_royxat', new URLSearchParams('kompaniya_id=5&obyekt_id=7'))).toEqual({ p_kompaniya_id: 5, p_obyekt_id: 7, p_limit: 100 });
    expect(oqishYuki('natija_tafsilot', new URLSearchParams('kompaniya_id=5&murojaat_id=9'))).toEqual({ p_kompaniya_id: 5, p_murojaat_id: 9 });
    expect(oqishYuki('natija_tafsilot', new URLSearchParams('kompaniya_id=5'))).toBe('murojaat_id kerak');
  });
  it('yozish bolimi yoq (natija_yoz ochilmagan)', () => {
    expect(typeof oqishYuki('natija_yoz', new URLSearchParams('kompaniya_id=5'))).toBe('string');
  });
});
