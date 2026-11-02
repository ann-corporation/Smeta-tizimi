import { describe, expect, it } from 'vitest';
import { qolganSummaMatni } from './f2-qolgan-summa';
import { katKesimYigish, ustamaliHisobla, type UstamaNatija } from '../../lib/ustamali-summa';

const natija = (x: Partial<UstamaNatija>): UstamaNatija =>
  ({ ustamali: null, ndsBilan: null, ustamasiz: 0, nomalum: { summa: 0, soni: 0 }, qadamlar: null, zanjir: [], ...x });
const sp = (s: string) => s.replace(/\s/g, ' ');

describe('F2 yozish tasdig‘i: bog‘lanmagan qatorlar summasi (ustamali + ustamasiz)', () => {
  it('kat to‘liq ma’lum — ustamali asosiy, ustamasiz yonida', () => {
    expect(sp(qolganSummaMatni(3, 1000, natija({ ustamali: 1250, ustamasiz: 1000 }))))
      .toBe('3 ta qator — 1 250 so‘m (nakrutka bilan), 1 000 so‘m ustamasiz');
  });
  it('kat noma’lum qism — «≈», noma’lum qism ustamasiz qo‘shiladi va alohida aytiladi', () => {
    expect(sp(qolganSummaMatni(5, 1400, natija({ ustamali: 1250, ustamasiz: 1000, nomalum: { summa: 400, soni: 2 } }))))
      .toBe('5 ta qator — ≈ 1 650 so‘m (nakrutka bilan), 1 400 so‘m ustamasiz (taxminiy, kat noma’lum: 400 so‘m)');
  });
  it('hech bir qatorning kategoriyasi ma’lum emas yoki ustama o‘qilmagan — «ustamali noma’lum», 0 emas', () => {
    expect(sp(qolganSummaMatni(2, 500, natija({ ustamali: 0, ustamasiz: 0, nomalum: { summa: 500, soni: 2 } }))))
      .toBe('2 ta qator — ustamali noma’lum, 500 so‘m ustamasiz');
    expect(sp(qolganSummaMatni(2, 500, null))).toBe('2 ta qator — ustamali noma’lum, 500 so‘m ustamasiz');
  });
  it('mavjud hisob (ustamaliHisobla) bilan: koeffitsient yo‘q — noma’lum', () => {
    const k = katKesimYigish([{ kat: 'МАТ', s: 100 }], (x) => x.kat, (x) => x.s);
    expect(sp(qolganSummaMatni(1, 100, ustamaliHisobla(k, null)))).toBe('1 ta qator — ustamali noma’lum, 100 so‘m ustamasiz');
  });
});
