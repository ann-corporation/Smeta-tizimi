/**
 * Forma 3: svod yaxlit bo'limi (bronza VIP ART kabi) — F2 summalariga ustama hisoblanmaydi, faqat QQS (server
 * `_t2_f2_ustamali` kesim.svod va imzolangan hujjat bilan bir xil). Sintetik fixture — real summa yo'q.
 */
import { describe, expect, it } from 'vitest';
import type { NakopitelniyQator } from '../api/t2-nakopitelniy';
import { f3ShartnomaYigish, forma3Hujjat, type Forma3Manba } from './forma3-export';
import type { SvodYaxlit } from './svod-yaxlit';
import { hujjatTekshir } from './hujjat-yozuvchi';

let seq = 5000;
function q(p: Partial<NakopitelniyQator> & { tur: NakopitelniyQator['tur'] }): NakopitelniyQator {
  seq++;
  return {
    qator_id: seq, tartib: seq, kod: null, nom: null, birlik: null, kat: null, qoshimcha: false, zamena: false,
    smeta_hajm: null, smeta_narx: null, smeta_summa: null, fakt_hajm: 0, fakt_summa: 0,
    oldingi_hajm: 0, oldingi_summa: 0, joriy_hajm: 0, joriy_summa: 0, joriy_qoralama_summa: 0,
    jami_hajm: 0, jami_summa: 0, f2_mumkin_hajm: 0, qoldiq_hajm: 0, qoldiq_summa: 0,
    jami_baseline_summa: 0, jami_actual_summa: null, narx_variance_summa: 0, bajarilish_foiz: null, ...p,
  };
}
const NK = { 'ТРАНСПОРТ_МАТЕРИАЛ': 5, 'СКЛАДСКИЕ_МАТЕРИАЛ': 2, 'СКЛАДСКИЕ_МК': 0.75, 'ТРАНСПОРТ_КАБЕЛЬ': 1.5, 'ПРОЧИЕ_ПОДРЯДЧИК': 18, 'ТРАНСПОРТ_ОБОРУД': 2, 'ЗАГОТ_СКЛАД_ОБОРУД': 1.2, 'СТРАХОВАНИЕ': 0.32, 'РИСК': 0, 'НДС': 12 };

function manba(yaxlitBelgi: boolean): { m: Forma3Manba; ob: number; mat: number } {
  const rzB = q({ tur: 'rz', nom: 'БРОНЗА' });
  const ob = q({ tur: 'ob', ota_id: rzB.qator_id, kat: 'ОБ', nom: 'ПЕРЕВОД В БРОНЗУ', birlik: 'шт', smeta_hajm: 1, smeta_summa: 16_000_000 });
  const rzO = q({ tur: 'rz', nom: 'ОБЫЧНЫЙ' });
  const bl = q({ tur: 'bl', ota_id: rzO.qator_id, kod: 'Е01', nom: 'РАБОТА', birlik: 'м3', smeta_summa: 1_000_000 });
  const mat = q({ tur: 'mat', ota_id: bl.qator_id, kat: 'МАТ', nom: 'МАТЕРИАЛ', birlik: 'м3', smeta_summa: 1_000_000 });
  const svodYaxlit: SvodYaxlit = { qqssiz: 16_000_000, barglar: 16_000_000, summasiz: 0, bolimlar: [{ id: 1, qator_id: rzB.qator_id, nom: 'БРОНЗА', svod_summa: 17_920_000, qqs_stavka: 12, qqssiz: 16_000_000, barglar: 16_000_000, asos: 'svod', dalil: {} }] };
  return {
    ob: ob.qator_id, mat: mat.qator_id,
    m: {
      nakopitelniy: [{ obyekt_id: 1, obyektNom: 'Тест', qatorlar: [rzB, ob, rzO, bl, mat], ...(yaxlitBelgi ? { svodYaxlit } : {}) }],
      f2Oylik: [
        { obyekt_id: 1, qator_id: ob.qator_id, oy: '2026-02', summa: 5_000_000, akt_id: 1 },
        { obyekt_id: 1, qator_id: ob.qator_id, oy: '2026-03', summa: 7_000_000, akt_id: 2 },
        { obyekt_id: 1, qator_id: mat.qator_id, oy: '2026-03', summa: 100_000, akt_id: 3 },
      ],
    },
  };
}

describe('Forma 3 — svod yaxlit bo‘lim ustamasiz (faqat QQS)', () => {
  it('G/H/I/J: bronza qatori ×1,12 aynan; oddiy qator ustama bilan; belgi yo‘q — avvalgidek', () => {
    const { m } = manba(true);
    const y = f3ShartnomaYigish([{ obyekt_id: 1, obyektNom: 'Тест', manba: m, nakrutka: NK }], '2026-03');
    const yoq = f3ShartnomaYigish([{ obyekt_id: 1, obyektNom: 'Тест', manba: manba(false).m, nakrutka: NK }], '2026-03');
    const u = y.obyektlar[0].ustun; const u0 = yoq.obyektlar[0].ustun;
    // H = oldingi + joriy: bronza 12 000 000 + mat 100 000 (oddiy).
    expect(u.H.pryamye).toBe(12_100_000);
    const matUstamali = u0.H.itogo4! - /* belgisiz: bronza ham ustama oldi */ 0;
    expect(matUstamali).toBeGreaterThan(u.H.itogo4!);
    // Faqat mat ustama oladi: itogo4 = 12 000 000 + mat*kf
    const matKf = (u.H.itogo4! - 12_000_000) / 100_000;
    expect(matKf).toBeGreaterThan(1);
    expect(u.H.vsego).toBeCloseTo(u.H.itogo4! * 1.12, 2);
    // Oy (J): bronza 7 000 000 → 7 000 000 ustamasiz + mat.
    expect((u.J.itogo4! - 7_000_000) / 100_000).toBeCloseTo(matKf, 6);
  });

  it('faqat bronza (oddiy qatorsiz): ВСЕГО = pryamye × 1,12 — imzolangan hujjat kabi (ustama yo‘q)', () => {
    const { m } = manba(true);
    const faqat: Forma3Manba = { ...m, f2Oylik: m.f2Oylik.filter((x) => x.summa !== 100_000) };
    const y = f3ShartnomaYigish([{ obyekt_id: 1, obyektNom: 'Тест', manba: faqat, nakrutka: NK }], '2026-03');
    expect(y.obyektlar[0].ustun.H.itogo4).toBe(12_000_000);
    expect(y.obyektlar[0].ustun.H.vsego).toBe(13_440_000);
    expect(y.obyektlar[0].ustun.J.vsego).toBe(7_840_000);
  });

  it('Excel: ИТОГО К ОПЛАТЕ (с начала) = 13 440 000, yashirin kategoriya ustunida СВОД', () => {
    const { m } = manba(true);
    const faqat: Forma3Manba = { ...m, f2Oylik: m.f2Oylik.filter((x) => x.summa !== 100_000) };
    const h = forma3Hujjat(faqat, { obyektNom: 'Тест', davr: '2026-03', asosiyObyektId: 1, nakrutka: NK, ndsFoiz: 12 });
    const t = hujjatTekshir(h.bytes);
    const vs = t.varaqlar[0].kataklar.map((k) => Number(k.v)).filter((x) => Number.isFinite(x));
    expect(vs).toContain(13_440_000);
    expect(vs).toContain(7_840_000);
  });
});
