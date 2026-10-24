/**
 * LOYIHACHI: loyiha o'zgarishining smetaga TA'SIRI (alohida o'zgarish qatlami).
 *
 * Asl smeta qatorlari o'zgarmaydi: bu yerda faqat "taklif" hisoblanadi (qo'shilgan / olib tashlangan / hajm o'zgargan),
 * keyin mavjud qo'shimcha/zamena oqimi (t2_smeta_ozgarish) tasdiqlaydi. Yangi formula YO'Q - summalar
 * mavjud `ustamaliHisobla` (kategoriya kesimi -> nakrutka kaskadi) orqali ustamali (NDS siz) va ustamasiz beriladi.
 *
 * Narxi noma'lum qator summasi 0 EMAS: u `narxsizSoni` da hisoblanadi, summaga kirmaydi.
 * Kategoriyasi noma'lum summa ustamaga aylantirilmaydi (`nomalum` da alohida turadi).
 */
import type { NakrutkaKoeffitsientlar } from '../../api/t2-nakrutka';
import type { Podval } from '../nakrutka-konstruktor';
import { bosKatKesim, katKesimgaQosh, ustamaliHisobla, type KatKesim, type UstamaNatija } from '../ustamali-summa';

export type TaklifAmali = 'qoshish' | 'olib_tashlash' | 'hajm';

export interface LoyihaOzgarishQatori {
  /** Asl smeta qatori (qoshish uchun null). */
  qatorId: number | null;
  amal: TaklifAmali;
  nom: string;
  birlik?: string;
  /** Nakrutka kategoriyasi (ЧЕЛ/МАШ/МАТ/...), noma'lum bo'lsa null. */
  kat: string | null;
  /** Asl smetadagi hajm (qoshish uchun 0/yo'q). */
  eskiHajm?: number | null;
  /** Taklif qilingan yangi hajm (olib_tashlash uchun 0/yo'q). */
  yangiHajm?: number | null;
  /** Birlik narxi, NDS siz, manbali. Noma'lum bo'lsa null. */
  narx: number | null;
}

export interface QatorTaasiri {
  qator: LoyihaOzgarishQatori;
  /** Hajm o'zgarishi (yangi - eski), imzoli. */
  hajmFarqi: number;
  /** Summa o'zgarishi, NDS siz, imzoli; narx noma'lum bo'lsa null. */
  summaFarqi: number | null;
}

export interface LoyihaTaasiri {
  qatorlar: QatorTaasiri[];
  /** Narxi yo'qligi uchun summaga kirmagan qatorlar soni. */
  narxsizSoni: number;
  qoshilgan: UstamaNatija;
  olingan: UstamaNatija;
  /** Sof ta'sir (qo'shilgan - olingan). Ustamali null bo'lishi mumkin (koeffitsient yo'q). */
  sof: { ustamali: number | null; ustamasiz: number };
}

const son = (x: number | null | undefined) => (x != null && Number.isFinite(x) ? x : 0);

export function hajmFarqi(q: LoyihaOzgarishQatori): number {
  if (q.amal === 'qoshish') return son(q.yangiHajm);
  if (q.amal === 'olib_tashlash') return -son(q.eskiHajm);
  return son(q.yangiHajm) - son(q.eskiHajm);
}

export function qatorTaasiri(q: LoyihaOzgarishQatori): QatorTaasiri {
  const f = hajmFarqi(q);
  const summaFarqi = q.narx != null && Number.isFinite(q.narx) ? f * q.narx : null;
  return { qator: q, hajmFarqi: f, summaFarqi };
}

/**
 * Taklif qatorlari -> smetaga ta'sir. Musbat farqlar "qo'shilgan", manfiylari "olingan" kesimga (absolyut qiymat)
 * tushadi; shunda har bir yo'nalish alohida ustamali ko'rsatiladi va nakrutka kaskadiga manfiy summa kirmaydi.
 */
export function loyihaOzgarishTaasiri(
  qatorlar: readonly LoyihaOzgarishQatori[],
  koef: Partial<NakrutkaKoeffitsientlar> | null | undefined,
  podval?: Podval | null,
): LoyihaTaasiri {
  const qosh: KatKesim = bosKatKesim();
  const olin: KatKesim = bosKatKesim();
  const ts: QatorTaasiri[] = [];
  let narxsiz = 0;
  for (const q of qatorlar) {
    const t = qatorTaasiri(q);
    ts.push(t);
    if (t.summaFarqi == null) { if (t.hajmFarqi !== 0) narxsiz++; continue; }
    if (t.summaFarqi > 0) katKesimgaQosh(qosh, q.kat, t.summaFarqi);
    else if (t.summaFarqi < 0) katKesimgaQosh(olin, q.kat, -t.summaFarqi);
  }
  const qoshilgan = ustamaliHisobla(qosh, koef, podval);
  const olingan = ustamaliHisobla(olin, koef, podval);
  const ustamali = qoshilgan.ustamali != null && olingan.ustamali != null ? qoshilgan.ustamali - olingan.ustamali : null;
  return {
    qatorlar: ts,
    narxsizSoni: narxsiz,
    qoshilgan,
    olingan,
    sof: { ustamali, ustamasiz: qoshilgan.ustamasiz - olingan.ustamasiz },
  };
}
