import type { F2Tafsilot } from '../../api/t2-narx';
import type { Forma3Manba } from '../forma3-export';

/** Certified snapshots, never legacy generated summa or current estimate price. */
export function f3CertifiedSources(rows: readonly F2Tafsilot[], companyId: number, objectId: number, period: string): Forma3Manba['f2Oylik'] {
  const result: Array<Forma3Manba['f2Oylik'][number]> = [];
  for (const row of rows) {
    if (row.kompaniya_id !== companyId || row.obyekt_id !== objectId) throw new Error('F3_SOURCE_SCOPE_MISMATCH');
    if (row.akt_holat !== 'tasdiqlangan') continue;
    const month = String(row.oy).slice(0, 7);
    if (month > period) continue;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('F3_PERIOD_MISMATCH');
    if (!Number.isSafeInteger(row.akt_id) || row.akt_id <= 0 || !Number.isSafeInteger(row.qator_id) || row.qator_id <= 0) throw new Error('F3_SOURCE_ID_REQUIRED');
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
  const result: Array<NonNullable<Forma3Manba['f2Hajm']>[number]> = [];
  for (const row of rows) {
    if (row.kompaniya_id !== companyId || row.obyekt_id !== objectId) throw new Error('F3_SOURCE_SCOPE_MISMATCH');
    if (row.akt_holat !== 'tasdiqlangan') continue;
    const month = String(row.oy).slice(0, 7);
    if (month > period) continue;
    const h = row.certified_quantity ?? row.hajm;
    if (h == null || !Number.isFinite(Number(h))) continue;
    result.push({ obyekt_id: objectId, qator_id: row.qator_id, oy: month, hajm: Number(h) });
  }
  return result;
}
