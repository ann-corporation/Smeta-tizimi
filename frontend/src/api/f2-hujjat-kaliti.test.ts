import { describe, expect, it } from 'vitest';
import { f2HujjatKaliti } from './f2-hujjat-kontekst';

describe('f2HujjatKaliti - token kaliti (qayta yuklash bepul)', () => {
  it('raqamli: obyekt + oy + raqam', () => { expect(f2HujjatKaliti(5, '2026-11-01', ' 12 ', 99)).toBe('f2:5:2026-11:12'); });
  it('raqamsiz saqlangan: akt bo\'yicha barqaror (bayt xeshiga bog\'liq emas)', () => {
    expect(f2HujjatKaliti(170, '2026-11-01', null, 825)).toBe('f2:170:2026-11:akt825');
    expect(f2HujjatKaliti(170, '2026-11-01', '', 825)).toBe(f2HujjatKaliti(170, '2026-11-15', '  ', 825));
  });
  it('saqlanmagan ko\'rinish (akt yo\'q): null', () => { expect(f2HujjatKaliti(170, '2026-11-01', null)).toBeNull(); });
});