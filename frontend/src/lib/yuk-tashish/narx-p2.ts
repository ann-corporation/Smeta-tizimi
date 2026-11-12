/**
 * Narx bahosi (Phase 2): baza + so'm/km (mashina sinfi bo'yicha) + yuklash + kutish. Hammasi t2_yb_sozlama dan (platforma admini o'zgartiradi:
 * t2_yb_p2_sozlama_saqla_v1) — kodda qiymat YO'Q. Defaultlar TAXMINIY (kalibrovka kerak), natija doim «taxminiy baho» deb ko'rsatiladi.
 * Narx QQS siz; ma'lumot yetishmasa — null («—», 0 emas). Sof funksiyalar (hisob-yadro qoidasi: QQS arifmetikasi bu yerda yo'q).
 */
export type NarxP2Parametr = { baza: number | null; kmSinf: Record<string, number>; yuklash: number | null; kutishSoat: number | null };
export type NarxP2Kirish = { km: number | null; sinf: string; yuklashKerak?: boolean; kutishSoat?: number };
export type NarxP2Natija = { qqsSiz: number | null; qatorlar: Array<{ nom: string; summa: number }>; yetishmaydi: string[] };

const son = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);

/** t2_yb_ol_v1 'sozlama' -> parametrlar (xom JSON) dan tuzadi; noto'g'ri qiymat — null. */
export function narxP2Parametr(xom: Record<string, unknown> | null | undefined): NarxP2Parametr {
  const km: Record<string, number> = {};
  const m = xom?.narx_km_sinf;
  if (m && typeof m === 'object' && !Array.isArray(m)) for (const [k, v] of Object.entries(m as Record<string, unknown>)) { const s = son(v); if (s != null) km[k] = s; }
  return { baza: son(xom?.narx_baza), kmSinf: km, yuklash: son(xom?.yuklash_narx), kutishSoat: son(xom?.kutish_soat_narx) };
}

/** Bir qatorli tarkib uchun qatorlar: baza, masofa × stavka, (ixtiyoriy) yuklash, kutish. */
export function narxP2(k: NarxP2Kirish, p: NarxP2Parametr): NarxP2Natija {
  const yetishmaydi: string[] = [];
  const stavka = p.kmSinf[k.sinf || 'orta'] ?? null;
  if (k.km == null) yetishmaydi.push('masofa');
  if (stavka == null) yetishmaydi.push('stavka');
  if (p.baza == null) yetishmaydi.push('baza');
  if (yetishmaydi.length > 0 || k.km == null || stavka == null || p.baza == null) return { qqsSiz: null, qatorlar: [], yetishmaydi };
  const qatorlar = [{ nom: 'baza', summa: p.baza }, { nom: 'masofa', summa: k.km * stavka }];
  if (k.yuklashKerak && p.yuklash != null) qatorlar.push({ nom: 'yuklash', summa: p.yuklash });
  if ((k.kutishSoat ?? 0) > 0 && p.kutishSoat != null) qatorlar.push({ nom: 'kutish', summa: (k.kutishSoat as number) * p.kutishSoat });
  return { qqsSiz: qatorlar.reduce((a, q) => a + q.summa, 0), qatorlar, yetishmaydi: [] };
}

/** Bir qatorli matn: «baza 50 000 + 420 km × 9 500 = … (taxminiy baho, QQS siz)». */
export function narxP2Matn(n: NarxP2Natija, km: number | null, sinf: string, p: NarxP2Parametr): string {
  if (n.qqsSiz == null) return `Taxminiy baho: — (yetishmaydi: ${n.yetishmaydi.join(', ')})`;
  const st = p.kmSinf[sinf || 'orta'];
  return `Taxminiy baho: baza ${p.baza} + ${km} km × ${st} = ${Math.round(n.qqsSiz)} UZS (QQS siz, kalibrovkagacha taxminiy)`;
}
