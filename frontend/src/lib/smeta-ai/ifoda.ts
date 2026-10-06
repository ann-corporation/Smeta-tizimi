/**
 * Safe quantity formula evaluator for the estimator AI: "12*0,6*0,1", "(6+4)×2×0.5", "3 x 4 x 0.2".
 * Only numbers, + − × ÷ and parentheses — no identifiers, no eval. Exact decimal arithmetic (BigInt
 * fractions) so 0.1+0.2 = 0.3; result rounded half-up to 6 places as a canonical decimal string.
 * The model proposes a formula from the user's own dimensions; the CODE computes the number.
 */
type Frac = { n: bigint; d: bigint };
const gcd = (a: bigint, b: bigint): bigint => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a || 1n; };
const norm = (f: Frac): Frac => { if (f.d === 0n) throw new Error('IFODA_NOLGA_BOLISH'); const s = f.d < 0n ? -1n : 1n; const g = gcd(f.n, f.d); return { n: s * f.n / g, d: s * f.d / g }; };
const add = (a: Frac, b: Frac) => norm({ n: a.n * b.d + b.n * a.d, d: a.d * b.d });
const sub = (a: Frac, b: Frac) => norm({ n: a.n * b.d - b.n * a.d, d: a.d * b.d });
const mul = (a: Frac, b: Frac) => norm({ n: a.n * b.n, d: a.d * b.d });
const div = (a: Frac, b: Frac) => norm({ n: a.n * b.d, d: a.d * b.n });

function parseNumber(t: string): Frac {
  const [i, f = ''] = t.replace(',', '.').split('.');
  return norm({ n: BigInt((i || '0') + f), d: 10n ** BigInt(f.length) });
}

/** Tokenise; spaces between digits ("1 250") are thousand separators only when grouped by 3. */
function tokens(src: string): string[] {
  const s = src.replace(/(\d)\s+(?=\d{3}(?!\d))/g, '$1').replace(/[×xхХX*]/g, '*').replace(/[÷:/]/g, '/').replace(/[−–—]/g, '-');
  const out: string[] = [];
  const re = /\s*(\d+(?:[.,]\d+)?|[-+*/()])/y;
  let m: RegExpExecArray | null;
  let pos = 0;
  while (pos < s.length) {
    re.lastIndex = pos;
    if (/^\s*$/.test(s.slice(pos))) break;
    m = re.exec(s);
    if (!m) throw new Error('IFODA_NOTOGRI');
    out.push(m[1]); pos = re.lastIndex;
  }
  return out;
}

export function ifodaHisobla(src: string): { qiymat: string; ifoda: string } {
  if (typeof src !== 'string' || !src.trim() || src.length > 300) throw new Error('IFODA_NOTOGRI');
  const t = tokens(src);
  let i = 0;
  const peek = () => t[i];
  const expr = (): Frac => { let v = term(); while (peek() === '+' || peek() === '-') { const op = t[i++]; const r = term(); v = op === '+' ? add(v, r) : sub(v, r); } return v; };
  const term = (): Frac => { let v = factor(); while (peek() === '*' || peek() === '/') { const op = t[i++]; const r = factor(); v = op === '*' ? mul(v, r) : div(v, r); } return v; };
  const factor = (): Frac => {
    const x = t[i++];
    if (x === '(') { const v = expr(); if (t[i++] !== ')') throw new Error('IFODA_NOTOGRI'); return v; }
    if (x === '-') return sub({ n: 0n, d: 1n }, factor());
    if (x != null && /^\d/.test(x)) return parseNumber(x);
    throw new Error('IFODA_NOTOGRI');
  };
  const v = expr();
  if (i !== t.length) throw new Error('IFODA_NOTOGRI');
  if (v.n < 0n) throw new Error('IFODA_MANFIY');
  // Round half-up to 6 decimals.
  const scaled = (v.n * 1_000_000n * 2n + v.d) / (2n * v.d);
  const str = scaled.toString().padStart(7, '0');
  const qiymat = (str.slice(0, -6) + '.' + str.slice(-6)).replace(/\.?0+$/, '') || '0';
  return { qiymat, ifoda: t.join(' ').replace(/\*/g, '×') };
}
