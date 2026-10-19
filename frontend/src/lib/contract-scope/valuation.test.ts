import { describe, expect, it } from 'vitest';
import { valueContractClosure, type PricePolicy } from './valuation';
const policy: PricePolicy = { amount: '100.00', currency: 'UZS', vat: 'included', vatPercent: null, markup: 'included', markupPercent: null, exchange: null, reference: 'Договор №1 / приложение 2' };
describe('contractual closing math', () => {
  it('does not charge VAT/overhead twice when contract price includes them', () => {
    expect(valueContractClosure(policy, { mode: 'unit', planned: '5', previous: '1', current: '2' })).toMatchObject({ ok: true, payable: '200.00', addedVat: '0.00', addedMarkup: '0.00', progressKind: 'quantity', progressPercent: '60' });
  });
  it('uses explicitly documented rates with sequential cent rounding', () => {
    expect(valueContractClosure({ ...policy, vat: 'excluded', vatPercent: '12', markup: 'excluded', markupPercent: '10' }, { mode: 'unit', planned: '5', previous: '0', current: '2' })).toMatchObject({ ok: true, base: '200.00', addedMarkup: '20.00', addedVat: '26.40', payable: '246.40' });
  });
  it('does not invent a foreign exchange rate or missing tax basis', () => {
    expect(valueContractClosure({ ...policy, currency: 'USD', vat: null }, { mode: 'unit', planned: '1', previous: '0', current: '1' })).toMatchObject({ ok: false, blockers: ['VAT_UNKNOWN', 'EXCHANGE_EVIDENCE_REQUIRED'] });
    expect(valueContractClosure({ ...policy, currency: 'USD', exchange: { rate: '12500', date: '2026-01-01', reference: 'Протокол курса' } }, { mode: 'unit', planned: '1', previous: '0', current: '1' })).toMatchObject({ ok: true, payable: '1250000.00' });
  });
  it('supports acceptance of whole milestones and refuses ambiguous fractions or overclosing', () => {
    expect(valueContractClosure(policy, { mode: 'milestone', planned: '4', previous: '1', current: '2' })).toMatchObject({ ok: true, progressKind: 'accepted_milestones', payable: '200.00' });
    expect(valueContractClosure(policy, { mode: 'milestone', planned: '1', previous: '0', current: '0.5' })).toMatchObject({ ok: false });
    expect(valueContractClosure(policy, { mode: 'unit', planned: '1', previous: '1', current: '1' })).toMatchObject({ ok: false, blockers: ['OVER_PLAN'] });
  });
  it('amount-based closing is financial, uses actual accepted amount and preserves zero', () => {
    expect(valueContractClosure({ ...policy, amount: null }, { mode: 'amount', planned: '1000', previous: '100', current: '250.50' })).toMatchObject({ ok: true, payable: '250.50', progressKind: 'financial', progressPercent: '35.05' });
    expect(valueContractClosure({ ...policy, amount: '0' }, { mode: 'unit', planned: '1', previous: '0', current: '1' })).toMatchObject({ ok: true, payable: '0.00' });
    expect(valueContractClosure({ ...policy, amount: null }, { mode: 'unit', planned: '1', previous: '0', current: '1' })).toMatchObject({ ok: false, blockers: ['PRICE_UNKNOWN'] });
  });
});
