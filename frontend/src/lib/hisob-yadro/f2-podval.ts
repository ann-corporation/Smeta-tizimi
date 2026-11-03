/**
 * F2 PODVAL BAHOLASH (egasi 2026-11-03) — tasdiqlangan/import qilingan F2 HUJJATINING O'Z podval ustamasi bilan baholanadi
 * (panel, reestr/tarix, qoralama, Excel, storno, nakopitelniy); smetadan tayyorlangan YANGI qatorlar — smeta podvali bilan.
 * SQL `_t2_summa_paket_v1` (20261121000000, `t2_akt_podval`) bilan AYNAN bir model:
 *  - o'z podvali (nk) bor har (akt, blok) — alohida kaskad;
 *  - podvalsiz hamma qatorlar — BITTA umumiy kesim va bitta smeta podvali kaskadi (SQL `p_podval = 'siz'`).
 * Natija yig'indisi: har maydon ROUND 2; birortasi noma'lum (null) — yig'indi ham null (NULL ≠ 0).
 */
import { bosKesim, type Kesim } from './kategoriya';
import { hisob, type HisobKirish, type HisobNatija } from './kaskad';
import { standartPodval, type KoefKod, type Podval } from './podval';
import { yaxlit2 } from './yaxlit';

export const AKT_PODVAL_MANBALAR = ['import', 'storno', 'smeta', 'backfill'] as const;
export type AktPodvalManba = typeof AKT_PODVAL_MANBALAR[number];
export type AktPodvalNk = Partial<Record<KoefKod, number | null>>;

/** Hujjatning o'z podvali (standart kaskad foizlari) → baholovchi podval. */
export function aktPodvaliPodval(nk: AktPodvalNk): Podval {
  return { ...standartPodval(nk), nom: 'Podval hujjat (F2)' };
}

/** Bir hisob birligi: kesim + (hujjatning o'z foizlari | null — smeta podvali). */
export type F2Blok = {
  /** `akt:blok` yoki `yangi` (smetadan tayyorlangan qatorlar). */
  kalit: string;
  nom?: string;
  kesim: Kesim;
  /** Hujjat o'z podvali (nk). null/undefined — smeta podvali (birlashtiriladi). */
  nk?: AktPodvalNk | null;
};

export type F2BlokNatija = { kalit: string; nom?: string; manba: 'hujjat' | 'smeta'; natija: HisobNatija; kalitlar: string[] };

export type F2Baho = {
  /** Kaskad birliklari: har o'z-podvalli blok alohida, podvalsizlar bitta `smeta` birlikda. */
  birliklar: F2BlokNatija[];
  qqsBilan: number | null;
  qqs: number | null;
  /** ИТОГО-4: ustamali, QQS siz. */
  ustamali: number | null;
  /** To'g'ri xarajat jami (ustamasiz). */
  ustamasiz: number;
  /** Podvali noma'lum (smeta podvali yo'q va hujjat podvali yo'q) yoki foiz noma'lum bo'lgan birliklar. */
  nomalumBirlik: number;
};

/** Ikki kesim yig'indisi (podvalsiz bloklar bitta kaskadga kirishi uchun — SQL bitta agregat). */
export function kesimQosh(a: Kesim, b: Kesim): Kesim {
  const s: Kesim['summalar'] = { ...a.summalar };
  for (const [k, v] of Object.entries(b.summalar)) s[k as keyof typeof s] = (s[k as keyof typeof s] ?? 0) + (v ?? 0);
  const y = a.yaxlit || b.yaxlit
    ? { qqssiz: (a.yaxlit?.qqssiz ?? 0) + (b.yaxlit?.qqssiz ?? 0), barglar: (a.yaxlit?.barglar ?? 0) + (b.yaxlit?.barglar ?? 0),
        ...(a.yaxlit?.svodQqsBilan != null || b.yaxlit?.svodQqsBilan != null ? { svodQqsBilan: (a.yaxlit?.svodQqsBilan ?? 0) + (b.yaxlit?.svodQqsBilan ?? 0), svodQqssiz: (a.yaxlit?.svodQqssiz ?? 0) + (b.yaxlit?.svodQqssiz ?? 0) } : {}) }
    : undefined;
  return {
    summalar: s, nomalum: a.nomalum + b.nomalum, nomalumSoni: a.nomalumSoni + b.nomalumSoni, summasizSoni: a.summasizSoni + b.summasizSoni,
    ...(y ? { yaxlit: y } : {}),
    ...(a.yaxlitQator != null || b.yaxlitQator != null ? { yaxlitQator: (a.yaxlitQator ?? 0) + (b.yaxlitQator ?? 0) } : {}),
  };
}

const yig = (xs: Array<number | null>): number | null => {
  let t = 0;
  for (const x of xs) { if (x == null) return null; t += x; }
  return yaxlit2(t);
};

/** F2 ni bloklar bo'yicha baholaydi: hujjat podvali — o'ziniki, qolgani — `smeta` (obyekt smeta podvali). */
export function f2Baholash(bloklar: readonly F2Blok[], smeta: HisobKirish): F2Baho {
  const birliklar: F2BlokNatija[] = [];
  let smetaKesim: Kesim | null = null;
  const smetaKalitlar: string[] = [];
  for (const b of bloklar) {
    if (b.nk) {
      birliklar.push({ kalit: b.kalit, nom: b.nom, manba: 'hujjat', natija: hisob(b.kesim, { podval: aktPodvaliPodval(b.nk) }), kalitlar: [b.kalit] });
    } else {
      smetaKesim = smetaKesim ? kesimQosh(smetaKesim, b.kesim) : kesimQosh(bosKesim(), b.kesim);
      smetaKalitlar.push(b.kalit);
    }
  }
  if (smetaKesim) birliklar.push({ kalit: 'smeta', nom: 'smeta', manba: 'smeta', natija: hisob(smetaKesim, smeta), kalitlar: smetaKalitlar });
  return {
    birliklar,
    qqsBilan: yig(birliklar.map((u) => u.natija.qqsBilan)),
    qqs: yig(birliklar.map((u) => u.natija.qqs)),
    ustamali: yig(birliklar.map((u) => u.natija.ustamali)),
    ustamasiz: yaxlit2(birliklar.reduce((t, u) => t + u.natija.ustamasiz, 0)),
    nomalumBirlik: birliklar.filter((u) => u.natija.qqsBilan == null).length,
  };
}
