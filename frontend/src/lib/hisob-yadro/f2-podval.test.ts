import { describe, expect, it } from 'vitest';
import { bosKesim, f2Baholash, hisob, kesimQosh, kesimgaQosh, type AktPodvalNk, type Kesim } from './index';

/**
 * F2 hujjat podvali (egasi 2026-11-03): SQL `_t2_summa_paket_v1` (20261121000000) bilan paritet.
 * Sonlar SINTETIK. Acceptance SQL ham shu stsenariy: 1000 so'm ЧЕЛ, hujjat ustamasi 10 %, QQS 12 % -> 1100 / 132 / 1232.
 */
const kesim = (kat: string, summa: number): Kesim => kesimgaQosh(bosKesim(), kat, summa);
const NK_HUJJAT: AktPodvalNk = { ЗТР_СОЦСТРАХ: 0, ТРАНСПОРТ_МАТЕРИАЛ: 0, СКЛАДСКИЕ_МАТЕРИАЛ: 0, СКЛАДСКИЕ_МК: 0, ТРАНСПОРТ_КАБЕЛЬ: 0, ПРОЧИЕ_ПОДРЯДЧИК: 10, ТРАНСПОРТ_ОБОРУД: 0, ЗАГОТ_СКЛАД_ОБОРУД: 0, СТРАХОВАНИЕ: 0, РИСК: 0, НДС: 12 };
const NK_SMETA: AktPodvalNk = { ТРАНСПОРТ_МАТЕРИАЛ: 5, СКЛАДСКИЕ_МАТЕРИАЛ: 2, СКЛАДСКИЕ_МК: 0.75, ТРАНСПОРТ_КАБЕЛЬ: 1.5, ПРОЧИЕ_ПОДРЯДЧИК: 18, ТРАНСПОРТ_ОБОРУД: 2, ЗАГОТ_СКЛАД_ОБОРУД: 1.2, СТРАХОВАНИЕ: 0.32, РИСК: 0, НДС: 12 };
const SMETA = { koef: NK_SMETA };

describe('f2Baholash — hujjat o‘z podvali bilan', () => {
  it('o‘z podvali: 1000 → ustamali 1100, QQS 132, QQS bilan 1232 (SQL acceptance bilan bir xil)', () => {
    const r = f2Baholash([{ kalit: '1:', kesim: kesim('ЧЕЛ', 1000), nk: NK_HUJJAT }], SMETA);
    expect(r.ustamali).toBe(1100);
    expect(r.qqs).toBe(132);
    expect(r.qqsBilan).toBe(1232);
    expect(r.ustamasiz).toBe(1000);
    expect(r.birliklar).toHaveLength(1);
    expect(r.birliklar[0].manba).toBe('hujjat');
  });

  it('storno (minus qatorlar, o‘sha foizlar) manba aktning AYNAN teskarisi', () => {
    const asl = f2Baholash([{ kalit: '1:', kesim: kesim('ЧЕЛ', 567910000.37), nk: NK_HUJJAT }], SMETA);
    const storno = f2Baholash([{ kalit: '2:1', kesim: kesim('ЧЕЛ', -567910000.37), nk: NK_HUJJAT }], SMETA);
    expect(storno.qqsBilan).toBe(-(asl.qqsBilan as number));
    expect(storno.ustamali).toBe(-(asl.ustamali as number));
    expect(storno.ustamasiz).toBe(-asl.ustamasiz);
  });

  it('podvalsiz bloklar BITTA kaskadga yig‘iladi (SQL p_podval=siz: bitta agregat)', () => {
    const a = kesim('МАТ', 333.33); const b = kesim('МАТ', 333.34);
    const birga = f2Baholash([{ kalit: 'a', kesim: a }, { kalit: 'b', kesim: b }], SMETA);
    const bitta = hisob(kesimQosh(a, b), SMETA);
    expect(birga.birliklar).toHaveLength(1);
    expect(birga.qqsBilan).toBe(bitta.qqsBilan);
  });

  it('pereraschet: storno bloki (o‘z podvali) + yangi qator (smeta podvali) = yangi − eski', () => {
    const eski = f2Baholash([{ kalit: '1:', kesim: kesim('ЧЕЛ', 1000), nk: NK_HUJJAT }], SMETA);
    const yangi = f2Baholash([{ kalit: 'yangi', kesim: kesim('МАТ', 1000) }], SMETA);
    const bir = f2Baholash([
      { kalit: '2:1', kesim: kesim('ЧЕЛ', -1000), nk: NK_HUJJAT },
      { kalit: 'yangi', kesim: kesim('МАТ', 1000) },
    ], SMETA);
    expect(bir.qqsBilan).toBe(Math.round(((yangi.qqsBilan as number) - (eski.qqsBilan as number)) * 100) / 100);
    expect(bir.birliklar.map((u) => u.manba).sort()).toEqual(['hujjat', 'smeta']);
  });

  it('NULL ≠ 0: smeta podvali ham, foizi ham yo‘q podvalsiz blok — yig‘indi noma‘lum (null)', () => {
    const r = f2Baholash([{ kalit: 'x', kesim: kesim('ЧЕЛ', 10) }, { kalit: '1:', kesim: kesim('ЧЕЛ', 1000), nk: NK_HUJJAT }], {});
    expect(r.qqsBilan).toBeNull();
    expect(r.nomalumBirlik).toBe(1);
  });
});
