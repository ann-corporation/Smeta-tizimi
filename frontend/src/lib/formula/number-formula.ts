/**
 * Yengil Excel-uslubidagi son formulasi. `eval` yo‘q: faqat sonlar,
 * ruxsat etilgan kontekst nomlari va oq ro‘yxatdagi funksiyalar ishlaydi.
 */
export type FormulaError = 'SYNTAX' | 'UNKNOWN_NAME' | 'MISSING_VALUE' | 'DIVIDE_BY_ZERO' | 'INVALID_NUMBER' | 'TOO_COMPLEX';
export type FormulaResult = { ok: true; value: number; formula: boolean } | { ok: false; error: FormulaError; formula: boolean };
export type FormulaContext = Readonly<Record<string, number | null | undefined>>;

const MAX_TOKENS = 160;
const number = (value: string): number | null => {
  const normalized = value.trim().replace(/[\s ]/g, '').replace(',', '.');
  if (!normalized) return null;
  const result = Number(normalized);
  return Number.isFinite(result) ? result : null;
};

type Token = { kind: 'number' | 'name' | 'op' | 'lparen' | 'rparen' | 'sep' | 'end'; text: string };
function tokens(source: string): Token[] | null {
  const result: Token[] = []; let i = 0;
  while (i < source.length) {
    const char = source[i];
    if (/\s/.test(char)) { i++; continue; }
    const slice = source.slice(i);
    const n = /^(?:\d+(?:[.,]\d+)?|[.,]\d+)/.exec(slice);
    if (n) { result.push({ kind: 'number', text: n[0] }); i += n[0].length; continue; }
    const name = /^[A-Za-zА-Яа-я_][A-Za-zА-Яа-я0-9_]*/.exec(slice);
    if (name) { result.push({ kind: 'name', text: name[0] }); i += name[0].length; continue; }
    if ('+-*/'.includes(char)) { result.push({ kind: 'op', text: char }); i++; continue; }
    if (char === '(') { result.push({ kind: 'lparen', text: char }); i++; continue; }
    if (char === ')') { result.push({ kind: 'rparen', text: char }); i++; continue; }
    if (char === ';' || char === ',') { result.push({ kind: 'sep', text: char }); i++; continue; }
    return null;
  }
  return result.length > MAX_TOKENS ? null : [...result, { kind: 'end', text: '' }];
}

class Parser {
  private at = 0;
  constructor(private readonly all: Token[], private readonly context: FormulaContext) {}
  private get token() { return this.all[this.at]; }
  private take(kind?: Token['kind'], text?: string): Token | null { const t = this.token; if ((kind && t.kind !== kind) || (text && t.text !== text)) return null; this.at++; return t; }
  read(): FormulaResult {
    const value = this.expression();
    return value.ok && this.token.kind !== 'end' ? { ok: false, error: 'SYNTAX', formula: true } : value;
  }
  private expression(): FormulaResult {
    let left = this.term();
    while (left.ok && this.token.kind === 'op' && (this.token.text === '+' || this.token.text === '-')) {
      const op = this.take('op')!.text; const right = this.term(); if (!right.ok) return right;
      left = { ok: true, value: op === '+' ? left.value + right.value : left.value - right.value, formula: true };
    }
    return left;
  }
  private term(): FormulaResult {
    let left = this.factor();
    while (left.ok && this.token.kind === 'op' && (this.token.text === '*' || this.token.text === '/')) {
      const op = this.take('op')!.text; const right = this.factor(); if (!right.ok) return right;
      if (op === '/' && right.value === 0) return { ok: false, error: 'DIVIDE_BY_ZERO', formula: true };
      left = { ok: true, value: op === '*' ? left.value * right.value : left.value / right.value, formula: true };
    }
    return left;
  }
  private factor(): FormulaResult {
    if (this.take('op', '+')) return this.factor();
    if (this.take('op', '-')) { const x = this.factor(); return x.ok ? { ok: true, value: -x.value, formula: true } : x; }
    const n = this.take('number'); if (n) { const v = number(n.text); return v == null ? { ok: false, error: 'INVALID_NUMBER', formula: true } : { ok: true, value: v, formula: true }; }
    const name = this.take('name');
    if (name) {
      const key = name.text.toUpperCase();
      if (this.take('lparen')) return this.call(key);
      const found = Object.entries(this.context).find(([k]) => k.toUpperCase() === key);
      if (!found) return { ok: false, error: 'UNKNOWN_NAME', formula: true };
      if (found[1] == null || !Number.isFinite(Number(found[1]))) return { ok: false, error: 'MISSING_VALUE', formula: true };
      return { ok: true, value: Number(found[1]), formula: true };
    }
    if (this.take('lparen')) { const x = this.expression(); return !this.take('rparen') ? { ok: false, error: 'SYNTAX', formula: true } : x; }
    return { ok: false, error: 'SYNTAX', formula: true };
  }
  private call(name: string): FormulaResult {
    const values: number[] = [];
    const empty = this.take('rparen');
    if (!empty) {
      do { const v = this.expression(); if (!v.ok) return v; values.push(v.value); } while (this.take('sep'));
      if (!this.take('rparen')) return { ok: false, error: 'SYNTAX', formula: true };
    }
    if (!['SUM', 'MIN', 'MAX', 'ROUND'].includes(name)) return { ok: false, error: 'UNKNOWN_NAME', formula: true };
    if (!values.length) return { ok: false, error: 'SYNTAX', formula: true };
    if (name === 'SUM') return { ok: true, value: values.reduce((a, b) => a + b, 0), formula: true };
    if (name === 'MIN') return { ok: true, value: Math.min(...values), formula: true };
    if (name === 'MAX') return { ok: true, value: Math.max(...values), formula: true };
    if (name === 'ROUND' && (values.length === 1 || values.length === 2) && Number.isInteger(values[1] ?? 0) && Math.abs(values[1] ?? 0) <= 12) {
      const multiplier = 10 ** (values[1] ?? 0); return { ok: true, value: Math.round((values[0] + Number.EPSILON) * multiplier) / multiplier, formula: true };
    }
    return { ok: false, error: 'UNKNOWN_NAME', formula: true };
  }
}

export function numberFormula(source: string, context: FormulaContext = {}): FormulaResult {
  const text = source.trim();
  if (!text) return { ok: false, error: 'INVALID_NUMBER', formula: false };
  if (!text.startsWith('=')) { const value = number(text); return value == null ? { ok: false, error: 'INVALID_NUMBER', formula: false } : { ok: true, value, formula: false }; }
  const all = tokens(text.slice(1));
  return all ? new Parser(all, context).read() : { ok: false, error: 'SYNTAX', formula: true };
}

export const FORMULA_ERROR_UZ: Record<FormulaError, string> = {
  SYNTAX: 'Formula yozilishi noto‘g‘ri', UNKNOWN_NAME: 'Noma’lum nom yoki funksiya', MISSING_VALUE: 'Formula uchun kerakli qiymat noma’lum',
  DIVIDE_BY_ZERO: '0 ga bo‘lish mumkin emas', INVALID_NUMBER: 'Son yoki formula kiriting', TOO_COMPLEX: 'Formula juda murakkab',
};
