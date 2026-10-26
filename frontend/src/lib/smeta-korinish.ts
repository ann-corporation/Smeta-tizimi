/**
 * SMETA ANATOMIYASI — smetani bir qarashda tushunish uchun sof hisoblar (egasi 2026-10-25).
 * Manba: `useT2Daraxt` daraxti (TreeNode). Yangi biznes formula yo'q — faqat yig'ish va ulushlar:
 *  - umumiy: smeta / fakt / tasdiqlangan F2 summalari va ulushlari;
 *  - bo'limlar: har yuqori tugun bo'yicha xuddi shu kesim + ish/resurs soni, smetadan oshgan qatorlar;
 *  - kategoriya: barg qatorlar smeta summasi ЧЕЛ/МАШ/МАТ/ОБ bo'yicha;
 *  - diqqat: bajarilgan hajmi smeta hajmidan oshgan qatorlar (eng kattasi birinchi).
 * NULL ≠ 0: summa noma'lum bo'lsa yig'indiga qo'shilmaydi va alohida sanaladi.
 */
import type { TreeNode } from '../api/types';
import { katGuruh, type KatGuruh } from './f2-hujjat-korinish';

const n = (v: number | null | undefined): number | null => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));

/**
 * Kesim: summa NOMA'LUM bo'lsa 0 emas, `null` (hech bir manba qiymati bo'lmasa) yoki `toliq: false`
 * (ba'zi qismlar noma'lum — ko'rsatilgan summa faqat ma'lum qismlar yig'indisi). UI bu holatni yashirmaydi.
 */
export type Kesim = {
  smeta: number | null; fakt: number | null; f2: number | null; qoldiq: number | null;
  f2Ulush: number | null; faktUlush: number | null;
  /** Har ko'rsatkich bo'yicha summasi noma'lum tugunlar soni. */
  nomalum: { smeta: number; fakt: number; f2: number };
  /** Hamma tugunda smeta, fakt va F2 ma'lum bo'lsa true. */
  toliq: boolean;
};
type Uchlik = { smeta: number | null; fakt: number | null; f2: number | null };
function yig(qismlar: readonly Uchlik[]): Kesim {
  const nom = { smeta: 0, fakt: 0, f2: 0 };
  const sum = { smeta: null as number | null, fakt: null as number | null, f2: null as number | null };
  for (const q of qismlar) for (const k of ['smeta', 'fakt', 'f2'] as const) {
    const v = q[k];
    if (v == null) nom[k]++; else sum[k] = (sum[k] ?? 0) + v;
  }
  const { smeta, fakt, f2 } = sum;
  const ul = (x: number | null) => (smeta != null && smeta > 0 && x != null ? Math.min(1, Math.max(0, x / smeta)) : null);
  const bajarilgan = fakt == null && f2 == null ? null : Math.max(fakt ?? 0, f2 ?? 0);
  return {
    smeta, fakt, f2,
    f2Ulush: ul(f2), faktUlush: ul(bajarilgan),
    qoldiq: smeta == null || bajarilgan == null ? null : smeta - bajarilgan,
    nomalum: nom, toliq: nom.smeta === 0 && nom.fakt === 0 && nom.f2 === 0,
  };
}
const uchlik = (r: TreeNode): Uchlik => ({ smeta: n(r.smeta), fakt: n(r.stFakt), f2: n(r.stF2) });

export function* barglar(nodes: readonly TreeNode[]): Generator<TreeNode> {
  for (const x of nodes) {
    if (x.children?.length) yield* barglar(x.children);
    else yield x;
  }
}

export function umumiyKesim(tree: readonly TreeNode[]): Kesim {
  return yig(tree.map(uchlik));
}

export const oshganmi = (x: TreeNode): boolean => {
  const sm = n(x.smetaHajm), fk = n(x.faktHajm ?? null);
  return sm != null && sm > 0 && fk != null && fk > sm * 1.0001;
};

export type BolimKorinish = Kesim & { id: string; kod: string | null; nom: string; ishSoni: number; resursSoni: number; oshgan: number; zamena: number; qoshimcha: number };
export function bolimlarKorinishi(tree: readonly TreeNode[]): BolimKorinish[] {
  return tree.map((r, i) => {
    let ish = 0, res = 0, osh = 0, zam = 0, qosh = 0;
    const yur = (x: TreeNode) => {
      if (x.type === 'bl') ish++; else if (x.type !== 'rz') res++;
      if (!x.children?.length && oshganmi(x)) osh++;
      if (x.zamena || x.isZamena) zam++;
      if (x.qoshimcha || x.isQosh) qosh++;
      x.children?.forEach(yur);
    };
    r.children?.forEach(yur);
    return { ...yig([uchlik(r)]), id: String(r.id ?? `${r.varaq}:${r.row}:${i}`), kod: r.kod ?? null, nom: r.nom, ishSoni: ish, resursSoni: res, oshgan: osh, zamena: zam, qoshimcha: qosh };
  });
}

export function katSmeta(tree: readonly TreeNode[]): { qismlar: { guruh: KatGuruh; summa: number; ulush: number }[]; jami: number; summasiz: number } {
  const acc = new Map<KatGuruh, number>();
  let summasiz = 0;
  for (const b of barglar(tree)) {
    if (b.type === 'rz' || b.type === 'bl') continue;
    const s = n(b.smeta);
    if (s == null) { summasiz++; continue; }
    const g = katGuruh(b.kat);
    acc.set(g, (acc.get(g) ?? 0) + s);
  }
  const jami = [...acc.values()].reduce((a, b) => a + b, 0);
  const tartib: KatGuruh[] = ['chel', 'mash', 'mat', 'ob', 'nomalum'];
  return { qismlar: tartib.filter((g) => acc.has(g)).map((g) => ({ guruh: g, summa: acc.get(g)!, ulush: jami > 0 ? Math.max(0, acc.get(g)!) / jami : 0 })), jami, summasiz };
}

export type Diqqat = { nom: string; kod: string | null; birlik: string | null; smetaHajm: number; faktHajm: number; foiz: number; bolim: string };
export function oshganQatorlar(tree: readonly TreeNode[], limit = 6): Diqqat[] {
  const out: Diqqat[] = [];
  for (const r of tree) for (const b of barglar(r.children ?? [])) {
    if (!oshganmi(b)) continue;
    const sm = Number(b.smetaHajm), fk = Number(b.faktHajm);
    out.push({ nom: b.nom, kod: b.kod ?? null, birlik: b.birlik ?? null, smetaHajm: sm, faktHajm: fk, foiz: (fk / sm) * 100, bolim: r.nom });
  }
  return out.sort((a, b) => b.foiz - a.foiz).slice(0, limit);
}
