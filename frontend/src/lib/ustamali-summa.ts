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
import { kaskadCats, kaskadgaYaxlit, type SvodYaxlit } from './svod-yaxlit';
import { nakrutkaKat, podvalliKaskad, NAKRUTKA_KATLAR, type KatSummalar, type NakrutkaHisobJS, type NakrutkaKat } from './nakrutka-podval';

/** Kategoriya kesimi: aniq kat bo'yicha summalar + kat noma'lum qismi. */
export type KatKesim = {
  summalar: Partial<Record<NakrutkaKat, number>>;
  /** Kategoriyasi aniqlanmagan qatorlar summasi (ustamaga kirmaydi). */
  nomalum: number;
  nomalumSoni: number;
  /** Summasi o'zi noma'lum (null) qatorlar soni. */
  summasizSoni: number;
  /**
   * Svod yaxlit bo'limlari (20261113500000): kesimga KIRMAGAN, ИТОГО-4 ga ustamasiz qo'shiladi (QQS siz qqssiz);
   * arglar — ularning smetadagi to'g'ri xarajati (ustamasiz jamiga qo'shiladi). Yo'q — o'zgarishsiz.
   */
  yaxlit?: { qqssiz: number; barglar: number };
  /**
   * Svod yaxlit bo'limi AVLODI bo'lgan qatorlar summasi (qator darajasi: F2/fakt/qoldiq kesimlari) — ustama
   * koeffitsienti QO'LLANMAYDI, ИТОГО-4 ga ustamasiz qo'shiladi (QQS bir marta). katKesimgaQosh(…, true) to'ldiradi.
   */
  yaxlitQator?: number;
};

export const bosKatKesim = (): KatKesim => ({ summalar: {}, nomalum: 0, nomalumSoni: 0, summasizSoni: 0 });

/** Bitta qatorni kesimga qo'shadi (kesim joyida o'zgaradi — katta ro'yxatlar uchun). */
export function katKesimgaQosh(k: KatKesim, kat: string | null | undefined, summa: number | null | undefined, yaxlitmi = false): KatKesim {
  if (summa == null || !Number.isFinite(summa)) { k.summasizSoni++; return k; }
  if (yaxlitmi) { k.yaxlitQator = (k.yaxlitQator ?? 0) + summa; return k; }
  const nk = nakrutkaKat(kat);
  if (nk == null) { k.nomalum += summa; k.nomalumSoni++; return k; }
  k.summalar[nk] = (k.summalar[nk] ?? 0) + summa;
  return k;
}

/** Kesim nusxasi + kat noma'lum qo'shimcha summa (masalan hujjat jami va qatorlar yig'indisi farqi). Farq ~0 bo'lsa — o'zgarishsiz. */
export function katKesimNomalumBilan(k: KatKesim, farq: number | null | undefined): KatKesim {
  const nusxa: KatKesim = { ...k, summalar: { ...k.summalar }, ...(k.yaxlit ? { yaxlit: { ...k.yaxlit } } : {}) };
  if (farq != null && Number.isFinite(farq) && Math.abs(farq) >= 0.005) { nusxa.nomalum += farq; nusxa.nomalumSoni += 1; }
  return nusxa;
}

export function katKesimYigish<T>(qatorlar: Iterable<T>, kat: (x: T) => string | null | undefined, summa: (x: T) => number | null | undefined, yaxlitmi?: (x: T) => boolean): KatKesim {
  const k = bosKatKesim();
  for (const q of qatorlar) katKesimgaQosh(k, kat(q), summa(q), yaxlitmi?.(q) ?? false);
  return k;
}

/**
 * Qatorlar kesimi + ko'rsatiladigan JAMI: qatorlar yig'indisi jamidan farq qilsa, farq «kat noma'lum» qismga o'tadi
 * (taxminiy deb ko'rsatiladi — o'ylab topilmaydi). `jami` null — farq qo'shilmaydi.
 */
export function katKesimJamiBilan<T>(qatorlar: Iterable<T>, kat: (x: T) => string | null | undefined, summa: (x: T) => number | null | undefined,
  jami: number | null | undefined, yaxlitmi?: (x: T) => boolean): KatKesim {
  const k = katKesimYigish(qatorlar, kat, summa, yaxlitmi);
  const bor = Object.values(k.summalar).reduce((a, b) => a + (b ?? 0), 0) + k.nomalum + (k.yaxlitQator ?? 0);
  return katKesimNomalumBilan(k, jami == null ? null : jami - bor);
}

/** Serverdagi `cats` (chel/mash/mat/ob/mk/kab/bez; mat — to'liq savat) → kesim. */
export function katKesimServerdan(c: { chel: number; mash: number; mat: number; ob: number; mk: number; kab: number; bez: number }, yaxlit?: SvodYaxlit | null): KatKesim {
  const k = bosKatKesim();
  k.summalar = { ЧЕЛ: c.chel, МАШ: c.mash, МАТ: c.mat - c.kab - c.mk - c.bez, ОБ: c.ob, КАБ: c.kab, 'М/К': c.mk, 'БЕЗ СКЛАД': c.bez };
  if (yaxlit) k.yaxlit = { qqssiz: yaxlit.qqssiz, barglar: yaxlit.barglar };
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
  /** QQS stavkasi, % — koeffitsientlardan (`НДС`); yo'q bo'lsa null (hech qachon taxmin qilinmaydi). */
  ndsFoiz?: number | null;
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
  const ustamasiz = NAKRUTKA_KATLAR.reduce((t, k) => t + s[k], 0) + (kesim.yaxlit?.barglar ?? 0) + (kesim.yaxlitQator ?? 0);
  const bosh: UstamaNatija = { ustamali: null, ndsBilan: null, ustamasiz, nomalum, qadamlar: null, zanjir: [] };
  if (!koef || Object.keys(koef).length === 0) return { ...bosh, xato: 'KOEF_YOQ' };
  bosh.ndsFoiz = koef.НДС != null && Number.isFinite(Number(koef.НДС)) ? Number(koef.НДС) : null;
  try {
    // Podval yo'q: server (SQL t2_nakrutka_hisobla_v1) bilan tiyingacha paritetli kaskad — Nakopitelniy ham aynan shuni oladi.
    // Podval bor: podval bo'yicha (Nakopitelniy kabi).
    const q: NakrutkaHisobJS = podval ? podvalliKaskad(s, koef, podval)
      : nakrutkaKaskad({ chel: s.ЧЕЛ, mash: s.МАШ, mat: s.МАТ + s['М/К'] + s.КАБ + s['БЕЗ СКЛАД'], ob: s.ОБ, mk: s['М/К'], kab: s.КАБ, bez: s['БЕЗ СКЛАД'] }, koef) as unknown as NakrutkaHisobJS;
    const yq = yaxlitQoshimcha(kesim);
    if (yq != null) {
      // Svod yaxlit: ustamasiz ИТОГО-4 ga, QQS bir marta (server t2_nakrutka_yaxlit_qosh_v1 bilan bir xil).
      const y = kaskadgaYaxlit(q, yq, Number(koef.НДС ?? 0));
      const zanjir = ustamaZanjiri(q, koef).map((z) => (z.kod === 'itogo' ? { ...z, summa: y.itogo4 } : z));
      return { ...bosh, ustamali: y.itogo4, ndsBilan: y.vsego, qadamlar: y, zanjir };
    }
    return { ...bosh, ustamali: q.itogo4, ndsBilan: q.vsego, qadamlar: q, zanjir: ustamaZanjiri(q, koef) };
  } catch {
    return { ...bosh, xato: 'PODVAL_TOLIQ_EMAS' };
  }
}

/** Kesimdagi ustamasiz ИТОГО-4 ga qo'shiladigan summa (svod yaxlit + yaxlit bo'lim qatorlari). Yo'q — null. */
export function yaxlitQoshimcha(kesim: KatKesim): number | null {
  if (!kesim.yaxlit && kesim.yaxlitQator == null) return null;
  return (kesim.yaxlit?.qqssiz ?? 0) + (kesim.yaxlitQator ?? 0);
}

type ServerCats = { chel: number; mash: number; mat: number; ob: number; mk: number; kab: number; bez: number };
/** Server javobi (	2_obyekt_nakrutka_v1) → obyekt darajasidagi kesim: cats_kaskad (bo'lmasa cats) + svod yaxlit. */
export function obyektKesimi(r: { cats?: ServerCats; cats_kaskad?: ServerCats; svod_yaxlit?: SvodYaxlit | null }): KatKesim | null {
  const c = kaskadCats(r) ?? r.cats;
  return c ? katKesimServerdan(c, r.svod_yaxlit) : null;
}

/**
 * OBYEKT darajasidagi ustamali / ВСЕГО — YAGONA yo'l (ekranlar, panel, eksport izohi): server kesimi + svod yaxlit →
 * ustamaliHisobla (podval bo'lsa u bo'yicha). Belgisiz obyektda natija avvalgidek (cats bilan).
 */
export function obyektUstamali(
  r: { cats?: ServerCats; cats_kaskad?: ServerCats; svod_yaxlit?: SvodYaxlit | null; koeffitsientlar?: Partial<NakrutkaKoeffitsientlar> | null },
  podval?: Podval | null, koef?: Partial<NakrutkaKoeffitsientlar> | null,
): UstamaNatija | null {
  const k = obyektKesimi(r);
  return k ? ustamaliHisobla(k, koef ?? r.koeffitsientlar ?? null, podval) : null;
}

/* ───────────── OBYEKT QIYMATI (egasi 2026-10-27: QQS bilan — ASOSIY) ───────────── */

/** QQS bilan qiymat noma'lum bo'lsa — sababi (ekranda «—» + izoh; 0 emas). */
export type UchlikSabab = 'SUMMA_YOQ' | 'HISOBLANMADI' | 'KOEF_YOQ' | 'PODVAL_TOLIQ_EMAS' | 'KAT_NOMALUM' | 'QQS_STAVKA_YOQ' | 'KESIM_YOQ';

/**
 * Jami qiymat UCHLIGI (egasi 2026-10-27, doimiy qoida): 1) QQS bilan (ВСЕГО) — asosiy; 2) ustamali, QQS siz (ИТОГО-4);
 * 3) to'g'ri xarajat (ustamasiz). Hisob YANGI EMAS: qiymatlar `ustamaliHisobla` natijasidan (server `vsego`/`itogo4` bilan
 * tiyingacha bir xil). null — noma'lum (0 emas).
 */
export type QiymatUchlik = {
  qqsBilan: number | null;
  ustamali: number | null;
  ustamasiz: number | null;
  /** Kat noma'lum qism ustamasiz qo'shilgan — qiymatlar taxminiy («≈»). QQS qatori ham taxminiy. */
  taxminiy: boolean;
  /** Kat noma'lum summa (taxminiy / hammasi noma'lum holatda). */
  nomalum: number;
  sabab: UchlikSabab | null;
};

const r2u = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;

/**
 * `ustamaliHisobla` natijasi + ko'rsatiladigan ustamasiz jami → uchlik.
 * Kat noma'lum qism (taxminiy): ustamaga AYLANTIRILMAYDI — ИТОГО-4 ga ustamasiz qo'shiladi (SummaJuft bilan bir xil),
 * QQS esa koeffitsientlardagi stavka bo'yicha shu qismga ham qo'llanadi (QQS hamma summaga tushadi). Stavka yo'q — «—».
 */
export function qiymatUchligi(u: UstamaNatija | null | undefined, ustamasiz: number | null | undefined): QiymatUchlik {
  const asos = ustamasiz != null && Number.isFinite(ustamasiz) ? ustamasiz : null;
  const bosh: QiymatUchlik = { qqsBilan: null, ustamali: null, ustamasiz: asos, taxminiy: false, nomalum: 0, sabab: null };
  if (asos == null) return { ...bosh, sabab: 'SUMMA_YOQ' };
  if (!u) return { ...bosh, sabab: 'HISOBLANMADI' };
  if (u.xato) return { ...bosh, sabab: u.xato };
  if (u.ustamali == null) return { ...bosh, sabab: 'HISOBLANMADI' };
  const nomalumBor = u.nomalum.soni > 0 || u.nomalum.summa !== 0;
  if (nomalumBor && u.ustamasiz === 0) return { ...bosh, nomalum: u.nomalum.summa, sabab: 'KAT_NOMALUM' };
  if (!nomalumBor) return { ...bosh, ustamali: u.ustamali, qqsBilan: u.ndsBilan, sabab: u.ndsBilan == null ? 'HISOBLANMADI' : null };
  const ustamali = r2u(u.ustamali + u.nomalum.summa);
  const f = u.ndsFoiz;
  const qqsBilan = u.ndsBilan == null || f == null ? null : r2u(u.ndsBilan + u.nomalum.summa * (1 + f / 100));
  return { ...bosh, ustamali, qqsBilan, taxminiy: true, nomalum: u.nomalum.summa, sabab: qqsBilan == null ? 'QQS_STAVKA_YOQ' : null };
}

/**
 * Portfel (bir nechta obyekt) uchligi — `usePortfelUstamali` yig'indisidan. Ustamasi hisoblanmagan obyektlar (koef/podval
 * yo'q) ustamasiz qiymati bilan qo'shiladi (ularning ustamasi ham, QQS stavkasi ham noma'lum) — natija taxminiy «≈».
 */
export function portfelUchligi(
  p: { ustamali: number | null; ndsBilan: number | null; nomalumSoni: number; hisoblanganUstamasiz: number },
  ustamasiz: number | null | undefined,
): QiymatUchlik {
  const asos = ustamasiz != null && Number.isFinite(ustamasiz) ? ustamasiz : null;
  const bosh: QiymatUchlik = { qqsBilan: null, ustamali: null, ustamasiz: asos, taxminiy: false, nomalum: 0, sabab: null };
  if (p.ustamali == null) return { ...bosh, sabab: asos == null ? 'SUMMA_YOQ' : 'HISOBLANMADI' };
  const qisman = p.nomalumSoni > 0;
  const qolgan = qisman && asos != null ? Math.max(0, asos - p.hisoblanganUstamasiz) : 0;
  const qqsBilan = p.ndsBilan == null ? null : r2u(p.ndsBilan + qolgan);
  return { ...bosh, ustamali: r2u(p.ustamali + qolgan), qqsBilan, taxminiy: qisman, nomalum: qolgan, sabab: qqsBilan == null ? 'HISOBLANMADI' : null };
}

/**
 * Faqat to'g'ri xarajat ma'lum (manbada kategoriya kesimi yo'q — masalan shartnoma svodidagi F2 hujjat jami):
 * QQS bilan va ustamali qiymat «—» (sababi bilan), o'ylab topilmaydi.
 */
export function ustamasizUchlik(ustamasiz: number | null | undefined, sabab: UchlikSabab = 'KESIM_YOQ'): QiymatUchlik {
  const asos = ustamasiz != null && Number.isFinite(ustamasiz) ? ustamasiz : null;
  return { qqsBilan: null, ustamali: null, ustamasiz: asos, taxminiy: false, nomalum: 0, sabab: asos == null ? 'SUMMA_YOQ' : sabab };
}

/** Server tayyor kaskad natijasi (`itogo4` — ИТОГО-4, `vsego` — ВСЕГО) + to'g'ri xarajat → uchlik. Hisob yo'q. */
export function serverUchligi(n: { itogo4: number | null; vsego: number | null } | null | undefined, ustamasiz: number | null | undefined): QiymatUchlik {
  const asos = ustamasiz != null && Number.isFinite(ustamasiz) ? ustamasiz : null;
  const qqs = n?.vsego != null && Number.isFinite(n.vsego) ? n.vsego : null;
  const us = n?.itogo4 != null && Number.isFinite(n.itogo4) ? n.itogo4 : null;
  return { qqsBilan: qqs, ustamali: us, ustamasiz: asos, taxminiy: false, nomalum: 0, sabab: qqs != null ? null : asos == null && !n ? 'SUMMA_YOQ' : 'HISOBLANMADI' };
}

/** Ikki uchlik ayirmasi (sof natija = plyus − minus): har qiymat ikkalasi ma'lum bo'lsagina; taxminiylik va sabab saqlanadi. */
export function uchlikAyir(a: QiymatUchlik, b: QiymatUchlik): QiymatUchlik {
  const ay = (x: number | null, y: number | null) => (x == null || y == null ? null : r2u(x - y));
  const qqsBilan = ay(a.qqsBilan, b.qqsBilan);
  return {
    qqsBilan, ustamali: ay(a.ustamali, b.ustamali), ustamasiz: ay(a.ustamasiz, b.ustamasiz),
    taxminiy: a.taxminiy || b.taxminiy, nomalum: r2u(a.nomalum - b.nomalum),
    sabab: qqsBilan != null ? null : a.sabab ?? b.sabab ?? 'HISOBLANMADI',
  };
}
