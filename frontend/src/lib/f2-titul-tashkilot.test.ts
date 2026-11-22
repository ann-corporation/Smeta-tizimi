import { describe, expect, it } from 'vitest';
import { tashkilotQismi } from './f2-hujjat';

describe('F-2 sarlavhasida faqat tashkilot (egasi 2026-11-22)', () => {
  it('lavozim va F.I.O. olib tashlanadi', () => {
    expect(tashkilotQismi('NEW TIMES BUILDINGS MCHJ, Производитель работ, Бозоров. Ш')).toBe('NEW TIMES BUILDINGS MCHJ');
    expect(tashkilotQismi('ДКС «YANGI NAVOIY SHAHARCHASI ISHBILARMONLIK MARKAZI DIREKSIYASI» ДМ, Эшкобилов Ф.')).toBe('ДКС «YANGI NAVOIY SHAHARCHASI ISHBILARMONLIK MARKAZI DIREKSIYASI» ДМ');
  });
  it('qo\'shtirnoq ichidagi vergul bo\'linmaydi; bo\'sh — undefined', () => {
    expect(tashkilotQismi('ООО «Альфа, Бета», Иванов И.')).toBe('ООО «Альфа, Бета»');
    expect(tashkilotQismi('  ')).toBeUndefined();
    expect(tashkilotQismi('Faqat tashkilot')).toBe('Faqat tashkilot');
  });
});
