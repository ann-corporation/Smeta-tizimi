import type { F2Tafsilot } from '../../api/t2-narx';
import type { Forma3Manba } from '../forma3-export';

const validPeriod = (value: string): boolean => /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

function requirePeriod(period: string): void {
  if (!validPeriod(period)) throw new Error('F3_PERIOD_MISMATCH');
}

/** Pul va hajm bir xil tasdiqlangan manba doirasidan olinadi. */
function sourceMonth(row: F2Tafsilot, companyId: number, objectId: number): string {
  if (row.kompaniya_id !== companyId || row.obyekt_id !== objectId) throw new Error('F3_SOURCE_SCOPE_MISMATCH');
  if (!Number.isSafeInteger(row.akt_id) || row.akt_id <= 0 || !Number.isSafeInteger(row.qator_id) || row.qator_id <= 0) throw new Error('F3_SOURCE_ID_REQUIRED');
  const month = String(row.oy).slice(0, 7);
  requirePeriod(month);
  return month;
}

/** Certified snapshots, never legacy generated summa or current estimate price. */
export function f3CertifiedSources(rows: readonly F2Tafsilot[], companyId: number, objectId: number, period: string): Forma3Manba['f2Oylik'] {
  requirePeriod(period);
  const result: Array<Forma3Manba['f2Oylik'][number]> = [];
  for (const row of rows) {
    if (row.kompaniya_id !== companyId || row.obyekt_id !== objectId) throw new Error('F3_SOURCE_SCOPE_MISMATCH');
    if (row.akt_holat !== 'tasdiqlangan') continue;
    const month = sourceMonth(row, companyId, objectId);
    if (month > period) continue;
    // Quantity-only BL/resource records are not money facts. Keep NULL distinct
    // from zero; never synthesize an amount from their quantity or estimate.
    if (row.certified_amount == null && row.certified_unit_price == null && row.narx == null && row.summa == null) continue;
    if (row.certified_amount == null || !Number.isFinite(Number(row.certified_amount))) throw new Error('MISSING_CERTIFIED_AMOUNT');
    result.push({ obyekt_id: objectId, qator_id: row.qator_id, oy: month, summa: Number(row.certified_amount), akt_id: row.akt_id });
  }
  return result;
}

/**
 * Tasdiqlangan F2 HAJMLARI (fizik ko'rsatkich) — Форма № 3 ning 8/11/14-grafalari va
 * podvaldagi chel.-ch / mash.-ch soatlari uchun (egasi 2026-09-29). Pul emas: faqat
 * hujjatning o'z miqdori (certified_quantity, bo'lmasa hajm); ish (bl) qatorlari ham.
 */
export function f3CertifiedHajm(rows: readonly F2Tafsilot[], companyId: number, objectId: number, period: string): NonNullable<Forma3Manba['f2Hajm']> {
  requirePeriod(period);
  const result: Array<NonNullable<Forma3Manba['f2Hajm']>[number]> = [];
  for (const row of rows) {
    if (row.kompaniya_id !== companyId || row.obyekt_id !== objectId) throw new Error('F3_SOURCE_SCOPE_MISMATCH');
    if (row.akt_holat !== 'tasdiqlangan') continue;
    const month = sourceMonth(row, companyId, objectId);
    if (month > period) continue;
    const h = row.certified_quantity ?? row.hajm;
    if (h == null || !Number.isFinite(Number(h))) continue;
    result.push({ obyekt_id: objectId, qator_id: row.qator_id, oy: month, hajm: Number(h) });
  }
  return result;
}

/**
 * Nakopitelniy / M-29 uchun OY KESIMI (egasi 2026-09-30: "otchetniy period avgust, sentyabr, noyabr —
 * har birining ustunlari va barcha oylar ИТОГО"). Faqat tasdiqlangan F2, davrgacha; hujjat
 * qiymatlari (certified_quantity / certified_amount) — qayta hisoblanmaydi.
 */
export function f2OyKesimi(rows: readonly F2Tafsilot[], period: string): { oylar: string[]; qiymat: Map<number, Map<string, { hajm: number; summa: number }>> } {
  requirePeriod(period);
  const qiymat = new Map<number, Map<string, { hajm: number; summa: number }>>();
  // Hisobot oyida akt bo‘lmasa ham uni saqlash zarur: aks holda exporter
  // oxirgi eski akt oyini «за отчетный период» deb ko‘rsatadi.
  const oylar = new Set<string>([period]);
  for (const row of rows) {
    if (row.akt_holat !== 'tasdiqlangan') continue;
    const oy = String(row.oy).slice(0, 7);
    requirePeriod(oy);
    if (oy > period) continue;
    oylar.add(oy);
    let m = qiymat.get(row.qator_id);
    if (!m) { m = new Map(); qiymat.set(row.qator_id, m); }
    const x = m.get(oy) ?? { hajm: 0, summa: 0 };
    x.hajm += Number(row.certified_quantity ?? row.hajm ?? 0);
    x.summa += Number(row.certified_amount ?? 0);
    m.set(oy, x);
  }
  return { oylar: [...oylar].sort(), qiymat };
}
