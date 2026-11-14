import { describe, expect, it } from 'vitest';
import { bosTolovShakl, summaOqi, tolovTekshir, tolovYuki } from './tolov-forma';

describe('to‘lov shakli', () => {
  it('bo‘sh summa 0 emas — «kiritilmagan» (NULL ≠ 0) va saqlanmaydi', () => {
    expect(summaOqi('')).toBeNull();
    expect(summaOqi('0')).toBe(0);
    const s = { ...bosTolovShakl(5, '2026-11-12') };
    expect(tolovTekshir(s).map((x) => x.joy)).toEqual(['summa']);
    expect(tolovYuki(s)).toBeNull();
  });
  it('shartnoma tanlanmasa xato; 0 va manfiy summa rad', () => {
    expect(tolovTekshir({ ...bosTolovShakl(null, '2026-11-12'), summa: '100' }).map((x) => x.joy)).toEqual(['shartnoma']);
    expect(tolovTekshir({ ...bosTolovShakl(1, '2026-11-12'), summa: '0' }).map((x) => x.joy)).toEqual(['summa']);
    expect(tolovTekshir({ ...bosTolovShakl(1, '2026-11-12'), summa: '-5' }).map((x) => x.joy)).toEqual(['summa']);
  });
  it('probel va vergulli summa o‘qiladi; qaytarim manfiy yoziladi, izoh kesiladi', () => {
    const t = tolovYuki({ ...bosTolovShakl(7, '2026-11-12'), summa: '1 234 567,50', izoh: '  avans  ' });
    expect(t).toEqual({ shartnomaId: 7, summa: 1234567.5, tur: 'tolov', sana: '2026-11-12', izoh: 'avans' });
    const q = tolovYuki({ ...bosTolovShakl(7, '2026-11-12'), tur: 'qaytarim', summa: '100' });
    expect(q?.summa).toBe(-100);
    expect(q && 'izoh' in q).toBe(false);
  });
  it('noto‘g‘ri sana rad', () => {
    expect(tolovTekshir({ ...bosTolovShakl(1, ''), summa: '5' }).map((x) => x.joy)).toEqual(['sana']);
  });
});
