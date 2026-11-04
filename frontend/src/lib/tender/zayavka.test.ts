import { describe, expect, it } from 'vitest';
import { qoldiqMiqdor, zayavkadanQatorlar } from './zayavka';

describe('zayavkadan tender qatorlari', () => {
  const z = (p: object) => ({ id: 1, itemText: 'Sement M400', requestedQty: 10, unit: 'tonna', requiredDate: '2027-01-15T00:00:00Z', status: 'approved', ...p });
  it('qoldiq: remainingQty yoki talab − yetkazilgan', () => {
    expect(qoldiqMiqdor(z({ remainingQty: 4 }))).toBe(4);
    expect(qoldiqMiqdor(z({ deliveredQty: 3 }))).toBe(7);
    expect(qoldiqMiqdor(z({ deliveredQty: 10 }))).toBeNull();
  });
  it('tasdiqlangan zayavka → qator; zayavka_id saqlanadi, sana kesiladi', () => {
    const r = zayavkadanQatorlar([z({})]);
    expect(r.qatorlar).toEqual([{ nom: 'Sement M400', birlik: 'tonna', miqdor: 10, lot_no: 1, zayavka_id: 1, talab_sana: '2027-01-15' }]);
    expect(r.otkazildi).toEqual([]);
  });
  it('o\'tkazib yuboriladi: qoralama holat, birliksiz, nomsiz, qoldiqsiz (o\'ylab topilmaydi)', () => {
    const r = zayavkadanQatorlar([z({ id: 2, status: 'draft' }), z({ id: 3, unit: null }), z({ id: 4, itemText: ' ' }), z({ id: 5, deliveredQty: 10 })]);
    expect(r.qatorlar).toEqual([]);
    expect(r.otkazildi).toEqual([{ id: 2, sabab: 'holat' }, { id: 3, sabab: 'birlik' }, { id: 4, sabab: 'nom' }, { id: 5, sabab: 'miqdor' }]);
  });
});
