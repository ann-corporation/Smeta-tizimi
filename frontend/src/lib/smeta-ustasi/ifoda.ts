/**
 * Parametrli hajm formulasi: identifikatorlar (perimetr, maydon...) + son + (+ - * / qavs).
 * 1) `ifodaOlchami` — o'lchov tekshiruvi (m + m2 qo'shilmaydi; natija birlikka mos bo'lishi shart);
 * 2) `ifodaQiymati` — parametrlar sonlarga almashtirilib, mavjud aniq (BigInt kasr) hisoblagich
 *    `smeta-ai/ifoda` bilan hisoblanadi, natija `yaxlit2` bilan yaxlitlanadi. Pul bu yerda yo'q — faqat hajm.
 */
import { yaxlit2 } from '../hisob-yadro';
import { ifodaHisobla } from '../smeta-ai/ifoda';
import type { ParamOlchov } from './turlar';

export const OLCHOV_DARAJA: Record<ParamOlchov, number | null> = { m: 1, m2: 2, m3: 3, dona: 0, matn: null };
/** Hajm formulasi mumkin bo'lgan birliklar (т/кг geometriyadan chiqmaydi — loyiha spetsifikatsiyasi). */
export const BIRLIK_DARAJA: Readonly<Record<string, number>> = { 'м3': 3, 'м2': 2, 'м': 1, 'шт': 0, 'компл': 0 };

const TOKEN = /\s*(\d+(?:[.,]\d+)?|[a-z_][a-z0-9_]*|[-+*/()])/y;

function tokenlar(src: string): string[] {
  if (typeof src !== 'string' || !src.trim() || src.length > 300) throw new Error('IFODA_NOTOGRI');
  const out: string[] = [];
  let pos = 0;
  while (pos < src.length) {
    if (/^\s*$/.test(src.slice(pos))) break;
    TOKEN.lastIndex = pos;
    const m = TOKEN.exec(src);
    if (!m) throw new Error('IFODA_NOTOGRI');
    out.push(m[1]); pos = TOKEN.lastIndex;
  }
  return out;
}

/** Formuladagi parametr nomlari (takrorsiz, tartib bo'yicha). */
export function ifodaParametrlari(src: string): string[] {
  return [...new Set(tokenlar(src).filter(t => /^[a-z_]/.test(t)))];
}

/** O'lcham darajasi: son = 0; * qo'shadi, / ayiradi, + va - bir xil daraja talab qiladi. */
export function ifodaOlchami(src: string, daraja: (param: string) => number | null | undefined): number {
  const t = tokenlar(src);
  let i = 0;
  const bad = () => new Error('IFODA_OLCHAM_MOS_EMAS');
  const expr = (): number => { let v = term(); while (t[i] === '+' || t[i] === '-') { i++; const r = term(); if (r !== v) throw bad(); } return v; };
  const term = (): number => { let v = factor(); while (t[i] === '*' || t[i] === '/') { const op = t[i++]; const r = factor(); v = op === '*' ? v + r : v - r; } return v; };
  const factor = (): number => {
    const x = t[i++];
    if (x === '(') { const v = expr(); if (t[i++] !== ')') throw new Error('IFODA_NOTOGRI'); return v; }
    if (x === '-') return factor();
    if (x != null && /^\d/.test(x)) return 0;
    if (x != null && /^[a-z_]/.test(x)) { const d = daraja(x); if (d == null) throw new Error('IFODA_NOMALUM_PARAMETR'); return d; }
    throw new Error('IFODA_NOTOGRI');
  };
  const v = expr();
  if (i !== t.length) throw new Error('IFODA_NOTOGRI');
  return v;
}

const sonMatni = (v: number): string => {
  if (!Number.isFinite(v)) throw new Error('IFODA_SON_NOTOGRI');
  return v.toFixed(6).replace(/\.?0+$/, '') || '0';
};

/** Parametrlarni sonlarga almashtirgan, `ifodaHisobla` o'qiy oladigan formula (masalan «36*0,5*1,2»). */
export function ifodaSonli(src: string, qiymat: (param: string) => number): string {
  return tokenlar(src).map(t => (/^[a-z_]/.test(t) ? sonMatni(qiymat(t)) : t)).join(' ');
}

/** Hajm: aniq hisob, so'ng `yaxlit2`. Manfiy natija / nolga bo'lish — xato (ifodaHisobla tashlaydi). */
export function ifodaQiymati(src: string, qiymat: (param: string) => number): { hajm: number; sonli: string } {
  const sonli = ifodaSonli(src, qiymat);
  const { qiymat: q } = ifodaHisobla(sonli);
  return { hajm: yaxlit2(Number(q)), sonli };
}
