/**
 * F2 REESTRI KO'RINISHI — chizish uchun sof ulushlar (egasi 2026-10-25: «hujjat va ish holatini bir qarashda ko'rish»).
 * Yangi biznes formula YO'Q: reestrQur bergan summalarni smeta (=100%) ga nisbatan chiziq bo'laklariga ajratadi.
 * Bu SUMMA nisbati — jismoniy bajarilish foizi emas. NULL ≠ 0: smeta noma'lum yoki ≤ 0 bo'lsa foiz ham noma'lum (null).
 */
import { yaxlit2 } from '../hisob-yadro';
import { bosqich, type Summa } from './reestr';

export type ReestrUlush = {
  /** Tasdiqlangan F2 (ma'lum qismi) / smeta × 100; smeta noma'lum bo'lsa null. */
  foiz: number | null;
  /** Chiziq bo'laklari 0..1 (yig'indisi ≤ 1): import, tizimda yasalgan, manbasi aniqlanmagan. */
  importUlush: number; tizimUlush: number; boshqaUlush: number;
  oshdi: boolean;
};

const ulush = (qism: number, butun: number) => Math.max(0, qism) / butun;

/**
 * Bajarilish foizi maxraji = «Smeta + o'zgarishlar» (egasi 2026-11-14: qo'shimcha ish ham bajariladigan ish).
 * Asl smeta (`jami`) o'zgarmaydi va alohida ko'rinadi; faqat nisbat maxraji asl + o'zgarishlar. Yangi hisoblagich yo'q:
 * `ozgarish` — serverning `t2_smeta_ozgarish_qatlam_v1` natijasi. O'zgarish noma'lum bo'lsa — asl (joriy: false, yorliq shuni aytadi).
 */
export function bajarilishMaxraji(o: { jami: number | null | undefined; ozgarish?: number | null }): { summa: number | null; joriy: boolean } {
  const asl = o.jami == null || !Number.isFinite(Number(o.jami)) ? null : Number(o.jami);
  const oz = o.ozgarish == null || !Number.isFinite(Number(o.ozgarish)) ? null : Number(o.ozgarish);
  if (asl == null) return { summa: null, joriy: false };
  if (oz == null) return { summa: asl, joriy: false };
  return { summa: yaxlit2(asl + oz), joriy: true };
}

export function reestrUlush(p: { tasdiqlangan: Summa; tasdiqImport: Summa; tasdiqTizim: Summa }, smeta: number | null | undefined): ReestrUlush {
  const s = smeta == null || !Number.isFinite(Number(smeta)) ? null : Number(smeta);
  if (s == null || s <= 0) return { foiz: null, importUlush: 0, tizimUlush: 0, boshqaUlush: 0, oshdi: false };
  const jami = p.tasdiqlangan.malum;
  const boshqa = Math.max(0, jami - p.tasdiqImport.malum - p.tasdiqTizim.malum);
  let qoldi = 1;
  const kes = (x: number) => { const v = Math.min(qoldi, ulush(x, s)); qoldi -= v; return v; };
  const importUlush = kes(p.tasdiqImport.malum);
  const tizimUlush = kes(p.tasdiqTizim.malum);
  const boshqaUlush = kes(boshqa);
  return { foiz: (jami / s) * 100, importUlush, tizimUlush, boshqaUlush, oshdi: jami > s * 1.0001 };
}

/** Kompaniya bo'yicha tasdiqlangan F2 ning manba taqsimoti (fz-split uchun): import / tizimda / aniqlanmagan. */
export function manbaTaqsimot(p: { tasdiqlangan: Summa; tasdiqImport: Summa; tasdiqTizim: Summa }): { import: number; tizim: number; boshqa: number; jami: number } {
  const imp = Math.max(0, p.tasdiqImport.malum), tiz = Math.max(0, p.tasdiqTizim.malum);
  const boshqa = Math.max(0, p.tasdiqlangan.malum - imp - tiz);
  return { import: imp, tizim: tiz, boshqa, jami: imp + tiz + boshqa };
}

export type OylikJami = { oy: string; tasdiqlangan: number; jarayonda: number; rad: number; bekor: number; nomalumSoni: number };

/**
 * Oylar bo'yicha F2 hujjat jami (ustamasiz) holat kesimida — grafik uchun. Yangi formula yo'q: `hujjat_jami` yig'indisi.
 * Summasi noma'lum (null) akt 0 emas: `nomalumSoni` ga yoziladi. Oylar o'sish tartibida.
 */
export function oylikJami(aktlar: readonly { oy: string; hujjat_jami: number | null; holat: string; lifecycle_status?: string | null }[]): OylikJami[] {
  const m = new Map<string, OylikJami>();
  for (const a of aktlar) {
    const oy = String(a.oy ?? '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(oy)) continue;
    const r = m.get(oy) ?? { oy, tasdiqlangan: 0, jarayonda: 0, rad: 0, bekor: 0, nomalumSoni: 0 };
    if (a.hujjat_jami == null || !Number.isFinite(Number(a.hujjat_jami))) r.nomalumSoni++;
    else r[bosqich(a)] += Number(a.hujjat_jami);
    m.set(oy, r);
  }
  return [...m.values()].sort((x, y) => x.oy.localeCompare(y.oy));
}
