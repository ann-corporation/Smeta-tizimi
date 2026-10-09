/**
 * Excel formulasini XAVFSIZ o'qish va bajarish (eval yo'q) — hujjatni o'zi tushunadigan tizimning yadrosi
 * (egasi talabi 2026-10-08/09: "smetani o'zi tashlangandan tushunib, summalarga ta'sir qiladigan har bir foizni
 * tushuna oladigan"; "hujjatni ideal tushunib, ideal xatosiz ishlaydigan tizim").
 *
 * Qo'llab-quvvatlanadi: sonlar, `6%`, katak (`G13`, `$G$13`, `'RES'!G13`), oraliq (`G16:G60`), + - * / ^, unar minus,
 * qavslar, SUM/ROUND/ROUNDUP/ROUNDDOWN/ABS/MIN/MAX/IF, taqqoslash (= <> < > <= >=), matn ("..."). Boshqasi —
 * `QOLLAB_BOLMAYDI` (taxmin qilinmaydi). Bo'sh katak arifmetikada 0 (Excel qoidasi), SUM uni o'tkazib yuboradi.
 */

export type Ref = { varaq: string | null; r: number; c: number };
export type Tugun =
  | { t: 'son'; v: number }
  | { t: 'matn'; v: string }
  | { t: 'ref'; ref: Ref }
  | { t: 'oraliq'; a: Ref; b: Ref }
  | { t: 'unar'; op: '-' | '+'; x: Tugun }
  | { t: 'foiz'; x: Tugun }
  | { t: 'ikki'; op: string; a: Tugun; b: Tugun }
  | { t: 'fn'; nom: string; args: Tugun[] };

export class FormulaXato extends Error {
  readonly kod: 'SINTAKSIS' | 'QOLLAB_BOLMAYDI';
  constructor(kod: 'SINTAKSIS' | 'QOLLAB_BOLMAYDI', msg: string) { super(msg); this.kod = kod; }
}

const ustunRaqam = (s: string) => [...s].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

type Tok = { k: 'son' | 'matn' | 'ref' | 'id' | 'op' | '(' | ')' | ',' | ':' | '%'; v: string };

function tokenla(f: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const s = f.trim().replace(/^=/, '');
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '"') {
      let j = i + 1, v = '';
      while (j < s.length) { if (s[j] === '"') { if (s[j + 1] === '"') { v += '"'; j += 2; continue; } break; } v += s[j++]; }
      out.push({ k: 'matn', v }); i = j + 1; continue;
    }
    if (ch === "'") { // 'Varaq nomi'!A1
      const j = s.indexOf("'!", i + 1);
      if (j < 0) throw new FormulaXato('SINTAKSIS', `varaq nomi yopilmagan: ${s}`);
      const m = s.slice(j + 2).match(/^\$?([A-Z]{1,3})\$?(\d+)/);
      if (!m) throw new FormulaXato('SINTAKSIS', `varaq havolasi: ${s}`);
      out.push({ k: 'ref', v: `${s.slice(i + 1, j).replace(/''/g, "'")}!${m[1]}${m[2]}` }); i = j + 2 + m[0].length; continue;
    }
    const num = s.slice(i).match(/^(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?/);
    if (num) { out.push({ k: 'son', v: num[0] }); i += num[0].length; continue; }
    const id = s.slice(i).match(/^([A-Za-z_][A-Za-z0-9_.]*)(!)?/);
    const ref = s.slice(i).match(/^(?:([A-Za-z_][A-Za-z0-9_]*)!)?\$?([A-Z]{1,3})\$?(\d+)(?![A-Za-z0-9_(])/);
    if (ref) { out.push({ k: 'ref', v: ref[1] ? `${ref[1]}!${ref[2]}${ref[3]}` : `${ref[2]}${ref[3]}` }); i += ref[0].length; continue; }
    if (id) { out.push({ k: 'id', v: id[1].toUpperCase() }); i += id[1].length; continue; }
    const two = s.slice(i, i + 2);
    if (two === '<=' || two === '>=' || two === '<>') { out.push({ k: 'op', v: two }); i += 2; continue; }
    if ('+-*/^&=<>'.includes(ch)) { out.push({ k: 'op', v: ch }); i++; continue; }
    if (ch === '(' || ch === ')' || ch === ',' || ch === ':' || ch === '%') { out.push({ k: ch, v: ch }); i++; continue; }
    if (ch === ';') { out.push({ k: ',', v: ',' }); i++; continue; } // ru-lokal ajratuvchi
    throw new FormulaXato('SINTAKSIS', `noma'lum belgi '${ch}' — ${s}`);
  }
  return out;
}

function refOqi(v: string): Ref {
  const bang = v.lastIndexOf('!');
  const varaq = bang >= 0 ? v.slice(0, bang) : null;
  const m = v.slice(bang + 1).match(/^([A-Z]{1,3})(\d+)$/)!;
  return { varaq, r: Number(m[2]) - 1, c: ustunRaqam(m[1]) };
}

const USTUVOR: Record<string, number> = { '=': 1, '<>': 1, '<': 1, '>': 1, '<=': 1, '>=': 1, '&': 2, '+': 3, '-': 3, '*': 4, '/': 4, '^': 5 };

export function formulaniOqi(f: string): Tugun {
  const t = tokenla(f);
  let p = 0;
  const kut = (k: Tok['k']) => { if (t[p]?.k !== k) throw new FormulaXato('SINTAKSIS', `'${k}' kutilgan — ${f}`); p++; };
  const asosiy = (): Tugun => {
    const x = t[p++];
    if (!x) throw new FormulaXato('SINTAKSIS', `formula to'liq emas — ${f}`);
    if (x.k === 'son') return { t: 'son', v: Number(x.v) };
    if (x.k === 'matn') return { t: 'matn', v: x.v };
    if (x.k === 'op' && (x.v === '-' || x.v === '+')) return { t: 'unar', op: x.v, x: postfiks(asosiy()) };
    if (x.k === '(') { const e = ifoda(0); kut(')'); return e; }
    if (x.k === 'ref') {
      const a = refOqi(x.v);
      if (t[p]?.k === ':' && t[p + 1]?.k === 'ref') { p++; const b = refOqi(t[p++].v); return { t: 'oraliq', a, b: { ...b, varaq: b.varaq ?? a.varaq } }; }
      return { t: 'ref', ref: a };
    }
    if (x.k === 'id') {
      if (t[p]?.k !== '(') {
        if (x.v === 'TRUE' || x.v === 'FALSE') return { t: 'son', v: x.v === 'TRUE' ? 1 : 0 };
        throw new FormulaXato('QOLLAB_BOLMAYDI', `nomlangan diapazon/nom: ${x.v}`);
      }
      p++;
      const args: Tugun[] = [];
      if (t[p]?.k !== ')') { for (;;) { args.push(ifoda(0)); if (t[p]?.k === ',') { p++; continue; } break; } }
      kut(')');
      return { t: 'fn', nom: x.v, args };
    }
    throw new FormulaXato('SINTAKSIS', `kutilmagan '${x.v}' — ${f}`);
  };
  const postfiks = (e: Tugun): Tugun => { while (t[p]?.k === '%') { p++; e = { t: 'foiz', x: e }; } return e; };
  const ifoda = (min: number): Tugun => {
    let chap = postfiks(asosiy());
    for (;;) {
      const op = t[p];
      if (!op || op.k !== 'op') break;
      const u = USTUVOR[op.v];
      if (u == null || u < min) break;
      p++;
      const ong = ifoda(op.v === '^' ? u : u + 1);
      chap = { t: 'ikki', op: op.v, a: chap, b: ong };
    }
    return chap;
  };
  const e = ifoda(0);
  if (p !== t.length) throw new FormulaXato('SINTAKSIS', `ortiqcha belgilar — ${f}`);
  return e;
}

export type Qiymat = number | string | null;
/** Katak qiymati (hujjatda saqlangan), formula bo'lsa ham — keshlangan natija. */
export type Oqish = (ref: Ref) => Qiymat;

const songa = (v: Qiymat): number => (v == null || v === '' ? 0 : typeof v === 'number' ? v : Number.isFinite(Number(v)) ? Number(v) : NaN);
const yaxlit = (x: number, n: number) => { const k = 10 ** n; return Math.round(x * k + Math.sign(x) * 1e-9) / k; };

/** Excel mezoni (SUMIF/COUNTIF): 1, "rs", ">0", "<>", "", "=x", "ab*" (wildcard). Matn registrga befarq. */
export function mezon(c: Qiymat): (x: Qiymat) => boolean {
  if (typeof c === 'number') return (x) => (typeof x === 'number' ? x === c : typeof x === 'string' && x.trim() !== '' && Number(x) === c);
  const s = String(c ?? '');
  const m = s.match(/^(<=|>=|<>|<|>|=)?([\s\S]*)$/)!;
  const op = m[1] ?? '=', rest = m[2];
  const bosh = (x: Qiymat) => x == null || x === '';
  if (rest === '') return op === '<>' ? (x) => !bosh(x) : (x) => bosh(x);
  const n = Number(rest);
  if (rest.trim() !== '' && Number.isFinite(n)) {
    return (x) => {
      const v = typeof x === 'number' ? x : typeof x === 'string' && x.trim() !== '' && Number.isFinite(Number(x)) ? Number(x) : null;
      if (v == null) return op === '<>';
      return op === '=' ? v === n : op === '<>' ? v !== n : op === '<' ? v < n : op === '>' ? v > n : op === '<=' ? v <= n : v >= n;
    };
  }
  const re = new RegExp(`^${rest.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'i');
  return (x) => { const ok = re.test(String(x ?? '')); return op === '<>' ? !ok : op === '=' ? ok : false; };
}

/** Formulani hujjatdagi kirish qiymatlari bilan bajaradi. Matn arifmetikada — NaN (Excel #VALUE!). */
export function bajar(e: Tugun, oqi: Oqish, joriyVaraq: string): Qiymat {
  const oraliqQiymatlari = (o: Extract<Tugun, { t: 'oraliq' }>): Qiymat[] => {
    const out: Qiymat[] = [];
    const varaq = o.a.varaq ?? joriyVaraq;
    for (let r = Math.min(o.a.r, o.b.r); r <= Math.max(o.a.r, o.b.r); r++)
      for (let c = Math.min(o.a.c, o.b.c); c <= Math.max(o.a.c, o.b.c); c++) out.push(oqi({ varaq, r, c }));
    return out;
  };
  const oraliqni = (a: Tugun): Qiymat[] => {
    if (a.t === 'oraliq') return oraliqQiymatlari(a);
    if (a.t === 'ref') return [oqi({ ...a.ref, varaq: a.ref.varaq ?? joriyVaraq })];
    throw new FormulaXato('QOLLAB_BOLMAYDI', 'mezon oralig‘i katak yoki oraliq bo‘lishi kerak');
  };
  const sonlar = (args: Tugun[]): number[] => args.flatMap((a) => (a.t === 'oraliq'
    ? oraliqQiymatlari(a).filter((v): v is number => typeof v === 'number')
    : [songa(bajar(a, oqi, joriyVaraq))]));
  switch (e.t) {
    case 'son': return e.v;
    case 'matn': return e.v;
    case 'ref': return oqi({ ...e.ref, varaq: e.ref.varaq ?? joriyVaraq });
    case 'oraliq': throw new FormulaXato('QOLLAB_BOLMAYDI', 'oraliq faqat funksiya ichida');
    case 'unar': { const x = songa(bajar(e.x, oqi, joriyVaraq)); return e.op === '-' ? -x : x; }
    case 'foiz': return songa(bajar(e.x, oqi, joriyVaraq)) / 100;
    case 'ikki': {
      const a = bajar(e.a, oqi, joriyVaraq), b = bajar(e.b, oqi, joriyVaraq);
      if (e.op === '&') return `${a ?? ''}${b ?? ''}`;
      if (['=', '<>', '<', '>', '<=', '>='].includes(e.op)) {
        const x = typeof a === 'string' || typeof b === 'string' ? String(a ?? '') : songa(a);
        const y = typeof a === 'string' || typeof b === 'string' ? String(b ?? '') : songa(b);
        const r = e.op === '=' ? x === y : e.op === '<>' ? x !== y : e.op === '<' ? x < y : e.op === '>' ? x > y : e.op === '<=' ? x <= y : x >= y;
        return r ? 1 : 0;
      }
      const x = songa(a), y = songa(b);
      return e.op === '+' ? x + y : e.op === '-' ? x - y : e.op === '*' ? x * y : e.op === '/' ? x / y : x ** y;
    }
    case 'fn': {
      switch (e.nom) {
        case 'SUM': return sonlar(e.args).reduce((s, x) => s + x, 0);
        case 'MIN': { const xs = sonlar(e.args); return xs.length ? Math.min(...xs) : 0; }
        case 'MAX': { const xs = sonlar(e.args); return xs.length ? Math.max(...xs) : 0; }
        case 'ABS': return Math.abs(songa(bajar(e.args[0], oqi, joriyVaraq)));
        case 'ROUND': return yaxlit(songa(bajar(e.args[0], oqi, joriyVaraq)), songa(bajar(e.args[1] ?? { t: 'son', v: 0 }, oqi, joriyVaraq)));
        case 'ROUNDUP': case 'ROUNDDOWN': {
          const x = songa(bajar(e.args[0], oqi, joriyVaraq)), n = songa(bajar(e.args[1] ?? { t: 'son', v: 0 }, oqi, joriyVaraq)), k = 10 ** n;
          const f = e.nom === 'ROUNDUP' ? (x >= 0 ? Math.ceil : Math.floor) : (x >= 0 ? Math.floor : Math.ceil);
          return f(x * k - Math.sign(x) * 1e-9 * (e.nom === 'ROUNDUP' ? 1 : -1)) / k;
        }
        case 'IF': {
          const sh = bajar(e.args[0], oqi, joriyVaraq);
          const rost = typeof sh === 'string' ? sh !== '' : songa(sh) !== 0;
          return rost ? bajar(e.args[1] ?? { t: 'son', v: 0 }, oqi, joriyVaraq) : (e.args[2] ? bajar(e.args[2], oqi, joriyVaraq) : 0);
        }
        case 'OR': case 'AND': {
          const vs = e.args.flatMap((a) => (a.t === 'oraliq' ? oraliqQiymatlari(a).filter((x) => x != null && x !== '') : [bajar(a, oqi, joriyVaraq)]))
            .map((x) => (typeof x === 'string' ? x !== '' : songa(x) !== 0));
          return (e.nom === 'OR' ? vs.some(Boolean) : vs.every(Boolean)) ? 1 : 0;
        }
        case 'NOT': { const x = bajar(e.args[0], oqi, joriyVaraq); return (typeof x === 'string' ? x !== '' : songa(x) !== 0) ? 0 : 1; }
        case 'N': { const x = bajar(e.args[0], oqi, joriyVaraq); return typeof x === 'number' ? x : 0; }
        case 'ISBLANK': { const x = bajar(e.args[0], oqi, joriyVaraq); return x == null ? 1 : 0; }
        case 'IFERROR': {
          let x: Qiymat;
          try { x = bajar(e.args[0], oqi, joriyVaraq); } catch (err) { if (err instanceof FormulaXato) throw err; x = NaN; }
          return typeof x === 'number' && !Number.isFinite(x) ? bajar(e.args[1] ?? { t: 'son', v: 0 }, oqi, joriyVaraq) : x;
        }
        case 'SUMIF': case 'COUNTIF': {
          const shart = oraliqni(e.args[0]);
          const m = mezon(bajar(e.args[1], oqi, joriyVaraq));
          if (e.nom === 'COUNTIF') return shart.filter(m).length;
          const yig = e.args[2] ? oraliqni(e.args[2]) : shart;
          return shart.reduce<number>((s, x, i) => (m(x) && typeof yig[i] === 'number' ? s + (yig[i] as number) : s), 0);
        }
        case 'SUMIFS': case 'COUNTIFS': {
          const bosh = e.nom === 'SUMIFS' ? 1 : 0;
          const juftlar: Array<[Qiymat[], (x: Qiymat) => boolean]> = [];
          for (let i = bosh; i + 1 < e.args.length; i += 2) juftlar.push([oraliqni(e.args[i]), mezon(bajar(e.args[i + 1], oqi, joriyVaraq))]);
          const n = juftlar[0]?.[0].length ?? 0;
          const yig = e.nom === 'SUMIFS' ? oraliqni(e.args[0]) : [];
          let s = 0;
          for (let i = 0; i < n; i++) {
            if (!juftlar.every(([o, m]) => m(o[i]))) continue;
            s += e.nom === 'SUMIFS' ? (typeof yig[i] === 'number' ? (yig[i] as number) : 0) : 1;
          }
          return s;
        }
        default: throw new FormulaXato('QOLLAB_BOLMAYDI', `funksiya ${e.nom}`);
      }
    }
  }
}

/** Formuladagi doimiy foiz ko'paytuvchi (`X*6%`, `X*0.06`, `(a-b)*1.5%`): {foiz, baza}. Bo'lmasa null. */
export function foizKopaytuvchi(e: Tugun): { foiz: number; baza: Tugun } | null {
  if (e.t !== 'ikki' || e.op !== '*') return null;
  const doimiy = (x: Tugun): number | null =>
    x.t === 'foiz' && x.x.t === 'son' ? x.x.v : x.t === 'son' && x.v > 0 && x.v < 1 ? x.v * 100
      : x.t === 'ikki' && x.op === '/' && x.a.t === 'son' && x.b.t === 'son' && x.b.v === 100 ? x.a.v : null;
  const a = doimiy(e.a), b = doimiy(e.b);
  if (b != null && e.a.t !== 'son') return { foiz: b, baza: e.a };
  if (a != null && e.b.t !== 'son') return { foiz: a, baza: e.b };
  return null;
}

/** Ifoda ichidagi barcha katak/oraliq havolalari. */
export function havolalar(e: Tugun, out: Array<Ref | { a: Ref; b: Ref }> = []): Array<Ref | { a: Ref; b: Ref }> {
  switch (e.t) {
    case 'ref': out.push(e.ref); break;
    case 'oraliq': out.push({ a: e.a, b: e.b }); break;
    case 'unar': case 'foiz': havolalar(e.x, out); break;
    case 'ikki': havolalar(e.a, out); havolalar(e.b, out); break;
    case 'fn': e.args.forEach((x) => havolalar(x, out)); break;
  }
  return out;
}
