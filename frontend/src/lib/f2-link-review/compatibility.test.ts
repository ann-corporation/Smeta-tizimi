import { describe, expect, it } from 'vitest';
import type { F2Tugun } from '../smeta-anatomiya/f2';
import type { Nomzod, Qavat } from '../f2-moslash-v3';
import { moslikIndeksiPercent } from './compatibility';

const source = (overrides: Partial<F2Tugun> = {}) => ({
  uid: 'f1', tur: 'bl', kod: '01-01', nom: 'Beton ishlari', birlik: 'm3', hajm: 10,
  bolalar: [], yol: ['КОНСТРУКЦИИ'],
  ...overrides,
}) as F2Tugun;

const candidate = (layers: Qavat[], ball = 95): Nomzod => ({
  qatorId: 1, ball, yol: 'RZ › BL', qavatlar: layers, sabab: [],
});

describe('matcher score presentation', () => {
  it('normalizes evidence weights to 100 while excluding weak volume/order tie-breakers', () => {
    const score = moslikIndeksiPercent(candidate([
      { nom: 'razdel', ball: 25, izoh: 'exact' }, { nom: 'shifr', ball: 25, izoh: 'exact' }, { nom: 'nom', ball: 20, izoh: 'exact' },
      { nom: 'resurslar', ball: 25, izoh: 'exact' }, { nom: 'hajm', ball: 2, izoh: 'weak' }, { nom: 'tartib', ball: 2, izoh: 'weak' },
    ]), source({ bolalar: [{ uid: 'r1' } as F2Tugun] }));
    expect(score).toBe(100);
  });

  it('penalizes unit mismatch as a hard safety gate', () => {
    const score = moslikIndeksiPercent(candidate([
      { nom: 'razdel', ball: 25, izoh: 'exact' }, { nom: 'shifr', ball: 25, izoh: 'exact' }, { nom: 'nom', ball: 20, izoh: 'exact' },
      { nom: 'birlik', ball: -100, izoh: 'mismatch' },
    ]), source());
    expect(score).toBe(0);
  });

  it('does not invent a percentage from a raw score when a fallback candidate has no evidence breakdown', () => {
    expect(moslikIndeksiPercent(candidate([], 50), source())).toBeNull();
  });

  it('handles optional absent code without treating it as a mismatch', () => {
    const score = moslikIndeksiPercent(candidate([
      { nom: 'shifr', ball: 0, izoh: 'absent' }, { nom: 'nom', ball: 20, izoh: 'exact' },
    ]), source({ kod: null, yol: [] }));
    expect(score).toBe(100);
  });
});
