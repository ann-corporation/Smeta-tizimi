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
import { bosKatKesim, katKesimgaQosh, type KatKesim } from './ustamali-summa';

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
  /** Bo'lim nomi (obyekt bo'yicha reja — oldindan ko'rishda bo'lim jamisi va bo'limni istisno qilish uchun). */
  bolim?: string | null;
  /** Ustamali summa uchun kategoriya kesimi (ustamasiz summa kat bo'yicha; narx noma'lum — nomalum). */
  kesim?: KatKesim;
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

/**
 * Qator summasi (ustamasiz, NDS siz) va kat kesimi. Resurs / o'z narxli ish: delta × (F2 narxi ?? smeta narxi).
 * O'z narxi yo'q ish (narx NULL yoki 0 — F2 summasi resurslarda): ergashadigan rs smeta summasining ish ulushi
 * (Qamrov % bilan bir xil qoida). Narx noma'lum — summa NULL (0 to'qilmaydi).
 */
function summaHisob(q: JurnalQator, ish: JurnalIsh | null, delta: number, holat: ReadonlyMap<number, TenglashHolat>): { narx: number | null; summa: number | null; kesim: KatKesim } {
  const h = holat.get(q.id);
  const kesim = bosKatKesim();
  const f2n = son(h?.f2_narx);
  const narx = (f2n != null && f2n !== 0 ? f2n : null) ?? son(h?.smeta_narx) ?? (q.tur !== 'bl' ? f2n : null);
  if (narx != null || !ish || !ish.avtomatik.length || !ish.smeta) {
    const summa = narx == null ? null : yaxlit(delta * narx);
    katKesimgaQosh(kesim, q.kat, summa);
    return { narx, summa, kesim };
  }
  const ulush = delta / ish.smeta; let summa: number | null = null;
  for (const r of ish.avtomatik) {
    const ss = son(holat.get(r.id)?.smeta_summa);
    if (ss == null) { katKesimgaQosh(kesim, r.kat, null); continue; }
    const v = yaxlit(ss * ulush); katKesimgaQosh(kesim, r.kat, v); summa = (summa ?? 0) + v;
  }
  return { narx: null, summa: summa == null ? null : yaxlit(summa), kesim };
}

export function faktF2Reja(ishlar: readonly JurnalIsh[], holat: ReadonlyMap<number, TenglashHolat>, bolim: string | null = null): TenglashReja {
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
      const oz = q === (ish as JurnalQator);
      const s = summaHisob(q, oz && ish.tur === 'bl' ? ish : null, delta, holat);
      qatorlar.push({
        id: q.id, tur: q.tur, nom: q.nom, birlik: q.birlik, fakt, f2, delta, narx: s.narx,
        summa: s.summa, avtomatik: oz ? ish.avtomatik.length : 0, bolim, kesim: s.kesim,
      });
    }
  }
  return rejaYasa(qatorlar, manfiyReja, f2Yoq);
}

function rejaYasa(qatorlar: TenglashQator[], manfiyReja: number, f2Yoq: number): TenglashReja {
  return {
    qatorlar,
    paket: qatorlar.map((x) => ({ qator_id: x.id, hajm: x.delta })),
    jamiSumma: yaxlit(qatorlar.reduce((s, x) => s + (x.summa ?? 0), 0)),
    narxsiz: qatorlar.filter((x) => x.summa == null).length,
    otkazildi: { manfiyReja, f2Yoq },
  };
}

/**
 * BUTUN OBYEKT bo'yicha «Fakt = F2» (egasi 2026-10-26: «fakt qilingan ishni tez hisoblab F2 qilib Nakopitelniy'ga»):
 * har bo'lim O'Z ishlari (avlodlarisiz — har ish bir marta) + bo'limsiz ishlar. Qator bo'lim nomi bilan belgilanadi.
 * Faqat musbat farq; fakt hech qachon kamaytirilmaydi.
 */
export function obyektF2Reja(guruhlar: readonly { nom: string; ishlar: readonly JurnalIsh[] }[], holat: ReadonlyMap<number, TenglashHolat>): TenglashReja {
  const qatorlar: TenglashQator[] = []; let manfiy = 0, f2Yoq = 0; const bor = new Set<number>();
  for (const g of guruhlar) {
    const r = faktF2Reja(g.ishlar, holat, g.nom);
    for (const q of r.qatorlar) if (!bor.has(q.id)) { bor.add(q.id); qatorlar.push(q); }
    manfiy += r.otkazildi.manfiyReja; f2Yoq += r.otkazildi.f2Yoq;
  }
  return rejaYasa(qatorlar, manfiy, f2Yoq);
}

export type TenglashBolimJami = { nom: string; soni: number; ustamasiz: number | null; kesim: KatKesim; narxsiz: number };
export type TenglashJami = {
  paket: { qator_id: number; hajm: number }[];
  ustamasiz: number | null; kesim: KatKesim; narxsiz: number;
  /** Bo'lim bo'yicha jami (rejadagi tartibda; istisno qilingan bo'lim ham ko'rinadi — soni 0). */
  bolimlar: TenglashBolimJami[];
};

const kesimQosh = (a: KatKesim, b: KatKesim | undefined) => {
  if (!b) return;
  for (const [k, v] of Object.entries(b.summalar) as [keyof KatKesim['summalar'], number][]) a.summalar[k] = (a.summalar[k] ?? 0) + v;
  a.nomalum += b.nomalum; a.nomalumSoni += b.nomalumSoni; a.summasizSoni += b.summasizSoni;
};

/** Istisnolardan (qator id yoki bo'lim nomi) keyingi paket va jamilar — sof, 25k qatorda chiziqli. */
export function tenglashJami(reja: TenglashReja, chiqQator: ReadonlySet<number>, chiqBolim: ReadonlySet<string>): TenglashJami {
  const paket: TenglashJami['paket'] = [];
  const kesim = bosKatKesim(); let ustamasiz: number | null = null; let narxsiz = 0;
  const bm = new Map<string, TenglashBolimJami>();
  for (const q of reja.qatorlar) {
    const nom = q.bolim ?? '';
    let b = bm.get(nom); if (!b) { b = { nom, soni: 0, ustamasiz: null, kesim: bosKatKesim(), narxsiz: 0 }; bm.set(nom, b); }
    if (chiqQator.has(q.id) || chiqBolim.has(nom)) continue;
    paket.push({ qator_id: q.id, hajm: q.delta });
    b.soni += 1;
    if (q.summa == null) { narxsiz += 1; b.narxsiz += 1; }
    else { ustamasiz = (ustamasiz ?? 0) + q.summa; b.ustamasiz = (b.ustamasiz ?? 0) + q.summa; }
    kesimQosh(kesim, q.kesim); kesimQosh(b.kesim, q.kesim);
  }
  for (const b of bm.values()) if (b.ustamasiz != null) b.ustamasiz = yaxlit(b.ustamasiz);
  return { paket, ustamasiz: ustamasiz == null ? null : yaxlit(ustamasiz), kesim, narxsiz, bolimlar: [...bm.values()] };
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
