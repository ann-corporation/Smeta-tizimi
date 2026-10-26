/**
 * Versiya farqi va da'vo — PUL hisobi (sof funksiyalar).
 * Narx: joriy smeta katalogidan (t2_qator rs/mat/ob: shifr → eng ko'p uchragan narx va kategoriya), NDS SIZ. Eski va joriy
 * pozitsiya BIR XIL katalog bilan narxlanadi — farq faqat hajm/tarkibdan (qo'lda solishtiruv usuli bilan bir xil).
 * Ustamali summa bu yerda hisoblanmaydi: har summa kategoriya kesimi (`KatKesim`) bilan qaytadi, ustamali — chaqiruvchida
 * yagona kaskad (`useUstamaliSumma` / `SummaJuft`) orqali. NULL ≠ 0: narxi yo'q resurs summaga 0 bo'lib kirmaydi —
 * `narxsiz` soni bilan alohida ko'rsatiladi; hech bir resursi narxlanmagan pozitsiya summasi — null.
 */
import { bosKatKesim, katKesimgaQosh, type KatKesim } from '../ustamali-summa';
import { kodNorm } from './pozitsiya';
import type { JQator } from './pozitsiya';
import type { MoslikHolat, Qaror, VResurs } from './turlar';
import { son } from './turlar';

export type KatalogNarx = { narx: number; kat: string | null };
export type Katalog = Map<string, KatalogNarx>;

const RES_TUR = new Set(['rs', 'mat', 'ob']);

/** Joriy smeta qatorlaridan narx katalogi: shifr → eng ko'p uchragan narx (va kategoriya). Narx NULL qatorlar kirmaydi. */
export function katalogQur(rows: readonly JQator[]): Katalog {
  const sanoq = new Map<string, Map<number, number>>();
  const katlar = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (!RES_TUR.has(r.tur ?? '')) continue;
    const k = kodNorm(r.kod); const n = son(r.narx);
    if (!k || n == null) continue;
    const m = sanoq.get(k) ?? new Map<number, number>(); m.set(n, (m.get(n) ?? 0) + 1); sanoq.set(k, m);
    if (r.kat) { const c = katlar.get(k) ?? new Map<string, number>(); c.set(r.kat, (c.get(r.kat) ?? 0) + 1); katlar.set(k, c); }
  }
  const eng = <T,>(m: Map<T, number>): T | null => { let b: T | null = null; let bn = -1; for (const [x, n] of m) if (n > bn) { b = x; bn = n; } return b; };
  const out: Katalog = new Map();
  for (const [k, m] of sanoq) out.set(k, { narx: eng(m)!, kat: katlar.has(k) ? eng(katlar.get(k)!) : null });
  return out;
}

export type PozPul = {
  /** NDS siz to'g'ri xarajat; null — hech bir resurs narxlanmadi (noma'lum, 0 emas). */
  summa: number | null;
  kesim: KatKesim;
  /** Narxi topilmagan (yoki hajmi noma'lum) resurslar soni — summa to'liq emas. */
  narxsiz: number;
};

/** Pozitsiya narxi: resurslar × katalog narxi. Resurssiz pozitsiya (material/uskuna qatori) — o'zi resurs. */
export function pozitsiyaPul(p: { kod: string | null; nom: string | null; birlik: string | null; hajm: number | null; resurslar: readonly VResurs[] }, k: Katalog): PozPul {
  const kesim = bosKatKesim();
  const resurslar = p.resurslar.length ? p.resurslar : [{ kod: p.kod, nom: p.nom, birlik: p.birlik, norma: 1, hajm: p.hajm }];
  let summa = 0; let narxlandi = 0; let narxsiz = 0;
  for (const r of resurslar) {
    let q = r.hajm;
    if (q == null && r.norma != null && p.hajm != null) q = r.norma * p.hajm;
    const n = k.get(kodNorm(r.kod));
    if (q == null) { narxsiz++; continue; }
    if (!n) { if (q !== 0) narxsiz++; continue; }
    const s = q * n.narx;
    katKesimgaQosh(kesim, n.kat, s);
    summa += s; narxlandi++;
  }
  return { summa: narxlandi ? summa : (narxsiz ? null : 0), kesim, narxsiz };
}

/** Kesimni songa ko'paytirish (masalan da'vo hajmi / pozitsiya hajmi). */
export function kesimKopaytir(k: KatKesim, f: number): KatKesim {
  const s: KatKesim['summalar'] = {};
  for (const [kat, v] of Object.entries(k.summalar)) s[kat as keyof KatKesim['summalar']] = (v ?? 0) * f;
  return { summalar: s, nomalum: k.nomalum * f, nomalumSoni: k.nomalumSoni, summasizSoni: k.summasizSoni };
}

/** a + f·b (yig'ish uchun; f = −1 — ayirish). */
export function kesimQosh(a: KatKesim, b: KatKesim, f = 1): KatKesim {
  const s: KatKesim['summalar'] = { ...a.summalar };
  for (const [kat, v] of Object.entries(b.summalar)) { const kk = kat as keyof KatKesim['summalar']; s[kk] = (s[kk] ?? 0) + f * (v ?? 0); }
  return { summalar: s, nomalum: a.nomalum + f * b.nomalum, nomalumSoni: a.nomalumSoni + b.nomalumSoni, summasizSoni: a.summasizSoni + b.summasizSoni };
}

/**
 * Da'vo hajmi — bazadagi `t2_smeta_versiya_dava_hajm()` bilan AYNAN bir xil qoida (egasi qarori 2026-10-26):
 * qurilgan → eski hajm; qisman → kiritilgan; o'chirilgan/almashtirilgan → to'liq qurilgan hajm; aks holda
 * max(qurilgan − joriy, 0); joriy hajm noma'lum yoki birlik farq — null (to'qilmaydi).
 */
export function davaHajm(m: { holat: MoslikHolat; qaror: Qaror; eskiHajm: number | null; qurilganHajm: number | null; joriyHajm: number | null; birlikFarq: boolean }): number | null {
  if (m.qaror !== 'qurilgan' && m.qaror !== 'qisman') return null;
  const q = m.qaror === 'qurilgan' ? m.eskiHajm : m.qurilganHajm;
  if (q == null) return null;
  if (m.holat === 'ochirilgan' || m.holat === 'almashtirilgan') return q;
  if (m.holat === 'yangi') return null;
  if (m.joriyHajm == null || m.birlikFarq) return null;
  return Math.max(q - m.joriyHajm, 0);
}

/** Egasi qarori kerakmi: ekspertiza hajmni kesgan (yoki kesgan bo'lishi mumkin) pozitsiya. */
export function qarorKerak(m: { holat: MoslikHolat; eskiHajm: number | null; joriyHajm: number | null; birlikFarq: boolean }): boolean {
  if (m.holat === 'kamaygan' || m.holat === 'ochirilgan' || m.holat === 'almashtirilgan') return true;
  if (m.holat !== 'noaniq') return false;
  if (m.birlikFarq || m.eskiHajm == null || m.joriyHajm == null) return true;
  return m.eskiHajm > m.joriyHajm;
}

/** Bir moslik qatorining pul ko'rinishi. */
export type QatorPul = {
  eski: PozPul | null;
  joriy: PozPul | null;
  /** joriy − eski (ustamasiz); null — biror tomon summasi noma'lum. */
  farq: number | null;
  farqKesim: KatKesim | null;
  davaHajm: number | null;
  /** Da'vo summasi (ustamasiz) va kesimi; null — hisoblab bo'lmadi. */
  dava: number | null;
  davaKesim: KatKesim | null;
};

export function qatorPul(
  m: { holat: MoslikHolat; qaror: Qaror; eskiHajm: number | null; qurilganHajm: number | null; joriyHajm: number | null; birlikFarq: boolean },
  eski: PozPul | null, joriy: PozPul | null,
): QatorPul {
  const bos = { summa: 0, kesim: bosKatKesim(), narxsiz: 0 };
  const e = eski ?? (m.holat === 'yangi' ? bos : null);
  const j = joriy ?? (m.holat === 'ochirilgan' ? bos : null);
  const farq = e?.summa != null && j?.summa != null ? j.summa - e.summa : null;
  const farqKesim = farq != null ? kesimQosh(j!.kesim, e!.kesim, -1) : null;
  const dh = davaHajm(m);
  let dava: number | null = null; let davaKesim: KatKesim | null = null;
  if (dh != null) {
    const joriydan = joriy?.summa != null && m.joriyHajm != null && m.joriyHajm > 0 && !m.birlikFarq && m.holat !== 'ochirilgan' && m.holat !== 'almashtirilgan';
    if (joriydan) { const f = dh / m.joriyHajm!; dava = joriy!.summa! * f; davaKesim = kesimKopaytir(joriy!.kesim, f); }
    else if (eski?.summa != null && m.eskiHajm != null && m.eskiHajm > 0) { const f = dh / m.eskiHajm; dava = eski.summa * f; davaKesim = kesimKopaytir(eski.kesim, f); }
    else if (dh === 0) { dava = 0; davaKesim = bosKatKesim(); }
  }
  return { eski: e, joriy: j, farq, farqKesim, davaHajm: dh, dava, davaKesim };
}

/** Bo'lim (LS) bo'yicha jami. Kesilgan/oshgan — qator farqlari ishorasi bo'yicha. */
export type BolimJami = {
  kalit: string; lsKod: string | null; lsNom: string | null;
  eski: number; joriy: number; kesilgan: number; oshgan: number;
  kesilganKesim: KatKesim; dava: number; davaKesim: KatKesim;
  soni: number; noaniq: number; qarorKutilmoqda: number; narxsiz: number; summasiz: number;
};

export function bosBolim(kalit: string, lsKod: string | null, lsNom: string | null): BolimJami {
  return { kalit, lsKod, lsNom, eski: 0, joriy: 0, kesilgan: 0, oshgan: 0, kesilganKesim: bosKatKesim(), dava: 0, davaKesim: bosKatKesim(), soni: 0, noaniq: 0, qarorKutilmoqda: 0, narxsiz: 0, summasiz: 0 };
}

export function bolimgaQosh(b: BolimJami, p: QatorPul, x: { holat: MoslikHolat; qaror: Qaror; qarorKerak: boolean }): void {
  b.soni++;
  if (x.holat === 'noaniq') b.noaniq++;
  if (x.qarorKerak && x.qaror === 'kutilmoqda') b.qarorKutilmoqda++;
  if ((p.eski?.narxsiz ?? 0) + (p.joriy?.narxsiz ?? 0) > 0) b.narxsiz++;
  if (p.eski?.summa != null) b.eski += p.eski.summa;
  if (p.joriy?.summa != null) b.joriy += p.joriy.summa;
  if (p.farq == null) b.summasiz++;
  else if (p.farq < 0) { b.kesilgan += -p.farq; b.kesilganKesim = kesimQosh(b.kesilganKesim, p.farqKesim!, -1); }
  else if (p.farq > 0) b.oshgan += p.farq;
  if (p.dava != null) { b.dava += p.dava; b.davaKesim = kesimQosh(b.davaKesim, p.davaKesim!); }
}
