/**
 * ISH ↔ MATERIAL MUVOFIQLIGI — ish hajmi materiallar hajmiga mosmi (egasi 2026-11-11: «qo'lda hal qilingan muammo tizim
 * funksiyasiga aylanadi»). Qo'lda tuzilgan F2 da ish hajmi smetada qolib, materiallari fakt bo'yicha o'zgargan holatlar topildi:
 * «Кладка газобетон» 173,83 m³, lekin bloklar 99,55 + 38,265 + 13,25 = 151,065 m³; «Наружная теплоизоляция» 3,4 (100 m²), lekin
 * plita/to'r 143,4 m².
 *
 * Bu modul — smeta yadrosi (`smeta-anatomiya/ish-material`) ustiga yupqa qatlam (parallel aniqlagich EMAS):
 *   - bog'lanishni (qaysi material qaysi ishniki) `ishMaterialBoglanishlari` aniqlaydi va uning `k_norm` i (smetaning o'z
 *     material/ish nisbati) norma sifatida olinadi;
 *   - bu yerda faqat «asosiy material» tanlovi (nom kalitlari + o'lcham oilasi), Σ material ÷ norma = ish hajmi (birlik
 *     o'girish `ish-kartasi/birlik` orqali: 100 М2 ↔ М2, 100 М3 ↔ М3) va ogohlantirish.
 * HECH QACHON bloklamaydi (egasi: hajm hech qachon bloklanmaydi) — faqat ogohlantirish + «tuzatish taklifi» (kiritmaga
 * qo'yadi, saqlash — foydalanuvchi o'zi). NULL ≠ 0: hajm noma'lum / 0 / manfiy qator hech narsa isbotlamaydi — jim qoladi.
 * Toza funksiyalar; hech narsa yozilmaydi.
 */
import { asosgaAylantir, birlikAylantir, type AsosBirlik } from './ish-kartasi/birlik';
import { hajmMasshtab } from './hisob-yadro';
import { ishMaterialBoglanishlari, type IshMatQator } from './smeta-anatomiya/ish-material';

/** Sukut tolerans: ish hajmi materialdan hisoblangandan shuncha foizdan ko'p farq qilsa — ogohlantirish. */
export const MOSLIK_TOLERANS = 0.03;

export type MoslikGuruhKodi = 'gazobeton' | 'sendvich' | 'krovlya' | 'issiqlik';

type Komponent = { kod: string; mos: (nom: string) => boolean };
type Guruh = {
  kod: MoslikGuruhKodi;
  ish: (nom: string) => boolean;
  /** Asosiy material komponentlari (har biri alohida: plita va to'r ikkalasi ham butun maydonni qoplaydi). */
  komponentlar: readonly Komponent[];
  /** Material ishdan shuncha ulush ko'p bo'lishi me'yor (kровля: ustma-ust yotqizish ≈ 5 %) — norma ma'lum bo'lmaganda. */
  qoplama: number;
};

/** Nom kaliti: katta harf, Ё→Е, lotin o'xshash harflar kirillga (smeta nomlari aralash yoziladi). */
const LOTIN: Record<string, string> = { A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х', Y: 'У' };
export const moslikNomKaliti = (s: string | null | undefined): string =>
  (s ?? '').toUpperCase().replace(/Ё/g, 'Е').replace(/[ABCEHKMOPTXY]/g, (c) => LOTIN[c] ?? c).replace(/\s+/g, ' ').trim();

const GURUHLAR: readonly Guruh[] = [
  { kod: 'sendvich', qoplama: 0,
    ish: (n) => /СЕНДВИЧ|СЭНДВИЧ|САНДВИЧ/.test(n),
    komponentlar: [{ kod: 'panel', mos: (n) => /СЕНДВИЧ|СЭНДВИЧ|САНДВИЧ|ПАНЕЛ/.test(n) }] },
  { kod: 'gazobeton', qoplama: 0,
    ish: (n) => /КЛАДК/.test(n) && /ГАЗОБЕТОН|ГАЗОБЛОК|ПЕНОБЕТОН|ГАЗОСИЛИКАТ|ЯЧЕИСТ/.test(n),
    komponentlar: [{ kod: 'blok', mos: (n) => /БЛОК/.test(n) && !/КЛЕЙ|РАСТВОР|СМЕС/.test(n) }] },
  { kod: 'krovlya', qoplama: 0.05,
    ish: (n) => /КРОВЛ/.test(n) && /ПРОФ|МЕТАЛЛОЧЕРЕП/.test(n),
    komponentlar: [{ kod: 'profnastil', mos: (n) => /ПРОФНАСТИЛ|ПРОФЛИСТ|МЕТАЛЛОЧЕРЕП/.test(n) || (/ПРОФ/.test(n) && /НАСТИЛ|ЛИСТ/.test(n)) }] },
  { kod: 'issiqlik', qoplama: 0,
    ish: (n) => /ТЕПЛОИЗОЛЯЦ|УТЕПЛЕН|УТЕПЛИТЕЛ/.test(n),
    komponentlar: [
      { kod: 'plita', mos: (n) => /ПЛИТ|ПЕНОПЛАСТ|ПЕНОПОЛИСТИРОЛ|ЭППС|МИНЕРАЛЬН|МИНВАТ|ВАТ[АЫ]/.test(n) },
      { kod: 'setka', mos: (n) => /СЕТК/.test(n) },
    ] },
];

export const moslikGuruhi = (ishNom: string | null | undefined): MoslikGuruhKodi | null => {
  const n = moslikNomKaliti(ishNom);
  return GURUHLAR.find((g) => g.ish(n))?.kod ?? null;
};

export type MoslikIsh = { id?: number | null; nom: string | null; birlik: string | null; hajm: number | null };
export type MoslikMaterial = {
  id?: number | null; nom: string | null; birlik: string | null;
  /** Kiritilgan hajm (o'z birligida); noma'lum / 0 — komponent tekshirilmaydi (NULL ≠ 0). */
  hajm: number | null;
  /** Norma: material (o'z birligida) / 1 ish birligi (ish birligida). */
  norma?: number | null;
  /** Norma asos birliklarda (smeta yadrosining `k_norm`i: material / ish). `norma` bo'lsa — u ustun. */
  kNorm?: number | null;
};
export type MoslikOpsiya = { tolerans?: number };

export type MoslikNatija = {
  ishId: number | null;
  ishNom: string | null;
  guruh: MoslikGuruhKodi;
  /** Qaysi komponent asos bo'ldi (blok, plita, setka, profnastil, panel). */
  komponent: string;
  ishBirlik: string | null;
  /** Kiritilgan ish hajmi (ish birligida). */
  kiritilgan: number;
  /** Materiallardan hisoblangan ish hajmi = tuzatish taklifi (ish birligida, 6 xonagacha). */
  taklif: number;
  /** |kiritilgan − taklif| / |taklif|. */
  farqUlush: number;
  tolerans: number;
  /** Asos bo'lgan materiallar (ko'rsatish uchun). */
  materiallar: { id: number | null; nom: string | null; hajm: number; birlik: string | null }[];
  /** Materiallar yig'indisi (asos birlikda) va uning birligi. */
  materialJami: number;
  materialBirlik: AsosBirlik;
};

const musbat = (x: number | null | undefined): x is number => x != null && Number.isFinite(x) && x > 0;

/**
 * Bitta ish va uning materiallari. Natija null — ogohlantirish yo'q (mos, yoki tekshirib bo'lmaydi: guruh noma'lum,
 * hajm yo'q, o'lcham oilasi boshqa, komponentning biror materiali kiritilmagan). Ish hajmi KIRITILGAN qiymat bilan
 * solishtiriladi; ish hajmi biror komponent bergan oraliqqa (±tolerans) tushsa — mos.
 */
export function ishMaterialMoslik(ish: MoslikIsh, materiallar: readonly MoslikMaterial[], opsiya: MoslikOpsiya = {}): MoslikNatija | null {
  const tolerans = opsiya.tolerans ?? MOSLIK_TOLERANS;
  const guruh = GURUHLAR.find((g) => g.ish(moslikNomKaliti(ish.nom)));
  if (!guruh || !musbat(ish.hajm)) return null;
  const ishAsos = asosgaAylantir(ish.hajm, ish.birlik);
  if (!ishAsos) return null;

  type Natija = { kod: string; low: number; high: number; yigindi: number; royxat: MoslikNatija['materiallar'] };
  const natijalar: Natija[] = [];
  for (const kom of guruh.komponentlar) {
    // Boshqa o'lcham oilasidagi qator (m³ ↔ m², dona …) bu ish bilan solishtirilmaydi — komponentdan chiqariladi.
    const azolar = materiallar.filter((m) => kom.mos(moslikNomKaliti(m.nom)) && asosgaAylantir(1, m.birlik)?.asos === ishAsos.asos);
    if (!azolar.length || azolar.some((m) => !musbat(m.hajm))) continue; // kiritilmagan / 0 / manfiy a'zo — xulosa yo'q
    const asoslar = azolar.map((m) => asosgaAylantir(m.hajm, m.birlik));
    const yigindi = asoslar.reduce((s, a) => s + (a as { qiymat: number }).qiymat, 0);
    // Norma (asos birliklarda): aniq `norma` (o'z birliklarida) → `kNorm` → sukut 1 (+ guruh ustma-ust qoplamasi).
    let kBase: number | null = null;
    for (const m of azolar) {
      if (musbat(m.norma)) {
        const mb = asosgaAylantir(m.norma, m.birlik); const ib = asosgaAylantir(1, ish.birlik);
        if (mb && ib && mb.asos === ishAsos.asos) { kBase = mb.qiymat / ib.qiymat; break; }
      }
    }
    if (kBase == null) kBase = azolar.map((m) => m.kNorm).find(musbat) ?? null;
    const aniq = kBase != null;
    const k = kBase ?? 1;
    const high = yigindi / k;
    const low = aniq || guruh.qoplama <= 0 ? high : yigindi / (k * (1 + guruh.qoplama));
    natijalar.push({ kod: kom.kod, low, high, yigindi, royxat: azolar.map((m) => ({ id: m.id ?? null, nom: m.nom, hajm: m.hajm as number, birlik: m.birlik })) });
  }
  if (!natijalar.length) return null;

  // Biror komponent bergan oraliqqa tushsa — mos (komponentlar o'zaro farq qilsa ham jim: ehtiyotkor).
  if (natijalar.some((n) => ishAsos.qiymat >= n.low * (1 - tolerans) && ishAsos.qiymat <= n.high * (1 + tolerans))) return null;

  const asos = natijalar.reduce((a, b) => (b.high > a.high ? b : a));
  const taklif = hajmMasshtab(birlikAylantir(asos.low, ishAsos.asos, ish.birlik), 1);
  const kiritilgan = ish.hajm;
  if (taklif == null || !(taklif > 0)) return null;
  return {
    ishId: ish.id ?? null, ishNom: ish.nom, guruh: guruh.kod, komponent: asos.kod, ishBirlik: ish.birlik,
    kiritilgan, taklif, farqUlush: hajmMasshtab(Math.abs(kiritilgan - taklif) / taklif, 1) as number, tolerans,
    materiallar: asos.royxat, materialJami: hajmMasshtab(asos.yigindi, 1) as number, materialBirlik: ishAsos.asos,
  };
}

export type MoslikQator = IshMatQator & { norma?: number | string | null };
export type MoslikHajmlar = ReadonlyMap<number, number | null | undefined>;

/** Ish id → uning asosiy-material nomzodlari (hajmsiz): bir marta quriladi, hajmlar o'zgarganda qayta hisoblanmaydi. */
export type MoslikTuzilma = ReadonlyMap<number, { nom: string | null; birlik: string | null; materiallar: readonly Omit<MoslikMaterial, 'hajm'>[] }>;

/**
 * Tuzilma: faqat guruhi ma'lum ishlar. Bog'lanish — yadroning `ishMaterialBoglanishlari` i («bog'lanmaydi» va zamena merosi
 * olinmaydi; egasi «normal» degan — jim; tayyor bog'lanishlar berilsa qayta hisoblanmaydi); ish ichidagi `rs` bolalari
 * `norma` bilan qo'shiladi.
 */
export function moslikTuzilma(qatorlar: readonly MoslikQator[], boglanishlar?: ReturnType<typeof ishMaterialBoglanishlari>): MoslikTuzilma {
  const byId = new Map(qatorlar.map((r) => [r.id, r] as const));
  const soni = (v: unknown): number | null => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
  const out = new Map<number, { nom: string | null; birlik: string | null; materiallar: Omit<MoslikMaterial, 'hajm'>[] }>();
  const ish = (blId: number) => {
    let x = out.get(blId);
    if (!x) {
      const bl = byId.get(blId);
      if (!bl || bl.tur !== 'bl' || !moslikGuruhi(bl.nom)) return null;
      x = { nom: bl.nom ?? null, birlik: bl.birlik ?? null, materiallar: [] };
      out.set(blId, x);
    }
    return x;
  };
  for (const b of boglanishlar ?? ishMaterialBoglanishlari(qatorlar)) {
    if (b.bl_id == null || b.manba === 'zamena' || b.normal || b.ishonch === 'boglanmaydi') continue;
    const m = byId.get(b.mat_id);
    const x = m ? ish(b.bl_id) : null;
    if (m && x) x.materiallar.push({ id: m.id, nom: m.nom ?? null, birlik: m.birlik ?? null, kNorm: b.gayritabiiy ? null : b.k_norm });
  }
  // Ish ichidagi rs bolalari: norma = 1 ish birligiga resurs miqdori (o'z birligida).
  for (const r of qatorlar) {
    if (r.tur !== 'rs' || r.ota_id == null) continue;
    const norma = soni(r.norma);
    if (norma == null || !(norma > 0)) continue;
    const x = ish(r.ota_id);
    if (x) x.materiallar.push({ id: r.id, nom: r.nom ?? null, birlik: r.birlik ?? null, norma });
  }
  return out;
}

/** Tuzilma + kiritilgan hajmlar (qator id → hajm) → ogohlantirishlar. `hajmlar` da yo'q qator — kiritilmagan (NULL ≠ 0). `faqat` — shu ish idlari. */
export function moslikHisobla(tuzilma: MoslikTuzilma, hajmlar: MoslikHajmlar, opsiya: MoslikOpsiya & { faqat?: ReadonlySet<number> } = {}): MoslikNatija[] {
  const hajmOl = (id: number): number | null => { const h = hajmlar.get(id); return h == null || !Number.isFinite(h) ? null : h; };
  const out: MoslikNatija[] = [];
  for (const [blId, x] of tuzilma) {
    if (opsiya.faqat && !opsiya.faqat.has(blId)) continue;
    const n = ishMaterialMoslik({ id: blId, nom: x.nom, birlik: x.birlik, hajm: hajmOl(blId) }, x.materiallar.map((m) => ({ ...m, hajm: m.id == null ? null : hajmOl(m.id) })), opsiya);
    if (n) out.push(n);
  }
  return out;
}

/** Qulay qisqartma: smeta qatorlari + kiritilgan hajmlar → ogohlantirishlar (bir martalik chaqiruv). */
export function ishMaterialMoslikQatorlar(qatorlar: readonly MoslikQator[], hajmlar: MoslikHajmlar, opsiya: MoslikOpsiya & { faqat?: ReadonlySet<number> } = {}): MoslikNatija[] {
  return moslikHisobla(moslikTuzilma(qatorlar), hajmlar, opsiya);
}