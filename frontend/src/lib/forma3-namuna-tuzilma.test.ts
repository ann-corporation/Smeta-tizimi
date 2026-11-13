/**
 * Forma-3 tuzilmasi — egasining REAL F3 zanjiri bilan qotirilgan (2026-11-14 tekshiruv).
 * Real hujjatlarda: sarlavha «СПРАВКА-СЧЕТ-ФАКТУРА О СТОИМОСТИ ВЫПОЛНЕННЫХ РАБОТ (ПОНЕСЕННЫХ ЗАТРАТ)», «ЗА <МЕСЯЦ> МЕСЯЦ <ГОД> ГОДА»,
 * 16 grafa (номерация 1..16), «с начала строительства» / «с начала года» / «в том числе за отчетный месяц»;
 * ketma-ket F3 larda «с начала» = oldingi F3 «с начала» + shu F3 «за месяц» (narastayushchiy, oyni o'z ichiga oladi).
 * Faqat SINTETIK raqamlar: real summa, nom, INN yo'q.
 */
import { describe, expect, it } from 'vitest';
import type { NakopitelniyQator } from '../api/t2-nakopitelniy';
import { forma3Hujjat, type Forma3Manba } from './forma3-export';
import { hujjatTekshir } from './hujjat-yozuvchi';

let seq = 0;
function q(p: Partial<NakopitelniyQator> & { tur: NakopitelniyQator['tur'] }): NakopitelniyQator {
  seq++;
  return {
    qator_id: 9000 + seq, tartib: seq, kod: null, nom: null, birlik: null, kat: null, qoshimcha: false, zamena: false,
    smeta_hajm: null, smeta_narx: null, smeta_summa: null, fakt_hajm: 0, fakt_summa: 0,
    oldingi_hajm: 0, oldingi_summa: 0, joriy_hajm: 0, joriy_summa: 0, joriy_qoralama_summa: 0,
    jami_hajm: 0, jami_summa: 0, f2_mumkin_hajm: 0, qoldiq_hajm: 0, qoldiq_summa: 0,
    jami_baseline_summa: 0, jami_actual_summa: null, narx_variance_summa: 0, bajarilish_foiz: null, ...p,
  };
}
const NK = { 'ТРАНСПОРТ_МАТЕРИАЛ': 5, 'СКЛАДСКИЕ_МАТЕРИАЛ': 2, 'СКЛАДСКИЕ_МК': 2, 'ТРАНСПОРТ_КАБЕЛЬ': 3, 'ПРОЧИЕ_ПОДРЯДЧИК': 10, 'ТРАНСПОРТ_ОБОРУД': 4, 'ЗАГОТ_СКЛАД_ОБОРУД': 1.5, 'СТРАХОВАНИЕ': 1, 'РИСК': 0, 'НДС': 12 };

const rz = q({ tur: 'rz', nom: 'РАЗДЕЛ 1' });
const bl = q({ tur: 'bl', kod: 'Е01', nom: 'РАБОТА', birlik: 'м3', smeta_hajm: 10, smeta_summa: 1_000_000 });
const mat = q({ tur: 'mat', kat: 'МАТ', kod: 'С1', nom: 'МАТЕРИАЛ', birlik: 'м3', smeta_hajm: 10, smeta_summa: 1_000_000 });
// Sintetik tasdiqlangan F2: fevral, mart, aprel (yil ichida) + oldingi yil dekabri.
const OYLAR: Array<[string, number]> = [['2025-12', 50_000], ['2026-02', 100_000], ['2026-03', 200_000], ['2026-04', 300_000]];
const MANBA: Forma3Manba = {
  nakopitelniy: [{ obyekt_id: 1, obyektNom: 'Sinov obyekti', qatorlar: [rz, bl, mat] }],
  f2Oylik: OYLAR.map(([oy, summa]) => ({ obyekt_id: 1, qator_id: mat.qator_id, oy, summa })),
};
const f3 = (davr: string, shakl: 'toliq' | 'bir_qatorli' = 'toliq') =>
  forma3Hujjat(MANBA, { obyektNom: 'Sinov obyekti', davr, asosiyObyektId: 1, nakrutka: NK, shakl, raqam: '1', hujjatSana: `${davr}-28` });

describe('Forma-3 — real zanjir bilan tuzilma', () => {
  it('narastayushchiy: har F3 da «с начала» = oldingi F3 «с начала» + shu F3 «за месяц» (G=smeta, H=с начала, I=с начала года, J=oy)', () => {
    const f = ['2026-02', '2026-03', '2026-04'].map((d) => f3(d));
    // Birinchi yil F3 si: с начала (oldingi yil dekabri bilan) = dekabr + fevral; с начала года = fevral.
    expect(f[0].vsegoKOplate.H!).toBeCloseTo(f[0].vsegoKOplate.J! + f3('2025-12').vsegoKOplate.H!, 2);
    for (let i = 1; i < f.length; i++) {
      expect(f[i].vsegoKOplate.H!).toBeCloseTo(f[i - 1].vsegoKOplate.H! + f[i].vsegoKOplate.J!, 2);
      expect(f[i].vsegoKOplate.I!).toBeCloseTo(f[i - 1].vsegoKOplate.I! + f[i].vsegoKOplate.J!, 2);
    }
    // Birinchi F3 (hech qanday oldingi oy yo'q): с начала = с начала года = за месяц.
    const birinchi = f3('2025-12');
    expect(birinchi.vsegoKOplate.H!).toBeCloseTo(birinchi.vsegoKOplate.J!, 2);
    expect(birinchi.vsegoKOplate.I!).toBeCloseTo(birinchi.vsegoKOplate.J!, 2);
    // «за месяц» har doim «с начала» ning bir qismi.
    for (const x of f) expect(x.vsegoKOplate.J!).toBeLessThanOrEqual(x.vsegoKOplate.H! + 1e-9);
  });

  it('to‘liq shakl: real sarlavha, davr matni, 16 grafa raqamlari, guruh sarlavhalari', () => {
    const t = hujjatTekshir(f3('2026-03').bytes, {});
    const matn = t.matnlar.join(' | ');
    expect(matn).toContain('СПРАВКА-СЧЕТ-ФАКТУРА О СТОИМОСТИ ВЫПОЛНЕННЫХ РАБОТ (ПОНЕСЕННЫХ ЗАТРАТ)');
    expect(matn).toContain('ЗА МАРТ МЕСЯЦ 2026 ГОДА');
    for (const k of ['Номер документа', 'Дата составления', 'Отчетный период', 'Подрядчик:', 'Заказчик:', 'Наименование объекта и его адрес:', 'Договор',
      'Объем работ и затрат в физических показателях', 'с начала строительства', 'с начала года', 'в том числе за отчетный месяц', 'ИТОГО К ОПЛАТЕ (С УЧЕТОМ НДС)', 'ПОДРЯДЧИК', 'ЗАКАЗЧИК']) expect(matn).toContain(k);
    const kataklar = t.varaqlar[0].kataklar;
    const raqamlar = Array.from({ length: 16 }, (_, i) => String(i + 1));
    const qator = kataklar.filter((k) => /^[A-P]21$/.test(k.ref)).map((k) => String(k.matn ?? k.v));
    expect(qator).toEqual(raqamlar); // grafalar raqami 1..16 (A..P), real hujjatdagi kabi
    // Eski noto'g'ri belgi qaytmasin.
    expect(matn).not.toContain('до отчетного месяца');
  });

  it('bir qatorli shakl: «с начала» ustunlari ham narastayushchiy; НДС ustuni va ВСЕГО mavjud', () => {
    const m = f3('2026-03', 'bir_qatorli');
    const m1 = f3('2026-02', 'bir_qatorli');
    expect(m.vsegoKOplate.H!).toBeCloseTo(m1.vsegoKOplate.H! + m.vsegoKOplate.J!, 2);
    const matn = hujjatTekshir(m.bytes, {}).matnlar.join(' | ');
    expect(matn).toContain('ВСЕГО К ОПЛАТЕ (С УЧЕТОМ НДС)');
    expect(matn).toContain('с начала строительства');
    expect(matn).not.toContain('до отчетного месяца');
  });
});