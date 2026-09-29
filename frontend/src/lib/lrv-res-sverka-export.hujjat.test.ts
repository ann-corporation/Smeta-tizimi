import { describe, expect, it } from 'vitest';
import { sverkaHujjatXlsx } from './lrv-res-sverka-export';
import { lrvResSverka } from './smeta-anatomiya/sverka';
import { hujjatTekshir, imzoRollariBormi } from './hujjat-yozuvchi';
import { namunaSaqla } from './hujjat-yozuvchi/test-yordam';
import type { Resurs } from './smeta-anatomiya/turlar';

const m = (qator: number) => ({ fayl: 'f.xlsx', varaq: 'V', qator });
const r = (xom: string, birlik: string, hajm: number | null, summa: number | null, kod: string | null = null): Resurs =>
  ({ tartib: '1', kod, xom, birlik, normaBirlikka: null, hajm, narx: null, summa, guruh: null, manzil: m(1) });

describe('Сверка ЛРВ и РС — hujjat (H1–H9)', () => {
  it('bo‘limlar, farq formulasi keshlangan, diqqat ro‘yxati, imzolar, $ yo‘q', () => {
    const lrv = [{ fayl: 'f', varaq: 'LRV', rol: 'lrv' as const, rolDalil: [], ustunlar: null, titul: [], sarlavhalar: [], vedomost: [], jamilar: [], review: [],
      ishlar: [{ tartib: '1', shifr: 'E1', xom: 'ИШ', birlik: 'М3', hajm: 1, narx: null, summa: null, sarlavha: null, manzil: m(5),
        resurslar: [r('ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'ЧЕЛ-Ч', 30, null), r('БЕТОН В25', 'М3', 101.5, null)] }] }];
    const res = [r('ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ С УЧЕТОМ СОЦСТРАХА', 'ЧЕЛ.-Ч', 30, 3000), r('БЕТОН В25', 'М3', 100, 70_000), r('ГВОЗДИ', 'КГ', 5, 100)];
    const s = lrvResSverka(lrv, res);
    const { bytes, faylNomi } = sverkaHujjatXlsx(s, { obyektNomi: 'Объект', lrvManba: 'smeta.xlsx / ЛРВ', resManba: 'smeta.xlsx / РС', sana: '2026-09-29' });
    namunaSaqla('sverka-lrv-res.xlsx', bytes);
    expect(faylNomi).toBe('Объект_СВЕРКА_ЛРВ_И_РС_2026-09-29.xlsx');
    const t = hujjatTekshir(bytes);
    expect(t.taqiqlangan).toEqual([]);
    expect(t.dollarFormulalar).toEqual([]);
    expect(t.keshsizFormulalar).toEqual([]);
    const v = t.varaqlar[0];
    expect(v.a4 && v.bittaEnli && v.yonalish === 'landscape').toBe(true);
    expect(imzoRollariBormi(t, ['ПОДРЯДЧИК', 'СОСТАВИЛ']).yoq).toEqual([]);
    expect(t.matnlar).toEqual(expect.arrayContaining(['ЗАТРАТЫ ТРУДА', 'МАТЕРИАЛЫ, ИЗДЕЛИЯ И КОНСТРУКЦИИ']));
    expect(t.matnlar.some((x) => x.startsWith('ПОЗИЦИИ С РАСХОЖДЕНИЯМИ (2)'))).toBe(true);
    const beton = v.kataklar.find((k) => k.matn === 'БЕТОН В25')!;
    const row = beton.ref.replace(/^[A-Z]+/, '');
    expect(Number(v.kataklar.find((k) => k.ref === `G${row}`)?.v)).toBe(-1.5);
  });
});
