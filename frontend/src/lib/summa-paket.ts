/**
 * Yagona «summa paketi» (issue #195, egasi 2026-10-29) — serverdagi `_t2_summa_paket_hisob_v1` javobi.
 * Har pul ko'rinishi shu tartibda: 1) QQS bilan (to'lovga) — asosiy; 2) QQS siz, ustamali (ИТОГО-4); 3) прямые (ustamasiz).
 * ▸ kesim: ЧЕЛ / МАШ / МАТ / ОБ / Subpudrat / Svod («письмо») / boshqa ustamasiz / kat noma'lum. Σ kesim = прямые.
 * NULL ≠ 0: serverdan kelmagan paket — `null` (UI «kiritilmagan» deydi), hech qachon 0 ga aylantirilmaydi.
 */

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
