/**
 * SMETA VERSIYASI — o'qish shlyuzida markaziy qoida (egasi 2026-10-29: «tizim o'zi eski va yangi versiyani to'g'ri topsin»).
 *
 * `t2_qator` da eski (almashtirilgan) smeta qatorlari O'CHIRILMAYDI: ular F2/fakt tarixi uchun qoladi
 * (`versiya_holat = 'almashtirilgan'`). Smeta ekranlari esa faqat FAOL versiyani ko'rishi kerak — aks holda
 * eski + yangi qatorlar qo'shilib, smeta ikki barobar chiqadi (2-lot: ~214 mlrd o'rniga ~126 mlrd).
 *
 * Qoida (har ekran alohida emas, shu yerda):
 *  - `t2_qator` o'qishi SUKUT bo'yicha `versiya_holat=eq.faol` filtrini oladi;
 *  - `versiya: 'tarix'` — aniq opt-in: barcha versiyalar (F2/fakt tarixi, pereraschet, to'liq eksport);
 *  - filtrda `versiya_holat=` bo'lsa — chaqiruvchi o'zi aniq tanlagan, tegilmaydi;
 *  - `id=eq.` / `id=in.` — aniq qator(lar) identifikatori bo'yicha qidiruv (F2 qatori metama'lumoti) — barcha versiyalar.
 * Server tomonidagi o'quvchilar (view/RPC) uchun xuddi shu qoida bazada: `t2_versiya_xabardorlik_audit_v1()`.
 */
export type VersiyaRejim = 'faol' | 'tarix';

/** Versiya ustuni bor va sukut bo'yicha faqat faol ko'rsatiladigan jadvallar. */
export const VERSIYALI_JADVALLAR: ReadonlySet<string> = new Set(['t2_qator']);

export const FAOL_FILTR = 'versiya_holat=eq.faol';

export type VersiyaQaror = { ok: true; filtr: string | null } | { ok: false; error: string };

/** Majburiy versiya filtri (`key=value`) yoki null. Noto'g'ri `versiya` qiymati — xato (jim «hammasi» emas). */
export function versiyaFiltri(jadval: string, so: { filtr?: unknown; versiya?: unknown }): VersiyaQaror {
  if (so.versiya !== undefined && so.versiya !== null && so.versiya !== 'faol' && so.versiya !== 'tarix') {
    return { ok: false, error: "versiya noto'g'ri: faqat 'faol' yoki 'tarix'" };
  }
  if (!VERSIYALI_JADVALLAR.has(jadval)) return { ok: true, filtr: null };
  if (so.versiya === 'tarix') return { ok: true, filtr: null };
  const filtr = typeof so.filtr === 'string' ? so.filtr : '';
  if (/(?:^|&)versiya_holat=/.test(filtr)) return { ok: true, filtr: null };
  if (/(?:^|&)id=(?:eq|in)\./.test(filtr)) return { ok: true, filtr: null };
  return { ok: true, filtr: FAOL_FILTR };
}
