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
    if (row.certified_amount == null || !Number.isFinite(Number(row.certified_amount))) throw new Error('MISSING_CERTIFIED_AMOUNT');
    result.push({ obyekt_id: objectId, qator_id: row.qator_id, oy: month, summa: Number(row.certified_amount), akt_id: row.akt_id });
  }
  return result;
}
