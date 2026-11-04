/**
 * Yuk birjasi narx dvigateli (tavsiya; tomonlar erkin kelishadi). Formula:
 *   tavsiya = max(min_tarif, masofa_km * tonna * stavka_tkm * k_yuk * k_qaytish * k_shoshilinch * k_mashina)
 * Pul: QQS SIZ asos; QQS alohida. Barcha pul arifmetikasi `lib/hisob-yadro` orqali (yaxlitlash/QQS yagona manba).
 * Noma'lum parametr (stavka/masofa/tonna) — natija null va `yetishmaydi` ro'yxati (0 emas). SQL: t2_yb_sozlama kalitlari bilan bir xil nom.
 * Koeffitsientlar TAXMINIY (sozlamadan keladi, bozor kalibrovkasi kerak).
 */
import { ndsFoizTozala, qatorSumma, qqsBilan, qqsSumma, yaxlit2 } from '../hisob-yadro';

export type YukTuri = 'sochma' | 'qoplangan' | 'mo_rt' | 'xavfli' | 'negabarit';
export type Qaytish = 'bir_tomon' | 'qaytishda_yuk';
export type Shoshilinch = 'bugun' | 'ertaga' | 'oddiy';
export const YUK_TURLARI: readonly YukTuri[] = ['sochma', 'qoplangan', 'mo_rt', 'xavfli', 'negabarit'];

export type NarxParametr = {
  stavkaTkm: number | null;
  minTarif: number | null;
  kYuk: Record<string, number>;
  kQaytish: Record<string, number>;
  kShoshilinch: Record<string, number>;
  kMashina: Record<string, number>;
  diapazonFoiz: number;
  qqsFoiz: number;
};

/** Sozlama (t2_yb_ol_v1 'sozlama' → parametrlar) sukut qiymatlari. stavka/min NULL — kiritilmagan. */
export const SUKUT_PARAMETR: NarxParametr = {
  stavkaTkm: null,
  minTarif: null,
  kYuk: { sochma: 1, qoplangan: 1, mo_rt: 1.3, xavfli: 1.6, negabarit: 1.5 },
  kQaytish: { bir_tomon: 1.7, qaytishda_yuk: 1 },
  kShoshilinch: { bugun: 1.3, ertaga: 1.1, oddiy: 1 },
  kMashina: { yuk: 1, samosval: 1, tent: 1, ref: 1 },
  diapazonFoiz: 15,
  qqsFoiz: 12,
};

const musbat = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
const xarita = (v: unknown, sukut: Record<string, number>): Record<string, number> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return sukut;
  const r: Record<string, number> = { ...sukut };
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (musbat(x)) r[k] = x as number;
  return r;
};

/** Server sozlamasi (jsonb kalit→qiymat) → NarxParametr. Noto'g'ri qiymat sukutga tushadi, stavka/min — null. */
export function parametrlarServerdan(raw: Record<string, unknown> | null | undefined): NarxParametr {
  const r = raw ?? {};
  const d = typeof r.diapazon_foiz === 'number' && r.diapazon_foiz >= 0 && r.diapazon_foiz < 100 ? r.diapazon_foiz : SUKUT_PARAMETR.diapazonFoiz;
  return {
    stavkaTkm: musbat(r.stavka_tkm),
    minTarif: musbat(r.min_tarif),
    kYuk: xarita(r.k_yuk, SUKUT_PARAMETR.kYuk),
    kQaytish: xarita(r.k_qaytish, SUKUT_PARAMETR.kQaytish),
    kShoshilinch: xarita(r.k_shoshilinch, SUKUT_PARAMETR.kShoshilinch),
    kMashina: xarita(r.k_mashina, SUKUT_PARAMETR.kMashina),
    diapazonFoiz: d,
    qqsFoiz: ndsFoizTozala(r.qqs_foiz) ?? SUKUT_PARAMETR.qqsFoiz,
  };
}

const KUN_MS = 86_400_000;
/** Shoshilinchlik: yuklash sanasi bugun → bugun, ertaga → ertaga, aks holda oddiy. Sanalar YYYY-MM-DD. */
export function shoshilinchlik(sanaDan: string | null | undefined, bugun: string): Shoshilinch {
  if (!sanaDan || !/^\d{4}-\d{2}-\d{2}$/.test(sanaDan)) return 'oddiy';
  const farq = Math.round((Date.parse(sanaDan + 'T00:00:00Z') - Date.parse(bugun + 'T00:00:00Z')) / KUN_MS);
  return farq <= 0 ? 'bugun' : farq === 1 ? 'ertaga' : 'oddiy';
}

export type NarxKirish = {
  masofaKm: number | null;
  tonna: number | null;
  yukTuri?: YukTuri;
  qaytish?: Qaytish;
  shoshilinch?: Shoshilinch;
  mashinaTuri?: string;
  parametr: NarxParametr;
};
export type NarxTarkib = { tonnaKm: number | null; asos: number | null; koeffitsiyent: number; kYuk: number; kQaytish: number; kShoshilinch: number; kMashina: number };
export type NarxNatija = {
  qqsSiz: number | null;
  qqsSum: number | null;
  qqsBilan: number | null;
  pastki: number | null;
  yuqori: number | null;
  /** Minimal tarif qo'llandimi. */
  minQollandi: boolean;
  /** 1 t·km uchun yakuniy QQS siz narx (tavsiya / t·km). */
  tkmNarx: number | null;
  tarkib: NarxTarkib;
  yetishmaydi: Array<'masofa' | 'tonna' | 'stavka'>;
};

export function tavsiyaNarx(k: NarxKirish): NarxNatija {
  const p = k.parametr;
  const kYuk = p.kYuk[k.yukTuri ?? 'sochma'] ?? 1;
  const kQaytish = p.kQaytish[k.qaytish ?? 'bir_tomon'] ?? 1;
  const kSh = p.kShoshilinch[k.shoshilinch ?? 'oddiy'] ?? 1;
  const kMashina = p.kMashina[k.mashinaTuri ?? 'yuk'] ?? 1;
  const koef = Number((kYuk * kQaytish * kSh * kMashina).toFixed(6)); // koeffitsiyent — pul emas, yaxlitlanmaydi (2 xona emas)
  const yetishmaydi: NarxNatija['yetishmaydi'] = [];
  const masofa = musbat(k.masofaKm);
  const tonna = musbat(k.tonna);
  if (masofa == null) yetishmaydi.push('masofa');
  if (tonna == null) yetishmaydi.push('tonna');
  if (p.stavkaTkm == null) yetishmaydi.push('stavka');
  const tonnaKm = qatorSumma(masofa, tonna);
  const asos = qatorSumma(tonnaKm, p.stavkaTkm);
  const bosh: NarxTarkib = { tonnaKm, asos, koeffitsiyent: koef, kYuk, kQaytish, kShoshilinch: kSh, kMashina };
  if (yetishmaydi.length || asos == null) {
    return { qqsSiz: null, qqsSum: null, qqsBilan: null, pastki: null, yuqori: null, minQollandi: false, tkmNarx: null, tarkib: bosh, yetishmaydi };
  }
  const hisob = qatorSumma(asos, koef) ?? 0;
  const minQollandi = p.minTarif != null && hisob < p.minTarif;
  const qqsSiz = yaxlit2(minQollandi ? (p.minTarif as number) : hisob);
  const d = p.diapazonFoiz * 0.01;
  return {
    qqsSiz,
    qqsSum: qqsSumma(qqsSiz, p.qqsFoiz),
    qqsBilan: qqsBilan(qqsSiz, p.qqsFoiz),
    pastki: qatorSumma(qqsSiz, 1 - d),
    yuqori: qatorSumma(qqsSiz, 1 + d),
    minQollandi,
    tkmNarx: tonnaKm ? yaxlit2(qqsSiz / tonnaKm) : null,
    tarkib: bosh,
    yetishmaydi,
  };
}

/** Kelishilgan narxning tavsiyadan farqi, % (statistika / kalibrovka uchun). Tavsiya yo'q — null. */
export function tavsiyadanFarqFoiz(kelishilgan: number | null | undefined, tavsiya: number | null | undefined): number | null {
  if (kelishilgan == null || tavsiya == null || !Number.isFinite(kelishilgan) || !Number.isFinite(tavsiya) || tavsiya <= 0) return null;
  return yaxlit2(((kelishilgan - tavsiya) / tavsiya) * 100);
}