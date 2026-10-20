import { describe, expect, it } from 'vitest';
import { displayOffset, formatMoneyInput, moneyConstraint, moneyValueToRaw, parseMoneyEdit, parseMoneyInput, rawOffset, sameMoney } from './index';

describe('money string grammar', () => {
  it.each(['', '0', '000', '-', '.', '-.', '-0.00', '123456789012345678901234567890.00100'])('preserves exact draft %j', raw => {
    expect(parseMoneyInput(raw)).toBe(raw);
    expect(parseMoneyInput(formatMoneyInput(raw))).toBe(raw);
  });
  it.each([
    ['-1 234 567,0900', '-1234567.0900'], ['1\u00a0234\u00a0567,', '1234567.'],
    ['1\u202f234.00', '1234.00'], ['0,', '0.'],
  ])('canonicalizes %j without rounding', (text, raw) => expect(parseMoneyInput(text)).toBe(raw));
  it.each(['12 34', ' 123', '123 ', '1,234.56', '1.2.3', '1-2', '+12', '1e3', '12 USD', '1\t234', '1\n234', '123\n', '123\r', '1.2 3', '--2', '1,234,567'])('rejects malformed %j', text => {
    expect(parseMoneyInput(text)).toBeNull();
  });
  it.each([
    ['1234567.00100', '1 234 567.00100'], ['-1234.', '-1 234.'], ['000000.00', '000 000.00'],
  ])('groups integral digits only: %s', (raw, display) => expect(formatMoneyInput(raw)).toBe(display));
  it('edits existing spaces while rejecting newly inserted malformed grouping', () => {
    expect(parseMoneyEdit('12 345', '12 45')).toBe('1245');
    expect(parseMoneyEdit('', '12 34')).toBeNull();
    expect(parseMoneyEdit('1 234', '1 2934')).toBe('12934');
  });
  it('maps every raw caret boundary through grouping', () => {
    const raw = '-1234567.00100';
    const display = formatMoneyInput(raw);
    for (let i = 0; i <= raw.length; i++) expect(rawOffset(display, displayOffset(display, i))).toBe(i);
  });
  it('preserves missing versus zero and expands number exponents', () => {
    for (const value of [null, undefined, '']) expect(moneyValueToRaw(value)).toBe('');
    expect(moneyValueToRaw(0)).toBe('0');
    expect(moneyValueToRaw(1e21)).toBe('1000000000000000000000');
    expect(moneyValueToRaw(-1.23e-7)).toBe('-0.000000123');
    for (const value of [NaN, Infinity, '12oops']) expect(() => moneyValueToRaw(value)).toThrow(TypeError);
  });
  it('compares exact decimals and evaluates min/max/step beyond JS precision', () => {
    expect(sameMoney('0001.2300', '1.23')).toBe(true);
    expect(sameMoney('-0.00', '0')).toBe(true);
    expect(sameMoney('-', '0')).toBe(false);
    expect(sameMoney('9007199254740993', '9007199254740992')).toBe(false);
    expect(moneyConstraint('9007199254740993.01', '9007199254740993.02')).toBe('min');
    expect(moneyConstraint('9007199254740993.03', undefined, '9007199254740993.02')).toBe('max');
    expect(moneyConstraint('9007199254740993.03', undefined, undefined, '.02')).toBe('step');
    expect(moneyConstraint('9007199254740993.04', undefined, undefined, '.02')).toBeNull();
    expect(moneyConstraint('1.23', '0.01', '9', '.02')).toBeNull();
    expect(moneyConstraint('1.24', '0.01', '9', '.02')).toBe('step');
    expect(moneyConstraint('1.250001')).toBeNull();
    expect(moneyConstraint('1.25', undefined, undefined, '1')).toBe('step');
    expect(moneyConstraint('1.25', undefined, undefined, 'any')).toBeNull();
    expect(moneyConstraint('-')).toBe('draft');
    expect(moneyConstraint('')).toBeNull();
    expect(moneyConstraint('1.25', undefined, undefined, '1', '.25')).toBeNull();
    expect(moneyConstraint('1.25', '1e-2', '2e0', '1e-2')).toBeNull();
    expect(moneyConstraint('1.255', '1e-2', '2e0', '1e-2')).toBe('step');
  });
});
