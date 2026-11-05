import { describe, expect, it } from 'vitest';
import { bosKesim, kesimgaQosh, type AktPodvalNk } from './hisob-yadro';
import { pereraschetBaholash, pereraschetBloklari, stornoManbaId } from './f2-pereraschet';

const NK0: AktPodvalNk = { ЗТР_СОЦСТРАХ: 0, ТРАНСПОРТ_МАТЕРИАЛ: 0, СКЛАДСКИЕ_МАТЕРИАЛ: 0, СКЛАДСКИЕ_МК: 0, ТРАНСПОРТ_КАБЕЛЬ: 0, ПРОЧИЕ_ПОДРЯДЧИК: 10, ТРАНСПОРТ_ОБОРУД: 0, ЗАГОТ_СКЛАД_ОБОРУД: 0, СТРАХОВАНИЕ: 0, РИСК: 0, НДС: 12 };
const NK_A: AktPodvalNk = { ...NK0, ПРОЧИЕ_ПОДРЯДЧИК: 15 };
const SMETA = { koef: { ТРАНСПОРТ_МАТЕРИАЛ: 5, СКЛАДСКИЕ_МАТЕРИАЛ: 2, СКЛАДСКИЕ_МК: 0.75, ТРАНСПОРТ_КАБЕЛЬ: 1.5, ПРОЧИЕ_ПОДРЯДЧИК: 18, ТРАНСПОРТ_ОБОРУД: 2, ЗАГОТ_СКЛАД_ОБОРУД: 1.2, СТРАХОВАНИЕ: 0.32, РИСК: 0, НДС: 12 } };
const storno = (qatorId: number, of: number, summa: number | null) => ({ qator_id: qatorId, certified_quantity: -1, certified_unit_price: summa == null ? null : -summa, certified_amount: summa == null ? null : -summa, raw_snapshot: { source: 'storno', stornoOf: of } });
const SMETA_QATORLAR = new Map([[1, { id: 1, kat: 'ЧЕЛ', nom: 'mehnat' }], [2, { id: 2, kat: 'МАТ', nom: 'material' }], [3, { id: 3, kat: 'ЧЕЛ', nom: 'boshqa' }]]);

describe('storno bloki manba F2 tuzilmasida (rz → bl → rs), DB id tartibi emas', () => {
  it('tasodifiy tartibda kelgan qatorlar smeta daraxti tartibida chiqadi', () => {
    // rz 100 → bl 5 (tartib 1) → rs 51, rs 52; bl 6 (tartib 2) → mat 61. Akt qatorlari tasodifiy: resurslar ishidan oldin.
    const smeta = new Map<number, { id: number; tur: string; ota_id: number | null; tartib: number; nom: string; kat?: string }>([
      [100, { id: 100, tur: 'rz', ota_id: null, tartib: 1, nom: 'Bo‘lim' }],
      [6, { id: 6, tur: 'bl', ota_id: 100, tartib: 2, nom: 'Ish 6' }],
      [52, { id: 52, tur: 'rs', ota_id: 5, tartib: 2, nom: 'БУЛЬДОЗЕРЫ', kat: 'МАШ' }],
      [61, { id: 61, tur: 'mat', ota_id: 6, tartib: 1, nom: 'Material', kat: 'МАТ' }],
      [5, { id: 5, tur: 'bl', ota_id: 100, tartib: 1, nom: 'Е2704-001-04' }],
      [51, { id: 51, tur: 'rs', ota_id: 5, tartib: 1, nom: 'АВТОПОГРУЗЧИКИ', kat: 'МАШ' }],
    ]);
    const aq = [storno(52, 10, -5), storno(51, 10, -4), storno(61, 10, -3), storno(6, 10, null), storno(999, 10, -1), storno(5, 10, null)];
    const [b] = pereraschetBloklari(aq, smeta);
    expect(b.qatorlar.map((q) => q.qatorId)).toEqual([5, 51, 52, 6, 61, 999]); // smetada yo'q qator — oxirida
  });
});

describe('pereraschet — bitta F2: eski bloklar (o‘z podvali) + yangi (smeta podvali)', () => {
  it('storno bloklari manba akt bo‘yicha guruhlanadi; storno bo‘lmagan qator kirmaydi', () => {
    const b = pereraschetBloklari([storno(1, 10, 1000), storno(3, 11, 500), storno(2, 10, 200), { qator_id: 9, certified_amount: 5 }], SMETA_QATORLAR, new Map([[10, '535']]));
    expect(b.map((x) => x.manbaAktId)).toEqual([10, 11]);
    expect(b[0].qatorlar).toHaveLength(2);
    expect(b[0].raqam).toBe('535');
    expect(b[0].jami).toBe(-1200);
    expect(stornoManbaId({ raw_snapshot: { source: 'storno', stornoOf: 11 } })).toBe(11);
    expect(stornoManbaId({ raw_snapshot: { source: 'f2_v3' } })).toBeNull();
  });

  it('har blok o‘z podvali: bir nechta eski F2 — har biri o‘z foizi; sof = yangi − eski', () => {
    const bloklar = pereraschetBloklari([storno(1, 10, 1000), storno(3, 11, 1000)], SMETA_QATORLAR);
    const yangi = kesimgaQosh(bosKesim(), 'МАТ', 3000);
    const nk = (id: number) => (id === 10 ? NK0 : id === 11 ? NK_A : null);
    const r = pereraschetBaholash(bloklar, nk, yangi, SMETA);
    // 10%: 1000 → 1232 (QQS 12 %); 15%: 1000 → 1288
    expect(r.bloklar[0].baho.qqsBilan).toBe(-1232);
    expect(r.bloklar[1].baho.qqsBilan).toBe(-1288);
    expect(r.eski!.qqsBilan).toBe(-2520);
    expect(r.yangi!.qqsBilan).not.toBeNull();
    expect(r.sof.qqsBilan).toBe(Math.round(((r.yangi!.qqsBilan as number) + (r.eski!.qqsBilan as number)) * 100) / 100);
  });

  it('manba akt podvali yo‘q — smeta podvali (jim yo‘qolmaydi), summasiz qator noma‘lum sanaladi', () => {
    const bloklar = pereraschetBloklari([storno(1, 10, 1000), storno(3, 10, null)], SMETA_QATORLAR);
    expect(bloklar[0].nomalum).toBe(1);
    const r = pereraschetBaholash(bloklar, () => null, null, SMETA);
    expect(r.bloklar[0].hujjatPodvali).toBe(false);
    expect(r.yangi).toBeNull();
    expect(r.sof.qqsBilan).toBe(r.eski!.qqsBilan);
  });
});
