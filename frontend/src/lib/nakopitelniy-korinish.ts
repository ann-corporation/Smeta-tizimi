/**
 * NAKOPITELNIY KO'RINISHI uchun sof yordamchilar (egasi 2026-10-25: «reestrga qarab vaziyat tushunarli bo'lsin»).
 * Bu yerda yangi biznes formula YO'Q: faqat serverdan kelgan summalarni ko'rsatish uchun foiz/ulush/ierarxiya.
 * Noma'lum (null/NaN) qiymat hech qachon 0 ga aylantirilmaydi.
 */

const son = (x: number | null | undefined): x is number => x != null && Number.isFinite(x);

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
