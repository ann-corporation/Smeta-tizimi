/**
 * Uy sotish — shaxmatka (chessboard) ko'rinish modeli: sof funksiyalar (UI va testlar shuni ishlatadi).
 *  - shaxmatkaTuz: birliklar → podyezd ustun-guruhlari × qavat qatorlari (yuqori qavat tepada; qavatlar o'qi umumiy).
 *  - filtrMos: xonalar / maydon / narx / holat filtri.
 *  - ixcham: katta summani qisqa ko'rinishga (ming / mln / mlrd) — birlik nomini UI t() bilan tarjima qiladi.
 */
import type { Birlik, BirlikHolat } from '../../api/t2-sotuv';

export const HOLATLAR: readonly BirlikHolat[] = ['bosh', 'bron', 'sotilgan', 'zaxira', 'sotuvda_emas'];

/** Katak ranglari (dizayn tokenlari): bo'sh — yashil, bron — sariq, sotilgan — ko'k/kulrang, zaxira/sotuvda emas — xira. */
export const HOLAT_RANG: Record<BirlikHolat, string> = {
  bosh: 'border-ok/60 bg-ok/15 text-text hover:bg-ok/25',
  bron: 'border-warn/60 bg-warn/20 text-text hover:bg-warn/30',
  sotilgan: 'border-info/50 bg-info/15 text-text-dim hover:bg-info/25',
  zaxira: 'border-border bg-surface-2 text-text-mute hover:bg-surface-2/70',
  sotuvda_emas: 'border-dashed border-border bg-surface text-text-mute hover:bg-surface-2',
};
export const HOLAT_NUQTA: Record<BirlikHolat, string> = {
  bosh: 'bg-ok', bron: 'bg-warn', sotilgan: 'bg-info', zaxira: 'bg-text-mute', sotuvda_emas: 'bg-border',
};

export type ShaxmatkaFiltr = {
  xonalar: number[];               // bo'sh — hammasi; 4 — «4+»
  maydonDan: number | null; maydonGacha: number | null;
  narxDan: number | null; narxGacha: number | null;  // narx_jami bo'yicha
  holatlar: BirlikHolat[];         // bo'sh — hammasi
};
export const BOSH_FILTR: ShaxmatkaFiltr = { xonalar: [], maydonDan: null, maydonGacha: null, narxDan: null, narxGacha: null, holatlar: [] };

export function filtrBormi(f: ShaxmatkaFiltr): boolean {
  return f.xonalar.length > 0 || f.holatlar.length > 0 || [f.maydonDan, f.maydonGacha, f.narxDan, f.narxGacha].some((x) => x != null);
}

/** Birlik filtrga mosmi. Narxsiz birlik narx oralig'i berilganda mos EMAS (NULL ≠ 0). */
export function filtrMos(b: Birlik, f: ShaxmatkaFiltr): boolean {
  if (f.holatlar.length && !f.holatlar.includes(b.holat)) return false;
  if (f.xonalar.length) {
    const x = b.xona_soni;
    if (x == null) return false;
    const ok = f.xonalar.some((k) => (k >= 4 ? x >= 4 : x === k));
    if (!ok) return false;
  }
  if (f.maydonDan != null && (b.maydon == null || b.maydon < f.maydonDan)) return false;
  if (f.maydonGacha != null && (b.maydon == null || b.maydon > f.maydonGacha)) return false;
  if (f.narxDan != null && (b.narx_jami == null || b.narx_jami < f.narxDan)) return false;
  if (f.narxGacha != null && (b.narx_jami == null || b.narx_jami > f.narxGacha)) return false;
  return true;
}

/** Raqamlarni tabiiy tartibda solishtirish: «2» < «10», «1-02-3» < «1-10-1». */
export function raqamSolishtir(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

export type ShaxmatkaPodyezd = { podyezd: number; ustunlar: number; qavatlar: Map<number, Birlik[]> };
export type ShaxmatkaTuzilma = { qavatlar: number[]; podyezdlar: ShaxmatkaPodyezd[] };

/**
 * Shaxmatka tuzilmasi. Qavatlar o'qi butun bino uchun umumiy (kamayish tartibida) — podyezdlar yonma-yon tekislanadi.
 * Har podyezdning ustunlar soni = shu podyezddagi eng ko'p birlikli qavat.
 */
export function shaxmatkaTuz(birliklar: readonly Birlik[]): ShaxmatkaTuzilma {
  const pmap = new Map<number, Map<number, Birlik[]>>();
  const qset = new Set<number>();
  for (const b of birliklar) {
    const p = b.podyezd ?? 1; const q = b.qavat ?? 0;
    qset.add(q);
    if (!pmap.has(p)) pmap.set(p, new Map());
    const qm = pmap.get(p)!;
    if (!qm.has(q)) qm.set(q, []);
    qm.get(q)!.push(b);
  }
  const podyezdlar: ShaxmatkaPodyezd[] = [...pmap.entries()].sort((a, b) => a[0] - b[0]).map(([podyezd, qavatlar]) => {
    let ustunlar = 0;
    for (const r of qavatlar.values()) { r.sort((x, y) => raqamSolishtir(x.raqam, y.raqam)); ustunlar = Math.max(ustunlar, r.length); }
    return { podyezd, ustunlar, qavatlar };
  });
  return { qavatlar: [...qset].sort((a, b) => b - a), podyezdlar };
}

export type IxchamBirlik = '' | 'ming' | 'mln' | 'mlrd';
/** 1 250 000 000 → { son: '1.25', birlik: 'mlrd' }. Ko'rsatish uchun (hisob emas). */
export function ixcham(n: number | null | undefined): { son: string; birlik: IxchamBirlik } | null {
  if (n == null || !Number.isFinite(n)) return null;
  const a = Math.abs(n);
  const kes = (x: number, k: number) => String(Number(x.toFixed(k)));
  if (a >= 1e9) return { son: kes(n / 1e9, 2), birlik: 'mlrd' };
  if (a >= 1e6) return { son: kes(n / 1e6, a >= 1e8 ? 0 : 1), birlik: 'mln' };
  if (a >= 1e3) return { son: kes(n / 1e3, 0), birlik: 'ming' };
  return { son: kes(n, 0), birlik: '' };
}

/** Tanlangan birliklar xulosasi (ommaviy narx dialogi uchun). Bron/sotilgan — narx o'zgarmaydi (server ham o'tkazib yuboradi). */
export function tanlovXulosa(birliklar: readonly Birlik[], idlar: ReadonlySet<number>) {
  const tanlangan = birliklar.filter((b) => idlar.has(b.id));
  const ozgaradi = tanlangan.filter((b) => b.holat !== 'bron' && b.holat !== 'sotilgan');
  return { soni: tanlangan.length, ozgaradi: ozgaradi.length, otkaziladi: tanlangan.length - ozgaradi.length,
    narxsiz: ozgaradi.filter((b) => b.narx_m2 == null).length, ids: ozgaradi.map((b) => b.id) };
}

/** Ommaviy narx o'zgarishi oldindan ko'rinishi (server bilan bir xil formula; yakuniy qiymatni server yaxlitlaydi). */
export function yangiNarxM2(eski: number | null, usul: 'foiz' | 'summa_m2' | 'yangi_m2', qiymat: number): number | null {
  if (usul === 'yangi_m2') return qiymat > 0 ? qiymat : null;
  if (eski == null) return null;
  const y = usul === 'foiz' ? eski * (1 + qiymat / 100) : eski + qiymat;
  return y > 0 ? y : null;
}
