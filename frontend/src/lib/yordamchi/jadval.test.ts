import { describe, expect, it } from 'vitest';
import { mdBolaklar } from './jadval';

describe('mdBolaklar (markdown jadval)', () => {
  it('oddiy jadval: matn + jadval + matn; tekislash', () => {
    const b = mdBolaklar('Natija:\n\n| Obyekt | Summa |\n|:--|--:|\n| A | 10 |\n| B | 20 |\n\nOxiri');
    expect(b.map((x) => x.tur)).toEqual(['md', 'jadval', 'md']);
    const j = b[1]; if (j.tur !== 'jadval') throw new Error('jadval');
    expect(j.bosh).toEqual(['Obyekt', 'Summa']); expect(j.tekis).toEqual(['l', 'r']); expect(j.qatorlar).toEqual([['A', '10'], ['B', '20']]);
  });
  it('kod to‘sig‘i ichidagi jadval tegilmaydi; jadvalsiz matn bitta bo‘lak', () => {
    expect(mdBolaklar('```\n| a | b |\n|---|---|\n| 1 | 2 |\n```').map((x) => x.tur)).toEqual(['md']);
    expect(mdBolaklar('salom | dunyo')).toEqual([{ tur: 'md', matn: 'salom | dunyo' }]);
  });
  it('yetishmagan kataklar to‘ldiriladi; \\| himoyalangan; ustunlar soni mos kelmasa jadval emas', () => {
    const j = mdBolaklar('| a | b |\n|---|---|\n| 1 |\n| x\\|y | z |')[0];
    if (j.tur !== 'jadval') throw new Error('jadval'); expect(j.qatorlar).toEqual([['1', ''], ['x|y', 'z']]);
    expect(mdBolaklar('| a | b |\n|---|---|---|\n| 1 | 2 |').every((x) => x.tur === 'md')).toBe(true);
  });
});
