/**
 * Ekspertiza «ALL» to'plami (bitta kitobda RES / F5 / VED / TNDR) — qat'iy varaq rollari (yagona yadro).
 *
 * Kitob ALL-to'plam: `RES` va `F5` (yoki `F5_UZB`) + kamida bittasi `VED` / `TNDR`. Shunda:
 *   F5   → LRV har doim (faqat uskunali smeta bo'lsa ham);
 *   RES  → narx indeksi + podval manbai;
 *   VED  → e'tibor bermaslik (hajm vedomosti: ish + hajm, narx yo'q);
 *   TNDR → e'tibor bermaslik (tender narxi transport ichida — narx manbai faqat operator ongli tanlasa).
 * Nomi o'zgartirilgan varaqlar mazmunidan: F5 — ishlar ostida resurslar + yakuniy podval (ЗАРПЛАТА /
 * ЭКСПЛУАТАЦИЯ МАШИН / … / ИТОГО С ОБОРУДОВАНИЕМ); RES — bloklar + «ВСЕГО МАТЕРИАЛОВ/ОБОРУДОВАНИЯ»;
 * VED — «ВЕДОМОСТЬ ОБЪЕМОВ», narx ustuni yo'q; TNDR — F5 bilan bir xil shifrlar, resurssiz, ish narxi bilan.
 */
import { kalit, xom } from './matn';
import type { Katak } from './turlar';

export type AllRol = 'f5' | 'res' | 'ved' | 'tndr';
export type AllTeg = 'lrv' | 'res' | 'etibor_bermaslik';

export interface AllToplam {
  /** Varaq nomi → ALL roli. */
  rollar: Record<string, AllRol>;
  /** Varaq nomi → import tegi. */
  teglar: Record<string, AllTeg>;
  f5: string;
  res: string;
  ved: string[];
  tndr: string[];
  /** Rol nomdan emas, mazmundan aniqlangan varaqlar. */
  mazmundan: string[];
}

type V = { nom: string; rows: readonly (readonly Katak[] | null | undefined)[] };

const nomRoli = (nom: string): AllRol | null => {
  const n = kalit(nom).replace(/\s+/g, '');
  if (n === 'RES') return 'res';
  if (n === 'F5' || n === 'F5_UZB') return 'f5';
  if (n === 'VED') return 'ved';
  if (n === 'TNDR') return 'tndr';
  return null;
};

function yorliqlar(rows: V['rows']): string[] {
  const out: string[] = [];
  for (const row of rows) {
    const c = (row ?? []).find((x) => typeof x === 'string' && /[А-ЯA-Z]{3}/i.test(x));
    if (c != null) out.push(kalit(c));
  }
  return out;
}

function shifrlar(rows: V['rows']): Set<string> {
  const s = new Set<string>();
  for (const row of rows) for (const c of row ?? []) if (typeof c === 'string' && /^[A-ZА-ЯЁ]{1,3}\d{1,3}-\d+-\d+/i.test(xom(c))) s.add(kalit(c));
  return s;
}

const birlikResurs = (rows: V['rows']) => rows.some((row) => (row ?? []).some((c) => typeof c === 'string' && /^(ЧЕЛ|МАШ)[.\s-]*Ч/i.test(xom(c))));

function mazmunRoli(v: V): AllRol | null {
  const y = yorliqlar(v.rows);
  const bor = (re: RegExp) => y.some((x) => re.test(x));
  if (bor(/^ВСЕГО\s+(МАТЕРИАЛОВ|ОБОРУДОВАНИЯ)(?![А-ЯЁA-Z])/)) return 'res';
  if (bor(/^ИТОГО\s+С\s+ОБОРУДОВАНИЕМ/) && bor(/^ЗАРПЛАТА$/) && bor(/^ЭКСПЛУАТАЦИЯ\s+МАШИН/)) return 'f5';
  const bosh = y.slice(0, 15);
  if (bosh.some((x) => /ВЕДОМОСТЬ\s+ОБЪЕМОВ/.test(x))) return 'ved';
  return null;
}

/** Kitob ALL-to'plammi; bo'lsa — qat'iy rollar. Aks holda null (eski evristika ishlaydi). */
export function allToplamRollari(varaqlar: readonly V[]): AllToplam | null {
  const rollar: Record<string, AllRol> = {};
  const mazmundan: string[] = [];
  for (const v of varaqlar) {
    const r = nomRoli(v.nom);
    if (r) rollar[v.nom] = r;
  }
  for (const v of varaqlar) {
    if (rollar[v.nom]) continue;
    const r = mazmunRoli(v);
    if (r) { rollar[v.nom] = r; mazmundan.push(v.nom); }
  }
  const nomlar = (r: AllRol) => varaqlar.filter((v) => rollar[v.nom] === r).map((v) => v.nom);
  const f5lar = nomlar('f5');
  const f5 = f5lar.find((n) => kalit(n) === 'F5') ?? f5lar[0];
  const res = nomlar('res')[0];
  if (!f5 || !res) return null;
  // TNDR mazmundan: F5 bilan bir xil shifrlar, resurssiz, narxli (nomi boshqa bo'lsa).
  const f5v = varaqlar.find((v) => v.nom === f5)!;
  const f5Shifr = shifrlar(f5v.rows);
  for (const v of varaqlar) {
    if (rollar[v.nom] || !f5Shifr.size) continue;
    const s = shifrlar(v.rows);
    let umumiy = 0;
    for (const x of s) if (f5Shifr.has(x)) umumiy++;
    const narxli = yorliqlar(v.rows).slice(0, 20).some((x) => /ЦЕНА|СУММА|СТОИМОСТЬ/.test(x)) || v.rows.slice(0, 20).some((row) => (row ?? []).some((c) => typeof c === 'string' && /^(ЦЕНА|СУММА)$/i.test(xom(c))));
    if (s.size && umumiy >= Math.max(1, 0.8 * f5Shifr.size) && !birlikResurs(v.rows) && narxli) { rollar[v.nom] = 'tndr'; mazmundan.push(v.nom); }
  }
  const ved = nomlar('ved');
  const tndr = nomlar('tndr');
  if (!ved.length && !tndr.length) return null;
  const teglar: Record<string, AllTeg> = {};
  for (const [n, r] of Object.entries(rollar)) {
    teglar[n] = r === 'res' ? (n === res ? 'res' : 'etibor_bermaslik') : r === 'f5' ? (n === f5 ? 'lrv' : 'etibor_bermaslik') : 'etibor_bermaslik';
  }
  return { rollar, teglar, f5, res, ved, tndr, mazmundan };
}
