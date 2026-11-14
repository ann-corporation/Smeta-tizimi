/**
 * TEST YORDAMCHISI: xlsx formulalarini JS bilan qayta hisoblab, keshlangan qiymat (`v`) bilan solishtiradi (LibreOffice yo'q muhit).
 * Qo'llab-quvvatlanadi: + − * /, taqqoslash, SUM, ROUND, IF, OR, AND, SUMIF, SUMIFS, varaqlararo havola ('Nom'!A1), diapazon.
 * Faqat testlarda ishlatiladi (ishlab chiqarish kodida import qilinmaydi).
 */
import { hujjatTekshir } from './tekshir';

type Val = number | string | null;
type Tok = { t: 'num' | 'str' | 'ref' | 'fn' | 'op'; s: string };

const colN = (c: string) => c.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);

function tokenla(f: string): Tok[] {
  const out: Tok[] = [];
  const re = /\s*(?:("(?:[^"]|"")*")|((?:'[^']+'!)?\$?[A-Z]{1,3}\$?\d+(?::\$?[A-Z]{1,3}\$?\d+)?)|([A-Z][A-Z0-9.]*)(?=\()|(\d+(?:\.\d+)?(?:E[+-]?\d+)?)|(<>|<=|>=|[-+*/(),=<>]))/gy;
  let m: RegExpExecArray | null;
  let pos = 0;
  while (pos < f.length && (m = re.exec(f))) {
    pos = re.lastIndex;
    if (m[1] != null) out.push({ t: 'str', s: m[1].slice(1, -1).replace(/""/g, '"') });
    else if (m[2] != null) out.push({ t: 'ref', s: m[2] });
    else if (m[3] != null) out.push({ t: 'fn', s: m[3] });
    else if (m[4] != null) out.push({ t: 'num', s: m[4] });
    else out.push({ t: 'op', s: m[5] });
  }
  if (f.slice(pos).trim()) throw new Error(`FORMULA_TOKEN: ${f.slice(pos)}`);
  return out;
}

export type FormulaNatija = { soni: number; xato: string[]; farq: string[] };

/** Barcha formulalarni qayta hisoblaydi; xato (parse/#DIV) va keshdan farq (>0.005) ro'yxati qaytadi. */
export function formulalarniQaytaHisobla(bytes: Uint8Array): FormulaNatija {
  const t = hujjatTekshir(bytes);
  const sheets = new Map<string, Map<string, { f: string | null; v: Val }>>();
  for (const v of t.varaqlar) {
    const m = new Map<string, { f: string | null; v: Val }>();
    for (const k of v.kataklar) {
      const xom = k.matn != null ? k.matn : k.v;
      const son = k.matn == null && xom != null && xom !== '' && !Number.isNaN(Number(xom));
      m.set(k.ref, { f: k.f ?? null, v: son ? Number(xom) : (xom as Val) });
    }
    sheets.set(v.nom, m);
  }
  const memo = new Map<string, Val>();
  const stack = new Set<string>();
  const natija: FormulaNatija = { soni: 0, xato: [], farq: [] };

  const qiymat = (sh: string, ref: string): Val => {
    const key = `${sh}!${ref}`;
    if (memo.has(key)) return memo.get(key)!;
    const c = sheets.get(sh)?.get(ref);
    let r: Val;
    if (!c) r = null;
    else if (c.f == null) r = c.v;
    else {
      if (stack.has(key)) throw new Error(`CIRCULAR ${key}`);
      stack.add(key);
      try { r = hisobla(sh, c.f); } finally { stack.delete(key); }
    }
    memo.set(key, r);
    return r;
  };
  const rangeCells = (sh0: string, s: string): Array<[string, string]> => {
    const mm = /^(?:'([^']+)'!)?\$?([A-Z]{1,3})\$?(\d+)(?::\$?([A-Z]{1,3})\$?(\d+))?$/.exec(s)!;
    const sh = mm[1] ?? sh0;
    const c1 = colN(mm[2]), r1 = Number(mm[3]), c2 = mm[4] ? colN(mm[4]) : c1, r2 = mm[5] ? Number(mm[5]) : r1;
    const out: Array<[string, string]> = [];
    for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
      let n = c, col = ''; while (n > 0) { const k = (n - 1) % 26; col = String.fromCharCode(65 + k) + col; n = Math.floor((n - 1) / 26); }
      out.push([sh, `${col}${r}`]);
    }
    return out;
  };

  function hisobla(sh: string, f: string): Val {
    const tk = tokenla(f.replace(/^=/, ''));
    let i = 0;
    const peek = () => tk[i];
    const num = (x: Val): number => (x == null || x === '' ? 0 : typeof x === 'number' ? x : Number(x));
    const eq = (a: Val, b: Val) => ((a == null || a === '') && (b == null || b === '')) || (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-9 : String(a ?? '') === String(b ?? ''));
    type Node = () => Val | Array<[string, string]>;
    const val = (x: Val | Array<[string, string]>): Val => (Array.isArray(x) ? qiymat(x[0][0], x[0][1]) : x);
    function expr(): Node {
      let l = add();
      for (let o = peek(); o && o.t === 'op' && ['=', '<>', '<', '>', '<=', '>='].includes(o.s); o = peek()) {
        i++; const L = l, R = add(), op = o.s;
        l = () => { const a = val(L()), b = val(R()); return op === '=' ? (eq(a, b) ? 1 : 0) : op === '<>' ? (eq(a, b) ? 0 : 1) : op === '<' ? (num(a) < num(b) ? 1 : 0) : op === '>' ? (num(a) > num(b) ? 1 : 0) : op === '<=' ? (num(a) <= num(b) ? 1 : 0) : (num(a) >= num(b) ? 1 : 0); };
      }
      return l;
    }
    function add(): Node {
      let l = mul();
      for (let o = peek(); o && o.t === 'op' && (o.s === '+' || o.s === '-'); o = peek()) {
        i++; const L = l, R = mul(), s = o.s;
        l = () => (s === '+' ? num(val(L())) + num(val(R())) : num(val(L())) - num(val(R())));
      }
      return l;
    }
    function mul(): Node {
      let l = un();
      for (let o = peek(); o && o.t === 'op' && (o.s === '*' || o.s === '/'); o = peek()) {
        i++; const L = l, R = un(), s = o.s;
        l = () => { const a = num(val(L())), b = num(val(R())); if (s === '/' && b === 0) throw new Error('#DIV/0!'); return s === '*' ? a * b : a / b; };
      }
      return l;
    }
    function un(): Node {
      const o = peek();
      if (o && o.t === 'op' && o.s === '-') { i++; const x = un(); return () => -num(val(x())); }
      if (o && o.t === 'op' && o.s === '+') { i++; return un(); }
      return atom();
    }
    function atom(): Node {
      const o = tk[i++];
      if (!o) throw new Error('FORMULA_OXIRI');
      if (o.t === 'num') return () => Number(o.s);
      if (o.t === 'str') return () => o.s;
      if (o.t === 'ref') { const cells = rangeCells(sh, o.s); return () => (cells.length === 1 && !o.s.includes(':') ? qiymat(cells[0][0], cells[0][1]) : cells); }
      if (o.t === 'op' && o.s === '(') { const e = expr(); i++; return e; }
      if (o.t === 'fn') {
        i++; // (
        const args: Node[] = [];
        if (!(peek().t === 'op' && peek().s === ')')) { args.push(expr()); while (peek().t === 'op' && peek().s === ',') { i++; args.push(expr()); } }
        i++; // )
        const vals = (a: Node): Val[] => { const x = a(); return Array.isArray(x) ? x.map(([s, r]) => qiymat(s, r)) : [x]; };
        const crit = (c: Val) => (x: Val) => (typeof c === 'number' ? typeof x === 'number' && Math.abs(x - c) < 1e-9 : String(x ?? '') === String(c ?? ''));
        switch (o.s) {
          case 'SUM': return () => args.reduce((s, a) => s + vals(a).reduce<number>((t2, x) => t2 + (typeof x === 'number' ? x : 0), 0), 0);
          case 'ROUND': return () => { const n = num(val(args[0]())), d = num(val(args[1]())); const k = 10 ** d; return Math.round((n + Math.sign(n) * 1e-12) * k) / k; };
          case 'IF': return () => { const c = val(args[0]()); return (typeof c === 'number' ? c !== 0 : c !== '' && c != null) ? val(args[1]()) : args[2] ? val(args[2]()) : 0; };
          case 'OR': return () => (args.some((a) => { const x = val(a()); return typeof x === 'number' ? x !== 0 : false; }) ? 1 : 0);
          case 'AND': return () => (args.every((a) => { const x = val(a()); return typeof x === 'number' ? x !== 0 : false; }) ? 1 : 0);
          case 'SUMIF': return () => { const r = vals(args[0]), c = crit(val(args[1]())), s = args[2] ? vals(args[2]) : r; return r.reduce<number>((t2, x, k) => t2 + (c(x) && typeof s[k] === 'number' ? (s[k] as number) : 0), 0); };
          case 'SUMIFS': return () => { const s = vals(args[0]); const pairs: Array<[Val[], (x: Val) => boolean]> = []; for (let k = 1; k + 1 < args.length; k += 2) pairs.push([vals(args[k]), crit(val(args[k + 1]()))]); return s.reduce<number>((t2, x, k) => t2 + (pairs.every(([r, c]) => c(r[k])) && typeof x === 'number' ? x : 0), 0); };
          default: throw new Error(`FUNKSIYA_YOQ ${o.s}`);
        }
      }
      throw new Error(`FORMULA_ATOM ${o.s}`);
    }
    const root = expr();
    if (i < tk.length) throw new Error('FORMULA_ARTIQCHA');
    return val(root());
  }

  for (const [sh, cells] of sheets) {
    for (const [ref, c] of cells) {
      if (c.f == null) continue;
      natija.soni++;
      try {
        const x = qiymat(sh, ref);
        const a = typeof x === 'number' ? x : x === '' || x == null ? 0 : Number(x);
        const b = typeof c.v === 'number' ? c.v : c.v === '' || c.v == null ? 0 : Number(c.v);
        const ikkisiMatn = (typeof x === 'string' && x !== '' && Number.isNaN(Number(x))) || (typeof c.v === 'string' && c.v !== '' && Number.isNaN(Number(c.v)));
        if (ikkisiMatn ? String(x) !== String(c.v) : Math.abs(a - b) > 0.005) natija.farq.push(`${sh}!${ref}: formula=${String(x)} kesh=${String(c.v)} f=${c.f}`);
      } catch (e) { natija.xato.push(`${sh}!${ref}: ${e instanceof Error ? e.message : String(e)} f=${c.f}`); }
    }
  }
  return natija;
}
