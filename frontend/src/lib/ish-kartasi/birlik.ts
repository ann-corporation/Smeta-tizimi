/**
 * ISH KARTASI — birliklar (egasi 2026-11-05): smeta birligi (100М3, 1000М3, 100М2, Т, М3 …) ↔ amaliy birlik (м, м², м³, шт,
 * комплект, т, кг). Birlik o'girish FAQAT shu yerda (`birlikAylantir`). Toza funksiyalar; NULL ≠ 0 — o'girib bo'lmasa null.
 */

export type AsosBirlik = 'М3' | 'М2' | 'М' | 'Т' | 'КГ' | 'ШТ' | 'КОМПЛЕКТ';
export type BirlikTahlil = { asos: AsosBirlik; kopaytuvchi: number };

/** Amaliy birliklar (karta birligi; migratsiya CHECK bilan bir xil). */
export const AMALIY_BIRLIKLAR = ['м', 'м²', 'м³', 'шт', 'комплект', 'т', 'кг'] as const;
export type AmaliyBirlik = typeof AMALIY_BIRLIKLAR[number];

const LOTIN: Record<string, string> = { A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х', Y: 'У' };

/** Birlik matni kaliti: katta harf, lotin o'xshash harflar kirillga, ² ³ → 2 3, bo'shliq/nuqta olib tashlanadi. */
export function birlikKaliti(b: string | null | undefined): string {
  return (b ?? '').toUpperCase().replace(/Ё/g, 'Е').replace(/²/g, '2').replace(/³/g, '3')
    .replace(/[ABCEHKMOPTXY]/g, (c) => LOTIN[c] ?? c).replace(/[\s.,]/g, '');
}

const ASOS: ReadonlyArray<readonly [RegExp, AsosBirlik]> = [
  [/^(М3|КУБМ|КУБ)$/, 'М3'],
  [/^(М2|КВМ|МКВ)$/, 'М2'],
  [/^(М|ПМ|ПОГМ|МП|ПОГОНМ|МПОГ)$/, 'М'],
  [/^(Т|ТН|ТОНН|ТОННА)$/, 'Т'],
  [/^(КГ)$/, 'КГ'],
  [/^(ШТ|ШТУК|ШТУКА|ШТУКИ)$/, 'ШТ'],
  [/^(КОМПЛЕКТ|КОМПЛ|КОМП)$/, 'КОМПЛЕКТ'],
];
/** Ko'paytuvchili asos nomlari: КМ = 1000 М. */
const KARRALI: ReadonlyArray<readonly [RegExp, AsosBirlik, number]> = [[/^КМ$/, 'М', 1000]];

/**
 * «100М3» → {М3, 100}; «М3» → {М3, 1}; «1 000 м2» → {М2, 1000}; «ПОГ.М» → {М, 1}; «КМ» → {М, 1000};
 * «ТЫС.ШТ» → {ШТ, 1000}; «10 ТЫС.ШТ» → {ШТ, 10000}; notanish → null.
 */
export function birlikTahlil(b: string | null | undefined): BirlikTahlil | null {
  const k = birlikKaliti(b);
  const m = /^(\d+)?(.+)$/.exec(k);
  if (!m) return null;
  let kop = m[1] ? Number(m[1]) : 1;
  if (!Number.isFinite(kop) || kop <= 0) return null;
  let qism = m[2];
  const tys = /^(ТЫСЯЧ|ТЫС)(.+)$/.exec(qism);
  if (tys) { kop *= 1000; qism = tys[2]; }
  const karrali = KARRALI.find(([re]) => re.test(qism));
  if (karrali) return { asos: karrali[1], kopaytuvchi: kop * karrali[2] };
  const asos = ASOS.find(([re]) => re.test(qism))?.[1];
  return asos ? { asos, kopaytuvchi: kop } : null;
}

/** Bir o'lcham: asoslar bir xil yoki ikkalasi massa (Т ↔ КГ). Noma'lum birlik — false. */
export function birOlcham(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = birlikTahlil(a); const y = birlikTahlil(b);
  if (!x || !y) return false;
  const massa = (t: BirlikTahlil) => t.asos === 'Т' || t.asos === 'КГ';
  return x.asos === y.asos || (massa(x) && massa(y));
}

/** Qiymatni o'z asos birligiga (ko'paytuvchisiz; massa — Т ga) o'giradi: 0,5 «100М2» → {50, М2}; 250 КГ → {0,25, Т}. */
export function asosgaAylantir(qiymat: number | null | undefined, birlik: string | null | undefined): { qiymat: number; asos: AsosBirlik } | null {
  const t = birlikTahlil(birlik);
  if (!t) return null;
  const asos: AsosBirlik = t.asos === 'КГ' ? 'Т' : t.asos;
  const q = birlikAylantir(qiymat, birlik, asos);
  return q == null ? null : { qiymat: q, asos };
}

/**
 * Yagona o'girish: `qiymat` (dan birligida) → ga birligida. Bir xil asos — ko'paytuvchilar nisbati; Т ↔ КГ — ×1000.
 * Mos kelmaydi yoki noma'lum — null. Misol: 0,15 м³ → «100М3» = 0,0015.
 */
export function birlikAylantir(qiymat: number | null | undefined, dan: string | null | undefined, ga: string | null | undefined): number | null {
  if (qiymat == null || !Number.isFinite(qiymat)) return null;
  const a = birlikTahlil(dan); const b = birlikTahlil(ga);
  if (!a || !b) return null;
  const kg = (x: BirlikTahlil) => (x.asos === 'Т' ? 1000 : x.asos === 'КГ' ? 1 : null);
  if (a.asos === b.asos) return (qiymat * a.kopaytuvchi) / b.kopaytuvchi;
  const ka = kg(a); const kb = kg(b);
  if (ka != null && kb != null) return (qiymat * a.kopaytuvchi * ka) / (b.kopaytuvchi * kb);
  return null;
}

export const KARTA_TURLARI = ['rigel', 'balka', 'kolonna', 'plita', 'devor', 'armatura', 'boshqa'] as const;
export type KartaTur = typeof KARTA_TURLARI[number];

/** Karta parametrlari (migratsiya `_t2_ish_kartasi_param` bilan bir xil kalitlar). */
export type KartaParametr = { b_mm?: number | null; h_mm?: number | null; qalinlik_mm?: number | null; uzunlik_m?: number | null; kg_m3?: number | null };

const musbat = (x: number | null | undefined): x is number => x != null && Number.isFinite(x) && x > 0;

/** 1 amaliy birlikdagi fizik miqdor (м³ yoki т …) — parametrlardan. Yetarli parametr yo'q — null. */
export type FizikMiqdor = { qiymat: number; birlik: string; formula: string };

export function fizikMiqdor(tur: KartaTur, birlik: AmaliyBirlik, p: KartaParametr): FizikMiqdor | null {
  const b = p.b_mm; const h = p.h_mm; const t = p.qalinlik_mm; const l = p.uzunlik_m;
  if (birlik === 'м³') return { qiymat: 1, birlik: 'М3', formula: '1 м³' };
  if (birlik === 'т') return { qiymat: 1, birlik: 'Т', formula: '1 т' };
  if (birlik === 'кг') return { qiymat: 1, birlik: 'КГ', formula: '1 кг' };
  const chiziqli = tur === 'rigel' || tur === 'balka' || tur === 'kolonna';
  if (chiziqli && musbat(b) && musbat(h)) {
    const kesim = (b / 1000) * (h / 1000);
    if (birlik === 'м') return { qiymat: kesim, birlik: 'М3', formula: `${b}×${h} мм × 1 м` };
    if (birlik === 'шт' && musbat(l)) return { qiymat: kesim * l, birlik: 'М3', formula: `${b}×${h} мм × ${l} м` };
  }
  if ((tur === 'plita' || tur === 'devor') && musbat(t)) {
    if (birlik === 'м²') return { qiymat: t / 1000, birlik: 'М3', formula: `${t} мм × 1 м²` };
  }
  return null;
}

/** Parametrdan koeffitsient: 1 amaliy birlikka smeta birligi (rigel 300×500, «100М3» → 0,0015). Mos kelmasa — null. */
export function koefParametrdan(tur: KartaTur, birlik: AmaliyBirlik, p: KartaParametr, smetaBirlik: string | null | undefined): number | null {
  const f = fizikMiqdor(tur, birlik, p);
  if (f) return birlikAylantir(f.qiymat, f.birlik, smetaBirlik);
  // Amaliy birlik smeta birligi bilan bir xil turda bo'lsa (м² ↔ 100М2, т ↔ Т) — to'g'ridan o'girish.
  return birlikAylantir(1, birlik, smetaBirlik);
}

/**
 * Qo'shni qatorning koeffitsienti asosiy qatorga nisbatdan (smetaning o'z nisbati): k = kAsos × hajm / hajmAsos.
 * Ishora saqlanadi (istisno qatori hajmi manfiy → k manfiy). Asos hajmi 0/null yoki noma'lum — null.
 */
export function nisbatKoef(kAsos: number | null | undefined, hajmAsos: number | null | undefined, hajm: number | null | undefined): number | null {
  if (kAsos == null || hajmAsos == null || hajm == null || !Number.isFinite(kAsos) || !Number.isFinite(hajmAsos) || !Number.isFinite(hajm) || hajmAsos === 0) return null;
  return (kAsos * hajm) / hajmAsos;
}

/** Smetaning o'z nisbati: 1 asos birlikka (м³) armatura, kg (157 kg/м³). O'girib bo'lmasa — null. */
export function armaturaKgM3(armHajm: number | null | undefined, armBirlik: string | null | undefined, asosHajm: number | null | undefined, asosBirlik: string | null | undefined): number | null {
  const kg = birlikAylantir(armHajm, armBirlik, 'КГ');
  const m3 = birlikAylantir(asosHajm, asosBirlik, 'М3');
  if (kg == null || m3 == null || m3 === 0) return null;
  return kg / m3;
}
