/**
 * USTAMALI SUMMA — tizimdagi har pul summasi uchun YAGONA qatlam (egasi 2026-10-24:
 * «har qanday son uchun nakrutka bilan ham summasini ko'rsata olishi kerak»).
 *
 * Bu YANGI FORMULA EMAS: kategoriya bo'yicha to'g'ri xarajat summalari mavjud kaskadga
 * (`podvalliKaskad` = t2_obyekt_nakrutka_v1 / Nakopitelniy bilan bir xil, obyekt podvali bo'lsa
 * u bo'yicha) beriladi va ИТОГО-4 (NDS SIZ) olinadi. QQS bilan qiymat kerak bo'lsa — `ndsBilan`
 * (alohida yorliq bilan ko'rsatiladi; narx doim NDS siz).
 *
 * Qoidalar:
 *  - kategoriyasi noma'lum summa (bog'lanmagan qator, ish qatori, notanish kat) ustamaga
 *    AYLANTIRILMAYDI: `nomalum` da alohida turadi — soxta 0 ham, taxmin ham yo'q;
 *  - koeffitsientlar yo'q yoki podval to'liq emas — `ustamali = null` (noma'lum, 0 emas).
 */
import type { NakrutkaKoeffitsientlar } from '../api/t2-nakrutka';
import type { Podval } from './nakrutka-konstruktor';
import { nakrutkaKaskad } from './nakrutka-kaskad';
import { nakrutkaKat, podvalliKaskad, NAKRUTKA_KATLAR, type KatSummalar, type NakrutkaHisobJS, type NakrutkaKat } from './nakrutka-podval';

/** Kategoriya kesimi: aniq kat bo'yicha summalar + kat noma'lum qismi. */
export type KatKesim = {
  summalar: Partial<Record<NakrutkaKat, number>>;
  /** Kategoriyasi aniqlanmagan qatorlar summasi (ustamaga kirmaydi). */
  nomalum: number;
  nomalumSoni: number;
  /** Summasi o'zi noma'lum (null) qatorlar soni. */
  summasizSoni: number;
};

export const bosKatKesim = (): KatKesim => ({ summalar: {}, nomalum: 0, nomalumSoni: 0, summasizSoni: 0 });

/** Bitta qatorni kesimga qo'shadi (kesim joyida o'zgaradi — katta ro'yxatlar uchun). */
export function katKesimgaQosh(k: KatKesim, kat: string | null | undefined, summa: number | null | undefined): KatKesim {
  if (summa == null || !Number.isFinite(summa)) { k.summasizSoni++; return k; }
  const nk = nakrutkaKat(kat);
  if (nk == null) { k.nomalum += summa; k.nomalumSoni++; return k; }
  k.summalar[nk] = (k.summalar[nk] ?? 0) + summa;
  return k;
}

/** Kesim nusxasi + kat noma'lum qo'shimcha summa (masalan hujjat jami va qatorlar yig'indisi farqi). Farq ~0 bo'lsa — o'zgarishsiz. */
export function katKesimNomalumBilan(k: KatKesim, farq: number | null | undefined): KatKesim {
  const nusxa: KatKesim = { ...k, summalar: { ...k.summalar } };
  if (farq != null && Number.isFinite(farq) && Math.abs(farq) >= 0.005) { nusxa.nomalum += farq; nusxa.nomalumSoni += 1; }
  return nusxa;
}

export function katKesimYigish<T>(qatorlar: Iterable<T>, kat: (x: T) => string | null | undefined, summa: (x: T) => number | null | undefined): KatKesim {
  const k = bosKatKesim();
  for (const q of qatorlar) katKesimgaQosh(k, kat(q), summa(q));
  return k;
}

/** Serverdagi `cats` (chel/mash/mat/ob/mk/kab/bez; mat — to'liq savat) → kesim. */
export function katKesimServerdan(c: { chel: number; mash: number; mat: number; ob: number; mk: number; kab: number; bez: number }): KatKesim {
  const k = bosKatKesim();
  k.summalar = { ЧЕЛ: c.chel, МАШ: c.mash, МАТ: c.mat - c.kab - c.mk - c.bez, ОБ: c.ob, КАБ: c.kab, 'М/К': c.mk, 'БЕЗ СКЛАД': c.bez };
  return k;
}

export type ZanjirKod = 'pryamye' | 'transport' | 'prochie' | 'sugurta' | 'itogo';
export type ZanjirQadam = { kod: ZanjirKod; summa: number; foiz?: number };

export type UstamaNatija = {
  /** ИТОГО-4: ustamali summa, NDS SIZ. null — hisoblab bo'lmadi (sabab `xato`da). */
  ustamali: number | null;
  /** QQS bilan (ВСЕГО) — faqat alohida yorliq bilan ko'rsatish uchun. */
  ndsBilan: number | null;
  /** Kategoriyasi aniq qatorlarning to'g'ri xarajati (ustamali shundan hisoblangan). */
  ustamasiz: number;
  /** Kat noma'lum summa — ustamaga KIRMAGAN. */
  nomalum: { summa: number; soni: number };
  qadamlar: NakrutkaHisobJS | null;
  /** to'g'ridan-to'g'ri → transport/ZSR → prochie → sug'urta → itogo. */
  zanjir: ZanjirQadam[];
  xato?: 'KOEF_YOQ' | 'PODVAL_TOLIQ_EMAS';
};

const sanoq = (k: KatKesim): KatSummalar => Object.fromEntries(NAKRUTKA_KATLAR.map((x) => [x, k.summalar[x] ?? 0])) as KatSummalar;

/** Kaskad zanjiri (ko'rsatish uchun). Podvalda standart qadam kodlari bo'lmasligi mumkin — shunda faqat boshi va oxiri. */
export function ustamaZanjiri(q: NakrutkaHisobJS, nk: Partial<NakrutkaKoeffitsientlar>): ZanjirQadam[] {
  const v = (kod: string) => (typeof q[kod] === 'number' ? q[kod] : 0);
  const out: ZanjirQadam[] = [{ kod: 'pryamye', summa: q.pryamye }];
  const tr = v('tr_mat') + v('skl_mat') + v('skl_mk') + v('tr_kab') + v('tr_ob') + v('zag_ob');
  if (tr) out.push({ kod: 'transport', summa: tr });
  if (v('prochie')) out.push({ kod: 'prochie', summa: v('prochie'), foiz: Number(nk.ПРОЧИЕ_ПОДРЯДЧИК ?? 0) || undefined });
  if (v('strax') + v('risk')) out.push({ kod: 'sugurta', summa: v('strax') + v('risk'), foiz: (Number(nk.СТРАХОВАНИЕ ?? 0) + Number(nk.РИСК ?? 0)) || undefined });
  out.push({ kod: 'itogo', summa: q.itogo4 });
  return out;
}

/** Kesim + koeffitsientlar (+ ixtiyoriy obyekt podvali) → ustamali summa. */
export function ustamaliHisobla(kesim: KatKesim, koef: Partial<NakrutkaKoeffitsientlar> | null | undefined, podval?: Podval | null): UstamaNatija {
  const nomalum = { summa: kesim.nomalum, soni: kesim.nomalumSoni };
  const s = sanoq(kesim);
  const ustamasiz = NAKRUTKA_KATLAR.reduce((t, k) => t + s[k], 0);
  const bosh: UstamaNatija = { ustamali: null, ndsBilan: null, ustamasiz, nomalum, qadamlar: null, zanjir: [] };
  if (!koef || Object.keys(koef).length === 0) return { ...bosh, xato: 'KOEF_YOQ' };
  try {
    // Podval yo'q: server (SQL t2_nakrutka_hisobla_v1) bilan tiyingacha paritetli kaskad — Nakopitelniy ham aynan shuni oladi.
    // Podval bor: podval bo'yicha (Nakopitelniy kabi).
    const q: NakrutkaHisobJS = podval ? podvalliKaskad(s, koef, podval)
      : nakrutkaKaskad({ chel: s.ЧЕЛ, mash: s.МАШ, mat: s.МАТ + s['М/К'] + s.КАБ + s['БЕЗ СКЛАД'], ob: s.ОБ, mk: s['М/К'], kab: s.КАБ, bez: s['БЕЗ СКЛАД'] }, koef) as unknown as NakrutkaHisobJS;
    return { ...bosh, ustamali: q.itogo4, ndsBilan: q.vsego, qadamlar: q, zanjir: ustamaZanjiri(q, koef) };
  } catch {
    return { ...bosh, xato: 'PODVAL_TOLIQ_EMAS' };
  }
}
