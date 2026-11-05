/**
 * F2 STORNO (pereraschet): mavjud F2 aktning tanlangan qatorlaridan YANGI qoralama — hajm va summa minus, narx o'sha.
 * Egasi: «eski F2 bittada minus bo'ladi, yangisi bo'yicha F2 tayyorlanib olinadi». Asl akt O'ZGARMAYDI (tasdiqlangan F2 —
 * yuridik hujjat); tuzatish faqat yangi hujjat orqali.
 *
 * Qoidalar:
 *  - NULL ≠ 0: noma'lum summa noma'lum qoladi (minusga aylantirilganda ham null); narx yo'q — «narx ataylab yo'q».
 *  - Pul faqat yagona yadro (`hisob-yadro`) orqali yig'iladi; bu yerda hisob-kitob yo'q, faqat ishora almashtiriladi.
 *  - Fakt (tanlov, `StornoFaktRejim`): sukut — 0 ga tushadi: har tanlangan qator uchun joriy fakt hajmiga teng MINUS fakt yozuvi
 *    (mavjud `sbFaktYoz` yo'li); «o'zgartirma» — fakt allaqachon to'g'rilangan, hech narsa yozilmaydi.
 *    O'tgan fakt yozuvlari hech qachon o'chirilmaydi va o'zgartirilmaydi.
 */
import { yigindi2 } from './hisob-yadro';

export const STORNO_MANBA = 'storno';

export type StornoManbaQator = {
  qator_id: number;
  hajm?: number | string | null;
  certified_quantity?: number | string | null;
  certified_unit_price?: number | string | null;
  certified_amount?: number | string | null;
  narx?: number | string | null;
  summa?: number | string | null;
  provenance_status?: string | null;
};

export type StornoYukQator = {
  qatorId: number;
  certifiedQuantity: number;
  certifiedUnitPrice?: number;
  certifiedAmount?: number;
  priceIntentionallyAbsent: boolean;
  rawSnapshot: Record<string, unknown>;
  izoh: string;
};

const son = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
/** −0 bo'lmasin (JSON da «0» emas «-0» chiqmasligi uchun). */
const neg = (x: number): number => (x === 0 ? 0 : -x);

export type StornoQatorNatija =
  | { tur: 'qator'; qator: StornoYukQator; summaNomalum: boolean }
  | { tur: 'otkaz'; sabab: 'nol' | 'hajmsiz' };

/** Bitta manba qatori → storno qatori (yoki nega o'tkazilmagani). Hajm 0 yoki noma'lum qatorni stornolab bo'lmaydi. */
export function stornoQator(x: StornoManbaQator, aktId: number): StornoQatorNatija {
  const q = son(x.certified_quantity) ?? son(x.hajm);
  if (q == null) return { tur: 'otkaz', sabab: 'hajmsiz' };
  if (q === 0) return { tur: 'otkaz', sabab: 'nol' };
  const narxYoq = x.provenance_status === 'price_intentionally_absent';
  const narx = narxYoq ? null : (son(x.certified_unit_price) ?? son(x.narx));
  const summa = narxYoq ? null : (son(x.certified_amount) ?? son(x.summa));
  // Server narx bilan birga summani ham talab qiladi; summa noma'lum bo'lsa, narx ham «ataylab yo'q» deb o'tadi (0 to'qilmaydi).
  const aniq = narx != null && summa != null;
  const hajm = neg(q);
  const summaMinus = aniq ? neg(summa) : undefined;
  return {
    tur: 'qator',
    summaNomalum: !aniq,
    qator: {
      qatorId: x.qator_id, certifiedQuantity: hajm,
      certifiedUnitPrice: aniq ? narx : undefined, certifiedAmount: summaMinus,
      priceIntentionallyAbsent: !aniq,
      rawSnapshot: {
        source: STORNO_MANBA, stornoOf: aktId, sourceReference: `storno:${aktId}`,
        enteredQuantity: hajm, enteredUnitPrice: aniq ? narx : undefined, enteredAmount: summaMinus,
      },
      izoh: 'Сторно (eski F2)',
    },
  };
}

export type StornoReja = {
  qatorlar: StornoYukQator[];
  /** Σ minus summa (faqat ma'lum summalar; yagona yadro). */
  jami: number;
  /** Summasi noma'lum qatorlar soni (NULL — 0 emas). */
  nomalum: number;
  nolHajm: number;
  hajmsiz: number;
};

/** Tanlangan (`tanlangan` berilsa) yoki barcha qatorlardan storno rejasi. Tanlanmagan qatorlar stornolanmaydi. */
export function stornoQur(manba: readonly StornoManbaQator[], aktId: number, tanlangan?: ReadonlySet<number>): StornoReja {
  const qatorlar: StornoYukQator[] = [];
  let nomalum = 0; let nolHajm = 0; let hajmsiz = 0;
  for (const x of manba) {
    if (tanlangan && !tanlangan.has(x.qator_id)) continue;
    const n = stornoQator(x, aktId);
    if (n.tur === 'otkaz') { if (n.sabab === 'nol') nolHajm++; else hajmsiz++; continue; }
    if (n.summaNomalum) nomalum++;
    qatorlar.push(n.qator);
  }
  return { qatorlar, jami: yigindi2(qatorlar.map((q) => q.certifiedAmount)), nomalum, nolHajm, hajmsiz };
}

/* ── Ikki marta storno qilishdan himoya ─────────────────────────────────────────────────────────────────────────── */
export type StornoReestrAkt = { id: number; raqam?: string | null; holat?: string | null; lifecycle_status?: string | null };

/** Bekor/rad etilmagan (faol) storno aktlar. */
export function faolStornolar(stornoAktIdlar: readonly number[], reestr: readonly StornoReestrAkt[]): StornoReestrAkt[] {
  const ids = new Set(stornoAktIdlar);
  return reestr.filter((a) => ids.has(a.id) && a.holat !== 'bekor'
    && a.lifecycle_status !== 'cancelled' && a.lifecycle_status !== 'rejected' && a.lifecycle_status !== 'superseded');
}

/**
 * Aktni storno qilish mumkinmi (egasi 2026-11-05): FAQAT TASDIQLANGAN F2 (`holat='tasdiqlangan'`, lifecycle bo'lsa `approved`).
 * Qoralama / yuborilgan / bekor / rad / almashtirilgan (superseded) — storno manbai emas (imzolanmagan hujjatni «stornolash» yo'q).
 */
export const stornoQilinadiAkt = (a: StornoReestrAkt & { tur?: string | null }): boolean =>
  (a.tur == null || a.tur === 'f2') && a.holat === 'tasdiqlangan' && (a.lifecycle_status == null || a.lifecycle_status === 'approved');

/** Storno tanlagichi uchun obyekt F2 aktlari: faqat tasdiqlanganlari, yangisi tepada. */
export function stornoNomzodAktlar<T extends StornoReestrAkt & { tur?: string | null }>(reestr: readonly T[]): T[] {
  return reestr.filter(stornoQilinadiAkt).sort((a, b) => b.id - a.id);
}

/* ── Fakt ham 0 ga: minus fakt yozuvlari ────────────────────────────────────────────────────────────────────────── */
/** Storno paytida fakt bilan nima qilinadi: `nolga` — minus yozuv bilan 0 ga (sukut, eski oqim); `ozgartirma` — fakt tegilmaydi. */
export type StornoFaktRejim = 'nolga' | 'ozgartirma';
export type StornoFaktHolat = { qator_id: number; tur?: string | null; fakt_hajm?: number | string | null };
export type StornoFaktYozuv = { qator_id: number; hajm: number; izoh: string };
export type StornoFaktReja = {
  yozuvlar: StornoFaktYozuv[];
  /** Fakti bor, lekin qo'lda yozib bo'lmaydigan (rs — fakt BL normasidan hosil bo'ladi) qatorlar. */
  hosila: number;
};

/** Faktni qo'lda yozish mumkin bo'lgan turlar (server: t2_fakt_yoz_v2 — faqat bl/mat/ob). */
const FAKT_TURLAR = new Set(['bl', 'mat', 'ob']);

/**
 * Tanlangan qatorlar uchun joriy fakt hajmiga teng MINUS yozuv → sof fakt 0. Fakt noma'lum/0 bo'lsa yozuv yo'q.
 * Tanlanmagan qatorlar umuman kirmaydi (ularning fakti saqlanadi).
 */
export function stornoFaktReja(tanlanganIdlar: ReadonlySet<number>, holat: readonly StornoFaktHolat[], aktRaqam: string): StornoFaktReja {
  const yozuvlar: StornoFaktYozuv[] = []; let hosila = 0;
  for (const h of holat) {
    if (!tanlanganIdlar.has(h.qator_id)) continue;
    const f = son(h.fakt_hajm);
    if (f == null || f === 0) continue;
    if (!FAKT_TURLAR.has(String(h.tur ?? ''))) { hosila++; continue; }
    yozuvlar.push({ qator_id: h.qator_id, hajm: neg(f), izoh: `Сторно F2 №${aktRaqam}: fakt 0 ga` });
  }
  return { yozuvlar, hosila };
}

/* ── Qoralamani qayta saqlashda storno blokini saqlab qolish ────────────────────────────────────────────────────── */
export type SaqlanganAktQator = StornoManbaQator & { raw_snapshot?: unknown };

export const stornoQatorimi = (x: { raw_snapshot?: unknown }): boolean =>
  !!x.raw_snapshot && typeof x.raw_snapshot === 'object' && (x.raw_snapshot as { source?: unknown }).source === STORNO_MANBA;

/**
 * F2 tayyorlash qoralamani yangilaganda (qatorlar to'liq almashtiriladi) storno qatorlari yo'qolmasin: ular hujjat BOSHIDA
 * aynan o'zi bilan qayta yuboriladi, yangi qatorlar ular ostiga qo'shiladi.
 *
 * Storno bloki va yangi blok MUSTAQIL (egasi 2026-11-05, pereraschet): bir smeta qatori storno blokida (eski F2 minus) VA
 * yangi blokda (to'g'rilangan faktdan plyus) bir vaqtda bo'la oladi. Storno qatori — `raw_snapshot.source === STORNO_MANBA`.
 * Takror faqat har blok ICHIDA olib tashlanadi (birinchisi qoladi; `ichkiTakror` — nechtasi).
 * `ikkalasida` — ikkala blokda bor qatorlar soni (axborot).
 * `birXilQatorTashla` — faqat server bir qatorni bir hujjatda ikki marta qabul qilmasa (DUPLICATE_F2_SOURCE_LINE) va foydalanuvchi
 * ongli rozi bo'lsa: ikkala blokdagi yangi qator tashlanadi (eski xatti-harakat).
 */
export function stornoBlokniSaqla<T extends { qatorId: number }>(saqlangan: readonly SaqlanganAktQator[], yangi: readonly T[], opt?: { birXilQatorTashla?: boolean }): {
  qatorlar: Array<StornoYukQator | T>; stornoSoni: number; ikkalasida: number; ichkiTakror: number; tashlandi: number;
} {
  const blok: StornoYukQator[] = [];
  const band = new Set<number>();
  let ichkiTakror = 0;
  for (const x of saqlangan) {
    if (!stornoQatorimi(x)) continue;
    const q = son(x.certified_quantity) ?? son(x.hajm);
    if (q == null || q === 0) continue;
    if (band.has(x.qator_id)) { ichkiTakror++; continue; }
    band.add(x.qator_id);
    const narxYoq = x.provenance_status === 'price_intentionally_absent';
    const narx = narxYoq ? null : son(x.certified_unit_price);
    const summa = narxYoq ? null : son(x.certified_amount);
    const aniq = narx != null && summa != null;
    blok.push({
      qatorId: x.qator_id, certifiedQuantity: q,
      certifiedUnitPrice: aniq ? narx : undefined, certifiedAmount: aniq ? summa : undefined, priceIntentionallyAbsent: !aniq,
      rawSnapshot: (x.raw_snapshot as Record<string, unknown>) ?? { source: STORNO_MANBA }, izoh: 'Сторно (eski F2)',
    });
  }
  const yangiBand = new Set<number>();
  const qolgan: T[] = [];
  let ikkalasida = 0; let tashlandi = 0;
  for (const y of yangi) {
    if (yangiBand.has(y.qatorId)) { ichkiTakror++; continue; }
    yangiBand.add(y.qatorId);
    if (band.has(y.qatorId)) {
      ikkalasida++;
      if (opt?.birXilQatorTashla) { tashlandi++; continue; }
    }
    qolgan.push(y);
  }
  return { qatorlar: [...blok, ...qolgan], stornoSoni: blok.length, ikkalasida, ichkiTakror, tashlandi };
}

/**
 * Shu qoralamadagi storno blokining qaytaradigan hajmi: qator_id → eski F2 hajmi (= −Σ storno hajmi).
 * F2 tayyorlash bu hajmni «tasdiqlangan F2» dan chiqaradi: stornolanayotgan eski F2 sof 0 bo'ladi, yangi hajm
 * = to'liq fakt − BOSHQA tasdiqlangan F2 lar.
 */
export function stornoQaytarHajm(saqlangan: readonly SaqlanganAktQator[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const x of saqlangan) {
    if (!stornoQatorimi(x)) continue;
    const q = son(x.certified_quantity) ?? son(x.hajm);
    if (q == null || q === 0) continue;
    m.set(x.qator_id, (m.get(x.qator_id) ?? 0) - q);
  }
  return m;
}
