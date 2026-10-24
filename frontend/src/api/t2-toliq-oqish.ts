import type { SbJavob, SbSoro } from './supabase';

/** Gateway subrequest byudjetidan keyin qolgan qatorlar stable keyset orqali olinadi. */
export async function t2ToliqOqi<T>(
  oqi: (s: SbSoro) => Promise<SbJavob<T>>, s: SbSoro, kalit: 'id' | 'qator_id',
): Promise<SbJavob<T>> {
  const rows: T[] = [];
  const limit = s.limit ?? 200000;
  let last = 0, expected: number | null = null;
  const failed = (): SbJavob<T> => ({ ok: false, toliq: false, qatorlar: [],
    error: 'Smeta qatorlari to‘liq olinmadi. Hisoblash to‘xtatildi — qayta yangilang.' });
  for (let round = 0; round < 200; round++) {
    const page = await oqi({ ...s, tartib: kalit + '.asc',
      filtr: s.filtr + (last ? '&' + kalit + '=gt.' + last : '') });
    if (!page.ok) return { ...page, qatorlar: [], toliq: false };
    const batch = page.qatorlar ?? [];
    if (expected == null && page.jamiServerda != null) expected = page.jamiServerda;
    // Duplicate/out-of-order rows or a stalled cursor cannot become financial success.
    for (const row of batch) {
      const key = Number((row as Record<string, unknown>)[kalit]);
      if (!Number.isSafeInteger(key) || key <= last) return failed();
      last = key;
      rows.push(row);
    }
    if (rows.length > limit) return failed();
    if (page.toliq !== false) {
      if (expected != null && rows.length !== expected) return failed();
      return { ...page, qatorlar: rows, soni: rows.length, jamiServerda: expected, toliq: true };
    }
    if (!batch.length || rows.length >= limit) return failed();
  }
  return failed();
}

/**
 * Katta jadval (25k+ qator) — kalit oralig'i oynalarga bo'linib PARALLEL o'qiladi (prod profil 2026-10-24: Sun'iy ko'l
 * smetasi 6 ta ketma-ket /api/sb chaqiruvi, ~32 s). Sabab: proksi bir chaqiruvda chekli sub-so'rov qiladi va obyekt id lari
 * notekis (boshqa obyektlar id lari aralash) bo'lgani uchun har chaqiruv faqat ~5k qatorlik uzluksiz prefiks qaytaradi.
 * Har oyna `t2ToliqOqi` bilan o'z ichida to'liq tekshiriladi; yig'indi umumiy server soniga teng bo'lmasa yoki biror oyna
 * xato bersa — oddiy ketma-ket o'qishga qaytiladi (natija har doim bir xil: kalit bo'yicha o'sish tartibida, to'liq).
 */
export async function t2ToliqOqiParallel<T>(
  oqi: (s: SbSoro) => Promise<SbJavob<T>>, s: SbSoro, kalit: 'id' | 'qator_id',
  opts: { oyna?: number; minQator?: number } = {},
): Promise<SbJavob<T>> {
  const oynaSoni = opts.oyna ?? 6;
  const ketma = () => t2ToliqOqi(oqi, s, kalit);
  try {
    const [boshi, oxiri] = await Promise.all([
      oqi({ ...s, ustunlar: kalit, tartib: kalit + '.asc', limit: 1 }),
      oqi({ ...s, ustunlar: kalit, tartib: kalit + '.desc', limit: 1 }),
    ]);
    const jami = boshi.ok ? boshi.jamiServerda ?? null : null;
    const min = Number((boshi.qatorlar?.[0] as Record<string, unknown> | undefined)?.[kalit]);
    const max = Number((oxiri.qatorlar?.[0] as Record<string, unknown> | undefined)?.[kalit]);
    if (!boshi.ok || !oxiri.ok || jami == null || !Number.isSafeInteger(min) || !Number.isSafeInteger(max) || max < min
      || jami < (opts.minQator ?? 6000) || jami > (s.limit ?? 200000)) return ketma();
    const kenglik = Math.ceil((max - min + 1) / oynaSoni);
    const oynalar: Array<[number, number]> = [];
    for (let a = min; a <= max; a += kenglik) oynalar.push([a, Math.min(a + kenglik - 1, max)]);
    const natijalar = await Promise.all(oynalar.map(([a, b]) =>
      t2ToliqOqi(oqi, { ...s, filtr: `${s.filtr}&${kalit}=gte.${a}&${kalit}=lte.${b}` }, kalit)));
    if (natijalar.some((n) => !n.ok)) return ketma();
    const qatorlar = natijalar.flatMap((n) => n.qatorlar ?? []);
    if (qatorlar.length !== jami) return ketma();
    return { ...natijalar[0], qatorlar, soni: qatorlar.length, jamiServerda: jami, toliq: true };
  } catch {
    return ketma();
  }
}
