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
