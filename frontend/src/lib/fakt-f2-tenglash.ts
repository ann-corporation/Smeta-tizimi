/**
 * «Fakt = F2» — sof mantiq (egasi 2026-10-24). F2 tasdiqlangan hajmi fakt dan ko'p bo'lgan ishlar (va ularning
 * mat/ob resurslari) uchun FARQ (f2 − fakt, faqat musbat) fakt hujjatiga delta sifatida yoziladi.
 *
 *  - Ish tanlansa — mehnat/mashina (rs) resurslari norma bo'yicha ergashadi (view: ota bl × norma), alohida yozilmaydi;
 *    mat/ob resurslar o'z f2/fakt farqi bilan alohida belgilanadi (har biri mustaqil sozlanadi).
 *  - Faqat fakt jadvaliga (fakt_yoz_v2) yoziladi. Asl smeta qatorlari (t2_qator) HECH QACHON o'zgarmaydi.
 *  - Manfiy reja (chegirma) qatorlari bu bosqichda o'tkazib yuboriladi.
 */
import { sbT2AktBekor } from '../api/supabase';
import type { JurnalHolat, JurnalIsh, JurnalQator } from './fakt-jurnal';

export type BekorNatija = { ok: boolean; error?: string };
export type AktBekorFn = (aktId: number) => Promise<BekorNatija>;
export type TenglashOyna = { sarlavha: string; reja: TenglashReja };

/** Fakt = F2 hujjatini bekor qilish (akt_bekor) — faqat shu hujjat, smeta qatorlariga tegmaydi. */
export const faktF2Bekor: AktBekorFn = async (aktId) => {
  const r = await sbT2AktBekor(aktId, 'Fakt = F2 bekor qilindi');
  return { ok: !!r.ok, error: (r as { error?: string }).error };
};

export type TenglashHolat = JurnalHolat;

export type TenglashQator = {
  id: number; tur: JurnalQator['tur']; nom: string; birlik: string | null;
  fakt: number; f2: number; delta: number; narx: number | null; summa: number | null;
  /** Shu ish ostidagi mehnat/mashina qatorlari soni (norma bo'yicha ergashadi, alohida yozilmaydi). */
  avtomatik: number;
};

export type TenglashReja = {
  qatorlar: TenglashQator[];
  /** fakt_yoz_v2 paketi: faqat musbat delta. */
  paket: { qator_id: number; hajm: number }[];
  jamiSumma: number;
  narxsiz: number;
  otkazildi: { manfiyReja: number; f2Yoq: number };
};

const son = (v: number | null | undefined) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));
const yaxlit = (x: number) => Math.round(x * 1e6) / 1e6;

export function faktF2Reja(ishlar: readonly JurnalIsh[], holat: ReadonlyMap<number, TenglashHolat>): TenglashReja {
  const qatorlar: TenglashQator[] = [];
  let manfiyReja = 0, f2Yoq = 0;
  const korildi = new Set<number>();
  for (const ish of ishlar) {
    for (const q of [ish as JurnalQator, ...ish.resurslar]) {
      if (korildi.has(q.id)) continue;
      korildi.add(q.id);
      const h = holat.get(q.id);
      const f2 = son(h?.f2_hajm) ?? 0;
      const fakt = son(h?.fakt_hajm) ?? 0;
      if ((son(h?.smeta_hajm) ?? q.smeta ?? 0) < 0) { manfiyReja += 1; continue; }
      const delta = yaxlit(f2 - fakt);
      if (delta <= 1e-9) { if (f2 <= 1e-9) f2Yoq += 1; continue; }
      const narx = son(h?.f2_narx) ?? son(h?.smeta_narx);
      qatorlar.push({
        id: q.id, tur: q.tur, nom: q.nom, birlik: q.birlik, fakt, f2, delta, narx,
        summa: narx == null ? null : yaxlit(delta * narx), avtomatik: q === (ish as JurnalQator) ? ish.avtomatik.length : 0,
      });
    }
  }
  return {
    qatorlar,
    paket: qatorlar.map((x) => ({ qator_id: x.id, hajm: x.delta })),
    jamiSumma: yaxlit(qatorlar.reduce((s, x) => s + (x.summa ?? 0), 0)),
    narxsiz: qatorlar.filter((x) => x.summa == null).length,
    otkazildi: { manfiyReja, f2Yoq },
  };
}

/** Bo'lim (va ixtiyoriy ichki bo'limlar) ishlari. `bolimIshlari` — jurnalQur natijasi; `ichkilar` — bo'lim id → ichki bo'limlar id. */
export function bolimIshlariYigish(
  bolimId: number,
  bolimIshlari: ReadonlyMap<number, JurnalIsh[]>,
  bolalar: ReadonlyMap<number, readonly number[]>,
  ichkiBilan: boolean,
): JurnalIsh[] {
  const out: JurnalIsh[] = [];
  const yur = (id: number) => {
    out.push(...(bolimIshlari.get(id) ?? []));
    if (ichkiBilan) for (const c of bolalar.get(id) ?? []) yur(c);
  };
  yur(bolimId);
  return out;
}
