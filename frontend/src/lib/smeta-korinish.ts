/**
 * SMETA ANATOMIYASI — smetani bir qarashda tushunish uchun sof hisoblar (egasi 2026-10-25).
 * Manba: `useT2Daraxt` daraxti (TreeNode). Yangi biznes formula yo'q — faqat yig'ish va ulushlar:
 *  - umumiy: smeta / fakt / tasdiqlangan F2 summalari va ulushlari;
 *  - bo'limlar: har yuqori tugun bo'yicha xuddi shu kesim + ish/resurs soni, smetadan oshgan qatorlar;
 *  - kategoriya: barg qatorlar smeta summasi ЧЕЛ/МАШ/МАТ/ОБ bo'yicha;
 *  - diqqat: bajarilgan hajmi smeta hajmidan oshgan qatorlar (eng kattasi birinchi).
 * NULL ≠ 0: summa noma'lum bo'lsa yig'indiga qo'shilmaydi va alohida sanaladi.
 * SMETA — CONST (egasi 2026-11-06): «smeta» ko'rsatkichi faqat ASL qatorlardan (qo'shimcha/zamena tugunlari kirmaydi —
 * SQL `t2_qator_asl_v1` bilan bir xil). O'zgarishlar alohida, asoslangan qatlam: `t2_smeta_ozgarish_qatlam_v1`.
 * Qoldiq (bajarilmagan qism) avvalgidek qatorlar bo'yicha (to'liq daraxt smetasi − F2).
 */
import type { TreeNode } from '../api/types';
import { katGuruh, type KatGuruh } from './f2-hujjat-korinish';
import { ayirma2, yaxlit2 } from './hisob-yadro';

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
type Uchlik = { smeta: number | null; fakt: number | null; f2: number | null; toliq?: number | null; qoldiq?: number | null };
function yig(qismlar: readonly Uchlik[]): Kesim {
  const nom = { smeta: 0, fakt: 0, f2: 0 };
  const sum = { smeta: null as number | null, fakt: null as number | null, f2: null as number | null };
  let toliq: number | null = null;
  let qold: number | null = null;
  for (const q of qismlar) {
    if (q.qoldiq != null) qold = (qold ?? 0) + q.qoldiq;
    for (const k of ['smeta', 'fakt', 'f2'] as const) {
      const v = q[k];
      if (v == null) nom[k]++; else sum[k] = (sum[k] ?? 0) + v;
    }
    const tv = q.toliq === undefined ? q.smeta : q.toliq;
    if (tv != null) toliq = (toliq ?? 0) + tv;
  }
  const { smeta, fakt, f2 } = sum;
  const ul = (x: number | null) => (smeta != null && smeta > 0 && x != null ? Math.min(1, Math.max(0, x / smeta)) : null);
  // Egasi: fakt ≥ F2 qoidasi YO'Q — bajarilish = fakt yozilganidek; qoldiq = smeta − F2 AYNAN (yadro `ayirma2`).
  return {
    smeta: smeta == null ? null : yaxlit2(smeta), fakt: fakt == null ? null : yaxlit2(fakt), f2: f2 == null ? null : yaxlit2(f2),
    f2Ulush: ul(f2), faktUlush: ul(fakt),
    // Qoldiq — serverning qator qoldig'i yig'indisi (smeta − F2 − almashtirilgan; /holat «Resurslar» tabi bilan bir xil); u yo'q bo'lsa — smeta − F2.
    qoldiq: qold != null ? yaxlit2(qold) : ayirma2(toliq, f2 ?? 0),
    nomalum: nom, toliq: nom.smeta === 0 && nom.fakt === 0 && nom.f2 === 0,
  };
}
/** Asl smeta tuguni: o'zi qo'shimcha/zamena emas (bazadagi belgi yoki ota-zanjir guruhi). SQL `t2_qator_asl_v1` ko'zgusi. */
export const aslmi = (x: TreeNode): boolean =>
  !x.qoshimcha && !x.zamena && !x.isQosh && !x.isZamena && (x.ozgarishGuruh == null || x.ozgarishGuruh === 'asl');
/** Tugun summasiga (t2_rollup / rz jami) qo'shilgan qo'shimcha/zamena tugunlari summasi. */
function ozgarishQismi(x: TreeNode): number {
  let s = 0;
  for (const c of x.children ?? []) s += aslmi(c) ? ozgarishQismi(c) : (n(c.smeta) ?? 0);
  return s;
}
/** Tugunning ASL smeta summasi (CONST): tugun smetasi − ichidagi qo'shimcha/zamena. Asl bo'lmagan tugun — 0; noma'lum — null. */
export function aslSmeta(x: TreeNode): number | null {
  if (!aslmi(x)) return 0;
  const s = n(x.smeta);
  return s == null ? null : ayirma2(s, ozgarishQismi(x));
}
const uchlik = (r: TreeNode): Uchlik => ({ smeta: aslSmeta(r), fakt: n(r.stFakt), f2: n(r.stF2), toliq: n(r.smeta), qoldiq: n(r.stOst) });

export function* barglar(nodes: readonly TreeNode[]): Generator<TreeNode> {
  for (const x of nodes) {
    if (x.children?.length) yield* barglar(x.children);
    else yield x;
  }
}

export function umumiyKesim(tree: readonly TreeNode[]): Kesim {
  return yig(tree.map(uchlik));
}

/**
 * Fakt / F2 ulushlari MAXRAJI = «Smeta + o'zgarishlar» (egasi 2026-11-14: qo'shimcha ish ham obyekt qiymati). `umumiyKesim` ulushlari
 * asl smetaga nisbatan (qo'shimchali fakt/F2 ni asl smetaga bo'lib 100% dan oshiradi); maxraj noma'lum/≤0 bo'lsa ulush noma'lum (null).
 * Yangi formula emas: maxrajni chaqiruvchi beradi (`bajarilishMaxraji`, server qatlami).
 */
export function ulushlarniMaxrajgaKeltir(k: Kesim, maxraj: number | null | undefined): Kesim {
  const m = n(maxraj);
  const ul = (x: number | null) => (m != null && m > 0 && x != null ? Math.min(1, Math.max(0, x / m)) : null);
  return { ...k, f2Ulush: ul(k.f2), faktUlush: ul(k.fakt) };
}

/** Asl smeta barglari (kesim uchun): asl zanjirdagi barglar (qo'shimcha/zamena tugunlari va ularning ichi kirmaydi). */
export function* aslBarglar(nodes: readonly TreeNode[]): Generator<TreeNode> {
  for (const x of nodes) {
    if (!aslmi(x)) continue;
    if (x.children?.length) yield* aslBarglar(x.children);
    else yield x;
  }
}

export const oshganmi = (x: TreeNode): boolean => {
  const sm = n(x.smetaHajm), fk = n(x.faktHajm ?? null);
  return sm != null && sm > 0 && fk != null && fk > sm * 1.0001;
};

/**
 * O'zgarish yozuvlari soni: qo'shimcha — qo'shimcha guruhining ildiz tuguni (ichidagi ish/resurslar sanalmaydi);
 * zamena — o'zi REPLACEMENT bo'lgan tugun. Server 	2_smeta_ozgarish_qatlam_v1 (qoshimcha.soni / zamena.soni) bilan bir xil ma'no.
 */
export function ozgarishSoni(nodes: readonly TreeNode[]): { qoshimcha: number; zamena: number } {
  let qoshimcha = 0, zamena = 0;
  const yur = (x: TreeNode, otaQosh: boolean, otaZamena: boolean) => {
    const qosh = !!(x.isQosh || x.qoshimcha) && x.ozgarishGuruh !== 'zamena';
    if (qosh && !otaQosh) qoshimcha++;
    // Zamena: o'zi REPLACEMENT; change_type ma'lum bo'lmasa (eski ma'lumot) — bazadagi zamena belgisi, ota zamena bo'lmasa.
    const zamenaOzi = x.ozgarishOzi === 'REPLACEMENT' || (x.ozgarishOzi == null && !!(x.zamena || x.isZamena) && !otaZamena);
    if (zamenaOzi) zamena++;
    x.children?.forEach((c) => yur(c, qosh, zamenaOzi || otaZamena));
  };
  nodes.forEach((x) => yur(x, false, false));
  return { qoshimcha, zamena };
}

/**
 * Smetadan oshgan ISH: hajmi oshgan bl (ish darajasi — fakt aynan shu yerda kiritiladi) yoki ishsiz mustaqil resurs.
 * Ish ostidagi resurslarning fakti norma × ish fakti (BL_NORMA) hosilasi — ular ayni oshishni takrorlaydi (ishning o'zi 673% bo'lsa,
 * uning 6 ta resursi ham aynan 673%), shuning uchun alohida sanalmaydi.
 */
export const oshganIshmi = (x: TreeNode, otasiIsh = false): boolean => {
  if (x.type === 'rz') return false;
  if (x.children?.length) return x.type === 'bl' && oshganmi(x);
  if (otasiIsh) return false;
  return oshganmi(x);
};

export type BolimKorinish = Kesim & { id: string; kod: string | null; nom: string; ishSoni: number; resursSoni: number; oshgan: number; zamena: number; qoshimcha: number };
export function bolimlarKorinishi(tree: readonly TreeNode[]): BolimKorinish[] {
  return tree.map((r, i) => {
    let ish = 0, res = 0, osh = 0;
    const yur = (x: TreeNode, otasiIsh: boolean) => {
      if (x.type === 'bl') ish++; else if (x.type !== 'rz') res++;
      if (oshganIshmi(x, otasiIsh)) osh++;
      x.children?.forEach((c) => yur(c, x.type === 'bl' || otasiIsh));
    };
    r.children?.forEach((c) => yur(c, false));
    // Zamena / qo'shimcha — O'ZGARISH yozuvlari soni (ildizlari), ichidagi resurslar emas: /holat «Smeta va o'zgarishlar» bilan bir xil son.
    const oz = ozgarishSoni([r]);
    const zam = oz.zamena, qosh = oz.qoshimcha;
    return { ...yig([uchlik(r)]), id: String(r.id ?? `${r.varaq}:${r.row}:${i}`), kod: r.kod ?? null, nom: r.nom, ishSoni: ish, resursSoni: res, oshgan: osh, zamena: zam, qoshimcha: qosh };
  });
}

export function katSmeta(tree: readonly TreeNode[]): { qismlar: { guruh: KatGuruh; summa: number; ulush: number }[]; jami: number; summasiz: number } {
  const acc = new Map<KatGuruh, number>();
  let summasiz = 0;
  for (const b of aslBarglar(tree)) {
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
  const yur = (x: TreeNode, bolim: string, otasiIsh: boolean) => {
    if (oshganIshmi(x, otasiIsh)) {
      const sm = Number(x.smetaHajm), fk = Number(x.faktHajm);
      out.push({ nom: x.nom, kod: x.kod ?? null, birlik: x.birlik ?? null, smetaHajm: sm, faktHajm: fk, foiz: (fk / sm) * 100, bolim });
    }
    x.children?.forEach((c) => yur(c, bolim, x.type === 'bl' || otasiIsh));
  };
  for (const r of tree) r.children?.forEach((c) => yur(c, r.nom, false));
  return out.sort((a, b) => b.foiz - a.foiz).slice(0, limit);
}
