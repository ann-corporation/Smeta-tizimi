import { describe, expect, it } from 'vitest';
import { hisobKodi, saldoQatorlar, saldoUstunTaxmin } from './saldo';

// SINTETIK namuna (haqiqiy eksport tuzilishi emas): sarlavha qatori + ma'lumot + jami
const grid = [
  ['Оборотно-сальдовая ведомость', null, null, null, null],
  ['Счет', 'Контрагент', 'Договор', 'Дебет', 'Кредит'],
  ['5110', null, null, 1000, null],
  ['4010', 'TEST KONTRAGENT', 'S-1', 500, null],
  ['60.10', 'TEST KONTRAGENT', null, null, 900],
  ['8310', null, null, null, 600],
  ['Итого', null, null, 1500, 1500],
];

describe('boshlang‘ich qoldiq: ustun taxmini va moslash', () => {
  it('sarlavha qatorini va ustunlarni topadi', () => {
    const { boshQator, map } = saldoUstunTaxmin(grid);
    expect(boshQator).toBe(2);
    expect(map).toMatchObject({ hisob: 0, kontragent: 1, shartnoma: 2, dt: 3, kt: 4 });
  });
  it('hisob kodi: 4 raqam yoki NN.NN, jami qatori emas', () => {
    expect(hisobKodi('6010')).toBe('6010'); expect(hisobKodi('60.10')).toBe('6010'); expect(hisobKodi('Итого')).toBeNull(); expect(hisobKodi('60')).toBeNull();
  });
  it('qatorlar: jami o‘tkaziladi, kontragent va shartnoma moslanadi', () => {
    const { boshQator, map } = saldoUstunTaxmin(grid);
    const r = saldoQatorlar(grid, map, boshQator, { kontragentlar: [{ id: 7, nom: 'Test Kontragent', inn: null }], shartnomalar: [{ id: 9, raqam: 'S-1', kontragent_id: 7 }] });
    expect(r.qatorlar).toHaveLength(4);
    expect(r.otkazildi).toBe(1);
    expect(r.qatorlar[1]).toMatchObject({ hisob: '4010', dt: '500', shartnoma_id: 9, kontragent_id: 7 });
    expect(r.qatorlar[2]).toMatchObject({ hisob: '6010', kt: '900', kontragent_id: 7 });
    expect(r.moslanmadi).toBe(0);
  });
  it('moslanmagan kontragent hisoblanadi, bitta «saldo» ustuni ishora bilan', () => {
    const g = [['Счёт', 'Контрагент', 'Сальдо'], ['6010', 'Noma‘lum', -50], ['5110', null, 50]];
    const { boshQator, map } = saldoUstunTaxmin(g);
    const r = saldoQatorlar(g, map, boshQator, { kontragentlar: [], shartnomalar: [] });
    expect(r.moslanmadi).toBe(1);
    expect(r.qatorlar[0]).toMatchObject({ hisob: '6010', kt: '50' });
    expect(r.qatorlar[1]).toMatchObject({ hisob: '5110', dt: '50' });
  });
});