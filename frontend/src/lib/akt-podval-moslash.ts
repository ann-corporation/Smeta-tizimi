/**
 * BACKFILL MOSLASH (egasi 2026-11-03): foydalanuvchi asl F2 xlsx ni qayta yuklaydi; tizim FAQAT podvalni o'qiydi va uni
 * tasdiqlangan akt bilan JAMILAR va QATORLAR bo'yicha moslaydi. Moslash tavsiya — saqlashni foydalanuvchi tasdiqlaydi.
 * Pul arifmetikasi yo'q: faqat solishtirish (±1 so'm).
 */
import type { AktPodvalYuk } from './akt-podval';
import type { PodvalNomzod } from '../api/t2-akt-podval';

/** Yuklangan faylning bitta F2 varag'i (o'quvchi natijasidan). */
export type MoslashVaraq = {
  varaq: string;
  /** Hujjat ИТОГО ПРЯМЫЕ (hujjat birligida) yoki, bo'lmasa, qatorlar yig'indisi. */
  pryamye: number | null;
  barglarSoni: number;
  podval: AktPodvalYuk | null;
};

export type MoslashVariant = {
  nomzod: PodvalNomzod;
  ball: number;
  sabab: string[];
  /** Hujjat podvali ИТОГО-4 / ВСЕГО ni reestr jamilari bilan solishtirish: true/false, reestr yo'q — null. */
  reestrMos: boolean | null;
};

export type MoslashNatija = { varaq: MoslashVaraq; variantlar: MoslashVariant[]; tavsiya: number | null };

const yaqin = (a: number | null | undefined, b: number | null | undefined, tol = 1): boolean => a != null && b != null && Math.abs(a - b) <= tol;

/** Hujjat podvali jamilari reestr jamilariga (QQS siz = ИТОГО-4, QQS bilan = ВСЕГО) mos kelishi. Reestr yo'q — null. */
export function reestrBilanMosmi(p: AktPodvalYuk | null, n: Pick<PodvalNomzod, 'reestr_qqssiz' | 'reestr_qqs_bilan'>): boolean | null {
  if (!p || (n.reestr_qqssiz == null && n.reestr_qqs_bilan == null)) return null;
  const siz = n.reestr_qqssiz == null ? true : yaqin(p.hujjat.itogo4 ?? p.itogo4, Number(n.reestr_qqssiz));
  const bilan = n.reestr_qqs_bilan == null ? true : p.hujjat.vsego == null ? false : yaqin(p.hujjat.vsego, Number(n.reestr_qqs_bilan));
  return siz && bilan;
}

/**
 * Har varaq uchun nomzod aktlarni baholaydi: ПРЯМЫЕ jami mosligi (asosiy), qator soni, reestr jamilari mosligi.
 * `tavsiya` — yagona yetakchi variant indeksi (ball ≥ 4 va ikkinchisidan katta), aks holda null (foydalanuvchi tanlaydi).
 */
export function podvalMoslash(varaqlar: readonly MoslashVaraq[], nomzodlar: readonly PodvalNomzod[], masshtab: (v: MoslashVaraq) => number = (v) => v.podval?.masshtab ?? 1): MoslashNatija[] {
  return varaqlar.map((v) => {
    const ms = masshtab(v);
    const variantlar = nomzodlar.map((n): MoslashVariant => {
      const sabab: string[] = []; let ball = 0;
      if (yaqin(v.pryamye == null ? null : v.pryamye * ms, n.pryamye == null ? null : Number(n.pryamye))) { ball += 4; sabab.push('ПРЯМЫЕ'); }
      if (v.barglarSoni > 0 && n.qator_soni === v.barglarSoni) { ball += 1; sabab.push('qator soni'); }
      const reestrMos = reestrBilanMosmi(v.podval, n);
      if (reestrMos === true) { ball += 3; sabab.push('reestr'); }
      return { nomzod: n, ball, sabab, reestrMos };
    }).filter((x) => x.ball > 0).sort((a, b) => b.ball - a.ball || a.nomzod.akt_id - b.nomzod.akt_id);
    const tavsiya = variantlar.length > 0 && variantlar[0].ball >= 4 && (variantlar.length === 1 || variantlar[0].ball > variantlar[1].ball) ? 0 : null;
    return { varaq: v, variantlar, tavsiya };
  });
}
