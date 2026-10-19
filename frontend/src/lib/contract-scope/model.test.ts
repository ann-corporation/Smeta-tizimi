import { describe, it, expect } from 'vitest';
import { moneyMinor, moneyText, reconcileScope, scopeBreakdown, scopeCertificates, type ScopeBasis, type ScopeLine } from './model';
const basis = (id: number, kind: ScopeBasis['kind']): ScopeBasis => ({ qator_id: id, kind, contract_id: 1, reference: 'Договор / приложение №1', valuation: 'unit', vat: null, markup: null });
const line = (id: number, parent: number | null, sum: string | null, tur = 'bl'): ScopeLine => ({ id, ota_id: parent, summa: sum, tur, nom: `Строка ${id}` });
describe('mixed contractual scope', () => {
  it('keeps the contract separate from construction without inventing the remainder', () => {
    const b = scopeBreakdown([line(1, null, '1000', 'rz'), line(2, 1, '300'), line(3, 1, '700')], [basis(2, 'construction'), basis(3, 'artwork')]);
    expect(b.total).toBe('1000.00'); expect(b.groups.map(x => x.kind)).toEqual(['construction', 'artwork']);
    expect(reconcileScope('1000.00', b, true)).toEqual({ difference: '0.00', balanced: true });
    expect(reconcileScope('1000.00', b, false).difference).toBeNull();
  });
  it('inherits a section label; nested explicit equipment wins; does not count parent totals', () => {
    const b = scopeBreakdown([line(1, null, '100', 'rz'), line(2, 1, '40'), line(3, 1, '60')], [basis(1, 'construction'), basis(3, 'equipment')]);
    expect(b.total).toBe('100.00'); expect(b.owners.get(2)?.kind).toBe('construction'); expect(b.owners.get(3)?.kind).toBe('equipment');
  });
  it('keeps NULL and explicit zero separate and shows known partial totals', () => {
    const b = scopeBreakdown([line(1, null, '0'), line(2, null, null)], []);
    expect(b.total).toBeNull(); expect(b.known).toBe('0.00'); expect(b.unknown).toBe(1); expect(b.groups[0].kind).toBe('unclassified');
  });
  it('rejects silently doubled scope with priced parent + resources', () => {
    const b = scopeBreakdown([line(1, null, '100'), line(2, 1, '100', 'ob')], [basis(1, 'artwork')]);
    expect(b.known).toBe('100.00'); expect(b.total).toBeNull(); expect(b.issues[0].code).toBe('VALUE_PARENT_WITH_CHILDREN');
  });
  it.each(['cycle', 'missing', 'duplicate'])('blocks a final total on %s structure', mode => {
    const lines = mode === 'cycle' ? [line(1, 2, '10'), line(2, 1, '20')] : mode === 'missing' ? [line(1, 99, '10')] : [line(1, null, '10'), line(1, null, '20')];
    const b = scopeBreakdown(lines, [basis(1, 'service')]); expect(b.total).toBeNull(); expect(b.issues.length).toBeGreaterThan(0);
  });
  it('preserves cents beyond Number safe integer and rejects overprecision/nonfinancial inputs', () => {
    expect(moneyText(moneyMinor('9007199254740993.01') + moneyMinor('0.09'))).toBe('9007199254740993.10');
    for (const x of ['NaN', 'Infinity', '', '1e9', '1.234']) expect(() => moneyMinor(x)).toThrow('MONEY_INVALID');
    expect(moneyText(moneyMinor('-0.01'))).toBe('-0.01');
  });
  it('uses approved period snapshots including reversals; drafts/cancelled/future excluded', () => {
    const rows = [{ id: 1, quantity: '2', amount: '100.50', status: 'approved' as const, month: '2026-01' },
      { id: 2, quantity: '-1', amount: '-50.25', status: 'approved' as const, month: '2026-02' },
      { id: 3, quantity: '3', amount: '900', status: 'draft' as const, month: '2026-02' },
      { id: 4, quantity: '3', amount: '900', status: 'cancelled' as const, month: '2026-01' }];
    expect(scopeCertificates(rows, '2026-02')).toEqual({ previous: '100.50', current: '-50.25', known: '50.25', total: '50.25', unknown: 0 });
    expect(scopeCertificates([...rows, { ...rows[0], id: 5, amount: null }], '2026-02').total).toBeNull();
    expect(() => scopeCertificates([...rows, rows[0]], '2026-02')).toThrow('DUPLICATE_CERTIFICATE');
  });
});
