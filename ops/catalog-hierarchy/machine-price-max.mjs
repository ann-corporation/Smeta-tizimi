/** Source price selection only; never updates estimate or certified F2 prices. */
export const MACHINE_PRICE_POLICY = 'MAX_PER_EXACT_MACHINE';

export function exactMachineKey(name) {
  if (typeof name !== 'string' || !name.trim()) throw new Error('MACHINE_NAME_REQUIRED');
  // Preserve all model/capacity/unit digits. No fuzzy or positional equivalence.
  return name.normalize('NFC').toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/\s+/gu, ' ').trim();
}

function decimal(value) {
  if (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  const digits = BigInt(whole + fraction);
  return digits > 0n ? { digits, scale: fraction.length } : null;
}

function compare(a, b) {
  const scale = Math.max(a.scale, b.scale);
  const left = a.digits * 10n ** BigInt(scale - a.scale);
  const right = b.digits * 10n ** BigInt(scale - b.scale);
  return left < right ? -1 : left > right ? 1 : 0;
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

/**
 * Input rows must carry verified source readings. OCR alone is not verification.
 * One uncertain observation blocks that machine's MAX offer: otherwise a lower
 * partial result could falsely claim to be the maximum of both catalogues.
 * Sources retain evidence internally, not visible competing price variants.
 */
export function maximumMachinePrices(rows) {
  const groups = new Map();
  const review = [];
  const seen = new Set();
  for (const row of rows) {
    if (!row?.sourceKey || seen.has(row.sourceKey)) throw new Error('SOURCE_KEY_MISSING_OR_DUPLICATE');
    seen.add(row.sourceKey);
    if (typeof row.name !== 'string' || !row.name.trim()) {
      review.push({ sourceKeys: [row.sourceKey], reason: 'MACHINE_IDENTITY_UNRESOLVED' });
      continue;
    }
    const key = exactMachineKey(row.name);
    const group = groups.get(key) ?? { key, rows: [], reasons: new Set() };
    group.rows.push(row);
    if (row.readingVerified !== true) group.reasons.add('SOURCE_READING_UNVERIFIED');
    if (!decimal(row.price)) group.reasons.add('PRICE_UNKNOWN_OR_INVALID');
    if (row.unit !== 'маш-ч' || row.currency !== 'UZS' || row.vat !== 'EXCLUDED') group.reasons.add('PRICE_BASIS_UNRESOLVED');
    if (!validDate(row.sourceDate) || !/^[a-f0-9]{64}$/.test(row.sourceSha256 ?? '') || !Number.isInteger(row.page) || row.page < 1) group.reasons.add('SOURCE_PROVENANCE_INCOMPLETE');
    groups.set(key, group);
  }
  const offers = [];
  for (const group of groups.values()) {
    const evidence = [...group.rows].sort((a, b) => a.sourceKey.localeCompare(b.sourceKey));
    if (group.reasons.size) {
      review.push({ machineKey: group.key, sourceKeys: evidence.map(r => r.sourceKey), reasons: [...group.reasons].sort() });
      continue;
    }
    let selected = evidence[0];
    for (const row of evidence.slice(1)) {
      const order = compare(decimal(row.price), decimal(selected.price));
      if (order > 0 || (order === 0 && row.sourceDate > selected.sourceDate)) selected = row;
    }
    offers.push({ machineKey: group.key, name: selected.name, unit: selected.unit,
      price: selected.price, currency: selected.currency, vat: selected.vat,
      policy: MACHINE_PRICE_POLICY, sourceKey: selected.sourceKey,
      sourceDate: selected.sourceDate, sourceSha256: selected.sourceSha256, page: selected.page,
      purpose: 'REFERENCE_OFFER_NOT_CERTIFIED_F2', evidence });
  }
  offers.sort((a, b) => a.machineKey.localeCompare(b.machineKey));
  review.sort((a, b) => (a.machineKey ?? a.sourceKeys[0]).localeCompare(b.machineKey ?? b.sourceKeys[0]));
  return { policy: MACHINE_PRICE_POLICY, offers, review, complete: review.length === 0 };
}
