import { describe, expect, it } from 'vitest';
import { f2QoralamaHujjat } from './f2-native-export';
import { hujjatTekshir, imzoRollariBormi } from './hujjat-yozuvchi';
import { namunaSaqla } from './hujjat-yozuvchi/test-yordam';
import type { QatorHolat } from '../api/t2-fakt';
import type { F2NativePayloadRow } from './f2-native-preparation';

const holat = (id: number, nom: string, extra: Partial<QatorHolat> = {}): QatorHolat => ({
  id, qator_id: id, obyekt_id: 2, tur: 'mat', kod: `С${id}`, nom, birlik: 'м3', kat: 'МАТ', smeta_hajm: 20, smeta_narx: 123.45, smeta_summa: 2469,
  fakt_hajm: 10, fakt_summa: 1234.5, f2_hajm: 2, f2_summa: 246.9, qoldiq_hajm: 18, qoldiq_summa: 2222.1, f2_mumkin_hajm: 8, f2_mumkin_summa: 987.6, ...extra,
} as QatorHolat);
const cert = (qatorId: number, q: number, narx?: number, summa?: number): F2NativePayloadRow => ({
  qatorId, certifiedQuantity: q, certifiedUnitPrice: narx, certifiedAmount: summa, priceIntentionallyAbsent: narx == null,
  rawSnapshot: { source: 'native_f2_preparation', sourceReference: `Ф2 № 7, стр. ${qatorId}`, enteredQuantity: q, enteredUnitPrice: narx, enteredAmount: summa },
});

describe('Проект акта Ф-2 (F2 tayyorlash) — hujjat standarti', () => {
  it('hujjat summasi aynan saqlanadi; hisob va farq — nazorat; НДС; imzo; $ yo‘q', () => {
    const r = f2QoralamaHujjat([holat(7, 'БЕТОН В25'), holat(8, 'ПЕСОК')], [cert(7, 10, 123.45, 1234.49), cert(8, 5, 1000, 5000)], { obyektNom: 'Амфитеатр', davr: '2026-09-01', ndsFoiz: 12 });
    namunaSaqla('f2_qoralama.xlsx', r.bytes);
    expect(r.jami).toBeCloseTo(6234.49, 6);
    expect(r.faylNomi).toBe('Амфитеатр_ПРОЕКТ_АКТА_Ф-2_2026-09.xlsx');
    const t = hujjatTekshir(r.bytes);
    expect(t.taqiqlangan).toEqual([]);
    expect(t.dollarFormulalar).toEqual([]);
    expect(t.keshsizFormulalar).toEqual([]);
    expect(imzoRollariBormi(t, ['ЗАКАЗЧИК', 'ПОДРЯДЧИК', 'ТЕХНАДЗОР']).yoq).toEqual([]);
    expect(t.matnlar.some((s) => s.includes('БЕТОН В25') && s.includes('отличается от расчета'))).toBe(true);
    expect(t.matnlar).toContain('Ф2 № 7, стр. 7');
    const v = t.varaqlar[0];
    expect(v.kataklar.some((k) => k.ref.startsWith('G') && k.v === '1234.49')).toBe(true);
    expect(v.a4 && v.bittaEnli).toBe(true);
  });

  it('narx manbada ataylab yo‘q: summa bo‘sh, ИТОГО bo‘sh (0 emas), sabab hujjatda', () => {
    const r = f2QoralamaHujjat([holat(7, 'БЕТОН В25'), holat(8, 'ПЕСОК')], [cert(7, 10), cert(8, 5, 1000, 5000)], { obyektNom: 'Амфитеатр', davr: '2026-09' });
    namunaSaqla('f2_qoralama_nomalum.xlsx', r.bytes);
    expect(r.jami).toBeNull();
    const t = hujjatTekshir(r.bytes);
    expect(t.matnlar.some((s) => s.includes('в документе нет цены/суммы'))).toBe(true);
    expect(t.varaqlar[0].kataklar.find((k) => k.f?.startsWith('IF(COUNTIFS(N'))?.v).toBe('');
    expect(t.taqiqlangan).toEqual([]);
  });

  it('resursli F2: ish (bl) — sarlavha qatori, ИТОГО resurslardan aniq, "нет цены" yo‘q', () => {
    const ish = holat(9, 'УСТРОЙСТВО ФУНДАМЕНТА', { tur: 'bl', kat: null, smeta_narx: null });
    const chel = holat(10, 'Затраты труда', { tur: 'rs', kat: 'ЧЕЛ', birlik: 'чел.-ч' });
    const r = f2QoralamaHujjat([ish, chel, holat(8, 'ПЕСОК')], [cert(9, 6), cert(10, 12, 25000, 300000), cert(8, 5, 1000, 5000)], { obyektNom: 'Амфитеатр', davr: '2026-09' });
    expect(r.jami).toBe(305000);
    const t = hujjatTekshir(r.bytes);
    expect(t.matnlar.some((m) => m.includes('в документе нет цены'))).toBe(false);
    expect(t.matnlar.some((m) => m.includes('не указан вид затрат'))).toBe(false);
    expect(t.varaqlar[0].kataklar.find((k) => k.f?.startsWith('IF(COUNTIFS(N'))?.v).toBe('305000');
    expect(t.taqiqlangan).toEqual([]);
    expect(t.dollarFormulalar).toEqual([]);
  });
});
