import { describe, expect, it } from 'vitest';
import { characteristics, diametrMos, gateFailure, normName } from './resource-match';

const gate = (a: string, ua: string, b: string, ub: string) => gateFailure(characteristics(a), characteristics(b), ua, ub, normName(b));

describe('diametr oralig‘i va qisqartmasi', () => {
  it('"ДИАМЕТРОМ 6,3-6,5 ММ" oraliq sifatida o‘qiladi; "диам. 5,5 мм" ham diametr', () => {
    expect(characteristics('КАТАНКА ГОРЯЧЕКАТАНАЯ В МОТКАХ ДИАМЕТРОМ 6,3-6,5 ММ').diameter).toBe('6.3-6.5');
    expect(characteristics('Катанка (Чирчик) диам. 5,5 мм').diameter).toBe('5.5');
  });
  it('oraliq ichidagi qiymat mos, tashqaridagisi rad etiladi', () => {
    expect(gate('КАТАНКА ГОРЯЧЕКАТАНАЯ В МОТКАХ ДИАМЕТРОМ 6,3-6,5 ММ', 'т', 'Катанка В 6,5', 'тн')).toBeNull();
    expect(gate('КАТАНКА ГОРЯЧЕКАТАНАЯ В МОТКАХ ДИАМЕТРОМ 6,3-6,5 ММ', 'т', 'Катанка (Чирчик) диам. 5,5 мм', 'кг')).toBe('DIAMETER');
  });
  it('nuqtaviy diametrlar faqat teng bo‘lsa mos; elektrod klassi qat’iy', () => {
    expect(diametrMos('12', '12')).toBe(true);
    expect(diametrMos('12', '16')).toBe(false);
    expect(diametrMos('6.3-6.5', '6.4')).toBe(true);
    expect(gate('ЭЛЕКТРОДЫ ДИАМЕТРОМ 4 ММ Э42', 'т', 'Сварочные электроды MP-3 Арсенал, диам. 4 мм', 'кг')).toBe('ELECTRODE_GRADE');
    expect(gate('ЭЛЕКТРОДЫ ДИАМЕТРОМ 4 ММ Э42', 'т', 'Электроды Э42 диам. 4 мм', 'кг')).toBeNull();
  });
});
