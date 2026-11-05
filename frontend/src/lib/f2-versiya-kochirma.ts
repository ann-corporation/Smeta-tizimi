/**
 * F2 VERSIYA KO'CHIRMASI — ko'rsatish qatlami (20261203001000, `t2_f2_versiya_kochirma_v1`).
 *
 * Smeta versiyasi faollashtirilgandan keyin tasdiqlangan F2 eski ('almashtirilgan') qatorlarda qoladi (tarix, obyekt
 * jamisida bir marta). Yangi faol qatorda `t2_qator_holat.f2_hajm` = 0 — ekranda F2 «yo'qolgandek». Server modeli har faol
 * qator uchun qabul qilingan moslik bo'yicha eski F2 ni beradi; bu modul uni qator xaritasiga aylantiradi va BELGI uchun
 * «avvalgi F2 bilan F2 qoldig'i» ni YAGONA `ochiqQoldiq` (F2 rejimi) orqali hisoblaydi.
 *
 * QOIDA: bu qiymatlar hech qanday jamiga, F2 tayyorlash «mumkin» hajmiga yoki bo'lim/obyekt summasiga QO'SHILMAYDI
 * (aks holda eski F2 ikki marta sanaladi). NULL ≠ 0: summasi noma'lum bo'lsa null.
 */
import { ochiqQoldiq } from './zamena-qoldiq';

export type F2KochirmaQator = {
  qator_id: number; f2_avvalgi_hajm: number | null; f2_avvalgi_summa: number | null; f2_avvalgi_summa_nomalum: number;
  eski_soni: number; akt_idlar: number[]; eski_qator_idlar: number[]; moslik_id: number | null; zanjir_qadam: number | null;
};
export type F2KochirmaSabab = 'pozitsiya_yoq' | 'yangi_smetada_yoq' | 'rad_etilgan' | 'nishon_faol_emas' | 'resurs_topilmadi' | 'tasdiq_kutilmoqda';
export type F2KochirmaMoslanmagan = {
  eski_qator_id: number; tur: string | null; kod: string | null; nom: string | null; birlik: string | null;
  f2_hajm: number | null; f2_summa: number | null; f2_summa_nomalum: number; akt_idlar: number[];
  sabab: F2KochirmaSabab; nomzod_qator_id: number | null;
};
export type F2KochirmaJami = {
  eski_soni: number; eski_summa: number; eski_summa_nomalum: number;
  kochdi_soni: number; kochdi_summa: number; kutilmoqda_soni: number; kutilmoqda_summa: number;
  moslanmagan_soni: number; moslanmagan_summa: number; sabablar: Record<string, number>;
};
export type F2VersiyaKochirma = {
  ok: true; obyekt_id: number; versiyalar: number[];
  qatorlar: F2KochirmaQator[]; moslanmagan: F2KochirmaMoslanmagan[]; jami: F2KochirmaJami;
};

/** Faol qator → avvalgi versiyadan ko'chgan F2. */
export type AvvalgiF2 = { hajm: number | null; summa: number | null; summaNomalum: number; eskiSoni: number };

const son = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

export function avvalgiF2Xaritasi(k: Pick<F2VersiyaKochirma, 'qatorlar'> | null | undefined): Map<number, AvvalgiF2> {
  const m = new Map<number, AvvalgiF2>();
  for (const q of k?.qatorlar ?? []) {
    const hajm = son(q.f2_avvalgi_hajm); const summa = son(q.f2_avvalgi_summa);
    const summaNomalum = son(q.f2_avvalgi_summa_nomalum) ?? 0;
    if ((hajm ?? 0) === 0 && (summa ?? 0) === 0 && summaNomalum === 0) continue;
    m.set(Number(q.qator_id), { hajm, summa, summaNomalum, eskiSoni: son(q.eski_soni) ?? 0 });
  }
  return m;
}

/**
 * Faqat BELGI uchun: F2 qoldig'i avvalgi versiya F2 si bilan = smeta − (o'z F2 + avvalgi F2) − almashtirilgan
 * (yagona `ochiqQoldiq`, F2 rejimi). Smeta noma'lum — null. Qator ustunlari va jamilar bundan foydalanmaydi.
 */
export function avvalgiBilanF2Qoldiq(p: { smeta: number | null; ozF2: number | null; avvalgi: AvvalgiF2 | null | undefined; almashtirilgan?: number | null }): number | null {
  if (!p.avvalgi || p.avvalgi.hajm == null) return null;
  return ochiqQoldiq({ smeta: p.smeta, f2: (p.ozF2 ?? 0) + p.avvalgi.hajm, almashtirilgan: p.almashtirilgan ?? null }, 'f2');
}

/** Ko'chmagan (moslanmagan / tasdiq kutilayotgan) eski F2 bormi — ogohlantirish satri uchun. */
export function kochmaganBor(k: Pick<F2VersiyaKochirma, 'jami'> | null | undefined): boolean {
  return !!k && ((k.jami.kutilmoqda_soni ?? 0) + (k.jami.moslanmagan_soni ?? 0)) > 0;
}
