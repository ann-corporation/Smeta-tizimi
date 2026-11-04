/**
 * Bank ko'chirmasi (CSV / Excel) → to'lov qatorlari: ustunni topish, yo'nalish (kirim/chiqim), shartnomaga moslash, takrorsiz kalit.
 * Toza TS. Pul — hisob-yadro (yaxlit2). Faqat shartnomaga moslangan qator yoziladi; qolganlari qo'lda tanlanadi.
 */
import { yaxlit2 } from '../hisob-yadro';
import { sanaOl, sonOl, type Cell, type Grid } from '../qarzdorlik/parse';
import type { BankYuk, BuxShartnoma } from '../../api/t2-bux-hisob';

export type BankQator = {
  i: number; sana: string | null; summa: number | null; yonalish: 'kirim' | 'chiqim' | null; hujjat_raqam: string | null;
  izoh: string; inn: string | null; kontragent: string | null;
};
export type BankParse = { qatorlar: BankQator[]; topilmadi: string[]; ustunlar: Record<string, number> };

/** CSV matnini katakka bo'ladi: ajratgich (; , tab) avtomatik, qo'shtirnoq ichidagi ajratgich/yangi qator hisobga olinadi. */
export function csvGrid(matn: string): Grid {
  const t = matn.replace(/^﻿/, '');
  const birinchi = t.split(/\r?\n/, 1)[0] ?? '';
  const ajr = [';', '\t', ','].map((a) => [a, birinchi.split(a).length] as const).sort((x, y) => y[1] - x[1])[0][0];
  const grid: Grid = [];
  let qator: Cell[] = []; let kat = ''; let qosh = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (qosh) {
      if (c === '"' && t[i + 1] === '"') { kat += '"'; i++; } else if (c === '"') qosh = false; else kat += c;
    } else if (c === '"') qosh = true;
    else if (c === ajr) { qator.push(kat); kat = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      qator.push(kat); kat = '';
      if (qator.some((x) => String(x).trim() !== '')) grid.push(qator);
      qator = [];
    } else kat += c;
  }
  qator.push(kat);
  if (qator.some((x) => String(x).trim() !== '')) grid.push(qator);
  return grid;
}

const norm = (c: Cell) => String(c ?? '').toLowerCase().replace(/[\s_.]+/g, ' ').trim();
const USTUN: Record<string, RegExp> = {
  sana: /^(дата|sana|date|vaqt)/,
  debet: /(дебет|debet|debit|списан|chiqim|расход)/,
  kredit: /(кредит|kredit|credit|поступлен|kirim|приход)/,
  summa: /^(сумма|summa|amount|сум)/,
  izoh: /(назначение|maqsad|purpose|izoh|детал|описан|основание|примечан)/,
  inn: /(^инн|stir|^inn|\binn\b)/,
  kontragent: /(контрагент|корреспондент|наименование|получател|плательщик|nomi|kontragent|counterparty|benefici)/,
  hujjat: /(^№|номер|raqam|^doc|hujjat|документ)/,
};

/** Sarlavha qatorini topadi (kamida sana + summa/debet/kredit ustuni bor birinchi qator). */
function sarlavhaTop(grid: Grid): { qator: number; ustunlar: Record<string, number> } | null {
  for (let r = 0; r < Math.min(grid.length, 30); r++) {
    const u: Record<string, number> = {};
    (grid[r] ?? []).forEach((c, j) => {
      const s = norm(c);
      if (!s) return;
      for (const [k, re] of Object.entries(USTUN)) if (u[k] === undefined && re.test(s)) { u[k] = j; break; }
    });
    if (u.sana !== undefined && (u.summa !== undefined || u.debet !== undefined || u.kredit !== undefined)) return { qator: r, ustunlar: u };
  }
  return null;
}

/** `kreditKirim` — ikki ustunli ko'chirmada Kredit = kirim (1C/bank ko'chirmasi standarti); bank teskari bersa false. */
export function bankParse(grid: Grid, opts: { kreditKirim?: boolean } = {}): BankParse {
  const h = sarlavhaTop(grid);
  if (!h) return { qatorlar: [], topilmadi: ['sana', 'summa'], ustunlar: {} };
  const u = h.ustunlar; const kreditKirim = opts.kreditKirim !== false;
  const qatorlar: BankQator[] = [];
  for (let r = h.qator + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const sana = sanaOl(row[u.sana]);
    let summa: number | null = null; let yon: 'kirim' | 'chiqim' | null = null;
    const d = u.debet !== undefined ? sonOl(row[u.debet]) : null; const k = u.kredit !== undefined ? sonOl(row[u.kredit]) : null;
    if (d != null && d !== 0 && (k == null || k === 0)) { summa = Math.abs(d); yon = kreditKirim ? 'chiqim' : 'kirim'; }
    else if (k != null && k !== 0 && (d == null || d === 0)) { summa = Math.abs(k); yon = kreditKirim ? 'kirim' : 'chiqim'; }
    else if (u.summa !== undefined) { const s = sonOl(row[u.summa]); if (s != null && s !== 0) { summa = Math.abs(s); yon = s > 0 ? 'kirim' : 'chiqim'; } }
    if (summa == null) continue; // summasiz qator (bo'sh/jami) - yozilmaydi
    qatorlar.push({
      i: r + 1, sana, summa: summa == null ? null : yaxlit2(summa), yonalish: yon,
      hujjat_raqam: u.hujjat !== undefined ? (String(row[u.hujjat] ?? '').trim() || null) : null,
      izoh: u.izoh !== undefined ? String(row[u.izoh] ?? '').trim() : '',
      inn: u.inn !== undefined ? (String(row[u.inn] ?? '').replace(/\D/g, '') || null) : null,
      kontragent: u.kontragent !== undefined ? (String(row[u.kontragent] ?? '').trim() || null) : null,
    });
  }
  const kerak = ['sana', u.summa === undefined && u.debet === undefined && u.kredit === undefined ? 'summa' : ''].filter(Boolean);
  return { qatorlar, topilmadi: kerak.filter((x) => u[x] === undefined), ustunlar: u };
}

const kompakt = (s: string) => s.toLowerCase().replace(/[^a-z0-9а-яё]/gi, '');

export type Moslash = { shartnoma_id: number | null; sabab: 'raqam' | 'inn' | 'nom' | 'bir_nechta' | 'topilmadi' };

/**
 * Qatorni shartnomaga moslaydi: 1) izohda shartnoma raqami; 2) INN → kontragentning (yo'nalishga mos) yagona shartnomasi; 3) nom.
 * Bir nechta nomzod bo'lsa (`bir_nechta`) avtomatik tanlanmaydi — foydalanuvchi tanlaydi.
 */
export function bankMosla(q: Pick<BankQator, 'izoh' | 'inn' | 'kontragent' | 'yonalish'>, shartnomalar: ReadonlyArray<BuxShartnoma>): Moslash {
  const matn = kompakt(q.izoh);
  const raqamli = shartnomalar.filter((s) => { const r = kompakt(s.raqam); return r.length >= 2 && matn.includes(r); });
  if (raqamli.length) {
    // eng uzun raqam (T-12 va T-1 ni adashtirmaydi)
    const eng = Math.max(...raqamli.map((s) => kompakt(s.raqam).length));
    const top = raqamli.filter((s) => kompakt(s.raqam).length === eng);
    if (top.length === 1) return { shartnoma_id: top[0].id, sabab: 'raqam' };
  }
  const yonga = (s: BuxShartnoma) => (q.yonalish === 'kirim' ? s.asosiy : q.yonalish === 'chiqim' ? !s.asosiy : true);
  const tanla = (royxat: BuxShartnoma[], sabab: Moslash['sabab']): Moslash | null => {
    if (royxat.length === 0) return null;
    const mos = royxat.filter(yonga);
    const arr = mos.length ? mos : royxat;
    return arr.length === 1 ? { shartnoma_id: arr[0].id, sabab } : { shartnoma_id: null, sabab: 'bir_nechta' };
  };
  if (q.inn) {
    const r = tanla(shartnomalar.filter((s) => s.inn && s.inn.replace(/\D/g, '') === q.inn), 'inn');
    if (r) return r;
  }
  if (q.kontragent) {
    const n = kompakt(q.kontragent);
    if (n.length >= 4) {
      const r = tanla(shartnomalar.filter((s) => s.kontragent && kompakt(s.kontragent) === n), 'nom');
      if (r) return r;
    }
  }
  return { shartnoma_id: null, sabab: 'topilmadi' };
}

/** Takrorsiz kalit: bir xil ko'chirma qayta yuklansa bir xil kalit chiqadi; bir xil ikki qator tartib raqami bilan ajratiladi. */
export function bankKalitlari(qatorlar: ReadonlyArray<Pick<BankQator, 'sana' | 'summa' | 'yonalish' | 'hujjat_raqam' | 'izoh' | 'inn'>>): string[] {
  const sanoq = new Map<string, number>();
  return qatorlar.map((q) => {
    const asos = [q.sana, q.summa, q.yonalish, q.hujjat_raqam ?? '', q.inn ?? '', q.izoh.slice(0, 60)].join('|');
    const n = (sanoq.get(asos) ?? 0) + 1; sanoq.set(asos, n);
    return `${asos}#${n}`.slice(0, 120);
  });
}

/** Moslangan va to'liq qatorlarni RPC yukiga aylantiradi (qolganlari tashlanadi). */
export function bankYuk(qatorlar: ReadonlyArray<BankQator>, tanlov: ReadonlyArray<number | null>): BankYuk[] {
  const kalitlar = bankKalitlari(qatorlar);
  const out: BankYuk[] = [];
  qatorlar.forEach((q, j) => {
    const sid = tanlov[j];
    if (sid == null || q.sana == null || q.summa == null || q.summa <= 0 || q.yonalish == null) return;
    out.push({ kalit: kalitlar[j], sana: q.sana, summa: q.summa, yonalish: q.yonalish, shartnoma_id: sid, hujjat_raqam: q.hujjat_raqam, izoh: q.izoh.slice(0, 300) || null });
  });
  return out;
}
