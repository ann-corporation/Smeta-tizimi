import { describe, expect, it } from 'vitest';
import type { T2Qator } from '../../api/supabase';
import { jurnalQur, type JurnalHolat, type SummaKesim } from '../fakt-jurnal';
import { bosKatKesim } from '../ustamali-summa';
import type { F2Qator } from '../f2-tayyor';
import { deltaFaqat, f2QoralamaDelta, f2QoralamaJami, faktDeltalar, jamiDeltaBilan } from './jami-delta';
import { VARAQ_FILTRLAR, varaqFiltrMos } from './filtr';

const q = (o: Partial<T2Qator> & { id: number; tur: string }): T2Qator => ({
  obyekt_id: 8, obyekt: null, kompaniya_id: 1, ota_id: null, daraja: 0, tartib: o.id, kod: null, nom: `n${o.id}`, birlik: 'м3',
  hajm: null, narx: null, summa: null, kat: null, narx_usul: null, qoshimcha: false, zamena: false,
  d1: null, d2: null, d3: null, xom_qator: null, yangilandi: null, manba_id: null, versiya: 1, ...o,
} as T2Qator);
const rows = [
  q({ id: 1, tur: 'rz' }),
  q({ id: 11, tur: 'bl', ota_id: 1, hajm: 10 }),
  q({ id: 41, tur: 'rs', ota_id: 11, hajm: 20, kat: 'МАТ', norma: 2 } as never),
  q({ id: 42, tur: 'rs', ota_id: 11, hajm: 10, kat: 'ЧЕЛ', norma: 1 } as never), // narxi noma'lum
  q({ id: 51, tur: 'mat', ota_id: 1, hajm: 4, kat: 'МАТ' }),
];
const states: JurnalHolat[] = [
  { qator_id: 11, smeta_hajm: 10, fakt_hajm: 0 },
  { qator_id: 41, smeta_hajm: 20, fakt_hajm: 0, smeta_narx: 10, smeta_summa: 200, fakt_summa: 0 },
  { qator_id: 42, smeta_hajm: 10, fakt_hajm: 0, smeta_narx: null, smeta_summa: null, fakt_summa: null },
  { qator_id: 51, smeta_hajm: 4, fakt_hajm: 1, smeta_narx: 7, smeta_summa: 28, fakt_summa: 7 },
];
const j = jurnalQur(rows, states);
const qatorMap = new Map<number, ReturnType<typeof jurnalQur>['ildizIshlari'][number]>();
for (const arr of [...j.bolimIshlari.values(), j.ildizIshlari]) for (const x of arr) { qatorMap.set(x.id, x); for (const r of [...x.resurslar, ...x.avtomatik]) qatorMap.set(r.id, r as typeof x); }
const holat = new Map(states.map((s) => [s.qator_id, s]));
const rowById = new Map(rows.map((r) => [r.id, r]));

describe('fakt delta (saqlanmagan)', () => {
  it('ish deltasi avtomatik resurslarga norma bo‘yicha tushadi; narxi noma‘lum resurs — null (0 emas)', () => {
    const d = faktDeltalar({ deltalar: [{ qator_id: 11, hajm: 5 }], qatorOl: (id) => qatorMap.get(id), holat, rowById });
    // 41: 5 × 2 = 10 × 10 = 100; 42: narx yo'q — noma'lum
    expect(d).toEqual([{ id: 41, kat: 'МАТ', summa: 100 }, { id: 42, kat: 'ЧЕЛ', summa: null }]);
  });

  it('mat/ob — o‘z narxida: yangi fakt − joriy fakt summasi; chiqarilgan resurs o‘tkazib yuboriladi', () => {
    const d = faktDeltalar({ deltalar: [{ qator_id: 51, hajm: 2 }], qatorOl: (id) => qatorMap.get(id), holat, rowById });
    expect(d).toEqual([{ id: 51, kat: 'МАТ', summa: 14 }]);
    expect(faktDeltalar({ deltalar: [{ qator_id: 51, hajm: 2 }], qatorOl: (id) => qatorMap.get(id), holat, rowById, chiqarilgan: new Set([51]) })).toEqual([]);
  });

  it('jami + delta: ustamasiz yig‘indi va kesim; baza yo‘q va hammasi noma‘lum — null', () => {
    const baza: SummaKesim = { ustamasiz: 7, kesim: { ...bosKatKesim(), summalar: { МАТ: 7 } } };
    const d = [{ id: 41, kat: 'МАТ', summa: 100 }, { id: 42, kat: 'ЧЕЛ', summa: null as number | null }];
    const b = jamiDeltaBilan(baza, d);
    expect(b.ustamasiz).toBe(107);
    expect(b.kesim.summalar.МАТ).toBe(107);
    expect(b.kesim.summasizSoni).toBe(1); // narxsiz qator sanaladi
    expect(baza.ustamasiz).toBe(7); // baza o'zgarmaydi
    expect(jamiDeltaBilan(undefined, [{ id: 1, kat: null, summa: null }]).ustamasiz).toBeNull();
    expect(jamiDeltaBilan(undefined, []).ustamasiz).toBeNull();
    expect(deltaFaqat(d).ustamasiz).toBe(100);
    expect(deltaFaqat([{ id: 1, kat: 'МАТ', summa: -30 }]).ustamasiz).toBe(-30);
  });
});

const f2q = (id: number, tur: F2Qator['tur'], summa: number | null, kat: string | null = 'МАТ'): F2Qator => ({ id, ishId: null, tur, kat, nom: 'n', birlik: null, hajm: 1, narx: summa, summa, manba: 'smeta', narxsiz: summa == null });
describe('F2 qoralama jami va delta', () => {
  it('jami: ish (bl) summaga kirmaydi; narxsiz — kesimda sanaladi', () => {
    const j2 = f2QoralamaJami([f2q(1, 'bl', null), f2q(2, 'mat', 24), f2q(3, 'rs', null, 'ЧЕЛ')]);
    expect(j2.ustamasiz).toBe(24);
    expect(j2.kesim.summasizSoni).toBe(1);
    expect(f2QoralamaJami([f2q(3, 'rs', null)]).ustamasiz).toBeNull();
  });
  it('delta: yangi − saqlangan (ustamasiz va kesim)', () => {
    const eski = [f2q(2, 'mat', 24)];
    const yangi = [f2q(2, 'mat', 24), f2q(4, 'mat', 10), f2q(5, 'rs', 6, 'ЧЕЛ')];
    const d = f2QoralamaDelta(yangi, eski);
    expect(d.ustamasiz).toBe(16);
    expect(d.kesim.summalar).toEqual({ МАТ: 10, ЧЕЛ: 6 });
    expect(f2QoralamaDelta(eski, eski).ustamasiz).toBe(0);
    expect(f2QoralamaDelta([], []).ustamasiz).toBeNull();
  });
});

describe('Alt+1..4 filtrlar', () => {
  it('tugmalar Fakt jurnali bilan bir xil (alt+1…4), tartib: hammasi, qoldig‘i bor, smetadan oshgan, narxsiz', () => {
    expect(VARAQ_FILTRLAR.map((f) => [f.kalit, f.tugma])).toEqual([['hammasi', 'alt+1'], ['qoldiq', 'alt+2'], ['oshgan', 'alt+3'], ['narxsiz', 'alt+4']]);
  });
  it('mosligi', () => {
    const a = { holat: 'qisman' as const, qoldiq: 60, smeta: 100 };
    const o = { holat: 'oshdi' as const, qoldiq: -20, smeta: 100 };
    expect(varaqFiltrMos('hammasi', o, false)).toBe(true);
    expect(varaqFiltrMos('qoldiq', a, false)).toBe(true);
    expect(varaqFiltrMos('qoldiq', o, false)).toBe(false);
    expect(varaqFiltrMos('qoldiq', { holat: 'tugadi', qoldiq: 0, smeta: 5 }, false)).toBe(false);
    expect(varaqFiltrMos('qoldiq', { holat: 'yangi', qoldiq: -3, smeta: -3 }, false)).toBe(true); // chegirma qatori
    expect(varaqFiltrMos('oshgan', o, false)).toBe(true);
    expect(varaqFiltrMos('oshgan', a, false)).toBe(false);
    expect(varaqFiltrMos('narxsiz', a, true)).toBe(true);
    expect(varaqFiltrMos('narxsiz', a, false)).toBe(false);
  });
});
