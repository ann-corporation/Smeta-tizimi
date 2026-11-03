/**
 * «Fakt tiklash» — fakt hali to‘liq kiritilmagan obyektda DALIL asosida yetishmayotgan faktni qatorma-qator taklif qilish.
 *
 * Egasi qoidalari (2026-11-03):
 *  - «fakt ≥ F2» avtomatik qoidasi YO‘Q: taklif faqat foydalanuvchi belgilab, bitta tasdiq bilan qo‘llaydi (qo‘lda amal).
 *  - Fakt to‘qilmaydi: taklif faqat mavjud hujjat (tasdiqlangan F2 yoki qoralama F2) hajmidan keladi; hujjat nomi izohda.
 *  - Minus hajm ruxsat (F2 dagi minus qator ishorasi bilan); NULL ≠ 0 (summasi noma’lum qator — null, 0 emas).
 *  - Tasdiqlangan F2 o‘zgarmaydi; faqat fakt hujjatiga DELTA (taklif − hozirgi) qo‘shiladi (fakt_yoz_v2 yo‘li).
 *
 * Dalil darajalari:
 *  a) tasdiqlangan F2: mavjud «Fakt = F2» rejasi (lib/fakt-f2-tenglash) qatorlari AYNAN (narx, 1:1 nusxa, rs, minus);
 *  b) qoralama F2 (zaif dalil): qator bo‘yicha qoralama hajmi tasdiqlangan F2 USTIGA qo‘shiladi (qoralama tasdiqlansa F2
 *     jami shu bo‘ladi); taklif = (tasdiq F2 + qoralama) − (fakt, (a) qo‘llangandan keyin), faqat ishora bo‘yicha oshsa.
 *     Faqat ish/material/uskuna (bl/mat/ob): mehnat/mashina norma bo‘yicha ishdan hosil bo‘ladi.
 *     Summa: F2 bor qatorda F2 narxida (`faktSummaF2Narxda`), bo‘lmasa smeta narxida; narx yo‘q — noma’lum (null).
 */
import { faktSummaF2Narxda } from './hisob-yadro';
import { kesimQosh, paketQatorlar, type FaktF2PaketQator, type TenglashHolat, type TenglashNarxManba, type TenglashReja } from './fakt-f2-tenglash';
import { bosKatKesim, katKesimgaQosh, type KatKesim } from './ustamali-summa';

const son = (v: number | null | undefined) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));
const yaxlit = (x: number) => Math.round(x * 1e6) / 1e6;
const yig = (xs: readonly (number | null)[]) => xs.reduce<number | null>((a, v) => (v == null ? a : yaxlit((a ?? 0) + v)), null);

/** Dalil bo‘yicha yetishmayotgan hajm (ishora bilan): musbat F2 oshsa musbat, manfiy F2 (minus norma) manfiy; aks holda null. */
export const dalilFarqi = (dalil: number, fakt: number): number | null => {
  const d = yaxlit(dalil - fakt);
  return (d > 1e-9 && dalil > 1e-9) || (d < -1e-9 && dalil < -1e-9) ? d : null;
};

export type QoralamaQator = { akt_id: number; qator_id: number; hajm: number | null; certified_quantity?: number | null };
export type QoralamaYigma = { hajm: number; aktlar: number[] };
export type QoralamaAkt = { id: number; raqam: string | null; oy?: string | null };

/** Qoralama F2 qatorlari → qator bo‘yicha hajm yig‘indisi va akt idlari. Hajmi noma’lum (null) qator tashlanadi (0 deb olinmaydi). */
export function qoralamaYigish(qatorlar: readonly QoralamaQator[]): Map<number, QoralamaYigma> {
  const out = new Map<number, QoralamaYigma>();
  for (const x of qatorlar) {
    const h = son(x.certified_quantity) ?? son(x.hajm);
    if (h == null) continue;
    const id = Number(x.qator_id);
    const bor = out.get(id);
    if (bor) { bor.hajm = yaxlit(bor.hajm + h); if (!bor.aktlar.includes(Number(x.akt_id))) bor.aktlar.push(Number(x.akt_id)); }
    else out.set(id, { hajm: yaxlit(h), aktlar: [Number(x.akt_id)] });
  }
  return out;
}

export type TiklashManba = 'f2' | 'qoralama';
export type TiklashMeta = { id: number; tur: 'bl' | 'mat' | 'ob' | 'rs'; nom: string; birlik: string | null; kat: string | null; bolim: string | null };
export type TiklashSatr = {
  /** Tanlov kaliti: `f2:<id>` / `qoralama:<id>`. */
  kalit: string;
  id: number; tur: TiklashMeta['tur']; nom: string; birlik: string | null; bolim: string | null;
  manba: TiklashManba;
  /** Dalil hujjati matni (izohga ham ketadi): «F2 №12, №15» / «qoralama F2 №3». */
  hujjat: string;
  aktlar: readonly number[];
  /** Hozirgi fakt → taklif qilingan fakt; farq (delta, ishorali). */
  fakt: number; keyin: number; delta: number;
  narx: number | null;
  /** Pul ta’siri, NDS siz, ustamasiz (delta × narx); noma’lum — null. */
  summa: number | null;
  kesim: KatKesim;
  narxManba: TenglashNarxManba;
  /** fakt_yoz_v2 qator(lar)i — faqat delta. */
  paket: FaktF2PaketQator[];
};

export type TiklashKontekst = {
  reja: TenglashReja;
  holat: ReadonlyMap<number, TenglashHolat>;
  meta: readonly TiklashMeta[];
  qoralama: ReadonlyMap<number, QoralamaYigma>;
  /** Qoralama akt id → raqam (izoh uchun); yo‘q bo‘lsa id. */
  qoralamaRaqam?: ReadonlyMap<number, string | null>;
  smetaNarx?: (id: number) => number | null;
};

const aktBelgi = (id: number) => `№${id}`;

/** (a) tasdiqlangan F2 + (b) qoralama F2 takliflari. Fakt ≥ dalil bo‘lsa taklif yo‘q. */
export function tiklashSatrlar(k: TiklashKontekst): TiklashSatr[] {
  const out: TiklashSatr[] = [];
  const aDelta = new Map<number, number>();
  const metaById = new Map(k.meta.map((m) => [m.id, m]));
  for (const q of k.reja.qatorlar) {
    aDelta.set(q.id, q.delta);
    const m = metaById.get(q.id);
    out.push({
      kalit: `f2:${q.id}`, id: q.id, tur: q.tur, nom: q.nom, birlik: q.birlik, bolim: q.bolim ?? m?.bolim ?? null,
      manba: 'f2', hujjat: q.aktlar?.length ? `F2 ${q.aktlar.map(aktBelgi).join(', ')}` : 'F2', aktlar: q.aktlar ?? [],
      fakt: q.fakt, keyin: yaxlit(q.fakt + q.delta), delta: q.delta, narx: q.narx, summa: q.summa,
      kesim: q.kesim ?? bosKatKesim(), narxManba: q.narxManba ?? (q.summa != null ? 'smeta' : 'narxsiz'), paket: paketQatorlar(q),
    });
  }
  for (const m of k.meta) {
    if (m.tur === 'rs') continue; // mehnat/mashina norma bo‘yicha ishdan hosil bo‘ladi — qoralama dalili bilan alohida yozilmaydi
    const y = k.qoralama.get(m.id);
    const h = k.holat.get(m.id);
    if (!y || !h || Math.abs(y.hajm) <= 1e-12) continue;
    const f2 = son(h.f2_hajm) ?? 0;
    const fakt = son(h.fakt_hajm) ?? 0;
    const faktA = yaxlit(fakt + (aDelta.get(m.id) ?? 0));
    const dalil = yaxlit(f2 + y.hajm);
    const delta = dalilFarqi(dalil, faktA);
    if (delta == null) continue;
    const f2s = son(h.f2_summa);
    let narx: number | null = null; let summa: number | null = null; let narxManba: TenglashNarxManba = 'narxsiz';
    if (Math.abs(f2) > 1e-12) {
      // F2 bor qator — F2 narxida (yadro narx qoidasi); F2 summasi noma’lum — summa noma’lum (to‘qilmaydi).
      const r = faktSummaF2Narxda(delta, f2, f2s, null, h.f2_summa_yoq);
      summa = r.summa; narx = r.narx; narxManba = r.manba === 'f2' && r.summa != null ? 'f2' : 'narxsiz';
    } else {
      const sn = k.smetaNarx?.(m.id) ?? son(h.smeta_narx);
      if (sn != null) { narx = sn; summa = yaxlit(delta * sn); narxManba = 'smeta'; }
    }
    const kesim = bosKatKesim(); katKesimgaQosh(kesim, m.kat, summa);
    const raqamlar = y.aktlar.map((a) => { const r = k.qoralamaRaqam?.get(a); return r ? `№${r}` : aktBelgi(a); });
    const hujjat = `qoralama F2 ${raqamlar.join(', ')}`;
    out.push({
      kalit: `qoralama:${m.id}`, id: m.id, tur: m.tur, nom: m.nom, birlik: m.birlik, bolim: m.bolim,
      manba: 'qoralama', hujjat, aktlar: y.aktlar, fakt: faktA, keyin: yaxlit(faktA + delta), delta, narx, summa, kesim, narxManba,
      paket: [{ qator_id: m.id, hajm: delta, narx_izoh: `Fakt tiklash: ${hujjat} hajmi`.slice(0, 480) }],
    });
  }
  return out;
}

/**
 * Tanlangan qatorlar → fakt_yoz_v2 paketi (faqat delta). Bir qatorning ikkala manbasi tanlangan bo‘lsa va ikkalasi ham
 * yig‘ma (manba_akt_qator_id siz) qator bo‘lsa — serverda bir hujjatda qator takrorlanmasligi uchun BITTA qatorga qo‘shiladi
 * (hajm yig‘indisi, F2 narxi/manbasi saqlanadi, izohlar birlashadi).
 */
export function tiklashPaket(satrlar: readonly TiklashSatr[], tanlangan: ReadonlySet<string>): FaktF2PaketQator[] {
  const out: FaktF2PaketQator[] = [];
  const yigma = new Map<number, FaktF2PaketQator>();
  for (const s of satrlar) {
    if (!tanlangan.has(s.kalit)) continue;
    for (const p of s.paket) {
      if (p.manba_akt_qator_id != null) { out.push({ ...p }); continue; }
      const bor = yigma.get(p.qator_id);
      if (!bor) { const n = { ...p }; yigma.set(p.qator_id, n); out.push(n); continue; }
      bor.hajm = yaxlit(bor.hajm + p.hajm);
      if (bor.narx == null && p.narx != null) bor.narx = p.narx;
      if (bor.narx_yoq && !p.narx_yoq) delete bor.narx_yoq;
      if (!bor.narx_manba && p.narx_manba) { bor.narx_manba = p.narx_manba; if (p.narx_manba_id != null) bor.narx_manba_id = p.narx_manba_id; }
      bor.narx_izoh = [bor.narx_izoh, p.narx_izoh].filter(Boolean).join(' | ').slice(0, 480);
    }
  }
  return out.filter((p) => Math.abs(p.hajm) > 1e-12 || p.manba_akt_qator_id != null);
}

export type TiklashManbaJami = { soni: number; ustamasiz: number | null; kesim: KatKesim; narxsiz: number };
export type TiklashJami = TiklashManbaJami & { f2: TiklashManbaJami; qoralama: TiklashManbaJami; paket: FaktF2PaketQator[]; manfiySoni: number; hujjatlar: string[] };

const bosJami = (): TiklashManbaJami => ({ soni: 0, ustamasiz: null, kesim: bosKatKesim(), narxsiz: 0 });

/** Tanlanganlar jami (manba bo‘yicha ham): summa NULL qator yig‘indiga kirmaydi, `narxsiz` da sanaladi. */
export function tiklashJami(satrlar: readonly TiklashSatr[], tanlangan: ReadonlySet<string>): TiklashJami {
  const j = bosJami(); const f2 = bosJami(); const qor = bosJami();
  let manfiySoni = 0; const hujjatlar: string[] = [];
  for (const s of satrlar) {
    if (!tanlangan.has(s.kalit)) continue;
    for (const x of [j, s.manba === 'f2' ? f2 : qor]) {
      x.soni += 1;
      if (s.summa == null) x.narxsiz += 1; else x.ustamasiz = yig([x.ustamasiz, s.summa]);
      kesimQosh(x.kesim, s.kesim);
    }
    if (s.delta < 0) manfiySoni += 1;
    if (!hujjatlar.includes(s.hujjat)) hujjatlar.push(s.hujjat);
  }
  return { ...j, f2, qoralama: qor, paket: tiklashPaket(satrlar, tanlangan), manfiySoni, hujjatlar };
}

/** Obyekt fakti «keyin»: hozirgi fakt + tanlangan taklif (summa va kategoriya kesimi). Hozirgi noma’lum bo‘lsa — faqat taklif. */
export function faktKeyin(hozir: { ustamasiz: number | null; kesim: KatKesim } | null | undefined, qosh: TiklashManbaJami): { ustamasiz: number | null; kesim: KatKesim } {
  const kesim = bosKatKesim();
  if (hozir) kesimQosh(kesim, hozir.kesim);
  kesimQosh(kesim, qosh.kesim);
  return { ustamasiz: yig([hozir?.ustamasiz ?? null, qosh.ustamasiz]), kesim };
}

/** Fakt hujjati izohi/sarlavhasi: qaysi hujjatlardan (uzunligi cheklangan). */
export const tiklashSarlavha = (obyektNom: string, hujjatlar: readonly string[]) => `${obyektNom} — ${hujjatlar.join('; ')}`.slice(0, 400);

// ── Kompaniya bo‘yicha xulosa (har obyekt: (a) va (b) dan potensial o‘sish) ──

/** t2_qator_holat dan kerakli ustunlar (kompaniya xulosasi uchun). */
export type KompHolat = {
  qator_id: number; tur: string; kat: string | null;
  fakt_hajm: number | null; fakt_summa: number | null; f2_hajm: number | null; f2_summa: number | null;
  f2_summa_yoq?: number | string | null; smeta_narx: number | null;
};
export type KompBlok = { soni: number; noma: number; ustamasiz: number | null; kesim: KatKesim };
export type ObyektTiklashXulosa = { fakt: { ustamasiz: number | null; kesim: KatKesim }; f2: { ustamasiz: number | null; kesim: KatKesim }; a: KompBlok; b: KompBlok };

const BARG = new Set(['bl', 'mat', 'ob', 'rs']);

/**
 * Bitta obyekt xulosasi. (a): tasdiqlangan F2 hajmi fakt dan oshgan qatorlar (ishora bilan), summa F2 narxida;
 * (b): qoralama F2 (tasdiqlangan F2 ustiga) (a) dan keyingi faktdan oshgan bl/mat/ob qatorlar. Faqat o‘qish; hech narsa yozilmaydi.
 */
export function obyektTiklashXulosa(holat: readonly KompHolat[], qoralama: ReadonlyMap<number, QoralamaYigma>): ObyektTiklashXulosa {
  const bosh = (): KompBlok => ({ soni: 0, noma: 0, ustamasiz: null, kesim: bosKatKesim() });
  const a = bosh(); const b = bosh();
  const faktKesim = bosKatKesim(); const f2Kesim = bosKatKesim();
  let faktJami: number | null = null; let f2Jami: number | null = null;
  for (const h of holat) {
    if (!BARG.has(h.tur)) continue;
    const f2 = son(h.f2_hajm) ?? 0; const fakt = son(h.fakt_hajm) ?? 0;
    const fs = faktSummaF2Narxda(son(h.fakt_hajm), son(h.f2_hajm), son(h.f2_summa), son(h.fakt_summa), h.f2_summa_yoq).summa;
    katKesimgaQosh(faktKesim, h.kat, fs); if (fs != null) faktJami = yig([faktJami, fs]);
    const f2s = Math.abs(f2) > 1e-12 && !(h.f2_summa_yoq != null && Number(h.f2_summa_yoq) > 0) ? son(h.f2_summa) : null;
    katKesimgaQosh(f2Kesim, h.kat, f2s); if (f2s != null) f2Jami = yig([f2Jami, f2s]);
    const da = dalilFarqi(f2, fakt);
    const blokQosh = (blok: KompBlok, summa: number | null) => {
      blok.soni += 1;
      if (summa == null) blok.noma += 1; else blok.ustamasiz = yig([blok.ustamasiz, summa]);
      katKesimgaQosh(blok.kesim, h.kat, summa);
    };
    if (da != null) blokQosh(a, faktSummaF2Narxda(da, f2, son(h.f2_summa), null, h.f2_summa_yoq).summa);
    const y = h.tur === 'rs' ? undefined : qoralama.get(h.qator_id);
    if (y && Math.abs(y.hajm) > 1e-12) {
      const db = dalilFarqi(yaxlit(f2 + y.hajm), yaxlit(fakt + (da ?? 0)));
      if (db != null) {
        const sn = son(h.smeta_narx);
        const summa = Math.abs(f2) > 1e-12 ? faktSummaF2Narxda(db, f2, son(h.f2_summa), null, h.f2_summa_yoq).summa : sn == null ? null : yaxlit(db * sn);
        blokQosh(b, summa);
      }
    }
  }
  return { fakt: { ustamasiz: faktJami, kesim: faktKesim }, f2: { ustamasiz: f2Jami, kesim: f2Kesim }, a, b };
}
