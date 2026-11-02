/**
 * NAKOPITELNIY KO'RINISHI uchun sof yordamchilar (egasi 2026-10-25: «reestrga qarab vaziyat tushunarli bo'lsin»).
 * Bu yerda yangi biznes formula YO'Q: faqat serverdan kelgan summalarni ko'rsatish uchun foiz/ulush/ierarxiya.
 * Noma'lum (null/NaN) qiymat hech qachon 0 ga aylantirilmaydi.
 */
import { faktSummaF2Narxda, yigindi2 } from './hisob-yadro';

const son =(x: number | null | undefined): x is number => x != null && Number.isFinite(x);

type NakQ = { qator_id: number; ota_id?: number | null; tur: string; fakt_hajm: number | null; fakt_summa: number | null; jami_hajm: number | null; jami_summa: number | null };

/** Qator fakt summasi — yadro narx qoidasi: tasdiqlangan F2 (с начала) bor qatorda F2 birlik narxida; NULL — NULL. */
export function nakFaktSumma(q: NakQ): number | null {
  return faktSummaF2Narxda(q.fakt_hajm, q.jami_hajm, q.jami_summa, q.fakt_summa).summa;
}

/** Barg qatorlar (razdel emas, bolasi yo'q) — pul faqat ulardan yig'iladi (bl/rz jamisi takror). */
export function nakBarglar<T extends NakQ>(qatorlar: readonly T[]): T[] {
  const ota = new Set<number>();
  for (const q of qatorlar) if (q.ota_id != null) ota.add(q.ota_id);
  return qatorlar.filter((q) => q.tur !== 'rz' && !ota.has(q.qator_id));
}

/**
 * Sahifadagi YAGONA fakt pul jamisi (KPI, jadval pastki qatori, grafik): barglar F2 narxida. Ro'yxat qirqilgan bo'lsa —
 * server jamisi (qayta narxlanmagan) va `taxminiy` (UI «≈» + izoh).
 */
export function nakFaktJami(qatorlar: readonly NakQ[], serverJami: number, truncated: boolean): { summa: number; taxminiy: boolean } {
  if (truncated) return { summa: serverJami, taxminiy: true };
  return { summa: yigindi2(nakBarglar(qatorlar).map(nakFaktSumma)), taxminiy: false };
}

/** a/b foizi (butun). b noma'lum yoki ≤ 0 bo'lsa — null (0 emas). */
export function foizOl(a: number | null | undefined, b: number | null | undefined): number | null {
  if (!son(a) || !son(b) || b <= 0) return null;
  return Math.round((a / b) * 100);
}

export type SmetaTaqsimot = {
  /** Barcha ulushlar `asos` ga nisbatan, % (0..100). */
  oldingi: number; joriy: number; faktQoldi: number; qolgan: number;
  /** Tasdiqlangan F2 smetadan oshdi (asos = F2 jami). */
  oshdi: boolean;
  /** F2 jami / smeta, % (kesilmagan). */
  foiz: number;
};

/**
 * Smeta = 100%: oldingi tasdiqlangan F2 | shu davr F2 | faktda bor, lekin F2 ga kirmagan | ishlanmagan qoldiq.
 * Smeta noma'lum yoki ≤ 0 bo'lsa — null. F2 yoki fakt smetadan oshsa, o'lchov asosi kattasiga ko'chadi (chiziq to'lib ketmaydi).
 */
export function smetaTaqsimot(p: { smeta: number | null | undefined; oldingi: number | null | undefined; joriy: number | null | undefined; fakt: number | null | undefined }): SmetaTaqsimot | null {
  if (!son(p.smeta) || p.smeta <= 0) return null;
  const old = Math.max(0, son(p.oldingi) ? p.oldingi : 0);
  const jor = Math.max(0, son(p.joriy) ? p.joriy : 0);
  const fakt = Math.max(0, son(p.fakt) ? p.fakt : 0);
  const jami = old + jor;
  const asos = Math.max(p.smeta, jami, fakt);
  const pct = (x: number) => (x / asos) * 100;
  const faktQoldi = Math.max(0, fakt - jami);
  return {
    oldingi: pct(old), joriy: pct(jor), faktQoldi: pct(faktQoldi),
    qolgan: Math.max(0, pct(asos - Math.max(jami, fakt))),
    oshdi: jami > p.smeta + 0.005,
    foiz: (jami / p.smeta) * 100,
  };
}

/**
 * Ikki tomonlama (plyus/minus) chiziq: ikkala tomon bitta o'lchovda (max). Qiymatlar modul bo'yicha.
 * max ≤ 0 bo'lsa — ikkalasi 0%.
 */
export function ikkiTomon(plus: number | null | undefined, minus: number | null | undefined, max: number): { chap: number; ong: number } {
  if (!(max > 0)) return { chap: 0, ong: 0 };
  const cl = (x: number | null | undefined) => (son(x) ? Math.min(100, (Math.abs(x) / max) * 100) : 0);
  return { chap: cl(minus), ong: cl(plus) };
}

type Daraxtli = { qator_id: number; ota_id?: number | null };

/** Yig'ilgan bo'limlar ostidagi (har qanday chuqurlikdagi) qatorlar identifikatorlari. */
export function yashirinIdlar(qatorlar: readonly Daraxtli[], yigilgan: ReadonlySet<number>): Set<number> {
  const yashirin = new Set<number>();
  if (!yigilgan.size) return yashirin;
  const ota = new Map<number, number | null>(qatorlar.map((q) => [q.qator_id, q.ota_id ?? null]));
  const holat = new Map<number, boolean>();
  const yopiqmi = (id: number): boolean => {
    const bor = holat.get(id);
    if (bor !== undefined) return bor;
    const o = ota.get(id) ?? null;
    // Tsikldan himoya: vaqtincha false qo'yiladi.
    holat.set(id, false);
    const r = o != null && ota.has(o) && (yigilgan.has(o) || yopiqmi(o));
    holat.set(id, r);
    return r;
  };
  for (const q of qatorlar) if (yopiqmi(q.qator_id)) yashirin.add(q.qator_id);
  return yashirin;
}
