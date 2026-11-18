/** Regressiya: zamena/qo'shimcha BL ning normasiz RS (ЧЕЛ/МАШ) qatorlari F2 jami va hujjatdan tushib qolmaydi (server t2_akt_qator bilan bir xil). Sintetik sonlar. */
import { describe, expect, it } from 'vitest';
import type { T2Qator } from '../api/supabase';
import { aktdanKiritma } from './f2-akt-kiritma';
import { f2Jami, f2Qatorlar, f2Qur, type F2Holat } from './f2-tayyor';

const q = (id: number, tur: string, ota: number | null, kat: string | null, extra: Record<string, unknown> = {}) =>
  ({ id, obyekt_id: 1, tur, ota_id: ota, kat, nom: `q${id}`, birlik: 'x', tartib: id, versiya_holat: 'faol', hajm: 1, ...extra }) as unknown as T2Qator;
const smeta: T2Qator[] = [
  q(1, 'rz', null, null),
  q(20, 'bl', 1, null, { qoshimcha: true, zamena: true, hajm: 2 }),
  q(21, 'rs', 20, 'ЧЕЛ', { qoshimcha: true }), q(22, 'rs', 20, 'МАШ', { qoshimcha: true }), q(23, 'rs', 20, 'МАШ', { qoshimcha: true }), q(24, 'mat', 20, 'МАТ', { qoshimcha: true }),
];
const holat: F2Holat[] = [20, 21, 22, 23, 24].map((id) => ({ qator_id: id, f2_mumkin_hajm: 1000 }));
const band = (qator_id: number, hajm: number, narx: number | null) => ({ qator_id, hajm, certified_quantity: hajm, certified_unit_price: narx, certified_amount: narx == null ? null : hajm * narx, provenance_status: 'source_certified' });
const aktQatorlar = [band(20, 2, null), band(21, 10, 100), band(22, 3, 0), band(23, 4, 50), band(24, 5, 200)];

describe('F2 tayyorlash: normasiz resurslar jim tushib qolmaydi', () => {
  it('jami == t2_akt_qator yig‘indisi (ЧЕЛ + МАШ + МАТ), hujjat qatorlari ham to‘liq', () => {
    const bolimlar = f2Qur(smeta, holat);
    const { k } = aktdanKiritma(aktQatorlar, bolimlar);
    const qator = f2Qatorlar(bolimlar, k).filter((x) => !x.xato);
    expect(qator.map((x) => x.id).sort()).toEqual([20, 21, 22, 23, 24]);
    expect(f2Jami(qator).summa).toBeCloseTo(10 * 100 + 4 * 50 + 5 * 200, 2);
  });
});
