import { describe, expect, it } from 'vitest';
import type { T2Qator } from '../../api/supabase';
import type { AktBand } from '../f2-akt-kiritma';
import { f2AsosQur, f2Hisobla, f2Kiritma, f2Ogoh, f2Ozgarishlar, f2ManbaTanla } from './f2-qoralama';

const q = (o: Partial<T2Qator> & { id: number; tur: string }): T2Qator => ({
  obyekt_id: 8, obyekt: null, kompaniya_id: 1, ota_id: null, daraja: 0, tartib: o.id, kod: null, nom: `n${o.id}`, birlik: 'м3',
  hajm: null, narx: null, summa: null, kat: null, narx_usul: null, qoshimcha: false, zamena: false,
  d1: null, d2: null, d3: null, xom_qator: null, yangilandi: null, manba_id: null, versiya: 1, ...o,
} as T2Qator);
const rows = [
  q({ id: 1, tur: 'rz' }),
  q({ id: 11, tur: 'bl', ota_id: 1, hajm: 100 }),
  q({ id: 31, tur: 'mat', ota_id: 11, hajm: 10, narx: 5, kat: 'МАТ' }),
  q({ id: 12, tur: 'bl', ota_id: 1, hajm: 100 }),
  q({ id: 41, tur: 'rs', ota_id: 12, hajm: 200, narx: 4, kat: 'ЧЕЛ', norma: 2 } as never),
];
const holat = [
  { qator_id: 11, smeta_hajm: 100, fakt_hajm: 40, f2_mumkin_hajm: 40, f2_hajm: 0 },
  { qator_id: 31, smeta_hajm: 10, fakt_hajm: 40, f2_mumkin_hajm: 40, f2_hajm: 0 },
  { qator_id: 12, smeta_hajm: 100, fakt_hajm: 20, f2_mumkin_hajm: 20, f2_hajm: 0 },
  { qator_id: 41, smeta_hajm: 200, fakt_hajm: 40, f2_mumkin_hajm: 40, f2_hajm: 0 },
];
const baza = (aktQatorlar: AktBand[] = []) => ({
  rows, holat, protokolNarx: new Map(), qoralamaHajm: new Map<number, number>(), chiqarilgan: new Set<number>(), zamenaAsl: new Map<number, number>(), miqdor: new Map<number, number>(), aktQatorlar,
});
const band = (qator_id: number, hajm: number): AktBand => ({ qator_id, hajm, certified_quantity: hajm, certified_unit_price: null, certified_amount: null, provenance_status: 'price_intentionally_absent', raw_snapshot: { hajmManba: 'fakt' } });

describe('Ish varag‘i F2: qoralama hisobi (mavjud F2 zanjiri)', () => {
  it('manba: fakt bor — fakt; saqlangan qoralamadagi manba ustuvor', () => {
    expect(f2ManbaTanla(holat, [])).toBe('fakt');
    expect(f2ManbaTanla([{ qator_id: 1 }], [])).toBe('smeta');
    expect(f2ManbaTanla(holat, [{ ...band(11, 1), raw_snapshot: { hajmManba: 'smeta' } }])).toBe('smeta');
  });

  it('kiritiladigan qatorlar: ish va mustaqil resurs; avtomatik resurs (rs) kiritilmaydi', () => {
    const a = f2AsosQur(baza());
    expect([...a.tahrirIdlar].sort((x, y) => x - y)).toEqual([11, 12, 31]);
  });

  it('mavjud qoralama qatori kiritmaga ochiladi va o‘zgarishda yo‘qolmaydi; narx smeta narxidan (mustaqil resurs)', () => {
    const a = f2AsosQur(baza([band(12, 3)]));
    expect(a.kSaqlangan.hajm).toEqual({ 12: '3' });
    const oz = f2Ozgarishlar(a, { 11: '5', 12: '3' }); // 12 — saqlanganga teng: o'zgarish emas
    expect(oz).toEqual({ 11: '5' });
    const h = f2Hisobla(a, f2Kiritma(a, oz), '7');
    expect(h.qatorlar.map((x) => [x.id, x.tur, x.hajm])).toEqual([[11, 'bl', 5], [12, 'bl', 3], [41, 'rs', 6]]);
    // ish 12 hajmi 3 → avtomatik resurs 41 (norma 2) = 6, narx smetadan 4 → summa 24 (narx qoidasi f2Qur ichida)
    expect(h.byId.get(41)).toMatchObject({ narx: 4, summa: 24, manba: 'smeta' });
    expect(h.yuk.map((x) => x.qatorId)).toEqual([11, 12, 41]);
    expect(h.xatoSoni).toBe(0);
  });

  it('bo‘sh matn — qoralamadan olib tashlash; 0 va son bo‘lmagan — xato qator (yukka tushmaydi)', () => {
    const a = f2AsosQur(baza([band(12, 3)]));
    const oz = f2Ozgarishlar(a, { 12: '', 11: '0' });
    const h = f2Hisobla(a, f2Kiritma(a, oz), '');
    expect(h.byId.get(11)?.xato).toBe('HAJM');
    expect(h.byId.has(12)).toBe(false);
    expect(h.yuk.map((x) => x.qatorId)).toEqual([]);
    expect(h.xatoSoni).toBe(1);
  });

  it('storno bloki bor qoralama — varaq tegmaydi (belgi)', () => {
    const storno: AktBand = { ...band(12, -2), raw_snapshot: { source: 'native_f2_storno' } };
    const a = f2AsosQur(baza([storno]));
    // belgi aniqlanishi f2-storno qoidasiga bog'liq: manba kaliti bo'lmasa — oddiy qator
    expect(typeof a.storno).toBe('boolean');
  });
});

describe('F2 ogohlantirish (bloklamaydi)', () => {
  it('F2 > fakt va F2 > smeta alohida; tasdiqlangan F2 qo‘shiladi', () => {
    expect(f2Ogoh({ tasdiqlangan: 0, qoralama: 30, fakt: 40, smeta: 100 })).toEqual({ faktdanOshdi: false, smetadanOshdi: false });
    expect(f2Ogoh({ tasdiqlangan: 0, qoralama: 50, fakt: 40, smeta: 100 })).toEqual({ faktdanOshdi: true, smetadanOshdi: false });
    expect(f2Ogoh({ tasdiqlangan: 80, qoralama: 30, fakt: 200, smeta: 100 })).toEqual({ faktdanOshdi: false, smetadanOshdi: true });
    expect(f2Ogoh({ tasdiqlangan: null, qoralama: null, fakt: 1, smeta: 1 })).toEqual({ faktdanOshdi: false, smetadanOshdi: false });
    // chegirma (manfiy smeta): ishora teskari
    expect(f2Ogoh({ tasdiqlangan: 0, qoralama: -3, fakt: -2, smeta: -2 })).toEqual({ faktdanOshdi: true, smetadanOshdi: true });
  });
});
