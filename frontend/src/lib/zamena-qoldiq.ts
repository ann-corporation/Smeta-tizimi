/**
 * ZAMENA QOLDIQ -- yagona frontend ta'rifi (SQL: t2_almashtirilgan_hajm / t2_qator_holat bilan AYNAN bir xil qoida).
 *
 * Egasi qarori (2026-10-24): zamena qatoriga F2/fakt yozilgan sari ASLNING qoldig'i kamayadi.
 *  - birlik bir xil -> 1:1 (zamenaning F2/fakt hajmi aslning qoldig'idan ayriladi);
 *  - birlik farqli  -> `almashtirishHajm` (aslning birligida, zamenaning TO'LIQ rejalangan hajmi uchun) kiritilgan bo'lsa
 *    proporsional: progress / zamenaHajm * almashtirishHajm; kiritilmagan bo'lsa zamenaning bajarilgan
 *    ulushida (progress / zamenaHajm * aslHajm; egasi qarori 2026-10-25);
 *  - zamena ISH (bl) bo'lsa, aslning bola resurslari (rs/mat/ob) ham xuddi shu ulushda yopiladi.
 * Asl smeta qatorlari O'ZGARMAYDI; hajm bloklanmaydi (ortiqcha aslning qoldig'i bilan cheklanadi); NULL != 0.
 */
export interface ZamenaQator {
  id: number;
  ota_id?: number | null;
  tur?: string | null;
  birlik?: string | null;
  birlik_key?: string | null;
  hajm: number | null;
  /** Aslning tasdiqlangan F2 hajmi (o'zining). */
  f2Hajm?: number;
  /** Zamena qatori uchun: max(tasdiqlangan F2, fakt) hajmi (o'z birligida). */
  progress?: number;
  replaces_line_id?: number | null;
  change_type?: string | null;
  almashtirish_hajm?: number | null;
}

const birlikKalit = (q: ZamenaQator): string => (q.birlik_key ?? (q.birlik ?? '').trim().toLowerCase());

/** qoldiq = smeta - tasdiqlangan F2 - almashtirilgan. smeta NULL bo'lsa NULL (0 emas). */
export function qoldiqHajmi(smeta: number | null | undefined, tasdiqlangan: number | null | undefined, almashtirilgan?: number | null): number | null {
  if (smeta == null) return null;
  return smeta - (tasdiqlangan ?? 0) - (almashtirilgan ?? 0);
}

/** Bir asl qatorning O'Z zamenalaridan qoplangan hajmi (aslning birligida), aslning qolgan qoldig'i bilan cheklangan. */
function ozHajm(asl: ZamenaQator, zamenalar: readonly ZamenaQator[]): number {
  if (zamenalar.length === 0) return 0;
  const rem = Math.max((asl.hajm ?? 0) - (asl.f2Hajm ?? 0), 0);
  let yigindi = 0;
  for (const z of zamenalar) {
    const miq = z.almashtirish_hajm;
    const zh = z.hajm ?? 0;
    const ayni = birlikKalit(z) === birlikKalit(asl);
    const pr = z.progress ?? 0;
    if (miq != null) { if (zh > 0) yigindi += pr / zh * miq; }
    else if (ayni) yigindi += pr;
    // Egasi qarori 2026-10-25: birlik farqli, miqdorsiz -> zamenaning bajarilgan ulushida (zamena hajmi noma'lum -> 0).
    else if (zh > 0) yigindi += Math.min(pr / zh, 1) * (asl.hajm ?? 0);
  }
  return Math.min(yigindi, rem);
}

/**
 * Barcha qatorlar uchun almashtirilgan hajm xaritasi (qator id -> hajm; faqat > 0 bo'lganlar).
 * `rows` -- bitta obyekt qatorlari (replaces_line_id/almashtirish_hajm/f2Hajm/progress bilan).
 */
export function almashtirilganHajmlar(rows: readonly ZamenaQator[]): Map<number, number> {
  const byId = new Map(rows.map((r) => [r.id, r] as const));
  const zam = new Map<number, ZamenaQator[]>();
  for (const r of rows) {
    if (r.change_type === 'REPLACEMENT' && r.replaces_line_id != null && byId.has(r.replaces_line_id)) {
      const a = zam.get(r.replaces_line_id) ?? [];
      a.push(r); zam.set(r.replaces_line_id, a);
    }
  }
  const oz = (r: ZamenaQator) => ozHajm(r, zam.get(r.id) ?? []);
  const out = new Map<number, number>();
  for (const r of rows) {
    let h = oz(r);
    const ota = r.ota_id != null ? byId.get(r.ota_id) : undefined;
    if (ota && ota.tur === 'bl' && r.tur != null && ['rs', 'mat', 'ob'].includes(r.tur) && zam.has(ota.id) && (r.hajm ?? 0) !== 0 && (ota.hajm ?? 0) > 0) {
      const rem = Math.max((r.hajm ?? 0) - (r.f2Hajm ?? 0), 0);
      h = Math.max(h, Math.min(rem, (r.hajm as number) * Math.min(oz(ota) / (ota.hajm as number), 1)));
    }
    if (h > 0) out.set(r.id, h);
  }
  return out;
}

/** Narx qoidasi (SQL: t2_almashtirilgan_summa_hisob): summa to'qilmaydi. */
export function almashtirilganSumma(alm: number, hajm: number | null, narx: number | null, summa: number | null): number | null {
  if (!alm) return 0;
  if (narx != null) return alm * narx;
  if (hajm != null && hajm !== 0 && summa != null) return alm * summa / hajm;
  return null;
}

/** UI matni: «almashtirildi: X / Y birlik» (aslning birligida). Almashtirish yo'q bo'lsa null. */
export function almashtirildiMatn(alm: number | null | undefined, smeta: number | null | undefined, birlik?: string | null, fmt: (n: number) => string = (n) => String(+n.toFixed(4))): string | null {
  if (alm == null || !(alm > 0)) return null;
  return `${fmt(alm)}${smeta != null ? ' / ' + fmt(smeta) : ''}${birlik ? ' ' + birlik : ''}`;
}
