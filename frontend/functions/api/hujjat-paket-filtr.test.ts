import { describe, expect, it } from 'vitest';
import { paketFiltri } from './hujjat-maydoni';

describe('paketFiltri (query filtr -> RPC)', () => {
  it('faqat ma\'lum kalitlar va to\'g\'ri qiymatlar o\'tadi', () => {
    const f = paketFiltri(JSON.stringify({ loyiha_ids: [1, '2', -3, 'x'], obyekt_ids: [5], turlar: ['F2', 'forma3', 'drop table;'], holatlar: ['qoralama'], oy_dan: '2031-03', oy_gacha: '2031-13', yot: 1 }));
    expect(f).toEqual({ loyiha_ids: [1, 2], obyekt_ids: [5], turlar: ['f2', 'forma3'], holatlar: ['qoralama'], oy_dan: '2031-03' });
  });
  it('xato JSON / massiv / bo\'sh - bo\'sh filtr', () => {
    expect(paketFiltri(null)).toEqual({});
    expect(paketFiltri('{xato')).toEqual({});
    expect(paketFiltri('[1,2]')).toEqual({});
  });
});
