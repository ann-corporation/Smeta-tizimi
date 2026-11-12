/**
 * Subpudratchi tomoni hisobi (sof funksiyalar, React yo'q). Pul FAQAT lib/hisob-yadro orqali (qatorSumma, yigindi2Qatiy, ayirma2, qqsBilan):
 * bu yerda yaxlitlash va QQS arifmetikasi yo'q. Noma'lum = null ("—"), 0 emas.
 * Hajm (pul emas) ayirmasi - hajmAyir (ikkilik kasr xatosiz).
 */
import { ayirma2, qatorSumma, qqsBilan, yigindi2Qatiy } from '../hisob-yadro';
import type { SubAktHolat, SubAktQisqa, SubIsh, SubTolovQator, SubTopshiriq } from '../../api/t2-sub';

export const SUB_AKT_HOLAT_NOMI: Record<SubAktHolat, string> = {
  qoralama: 'Qoralama', yuborilgan: 'Yuborilgan, javob kutilmoqda', qabul: 'Qabul qilindi', tuzatish: 'Tuzatishga qaytdi', bekor: 'Bekor',
};

/** Hajm ayirmasi (pul emas): 6 xonagacha tozalanadi. */
export function hajmAyir(a: number, b: number): number {
  return Number((a - b).toFixed(6));
}

/** Subpudratchi uchun: topshirilgan hajmdan hali akt yuborilmagan/qabul qilinmagan qismi. */
export function ishQoldigi(i: Pick<SubIsh, 'hajm' | 'qabul_hajm' | 'kutilayotgan_hajm'>): number {
  return Math.max(0, hajmAyir(hajmAyir(i.hajm, i.qabul_hajm), i.kutilayotgan_hajm));
}

/** Qator summasi (kelishilgan narx x hajm), QQS siz; narx yo'q - null. */
export const subQatorSumma = (hajm: number | null | undefined, narx: number | null | undefined): number | null => qatorSumma(hajm, narx);

/** Aktning jami (QQS siz) va QQS bilan (QQS foizi hamma qatorda bir xil bo'lsagina; aks holda null). */
export function aktJami(qatorlar: ReadonlyArray<{ hajm: number; narx: number | null }>, qqsFoiz: number | null) {
  const jami = yigindi2Qatiy(qatorlar.map((q) => qatorSumma(q.hajm, q.narx)));
  return { qqsSiz: qatorlar.length ? jami : null, qqsBilan: qatorlar.length ? qqsBilan(jami, qqsFoiz) : null };
}

export type SubBugunHisobi = {
  /** Faol topshirilgan qatorlar soni. */
  ishlar: number;
  /** Hali akt yuborilmagan hajmi bor qatorlar. */
  qolganIshlar: number;
  /** Narxi kelishilmagan qatorlar (akt yuborib bo'lmaydi). */
  narxsiz: number;
  qoralama: SubAktQisqa[];
  tuzatish: SubAktQisqa[];
  kutilmoqda: SubAktQisqa[];
  qabul: SubAktQisqa[];
};

export function subBugunHisobi(ishlar: readonly SubIsh[], aktlar: readonly SubAktQisqa[]): SubBugunHisobi {
  return {
    ishlar: ishlar.length,
    qolganIshlar: ishlar.filter((i) => ishQoldigi(i) > 0).length,
    narxsiz: ishlar.filter((i) => i.narx == null).length,
    qoralama: aktlar.filter((a) => a.holat === 'qoralama'),
    tuzatish: aktlar.filter((a) => a.holat === 'tuzatish'),
    kutilmoqda: aktlar.filter((a) => a.holat === 'yuborilgan'),
    qabul: aktlar.filter((a) => a.holat === 'qabul'),
  };
}

export type TolovHolat = 'tolangan' | 'qisman' | 'tolanmagan';
/** To'lov holati: qabul (QQS bilan) va to'langan (shartnoma bo'yicha). Hisob-kitob ma'lumoti yo'q (grant/shartnoma) - holat null ("-"). */
export function tolovHolati(q: Pick<SubTolovQator, 'ruxsat' | 'shartnoma_qabul_qqs_siz' | 'qqs_foiz' | 'tolangan'>): { holat: TolovHolat | null; qarz: number | null; qabulQqsBilan: number | null } {
  const qabulQqsBilan = q.ruxsat ? qqsBilan(q.shartnoma_qabul_qqs_siz, q.qqs_foiz) : null;
  if (!q.ruxsat || qabulQqsBilan == null || q.tolangan == null) return { holat: null, qarz: null, qabulQqsBilan };
  const qarz = ayirma2(qabulQqsBilan, q.tolangan);
  if (qarz == null) return { holat: null, qarz: null, qabulQqsBilan };
  const holat: TolovHolat = qarz <= 0.005 ? 'tolangan' : q.tolangan > 0 ? 'qisman' : 'tolanmagan';
  return { holat, qarz, qabulQqsBilan };
}

/* ───── Bosh pudratchi tomoni ───── */

/** Bir ish = bitta fakt: topshirilgan hajmdan bosh pudratchi qo'lda kiritgan fakt va qabul qilingan sub hajmi ayirilgach qolgani. */
export function gcQolgan(t: Pick<SubTopshiriq, 'hajm' | 'gc_fakt_hajm' | 'qabul_hajm'>): number {
  return hajmAyir(hajmAyir(t.hajm, t.gc_fakt_hajm), t.qabul_hajm);
}
/** Bosh pudratchi shu qatorga o'zi ham fakt kiritgan: ikki marta hisoblanmasin deb ogohlantiriladi. */
export const ikkiMartaXavfi = (t: Pick<SubTopshiriq, 'gc_fakt_hajm'>): boolean => t.gc_fakt_hajm > 0;

export type MarjaQator = {
  id: number; smetaSumma: number | null; subSumma: number | null;
  /** Smeta puli - subpudrat narxi (to'g'ri xarajat darajasida, ustamasiz). Ikkalasi ma'lum bo'lsagina. */
  farq: number | null;
};
export function marjaQatori(t: Pick<SubTopshiriq, 'id' | 'hajm' | 'smeta_narx' | 'narx'>): MarjaQator {
  const smetaSumma = qatorSumma(t.hajm, t.smeta_narx);
  const subSumma = qatorSumma(t.hajm, t.narx);
  return { id: t.id, smetaSumma, subSumma, farq: ayirma2(smetaSumma, subSumma) };
}
export function marjaJami(qatorlar: readonly MarjaQator[]): { smeta: number | null; sub: number | null; farq: number | null } {
  const smeta = yigindi2Qatiy(qatorlar.map((q) => q.smetaSumma));
  const sub = yigindi2Qatiy(qatorlar.map((q) => q.subSumma));
  return { smeta, sub, farq: ayirma2(smeta, sub) };
}
