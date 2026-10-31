/**
 * Xarajat kategoriyalari modeli: ЧЕЛ / МАШ / МАТ / ОБ / КАБ / М/К / БЕЗ СКЛАД.
 * МАТ bu yerda «sof» material (КАБ, М/К, БЕЗ СКЛАД alohida); server `mat` — TO'LIQ savat
 * (МАТ + КАБ + М/К + БЕЗСКЛАД) — `serverCatsdan` / `serverCatsga` o'giradi.
 * Kategoriyasi aniqlanmagan summa HECH QACHON МАТ ga tushmaydi: `nomalum` da alohida sanaladi.
 */
export const KATLAR = ['ЧЕЛ', 'МАШ', 'МАТ', 'ОБ', 'КАБ', 'М/К', 'БЕЗ СКЛАД'] as const;
export type Kat = typeof KATLAR[number];
export type KatSummalar = Record<Kat, number>;

/** Matndagi kategoriya → Kat; notanish/bo'sh — null (taxmin yo'q). */
export function katAniqla(kat: string | null | undefined): Kat | null {
  const k = (kat ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
  if (k === 'БЕЗСКЛАД' || k === 'БЕЗ_СКЛАД' || k === 'BEZ_SKLAD') return 'БЕЗ СКЛАД';
  return (KATLAR as readonly string[]).includes(k) ? (k as Kat) : null;
}

export const bosKatSummalar = (): KatSummalar => Object.fromEntries(KATLAR.map((k) => [k, 0])) as KatSummalar;

/** Kategoriya kesimi: aniq kat summalari + noma'lum qism + yaxlit (svod) qism. */
export type Kesim = {
  summalar: Partial<Record<Kat, number>>;
  /** Kategoriyasi aniqlanmagan summa (ustamaga kirmaydi; ИТОГО-4 ga ustamasiz qo'shiladi, server bilan bir xil). */
  nomalum: number;
  nomalumSoni: number;
  /** Summasi o'zi noma'lum (null) qatorlar soni — narxsiz. */
  summasizSoni: number;
  /**
   * Svod yaxlit (server xulosasi): `qqssiz` — QQS siz (ko'rsatish), `barglar` — ustamasiz jamiga. `svodQqsBilan` — svod
   * summasi kiritilgan bo'limlar jami (QQS BILAN, yakuniy — aynan olinadi), `svodQqssiz` — shu bo'limlarning QQS siz qismi.
   */
  yaxlit?: { qqssiz: number; barglar: number; svodQqsBilan?: number; svodQqssiz?: number };
  /** Yaxlit bo'lim avlodi qatorlar summasi (qator darajasi) — ustamasiz ИТОГО-4 ga. */
  yaxlitQator?: number;
};

export const bosKesim = (): Kesim => ({ summalar: {}, nomalum: 0, nomalumSoni: 0, summasizSoni: 0 });

/** Bitta qatorni kesimga qo'shadi (joyida). `yaxlitmi` — svod yaxlit avlodi. */
export function kesimgaQosh(k: Kesim, kat: string | null | undefined, summa: number | null | undefined, yaxlitmi = false): Kesim {
  if (summa == null || !Number.isFinite(summa)) { k.summasizSoni++; return k; }
  if (yaxlitmi) { k.yaxlitQator = (k.yaxlitQator ?? 0) + summa; return k; }
  const nk = katAniqla(kat);
  if (nk == null) { k.nomalum += summa; k.nomalumSoni++; return k; }
  k.summalar[nk] = (k.summalar[nk] ?? 0) + summa;
  return k;
}

export function kesimYigish<T>(qatorlar: Iterable<T>, kat: (x: T) => string | null | undefined, summa: (x: T) => number | null | undefined, yaxlitmi?: (x: T) => boolean): Kesim {
  const k = bosKesim();
  for (const q of qatorlar) kesimgaQosh(k, kat(q), summa(q), yaxlitmi?.(q) ?? false);
  return k;
}

/** Kesim nusxasi + kat noma'lum qo'shimcha summa (farq ~0 bo'lsa o'zgarishsiz). */
export function kesimNomalumBilan(k: Kesim, farq: number | null | undefined): Kesim {
  const n: Kesim = { ...k, summalar: { ...k.summalar }, ...(k.yaxlit ? { yaxlit: { ...k.yaxlit } } : {}) };
  if (farq != null && Number.isFinite(farq) && Math.abs(farq) >= 0.005) { n.nomalum += farq; n.nomalumSoni += 1; }
  return n;
}

/** To'liq KatSummalar (yo'q kategoriya — 0: summa yo'q = 0 so'm, bu foiz emas). */
export const katSummalari = (k: Kesim): KatSummalar => Object.fromEntries(KATLAR.map((x) => [x, k.summalar[x] ?? 0])) as KatSummalar;

/** Kesimdagi aniq kategoriyalar jami (ustamaga kiradigan to'g'ri xarajat). */
export const katJami = (s: Partial<KatSummalar>): number => KATLAR.reduce((t, k) => t + (s[k] ?? 0), 0);

export type ServerCats = { chel: number; mash: number; mat: number; ob: number; mk: number; kab: number; bez: number };

/** Server `cats` (mat — to'liq savat) → KatSummalar. */
export function serverCatsdan(c: ServerCats): KatSummalar {
  return { ЧЕЛ: c.chel, МАШ: c.mash, МАТ: c.mat - c.kab - c.mk - c.bez, ОБ: c.ob, КАБ: c.kab, 'М/К': c.mk, 'БЕЗ СКЛАД': c.bez };
}

/** KatSummalar → server `cats` shakli. */
export function serverCatsga(s: Partial<KatSummalar>): ServerCats {
  const g = (k: Kat) => s[k] ?? 0;
  return { chel: g('ЧЕЛ'), mash: g('МАШ'), mat: g('МАТ') + g('КАБ') + g('М/К') + g('БЕЗ СКЛАД'), ob: g('ОБ'), mk: g('М/К'), kab: g('КАБ'), bez: g('БЕЗ СКЛАД') };
}
