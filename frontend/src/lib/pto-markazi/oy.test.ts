import { describe, expect, it } from 'vitest';
import { f3BoshOy, faolOy, ishOyi, oyKaliti, oyOldin, oydaFaktSoni } from './oy';

const a = (tur: string, oy: string, holat = 'tasdiqlangan') => ({ tur, oy, holat, lifecycle_status: null });

describe('pto-markazi/oy', () => {
  it('oyKaliti', () => {
    expect(oyKaliti('2026-08-15')).toBe('2026-08');
    expect(oyKaliti('2026-13')).toBeNull();
    expect(oyKaliti(null)).toBeNull();
  });
  it('faolOy: oxirgi fakt/F2 oyi; bekor va boshqa turlar hisobga olinmaydi; akt yo‘q — null', () => {
    expect(faolOy([a('fakt', '2026-06-01'), a('f2', '2026-08-01'), a('fakt', '2026-07-01')])).toBe('2026-08');
    expect(faolOy([a('f2', '2026-09-01', 'bekor'), a('fakt', '2026-05-01')])).toBe('2026-05');
    expect(faolOy([a('boshqa', '2026-10-01')])).toBeNull();
    expect(faolOy([])).toBeNull();
    expect(faolOy(null)).toBeNull();
  });
  it('ishOyi: tanlangan → faollik → bugun', () => {
    expect(ishOyi({ tanlangan: '2026-03', faollik: '2026-08', bugun: '2026-11' })).toEqual({ oy: '2026-03', manba: 'tanlangan' });
    expect(ishOyi({ faollik: '2026-08', bugun: '2026-11' })).toEqual({ oy: '2026-08', manba: 'faollik' });
    expect(ishOyi({ bugun: '2026-11' })).toEqual({ oy: '2026-11', manba: 'bugun' });
  });
  it('oydaFaktSoni: noma‘lum — null, 0 emas', () => {
    expect(oydaFaktSoni(null, '2026-08')).toBeNull();
    expect(oydaFaktSoni([a('fakt', '2026-08-02'), a('fakt', '2026-08-20'), a('fakt', '2026-07-01'), a('f2', '2026-08-01')], '2026-08')).toBe(2);
    expect(oydaFaktSoni([], '2026-08')).toBe(0);
  });
  it('f3BoshOy: Forma 3 ga kirmagan oxirgi oy ustun; yo‘q bo‘lsa — umuman oxirgi', () => {
    expect(f3BoshOy([{ oy: '2026-08-01', band: false }, { oy: '2026-09-01', band: true }, { oy: '2026-07-01', band: false }])).toBe('2026-08');
    expect(f3BoshOy([{ oy: '2026-09-01', band: true }, { oy: '2026-07-01', band: true }])).toBe('2026-09');
    expect(f3BoshOy([])).toBeNull();
  });
  it('oyOldin', () => {
    expect(oyOldin('2026-02', 3)).toBe('2025-11');
    expect(oyOldin('2026-11', 36)).toBe('2023-11');
  });
});
