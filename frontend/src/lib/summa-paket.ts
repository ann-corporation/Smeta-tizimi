/**
 * Yagona «summa paketi» (issue #195, egasi 2026-10-29) — serverdagi `_t2_summa_paket_hisob_v1` javobi.
 * Har pul ko'rinishi shu tartibda: 1) QQS bilan (to'lovga) — asosiy; 2) QQS siz, ustamali (ИТОГО-4); 3) прямые (ustamasiz).
 * ▸ kesim: ЧЕЛ / МАШ / МАТ / ОБ / Subpudrat / Svod («письмо») / boshqa ustamasiz / kat noma'lum. Σ kesim = прямые.
 * NULL ≠ 0: serverdan kelmagan paket — `null` (UI «kiritilmagan» deydi), hech qachon 0 ga aylantirilmaydi.
 */

import type { KatKesim, QiymatUchlik as QiymatUchlikTuri } from './ustamali-summa';

export type SummaKesim = {
  chel: number; mash: number; mat: number; ob: number;
  subpudrat: number; svod: number; ustamasiz: number; nomalum: number;
};

export type SummaPaket = {
  /** QQS bilan — «to'lovga» (asosiy raqam). */
  qqs_bilan: number;
  /** QQS summasi. */
  qqs: number;
  /** QQS siz, ustamali (ИТОГО-4). */
  ustamali: number;
  /** Прямые — ustamasiz to'g'ri xarajat (Σ kesim). */
  ustamasiz: number;
  qqs_foiz: number | null;
  /** Ustama qo'shilmagan qism (svod/subpudrat/bojxona/kat noma'lum), QQS siz. */
  ustamasiz_qism: number;
  kesim: SummaKesim;
  soat: { chel: number; mash: number; mashinist: number };
  subpudratchilar: Array<{ kontragent: string; summa: number }>;
  narxsiz_soni: number;
  qator_soni: number;
  /** Server kaskad qadamlari (_t2_summa_paket_hisob_v1.ustama): tr_mat, skl_mat, prochie, strax, risk, itogo4, nds, vsego va h.k. Yo'q — bo'lmasligi mumkin. */
  ustama?: Record<string, number>;
  nk_manba?: 'smeta_podvali' | 'shartnoma' | 'kompaniya' | 'sukut' | string;
  obyekt_soni?: number;
  smetadan_oshgan?: number;
  smetadan_oshgan_soni?: number;
};

const son = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const son0 = (v: unknown): number => son(v) ?? 0;
const obyektmi = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

/**
 * Server javobini tekshirib, turga keltiradi. Asosiy uchlik (qqs_bilan/ustamali/ustamasiz) bo'lmasa — `null`
 * (soxta nol ko'rsatilmaydi). Kesim/soat ichidagi yo'q qiymat — 0 (server ularni doim beradi).
 */
export function summaPaket(x: unknown): SummaPaket | null {
  if (!obyektmi(x)) return null;
  const qqsBilan = son(x.qqs_bilan), ustamali = son(x.ustamali), ustamasiz = son(x.ustamasiz);
  if (qqsBilan == null || ustamali == null || ustamasiz == null) return null;
  const k = obyektmi(x.kesim) ? x.kesim : {};
  const s = obyektmi(x.soat) ? x.soat : {};
  const subs = Array.isArray(x.subpudratchilar) ? x.subpudratchilar : [];
  return {
    qqs_bilan: qqsBilan, qqs: son0(x.qqs), ustamali, ustamasiz,
    qqs_foiz: son(x.qqs_foiz), ustamasiz_qism: son0(x.ustamasiz_qism),
    kesim: { chel: son0(k.chel), mash: son0(k.mash), mat: son0(k.mat), ob: son0(k.ob),
      subpudrat: son0(k.subpudrat), svod: son0(k.svod), ustamasiz: son0(k.ustamasiz), nomalum: son0(k.nomalum) },
    soat: { chel: son0(s.chel), mash: son0(s.mash), mashinist: son0(s.mashinist) },
    subpudratchilar: subs.filter(obyektmi).map((e) => ({ kontragent: String(e.kontragent ?? '—'), summa: son0(e.summa) })),
    narxsiz_soni: son0(x.narxsiz_soni), qator_soni: son0(x.qator_soni),
    ...(obyektmi(x.ustama) ? { ustama: Object.fromEntries(Object.entries(x.ustama).map(([k2, v]) => [k2, son(v)]).filter((e): e is [string, number] => e[1] != null)) } : {}),
    ...(typeof x.nk_manba === 'string' ? { nk_manba: x.nk_manba } : {}),
    ...(son(x.obyekt_soni) != null ? { obyekt_soni: son0(x.obyekt_soni) } : {}),
    ...(son(x.smetadan_oshgan) != null ? { smetadan_oshgan: son0(x.smetadan_oshgan), smetadan_oshgan_soni: son0(x.smetadan_oshgan_soni) } : {}),
  };
}

/** Σ kesim — invariant bo'yicha прямые ga teng (UI tekshiruvi / test uchun). */
export function kesimJami(k: SummaKesim): number {
  return k.chel + k.mash + k.mat + k.ob + k.subpudrat + k.svod + k.ustamasiz + k.nomalum;
}

/** Kesim invarianti bajariladimi (1 so'm yaxlitlash bilan). */
export function kesimMosmi(p: SummaPaket): boolean {
  return Math.abs(kesimJami(p.kesim) - p.ustamasiz) <= 1;
}

/** Foiz (bir xona): maxraj 0 yoki noma'lum bo'lsa — null (0% emas). */
export function foiz(surat: number | null | undefined, maxraj: number | null | undefined): number | null {
  if (surat == null || maxraj == null || !Number.isFinite(surat) || !Number.isFinite(maxraj) || maxraj === 0) return null;
  return Math.round((surat / maxraj) * 1000) / 10;
}

/**
 * Server paketi → `QiymatUchlik` (yagona 3 qatorli ko'rinish). Paket yo'q → «—» (SUMMA_YOQ), 0 emas.
 * Server hisobi to'liq (kat noma'lum qism ustamasiz qo'shilgan, QQS bir marta) — «≈» belgisi qo'yilmaydi;
 * noma'lum qism `nomalum` da (izoh uchun).
 */
export function paketUchligi(p: SummaPaket | null | undefined): QiymatUchlikTuri {
  if (!p) return { qqsBilan: null, ustamali: null, ustamasiz: null, taxminiy: false, nomalum: 0, sabab: 'SUMMA_YOQ' };
  return { qqsBilan: p.qqs_bilan, ustamali: p.ustamali, ustamasiz: p.ustamasiz, taxminiy: false, nomalum: p.kesim.nomalum, sabab: null };
}

/**
 * Mijoz tomonidagi kategoriya kesimi (`KatKesim`) → ▸ kesim ko'rinishi uchun paket (soatlar yo'q — 0).
 * Svod yaxlit qismi «svod» da, kat noma'lum — «nomalum» da. Uchlik qiymatlari o'zgarmaydi (faqat ko'rsatish).
 */
export function katKesimdanPaket(k: KatKesim, q: QiymatUchlikTuri): SummaPaket {
  const s = k.summalar;
  const n = (v: number | undefined) => (v != null && Number.isFinite(v) ? v : 0);
  return {
    qqs_bilan: n(q.qqsBilan ?? undefined), qqs: 0, ustamali: n(q.ustamali ?? undefined), ustamasiz: n(q.ustamasiz ?? undefined),
    qqs_foiz: null, ustamasiz_qism: 0,
    kesim: {
      chel: n(s['ЧЕЛ']), mash: n(s['МАШ']), mat: n(s['МАТ']) + n(s['КАБ']) + n(s['М/К']) + n(s['БЕЗ СКЛАД']), ob: n(s['ОБ']),
      subpudrat: 0, svod: n(k.yaxlit?.barglar) + n(k.yaxlitQator), ustamasiz: 0, nomalum: n(k.nomalum),
    },
    soat: { chel: 0, mash: 0, mashinist: 0 }, subpudratchilar: [], narxsiz_soni: k.summasizSoni, qator_soni: 0,
  };
}
