import { describe, expect, it } from 'vitest';
import { arxivOperationId } from './t2-hujjat-arxiv';
import { f2Hujjat } from '../lib/f2-hujjat';
import { bosKiritma, f2Qatorlar, f2Qur } from '../lib/f2-tayyor';
import { AKT246_HAJM, AKT246_HOLAT, AKT246_ROWS } from '../lib/f2-hujjat.fixture';

/* hujjat-yukla.ts dagi server qoidasi bilan aynan bir xil. */
const SERVER_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('Hujjat arxivi (R2, o‘zgarmas versiya)', () => {
  it('bir xil hujjat ikki marta yasalsa — baytlari aynan bir xil (ZIP vaqti qat‘iy)', () => {
    const b = f2Qur(AKT246_ROWS, AKT246_HOLAT);
    const q = f2Qatorlar(b, { ...bosKiritma(), hajm: AKT246_HAJM });
    const a1 = f2Hujjat(b, q, { obyektNom: 'X', davr: '2026-10', raqam: '1', formulasiz: true }).bytes;
    const a2 = f2Hujjat(b, q, { obyektNom: 'X', davr: '2026-10', raqam: '1', formulasiz: true }).bytes;
    expect(Buffer.from(a1).equals(Buffer.from(a2))).toBe(true);
  });

  it('operation_id: mazmundan deterministik, server UUID qoidasiga mos; boshqa mazmun/tur/obyekt — boshqa ID', async () => {
    const a = await arxivOperationId(17, 80, 'f3', 'a'.repeat(64));
    expect(a).toMatch(SERVER_UUID);
    expect(await arxivOperationId(17, 80, 'f3', 'a'.repeat(64))).toBe(a);
    expect(await arxivOperationId(17, 80, 'f3', 'b'.repeat(64))).not.toBe(a);
    expect(await arxivOperationId(17, 80, 'f2_hujjat', 'a'.repeat(64))).not.toBe(a);
    expect(await arxivOperationId(17, 81, 'f3', 'a'.repeat(64))).not.toBe(a);
  });
});
