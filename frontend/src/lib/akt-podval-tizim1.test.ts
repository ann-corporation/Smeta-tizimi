import { describe, expect, it } from 'vitest';
import { nakrutkaPodvaliniOqi } from './smeta-anatomiya/nakrutka';
import type { KirishKitob } from './smeta-anatomiya/turlar';
import { f2AktlarniOqi } from './smeta-anatomiya/f2';
import { aktPodvalYuki } from './akt-podval';

/**
 * «Tizim 1» (eski LRV_PLUS) F2 podvali — SINTETIK fixture (soxta summalar, haqiqiy hujjat emas): yorliq C, birlik D, summa G;
 * ИТОГО-1…4 raqamsiz «ИТОГО», foizlar yorliq matnida, КОЭФФИЦЕНТ РИСКА bo'sh, ba'zi formulalar natijasiz.
 */
type Satr = { yorliq: string; summa?: number | null; formula?: string };
const QATORLAR = (o: { trKab?: number | null; ob?: number | null; prochie?: number } = {}): Satr[] => [
  { yorliq: 'ИТОГО ПРЯМЫЕ ЗАТРАТЫ', summa: 1300 },
  { yorliq: 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ (В Т.Ч. СОЦСТРАХ 12%)', summa: 200 },
  { yorliq: 'ЗАТРАТЫ МАШИН И МЕХАНИЗМОВ', summa: 100 },
  { yorliq: 'МАТЕРИАЛЫ', summa: 1000 },
  { yorliq: 'ТРАНСПОРТНЫЕ РАСХОДЫ НА МАТЕРИАЛЫ 5%', summa: 50, formula: '(G4)*0.05' },
  { yorliq: 'СКЛАДСКИЕ РАСХОДЫ НА МАТЕРИАЛЫ 2% И М/К 0,75%', summa: 20, formula: '((G4)*0.02)' },
  { yorliq: 'КАБЕЛИ И ПРОВОДА', summa: 0 },
  { yorliq: 'ТРАНСПОРТНЫЕ РАСХОДЫ НА КАБЕЛИ И ПРОВОДА', summa: o.trKab === undefined ? 0 : o.trKab, formula: 'G7*0.015' },
  { yorliq: 'ИТОГО', summa: 1370, formula: 'G8+G6+G5+G4+G3+G2' },
  { yorliq: 'ПРОЧИЕ ЗАТРАТЫ И РАСХОДЫ ПОДРЯДЧИКА 18%', summa: o.prochie ?? 246.6, formula: 'G9*0.18' },
  { yorliq: 'ИТОГО', summa: 1616.6, formula: 'G9+G10' },
  { yorliq: 'ОБОРУДОВАНИЯ', summa: 0 },
  { yorliq: 'ТРАНСПОРТНЫЕ РАСХОДЫ НА ОБОРУДОВАНИЯ', summa: o.ob === undefined ? 0 : o.ob, formula: '(G12)*0.02' },
  { yorliq: 'ЗАГОТОВИТЕЛЬНО-СКЛАДСКИЕ РАСХОДЫ НА ОБОРУДОВАНИЯ 1,2%', summa: 0, formula: '(G12)*0.012' },
  { yorliq: 'ИТОГО', summa: 1616.6, formula: 'G14+G13+G12+G11' },
  { yorliq: 'ЗАТРАТЫ НА СТРАХОВАНИЕ ОБЪЕКТА 0,32%', summa: 5.17, formula: 'G15*0.0032' },
  { yorliq: 'КОЭФФИЦЕНТ РИСКА' },
  { yorliq: 'ИТОГО', summa: 1621.77, formula: 'G16+G15' },
  { yorliq: 'НДС', summa: 194.61, formula: 'G18*0.12' },
  { yorliq: 'ВСЕГО СТОИМОСТЬ СТРОИТЕЛЬСТВА В ТЕКУЩИХ ЦЕНАХ', summa: 1816.38, formula: 'G19+G18' },
];

function kitob(satrlar: Satr[], formulalarBilan: boolean): KirishKitob {
  const rows = satrlar.map((s) => [null, null, s.yorliq, 'СУМ', null, null, s.summa ?? null] as Array<string | number | null>);
  const formulalar = satrlar.map((s) => (formulalarBilan && s.formula ? [null, null, null, null, null, null, s.formula] : []));
  return { fayl: 'sintetik.xlsx', varaqlar: [{ nom: 'LRV', rows, ...(formulalarBilan ? { formulalar } : {}) }] };
}
const JAMI = { pryamye: 1300, nds: null, vsego: 1816.38 };

describe('Tizim 1 (LRV_PLUS) podvali', () => {
  it('foizlar yorliqdan, ИТОГО-1..4 joyiga qarab, НДС — ИТОГО-4 nisbatidan; kaskad ИТОГО-4/ВСЕГО ni beradi → isbotlangan', () => {
    const y = aktPodvalYuki(nakrutkaPodvaliniOqi(kitob(QATORLAR(), false)), JAMI);
    expect(y).not.toBeNull();
    expect(y!.nk).toMatchObject({ ТРАНСПОРТ_МАТЕРИАЛ: 5, СКЛАДСКИЕ_МАТЕРИАЛ: 2, СКЛАДСКИЕ_МК: 0.75, ПРОЧИЕ_ПОДРЯДЧИК: 18, ЗАГОТ_СКЛАД_ОБОРУД: 1.2, СТРАХОВАНИЕ: 0.32, РИСК: 0, НДС: 12 });
    expect([y!.itogo1, y!.itogo2, y!.itogo3, y!.itogo4]).toEqual([1370, 1616.6, 1616.6, 1621.77]);
    expect(y!.hujjat.vsego).toBe(1816.38);
    expect(y!.tekshiruv.isbotNomos).toBe(0);
    expect(y!.tekshiruv.isbotsiz).toEqual([]);
    expect(y!.tekshiruv.toliq).toBe(true);
    expect(y!.tekshiruv.isbotSoni).toBeGreaterThanOrEqual(10);
  });

  it('natijasi saqlanmagan chiziqli formulalar («=G7*0.015», «=(G12)*0.02») hisoblanadi, baza 0 bo‘lsa podval yiqilmaydi', () => {
    const y = aktPodvalYuki(nakrutkaPodvaliniOqi(kitob(QATORLAR({ trKab: null, ob: null }), true)), JAMI);
    expect(y!.nk.ТРАНСПОРТ_КАБЕЛЬ).toBe(1.5); // yorliqda foiz yo'q — formuladan
    expect(y!.nk.ТРАНСПОРТ_ОБОРУД).toBe(2);
    const tr = y!.qatorlar.find((q) => q.kod === 'tr_kab');
    expect(tr?.summa).toBe(0); // G7 = 0 → 0 × 1,5%
    expect(y!.tekshiruv.toliq).toBe(true);
  });

  it('formulasiz va natijasiz qator — summa noma‘lum (null), podval baribir isbotlangan', () => {
    const y = aktPodvalYuki(nakrutkaPodvaliniOqi(kitob(QATORLAR({ trKab: null, ob: null }), false)), JAMI);
    expect(y!.qatorlar.find((q) => q.kod === 'tr_kab')?.summa).toBeNull();
    expect(y!.tekshiruv.toliq).toBe(true);
  });

  it('kaskad hujjat summasini bermasa (ПРОЧИЕ buzilgan) — isbotlanmagan', () => {
    const y = aktPodvalYuki(nakrutkaPodvaliniOqi(kitob(QATORLAR({ prochie: 300 }), false)), JAMI);
    expect(y!.tekshiruv.toliq).toBe(false);
    expect(y!.tekshiruv.isbotNomos).toBeGreaterThan(0);
  });

  it('F2 akt o‘quvchisi (ishlar + shu podval) podvalni akt.podval ga qo‘yadi', () => {
    const SARLAVHA: Array<Array<string | number | null>> = [
      ['АКТ'], ['О выполненых работ по объекту "SINTETIK"'], [], ['За сентябрь месяц 2025 года'], [],
      ['№№', 'ОБОСНОВАНИЕ', 'НАИМЕНОВАНИЕ РАБОТ И РЕСУРСОВ', 'ЕД.ИЗМ', 'КОЛ-ВО', null, 'Сметная стоимость', null],
      [null, null, null, null, 'НА ЕДИНИЦУ', 'ПО ПРОЕКТУ', 'на.ед.изм.', 'общая'], [1, 2, 3, 4, 5, 6, 7, 8],
      [1, 'E1-1-1', 'SINTETIK ISH', 'М3', 2, null, null, 1300],
    ];
    const rows = [...SARLAVHA, ...QATORLAR().map((s) => [null, null, s.yorliq, 'СУМ', null, null, null, s.summa ?? null] as Array<string | number | null>)];
    const aktlar = f2AktlarniOqi({ fayl: 'sintetik.xlsx', varaqlar: [{ nom: 'LRV', rows }] });
    const pv = aktlar[0]?.podval;
    expect(pv?.nk.НДС).toBe(12);
    expect(pv?.itogo4).toBe(1621.77);
    expect(pv?.tekshiruv.toliq).toBe(true);
  });});
