/**
 * Yengil Excel-uslubidagi son formulasi (Fakt hajm katagi uchun). `eval`/`Function` yo‘q: faqat
 * sonlar, + - * / ( ) va ruxsat etilgan kontekst nomlari (masalan SMETA, FAKT, QOLDIQ, F2_MUMKIN).
 * Funksiya chaqiruvi yo‘q. Faqat matnni songa aylantiradi — hisob-kitob qoidalariga tegmaydi.
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
const bad = (error: FormulaError): FormulaResult => ({ ok: false, error, formula: true });
const good = (value: number): FormulaResult => (Number.isFinite(value) ? { ok: true, value, formula: true } : bad('INVALID_NUMBER'));

type Token = { kind: 'number' | 'name' | 'op' | 'lparen' | 'rparen' | 'end'; text: string };
function tokens(source: string): Token[] | 'TOO_COMPLEX' | null {
  const result: Token[] = []; let i = 0;
  while (i < source.length) {
    const char = source[i];
    if (/\s/.test(char)) { i++; continue; }
    const slice = source.slice(i);
    const n = /^(?:\d+(?:[.,]\d+)?|[.,]\d+)/.exec(slice);
    if (n) { result.push({ kind: 'number', text: n[0] }); i += n[0].length; continue; }
    const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(slice);
    if (name) { result.push({ kind: 'name', text: name[0] }); i += name[0].length; continue; }
    if ('+-*/'.includes(char)) { result.push({ kind: 'op', text: char }); i++; continue; }
    if (char === '(') { result.push({ kind: 'lparen', text: char }); i++; continue; }
    if (char === ')') { result.push({ kind: 'rparen', text: char }); i++; continue; }
    return null;
  }
  return result.length > MAX_TOKENS ? 'TOO_COMPLEX' : [...result, { kind: 'end', text: '' }];
}

class Parser {
  private at = 0;
  private depth = 0;
  private readonly names = new Map<string, number | null | undefined>();
  private readonly all: Token[];
  constructor(all: Token[], context: FormulaContext) {
    this.all = all;
    for (const key of Object.keys(context)) this.names.set(key.toUpperCase(), context[key]);
  }
  private get token() { return this.all[this.at]; }
  private take(kind?: Token['kind'], text?: string): Token | null { const t = this.token; if ((kind && t.kind !== kind) || (text && t.text !== text)) return null; this.at++; return t; }
  read(): FormulaResult {
    const value = this.expression();
    return value.ok && this.token.kind !== 'end' ? bad('SYNTAX') : value;
  }
  private expression(): FormulaResult {
    let left = this.term();
    while (left.ok && this.token.kind === 'op' && (this.token.text === '+' || this.token.text === '-')) {
      const op = this.take('op')!.text; const right = this.term(); if (!right.ok) return right;
      left = good(op === '+' ? left.value + right.value : left.value - right.value);
    }
    return left;
  }
  private term(): FormulaResult {
    let left = this.factor();
    while (left.ok && this.token.kind === 'op' && (this.token.text === '*' || this.token.text === '/')) {
      const op = this.take('op')!.text; const right = this.factor(); if (!right.ok) return right;
      if (op === '/' && right.value === 0) return bad('DIVIDE_BY_ZERO');
      left = good(op === '*' ? left.value * right.value : left.value / right.value);
    }
    return left;
  }
  private factor(): FormulaResult {
    if (this.take('op', '+')) return this.factor();
    if (this.take('op', '-')) { const x = this.factor(); return x.ok ? good(-x.value) : x; }
    const n = this.take('number'); if (n) { const v = number(n.text); return v == null ? bad('INVALID_NUMBER') : good(v); }
    const name = this.take('name');
    if (name) {
      if (this.token.kind === 'lparen') return bad('UNKNOWN_NAME'); // funksiya chaqiruvi yo‘q
      const key = name.text.toUpperCase();
      if (!this.names.has(key)) return bad('UNKNOWN_NAME');
      const v = this.names.get(key);
      if (v == null || !Number.isFinite(Number(v))) return bad('MISSING_VALUE');
      return good(Number(v));
    }
    if (this.take('lparen')) {
      if (++this.depth > 24) return bad('TOO_COMPLEX');
      const x = this.expression(); this.depth--;
      if (!x.ok) return x;
      return !this.take('rparen') ? bad('SYNTAX') : x;
    }
    return bad('SYNTAX');
  }
}

/** Matn `=` bilan boshlansa — formula (kontekst nomlari bilan); aks holda oddiy son. Bo‘sh matn — INVALID_NUMBER (chaqiruvchi NULL deb biladi). */
export function numberFormula(source: string, context: FormulaContext = {}): FormulaResult {
  const text = source.trim();
  if (!text) return { ok: false, error: 'INVALID_NUMBER', formula: false };
  if (!text.startsWith('=')) { const value = number(text); return value == null ? { ok: false, error: 'INVALID_NUMBER', formula: false } : { ok: true, value, formula: false }; }
  const all = tokens(text.slice(1));
  if (all === 'TOO_COMPLEX') return bad('TOO_COMPLEX');
  return all ? new Parser(all, context).read() : bad('SYNTAX');
}

/** Kiritma formulami (`=` bilan boshlanadimi)? */
export const formulaMi = (source: string): boolean => source.trim().startsWith('=');

/** Katak ostida ko‘rsatiladigan xato matnlari (uz — `t()` orqali tarjima qilinadi). */
export const FORMULA_ERROR_UZ: Record<FormulaError, string> = {
  SYNTAX: 'Formula yozilishi noto‘g‘ri', UNKNOWN_NAME: 'Noma’lum nom (SMETA, FAKT, QOLDIQ, F2_MUMKIN)', MISSING_VALUE: 'Formula uchun kerakli qiymat noma’lum',
  DIVIDE_BY_ZERO: '0 ga bo‘lish mumkin emas', INVALID_NUMBER: 'Son yoki formula kiriting', TOO_COMPLEX: 'Formula juda murakkab',
};
