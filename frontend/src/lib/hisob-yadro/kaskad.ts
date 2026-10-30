/**
 * KASKAD va HISOB natijasi — saytning har burchagi (ekran, Excel, F2, qoldiq, oy) shu yerdan oladi.
 * Formulalar podvaldan (`podval.ts`), har qadam ROUND 2. Yaxlit (svod) va kategoriyasi noma'lum summa ИТОГО-4 ga
 * USTAMASIZ qo'shiladi, QQS bir marta — server `_t2_summa_paket_hisob_v1` / `t2_nakrutka_yaxlit_qosh_v1` bilan bir xil.
 */
import { katJami, katSummalari, type Kat, type KatSummalar, type Kesim } from './kategoriya';
import { podvalAniqla, podvalBahola, podvalKf, podvalNdsFoizi, type KoefKod, type Podval } from './podval';
import { qqsSumma } from './nds';
import { yaxlit2 } from './yaxlit';
import { yaxlitKOplate } from './yaxlit-svod';

export type UstamaQadam = { kod: string; nom: string; tur: 'foiz' | 'summa' | 'jami'; foiz: number | null; summa: number | null };

export type KaskadNatija = {
  /** ПРЯМЫЕ ЗАТРАТЫ (kaskadga kirgan kategoriyalar). */
  pryamye: number;
  /** Podval qatorlari qiymati (kod → summa | null). */
  qiymat: Record<string, number | null>;
  qadamlar: UstamaQadam[];
  /** ИТОГО-4 (QQS siz), yaxlit qo'shilgan. null — noma'lum. */
  itogo4: number | null;
  /** Kaskadning o'z ИТОГО-4 (yaxlit qo'shilmasdan). */
  kaskadItogo4: number | null;
  qqs: number | null;
  qqsBilan: number | null;
  qqsFoiz: number | null;
  /** Podvalning oxirgi qatori (ВСЕГО), yaxlit qo'shilgan bo'lsa — QQS bilan. */
  vsego: number | null;
  /** ИТОГО-4 ga ustamasiz qo'shilgan qism (yaxlit svod + kat noma'lum). */
  ustamasizQism: number | null;
  /** Noma'lum podval qatorlari kodlari (foiz/summa kiritilmagan). */
  nomalumQatorlar: string[];
};

export type KaskadOpsiya = {
  /** false — ko'p ustunli hujjatning 2-ustunidan boshlab (belgilangan summalar faqat asosiy ustunda). */
  asosiy?: boolean;
  /** ИТОГО-4 ga ustamasiz qo'shiladigan summa (svod yaxlit QQS siz + kat noma'lum). null/0 — yo'q. */
  ustamasizQism?: number | null;
};

/** Kategoriya summalari + podval → kaskad. Hech qachon tashlamaydi: noma'lum — null va `nomalumQatorlar`. */
export function kaskad(s: Partial<KatSummalar>, podval: Podval, o: KaskadOpsiya = {}): KaskadNatija {
  const n = podvalBahola(podval, s, { summaQosh: o.asosiy !== false });
  const q = n.qiymat;
  const kodlar = new Set(podval.qatorlar.map((x) => x.kod));
  const pryamye = q.pryamye ?? yaxlit2(katJami(s));
  const qadamlar: UstamaQadam[] = podval.qatorlar.map((x) => ({ kod: x.kod, nom: x.nom, tur: x.tur, foiz: x.tur === 'foiz' ? (x.foiz ?? null) : null, summa: q[x.kod] ?? null }));
  const qqsFoiz = podvalNdsFoizi(podval);
  const nomalumQatorlar = [...n.nomalum];
  const kaskadItogo4 = kodlar.has('itogo4') ? q.itogo4 : n.vsego;
  const qism = o.ustamasizQism != null && Number.isFinite(o.ustamasizQism) && o.ustamasizQism !== 0 ? o.ustamasizQism : null;
  if (qism == null) {
    const qqs = kodlar.has('nds') ? q.nds : null;
    return { pryamye, qiymat: q, qadamlar, itogo4: kaskadItogo4, kaskadItogo4, qqs, qqsBilan: kodlar.has('nds') ? n.vsego : null, qqsFoiz, vsego: n.vsego, ustamasizQism: null, nomalumQatorlar };
  }
  // Ustamasiz qism: ИТОГО-4 qatori bo'lishi shart (aks holda qayerga qo'shish noma'lum).
  if (!kodlar.has('itogo4')) {
    nomalumQatorlar.push('itogo4');
    return { pryamye, qiymat: q, qadamlar, itogo4: null, kaskadItogo4, qqs: null, qqsBilan: null, qqsFoiz, vsego: null, ustamasizQism: yaxlit2(qism), nomalumQatorlar };
  }
  const i4 = kaskadItogo4 == null ? null : yaxlit2(kaskadItogo4 + qism);
  const qqs = qqsSumma(i4, qqsFoiz);
  const qqsBilan = i4 == null || qqs == null ? null : yaxlit2(i4 + qqs);
  const qiymat = { ...q, kaskad_itogo4: kaskadItogo4, yaxlit: yaxlit2(qism), itogo4: i4, nds: qqs, [n.vsegoKod]: qqsBilan };
  return { pryamye, qiymat, qadamlar, itogo4: i4, kaskadItogo4, qqs, qqsBilan, qqsFoiz, vsego: qqsBilan, ustamasizQism: yaxlit2(qism), nomalumQatorlar };
}

/** Kategoriya koeffitsientlari (к оплате = to'g'ri xarajat × Kf). Noma'lum foiz — null. */
export function kategoriyaKf(podval: Podval): Record<Kat, number | null> {
  return podvalKf(podval);
}

/**
 * Qatorning «к оплате» (QQS bilan) summasi. Oddiy qator: ROUND(summa × Kf[kat], 2). Yaxlit (svod) qatori:
 * ustama yo'q, faqat QQS — ROUND(summa × (1 + НДС/100), 2). Kategoriya/Kf/QQS noma'lum — null.
 */
export function kOplate(summa: number | null | undefined, kat: Kat | null, kf: Record<Kat, number | null>, yaxlitmi = false, ndsFoiz: number | null = null): number | null {
  if (summa == null || !Number.isFinite(summa)) return null;
  if (yaxlitmi) return yaxlitKOplate(summa, ndsFoiz);
  if (kat == null) return null;
  const k = kf[kat];
  return k == null ? null : yaxlit2(summa * k);
}

/** Natija (6-band): ko'rsatish tartibi — QQS bilan, keyin ustamali (QQS siz), keyin ustamasiz. */
export type HisobNatija = {
  qqsBilan: number | null;
  qqs: number | null;
  /** ИТОГО-4: ustamali, QQS siz. */
  ustamali: number | null;
  itogo4: number | null;
  /** To'g'ri xarajat jami: aniq kategoriyalar + kat noma'lum + yaxlit bo'limlar tarkibi. */
  ustamasiz: number;
  /** Ustama qadamlari (podval qatorlari). */
  ustama: UstamaQadam[];
  qqsFoiz: number | null;
  kategoriyalar: KatSummalar;
  /** Narxsiz (summasi noma'lum) qatorlar soni. */
  narxsizSoni: number;
  /** Kategoriyasi noma'lum qatorlar soni va summasi (ustamasiz qo'shilgan — natija taxminiy). */
  nomalumSoni: number;
  nomalumSumma: number;
  /** ИТОГО-4 ga ustamasiz qo'shilgan yaxlit (svod) qism, QQS siz. */
  yaxlit: number | null;
  /** Kat noma'lum qism bor — qiymatlar taxminiy («≈»). */
  taxminiy: boolean;
  kaskad: KaskadNatija | null;
  sabab: null | 'KOEF_YOQ' | 'PODVAL_TOLIQ_EMAS' | 'QQS_STAVKA_YOQ';
};

export type HisobKirish = { podval?: Podval | null; koef?: Partial<Record<KoefKod, number | null>> | null };

/** Kesim → to'liq natija. Podval bo'lmasa koeffitsientlardan standart podval (server tartibi). */
export function hisob(k: Kesim, kirish: HisobKirish): HisobNatija {
  const kategoriyalar = katSummalari(k);
  const yaxlit = (k.yaxlit || k.yaxlitQator != null) ? (k.yaxlit?.qqssiz ?? 0) + (k.yaxlitQator ?? 0) : null;
  const ustamasiz = yaxlit2(katJami(kategoriyalar) + k.nomalum + (k.yaxlit?.barglar ?? 0) + (k.yaxlitQator ?? 0));
  const taxminiy = k.nomalumSoni > 0 || k.nomalum !== 0;
  const bosh: HisobNatija = {
    qqsBilan: null, qqs: null, ustamali: null, itogo4: null, ustamasiz, ustama: [], qqsFoiz: null, kategoriyalar,
    narxsizSoni: k.summasizSoni, nomalumSoni: k.nomalumSoni, nomalumSumma: yaxlit2(k.nomalum), yaxlit: yaxlit == null ? null : yaxlit2(yaxlit), taxminiy, kaskad: null, sabab: null,
  };
  const podval = podvalAniqla(kirish.podval, kirish.koef);
  if (!podval) return { ...bosh, sabab: 'KOEF_YOQ' };
  const qism = (yaxlit ?? 0) + k.nomalum;
  const r = kaskad(kategoriyalar, podval, { ustamasizQism: qism });
  const natija: HisobNatija = { ...bosh, kaskad: r, ustama: r.qadamlar, qqsFoiz: r.qqsFoiz, itogo4: r.itogo4, ustamali: r.itogo4, qqs: r.qqs, qqsBilan: r.qqsBilan };
  if (r.itogo4 == null) return { ...natija, sabab: 'PODVAL_TOLIQ_EMAS' };
  if (r.qqsBilan == null) return { ...natija, sabab: 'QQS_STAVKA_YOQ' };
  return natija;
}
