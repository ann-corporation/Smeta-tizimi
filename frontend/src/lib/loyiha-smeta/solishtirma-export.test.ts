import { describe, expect, it } from 'vitest';
import { solishtirmaHujjatXlsx } from './solishtirma-export';
import { farqJami, type FarqQator } from './farq';
import { hujjatTekshir, imzoRollariBormi } from '../hujjat-yozuvchi';

const r = (o: Partial<FarqQator>): FarqQator => ({ tur: 'hajm_farqi', varaq: 'КР-5', miqdorId: 1, qatorId: 2, nom: 'Бетон монолитный', birlik: 'м3', loyiha: 12, smeta: 10, fakt: null, farq: 2, pulQQSsiz: 2000, pulQQSbilan: 2240,
  narxsiz: false, qaror: null, qarorEskirgan: false, izoh: [], ...o });

describe('Solishtirma vedomosti (loyiha–smeta–fakt)', () => {
  it('H1–H9: KATTA HARF, formula keshlangan, $ yo‘q, imzolar; narxsiz qator bo‘sh va diqqat ro‘yxatida', () => {
    const rows = [r({}), r({ tur: 'loyihada_bor_smetada_yoq', qatorId: null, nom: 'Новая работа', smeta: null, farq: 3, pulQQSsiz: null, pulQQSbilan: null, narxsiz: true })];
    const { bytes, faylNomi } = solishtirmaHujjatXlsx(rows, farqJami(rows), { obyektNomi: 'Объект', sana: '2026-11-12' });
    expect(faylNomi).toBe('Объект_СОПОСТАВЛЕНИЕ_ПРОЕКТ_СМЕТА_ФАКТ_2026-11-12.xlsx');
    const t = hujjatTekshir(bytes);
    expect(t.taqiqlangan).toEqual([]); expect(t.dollarFormulalar).toEqual([]); expect(t.keshsizFormulalar).toEqual([]);
    expect(t.matnlar).toEqual(expect.arrayContaining(['БЕТОН МОНОЛИТНЫЙ', 'НОВАЯ РАБОТА']));
    expect(t.matnlar.some((x) => x.startsWith('ПОЗИЦИИ БЕЗ ЦЕНЫ (1)'))).toBe(true);
    expect(imzoRollariBormi(t, ['ПОДРЯДЧИК', 'СОСТАВИЛ']).yoq).toEqual([]);
    const v = t.varaqlar[0]; expect(v.a4 && v.bittaEnli && v.yonalish === 'landscape').toBe(true);
  });
});
