import { describe, expect, it } from 'vitest';
import { kechikkanKun, muddatHolati, muddatiOtganlar, reestrQatorlari, type PredpisaniyaQator } from './predpisaniya';

const q = (p: Partial<PredpisaniyaQator> & { id: number }): PredpisaniyaQator => ({ sarlavha: 'x', holat: 'ochiq', ...p });

describe('nazorat predpisaniya', () => {
  it('muddat holatlari', () => {
    expect(muddatHolati(q({ id: 1, muddat: '2026-10-20' }), '2026-10-24')).toBe('otgan');
    expect(muddatHolati(q({ id: 1, muddat: '2026-10-24' }), '2026-10-24')).toBe('bugun');
    expect(muddatHolati(q({ id: 1, muddat: '2026-10-30' }), '2026-10-24')).toBe('muddatda');
    expect(muddatHolati(q({ id: 1 }), '2026-10-24')).toBe('muddatsiz');
    expect(muddatHolati(q({ id: 1, muddat: '2026-01-01', holat: 'yopildi' }), '2026-10-24')).toBe('yopiq');
  });
  it('kechikish va tartib', () => {
    const r = [q({ id: 1, muddat: '2026-10-22' }), q({ id: 2, muddat: '2026-10-10', muhimlik: 'past' }), q({ id: 3, muddat: '2026-10-22', muhimlik: 'kritik' }), q({ id: 4 })];
    expect(kechikkanKun(r[0], '2026-10-24')).toBe(2);
    expect(muddatiOtganlar(r, '2026-10-24').map((x) => x.id)).toEqual([2, 3, 1]);
  });
  it('reestr: ruscha, bo\'sh qiymat bo\'sh qoladi', () => {
    const [qator] = reestrQatorlari([q({ id: 1, sarlavha: 'Арматура', muddat: '2026-10-20', sana: '2026-10-01' })], '2026-10-24');
    expect(qator[2]).toBe('01.10.2026');
    expect(qator[3]).toBe('');
    expect(qator[7]).toBe('Не устранено (просрочено 4 дн.)');
  });
});
