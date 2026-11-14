import { describe, expect, it } from 'vitest';
import { f2ObyektFayldan, f2OyFayldan, f2RaqamFayldan } from './fayl-nomi';

describe('f2 fayl nomidan taklif', () => {
  it('raqam', () => {
    expect(f2RaqamFayldan('Yevropa_АКТ_Ф-2_№36_2026-05.xlsx')).toBe('36');
    expect(f2RaqamFayldan('F2 № 007.xlsx')).toBe('7');
    expect(f2RaqamFayldan('akt_12 aprel.xlsx')).toBe('12');
    expect(f2RaqamFayldan('smeta.xlsx')).toBeNull();
  });
  it('oy: aniq bitta bo‘lsa', () => {
    expect(f2OyFayldan('F2_2026-05.xlsx')).toBe('2026-05');
    expect(f2OyFayldan('F2 05.2026.xlsx')).toBe('2026-05');
    expect(f2OyFayldan('F2 2026-05 va 2026-06.xlsx')).toBeNull();
    expect(f2OyFayldan('F2.xlsx')).toBeNull();
  });
  it('obyekt: aniq bitta (eng uzun) mos; noaniq — null', () => {
    const o = [{ id: 1, nom: 'Yevropa oshxonasi №1' }, { id: 2, nom: 'Yevropa oshxonasi №2' }, { id: 3, nom: 'Karting' }];
    expect(f2ObyektFayldan('Karting_F2_36.xlsx', o)).toBe(3);
    expect(f2ObyektFayldan('Yevropa oshxonasi №2_АКТ.xlsx', o)).toBe(2);
    expect(f2ObyektFayldan('Yevropa oshxonasi.xlsx', o)).toBeNull();
    expect(f2ObyektFayldan('boshqa.xlsx', o)).toBeNull();
  });
});
