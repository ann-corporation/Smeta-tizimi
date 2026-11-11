import { describe, expect, it } from 'vitest';
import { ishJurnaliXlsx, JURNAL_SABLON_SUKUT } from './eksport';
import { hujjatTekshir, imzoRollariBormi } from '../hujjat-yozuvchi';
import type { KunJurnali } from './model';

const kun = (o: Partial<KunJurnali> = {}): KunJurnali => ({
  obyektId: 1, obyektNomi: 'Объект', sana: '2026-11-12',
  ishlar: [{ qatorId: 1, kod: 'Е06-001', nom: 'Устройство фундамента', birlik: 'м3', hajm: 7.5, aktlar: 2 }],
  kirimlar: [{ id: 1, nomi: 'Цемент', birligi: 'т', hajm: 3, postavshik: 'ООО «Поставщик»' }],
  aosr: [{ id: 1, raqam: '5', ishNomi: 'Армирование', holat: 'tasdiqlangan' }],
  murojaatlar: [{ id: 1, turi: 'predpisaniya', sarlavha: 'Устранить трещины', holat: 'ochiq', muddat: '2026-11-20' }],
  obHavo: { harorat_min: 3, harorat_max: 11, yogin_mm: 0, shamol_max: 10, kod: 0, manba: 'open-meteo' },
  izoh: { izoh: 'Работы шли по графику', odamlar: '2 бригады', tasdiqlandi: true, versiya: 1, obHavo: null }, olinmagan: [], ...o,
});

describe('Kundalik ish jurnali — rasmiy hujjat', () => {
  it('hujjat qoidalari: taqiqlangan yo‘q, imzolar, asosiy qatorlar KATTA HARF, fayl nomi', () => {
    const { bytes, faylNomi } = ishJurnaliXlsx([kun()], { obyektNomi: 'Объект' });
    expect(faylNomi).toBe('Объект_ЖУРНАЛ_РАБОТ_2026-11-12.xlsx');
    const t = hujjatTekshir(bytes);
    expect(t.taqiqlangan).toEqual([]);
    expect(t.dollarFormulalar).toEqual([]);
    expect(imzoRollariBormi(t, ['ПОДРЯДЧИК', 'ТЕХНАДЗОР']).yoq).toEqual([]);
    expect(t.matnlar).toContain('УСТРОЙСТВО ФУНДАМЕНТА');
    expect(t.matnlar).toContain('ЦЕМЕНТ');
    expect(t.matnlar.some((x) => x.includes('ОБЩИЙ ЖУРНАЛ РАБОТ'))).toBe(true);
    expect(t.matnlar.some((x) => x.includes('ДАТА: 12.11.2026'))).toBe(true);
  });
  it('tasdiqlanmagan yozuv va o‘qilmagan manba hujjatda ko‘rinadi (jim yo‘qotish yo‘q)', () => {
    const { bytes } = ishJurnaliXlsx([kun({ izoh: null, olinmagan: ['kirim'] })], { obyektNomi: 'Объект' });
    const t = hujjatTekshir(bytes);
    expect(t.matnlar.some((x) => x.includes('НЕ ПОДТВЕРЖДЕНА ПРОРАБОМ'))).toBe(true);
    expect(t.matnlar.some((x) => x.includes('«поступление материалов» не получены'))).toBe(true);
  });
  it('shablon sozlanadi: bo‘lim o‘chirilsa chiqmaydi, sarlavha almashadi', () => {
    const { bytes } = ishJurnaliXlsx([kun()], { obyektNomi: 'Объект', sablon: { ...JURNAL_SABLON_SUKUT, sarlavha: 'ЖУРНАЛ УЧЕТА', bolimlar: { ...JURNAL_SABLON_SUKUT.bolimlar, kirim: false, obHavo: false } } });
    const t = hujjatTekshir(bytes);
    expect(t.matnlar.some((x) => x.includes('ЖУРНАЛ УЧЕТА'))).toBe(true);
    expect(t.matnlar).not.toContain('ЦЕМЕНТ');
    expect(t.matnlar).not.toContain('ПОГОДА');
  });
  it('bir necha kun sana tartibida, ob-havo yo‘q — «данные не получены»', () => {
    const { bytes, faylNomi } = ishJurnaliXlsx([kun({ sana: '2026-11-13', obHavo: null }), kun({ sana: '2026-11-12' })], { obyektNomi: 'Объект' });
    expect(faylNomi).toBe('Объект_ЖУРНАЛ_РАБОТ_2026-11-12_2026-11-13.xlsx');
    const t = hujjatTekshir(bytes);
    const i12 = t.matnlar.findIndex((x) => x.includes('12.11.2026')); const i13 = t.matnlar.findIndex((x) => x.includes('ДАТА: 13.11.2026'));
    expect(i12).toBeGreaterThanOrEqual(0); expect(i13).toBeGreaterThan(i12);
    expect(t.matnlar.some((x) => x.toLowerCase().includes('данные не получены'))).toBe(true);
  });
});
