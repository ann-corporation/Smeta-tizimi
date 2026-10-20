/** String-only editing grammar. Incomplete drafts ("-", ".", "-.") are intentional. */
export function parseMoneyInput(text: string, strictGrouping = true): string | null {
  const normalized = text.replace(/[\u00a0\u202f]/g, ' ');
  if (/[^\d .,-]/.test(normalized)) return null;
  if (!/^-?[\d ]*(?:[.,]\d*)?$/.test(normalized)) return null;
  const integral = normalized.split(/[.,]/)[0].replace(/^-/, '');
  if (strictGrouping && integral.includes(' ') && !/^\d{1,3}(?: \d{3})+$/.test(integral)) return null;
  return normalized.replace(/ /g, '').replace(',', '.');
}

export function formatMoneyInput(raw: string, grouping = true): string {
  if (!grouping) return raw;
  const [integer, fraction] = raw.split('.');
  return integer.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (fraction === undefined ? '' : `.${fraction}`);
}

/** Expand the number's existing decimal representation; never round a decimal string. */
export function moneyValueToRaw(value: string | number | null | undefined): string {
  if (value == null) return '';
  if (typeof value === 'string') {
    const raw = parseMoneyInput(value);
    if (raw === null) throw new TypeError('Invalid MoneyInput value');
    return raw;
  }
  if (!Number.isFinite(value)) throw new TypeError('MoneyInput requires a finite number');
  return expandScientific(String(value));
}

function expandScientific(text: string): string {
  if (!/[eE]/.test(text)) return text;
  const [mantissa, exponent] = text.split(/[eE]/);
  const negative = mantissa.startsWith('-');
  const unsigned = negative ? mantissa.slice(1) : mantissa;
  const point = (unsigned.indexOf('.') < 0 ? unsigned.length : unsigned.indexOf('.')) + Number(exponent);
  const digits = unsigned.replace('.', '');
  const expanded = point <= 0 ? `0.${'0'.repeat(-point)}${digits}`
    : point >= digits.length ? digits + '0'.repeat(point - digits.length)
      : `${digits.slice(0, point)}.${digits.slice(point)}`;
  return (negative ? '-' : '') + expanded;
}

export function rawOffset(display: string, offset: number): number {
  return display.slice(0, offset).replace(/[ \u00a0\u202f]/g, '').length;
}

export function displayOffset(display: string, offset: number): number {
  if (offset === 0) return 0;
  let seen = 0;
  for (let i = 0; i < display.length; i++) {
    if (display[i] !== ' ') seen++;
    if (seen === offset) return i + 1;
  }
  return display.length;
}

/** Only newly inserted spaces need strict grouping; existing display spaces move during editing. */
export function parseMoneyEdit(previous: string, next: string): string | null {
  let start = 0;
  while (start < previous.length && previous[start] === next[start]) start++;
  let oldEnd = previous.length;
  let newEnd = next.length;
  while (oldEnd > start && newEnd > start && previous[oldEnd - 1] === next[newEnd - 1]) {
    oldEnd--; newEnd--;
  }
  return parseMoneyInput(next, /[ \u00a0\u202f]/.test(next.slice(start, newEnd)));
}

export function isCompleteMoney(raw: string): boolean {
  return !/[^\d.-]/.test(raw) && /^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw);
}

/** Validate only money fields belonging to this editor/row, never the global document. */
export function reportMoneyValidity(root: ParentNode | null | undefined): boolean {
  if (!root) return false;
  const fields = root.querySelectorAll<HTMLInputElement>('input[data-money-input]');
  for (const field of fields) {
    if (!field.reportValidity()) return false;
  }
  return true;
}

function decimalParts(raw: string) {
  const [whole, fraction = ''] = raw.replace(/^-/, '').split('.');
  return { units: BigInt((raw.startsWith('-') ? '-' : '') + ((whole || '0') + fraction)), scale: fraction.length };
}

function align(a: string, b: string): [bigint, bigint] {
  const left = decimalParts(a); const right = decimalParts(b);
  const scale = Math.max(left.scale, right.scale);
  return [left.units * 10n ** BigInt(scale - left.scale), right.units * 10n ** BigInt(scale - right.scale)];
}

export function sameMoney(a: string, b: string): boolean {
  if (!isCompleteMoney(a) || !isCompleteMoney(b)) return false;
  const [left, right] = align(a, b);
  return left === right;
}

/** Exact equivalent of number-input constraints; custom validity exposes the result. */
export function moneyConstraint(raw: string, min?: string | number, max?: string | number,
  step?: string | number, defaultValue?: string | number | null): 'draft' | 'min' | 'max' | 'step' | null {
  if (raw === '') return null; // required is handled natively
  if (!isCompleteMoney(raw)) return 'draft';
  const bound = (v: string | number | null | undefined) => {
    if (v == null) return null;
    try {
      // Native numeric attributes commonly use step="1e-2". Expand the spelling,
      // not its floating-point value, before comparing exact decimal integers.
      const scientific = typeof v === 'string' && /^-?(?:\d+(?:\.\d*)?|\.\d+)[eE][+-]?\d+$/.test(v);
      if (scientific && Math.abs(Number(v.split(/[eE]/)[1])) > 1000) return null;
      const text = scientific ? expandScientific(v) : moneyValueToRaw(v);
      return isCompleteMoney(text) ? text : null;
    } catch { return null; }
  };
  const lower = bound(min); const upper = bound(max);
  if (lower !== null) { const [a, b] = align(raw, lower); if (a < b) return 'min'; }
  if (upper !== null) { const [a, b] = align(raw, upper); if (a > b) return 'max'; }
  if (step === undefined || step === 'any') return null;
  const stride = bound(step);
  const actualStep = stride && decimalParts(stride).units > 0n ? stride : '1';
  const base = lower ?? bound(defaultValue) ?? '0';
  const entries = [raw, base, actualStep].map(decimalParts);
  const scale = Math.max(...entries.map(entry => entry.scale));
  const [amount, origin, increment] = entries.map(entry => entry.units * 10n ** BigInt(scale - entry.scale));
  return (amount - origin) % increment === 0n ? null : 'step';
}
