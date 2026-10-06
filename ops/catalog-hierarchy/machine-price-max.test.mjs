import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exactMachineKey, maximumMachinePrices } from './machine-price-max.mjs';

const row = (sourceKey, price, overrides = {}) => ({ sourceKey, price,
  name: 'Автомобиль-самосвал г/п до 10 т', unit: 'маш-ч', currency: 'UZS', vat: 'EXCLUDED',
  sourceDate: '2023-01-01', sourceSha256: 'a'.repeat(64), page: 1, readingVerified: true, ...overrides });

test('one offer: selects maximum, not latest or average', () => {
  const rows = [row('2023', '151969'), row('2025', '159476', { sourceDate: '2025-01-01' })];
  const result = maximumMachinePrices(rows);
  assert.equal(result.offers.length, 1);
  assert.equal(result.offers[0].price, '159476');
  assert.equal(result.offers[0].sourceDate, '2025-01-01');
  assert.equal(result.offers[0].evidence.length, 2);
  assert.equal(result.complete, true);
  assert.deepEqual(rows[0], row('2023', '151969'));
});
test('older higher price wins, provenance retained', () => {
  const r = maximumMachinePrices([row('2023', '146729'), row('2025', '146569', { sourceDate: '2025-01-01' })]);
  assert.equal(r.offers[0].sourceKey, '2023');
  assert.equal(r.offers[0].sourceSha256, 'a'.repeat(64));
});
test('different capacities and models remain different machines', () => {
  const rows = ['5', '10', '25'].map(n => row(n, '100', { name: `Самосвал ${n} т` }));
  assert.equal(maximumMachinePrices(rows).offers.length, 3);
  assert.notEqual(exactMachineKey('Кран 10 т'), exactMachineKey('Кран 10 т модель A'));
});
test('only conservative case/space/yo equivalence, no fuzzy or row identity', () => {
  assert.equal(exactMachineKey('  ПОДЪЁМНИК  12 м '), exactMachineKey('подъемник 12 м'));
  assert.notEqual(exactMachineKey('Автопогрузчик 3 т'), exactMachineKey('Автопогрузчик З т'));
});
test('decimal comparison exact beyond JS safe integer, no money rounding', () => {
  const r = maximumMachinePrices([row('a', '9007199254740992.001'), row('b', '9007199254740992.002')]);
  assert.equal(r.offers[0].sourceKey, 'b');
});
test('equal prices prefer newer source, deterministic on reordering', () => {
  const rows = [row('a', '100.00'), row('b', '100', { sourceDate: '2025-01-01' }), row('c', '100', { sourceDate: '2025-01-01' })];
  assert.equal(maximumMachinePrices(rows).offers[0].sourceKey, 'b');
  assert.deepEqual(maximumMachinePrices(rows), maximumMachinePrices([...rows].reverse()));
});
test('NULL/zero/negative/NaN/formatted/OCR prices never become offers', () => {
  for (const price of [null, 0, '0', '-1', 'NaN', '159 476', '159O76']) {
    const r = maximumMachinePrices([row('x', price)]);
    assert.equal(r.offers.length, 0);
    assert.equal(r.complete, false);
  }
});
test('unverified source prevents false partial maximum', () => {
  const r = maximumMachinePrices([row('verified', '100'), row('ocr', '999', { readingVerified: false })]);
  assert.equal(r.offers.length, 0);
  assert.ok(r.review[0].reasons.includes('SOURCE_READING_UNVERIFIED'));
});
test('VAT/currency/unit mismatch not silently mixed', () => {
  for (const patch of [{ vat: 'INCLUDED' }, { currency: 'USD' }, { unit: 'шт' }]) {
    const r = maximumMachinePrices([row('a', '100'), row('b', '999', patch)]);
    assert.equal(r.offers.length, 0);
    assert.ok(r.review[0].reasons.includes('PRICE_BASIS_UNRESOLVED'));
  }
});
test('source SHA/page/date required, invalid calendar date rejected', () => {
  for (const patch of [{ sourceSha256: '' }, { page: 0 }, { sourceDate: '2025-02-30' }])
    assert.equal(maximumMachinePrices([row('a', '100', patch)]).offers.length, 0);
});
test('missing names review, duplicate source keys fail closed', () => {
  assert.equal(maximumMachinePrices([row('a', '100', { name: '' })]).review.length, 1);
  assert.throws(() => maximumMachinePrices([row('a', '100'), row('a', '101')]), /SOURCE_KEY/);
});
test('10k source observations produce bounded one-per-machine output', () => {
  const rows = Array.from({ length: 10000 }, (_, i) => row(String(i), String(i + 1), { name: `Модель ${i % 1000}` }));
  assert.equal(maximumMachinePrices(rows).offers.length, 1000);
});
