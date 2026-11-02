import { describe, expect, it } from 'vitest';
import { obyektHolati, shkala, signallarDaraja, squarify } from './grafik';

const t0 = { approved_missing: 0, estimate_missing: 0, unpriced_rows: 0, pending_changes: 0, review_count: 0, draft_count: 0 };

describe('rahbar paneli grafiklari', () => {
  it('treemap: maydon qiymatga mutanosib, to‘rtburchak ichida, noma’lum/0 qiymat kirmaydi', () => {
    const r = squarify([{ id: 'a', qiymat: 60 }, { id: 'b', qiymat: 30 }, { id: 'c', qiymat: 10 }, { id: 'd', qiymat: 0 }, { id: 'e', qiymat: Number.NaN }], 100, 50);
    expect(r.map((p) => p.id).sort()).toEqual(['a', 'b', 'c']);
    const maydon = Object.fromEntries(r.map((p) => [p.id, p.w * p.h]));
    expect(maydon.a).toBeCloseTo(3000); expect(maydon.b).toBeCloseTo(1500); expect(maydon.c).toBeCloseTo(500);
    for (const p of r) { expect(p.x + p.w).toBeLessThanOrEqual(100.0001); expect(p.y + p.h).toBeLessThanOrEqual(50.0001); }
    expect(squarify([], 10, 10)).toEqual([]);
  });
  it('holat: summa yetishmasa — xavf; narxsiz — diqqat; tekshiruv; toza', () => {
    expect(obyektHolati({ ...t0, approved_missing: 1 })).toBe('xavf');
    expect(obyektHolati({ ...t0, unpriced_rows: 2 })).toBe('diqqat');
    expect(obyektHolati({ ...t0, draft_count: 1 })).toBe('tekshiruv');
    expect(obyektHolati(t0)).toBe('toza');
  });
  it('shkala noma’lumni e’tiborsiz qoldiradi; signallar darajasi qayd soni bilan', () => {
    expect(shkala([null, 730, undefined]).max).toBe(1000);
    expect(shkala([null]).max).toBe(1);
    expect(signallarDaraja([{ severity: 'critical', quantity: 2 }, { severity: 'medium' }, { severity: null }])).toEqual({ muhim: 2, orta: 1, past: 1 });
  });
});
