/**
 * Forma-3 «bir qatorli» shakli (egasi 2026-11-03): ish ro'yxatisiz BITTA yig'ma qator + podval.
 * Summalar to'liq shakl podvali bilan tiyingacha bir xil (yagona hisob-yadro); sarlavha, rekvizit, imzo bir xil.
 * Sun'iy misol: real summa, INN yoki nom yo'q.
 */
import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import type { NakopitelniyQator } from '../api/t2-nakopitelniy';
import { forma3Hujjat, forma3SotuvdanXlsx, f3ShaklTozala, type Forma3ExportOptions, type Forma3Manba, type F3PulUstun } from './forma3-export';
import { hujjatTekshir } from './hujjat-yozuvchi';
import type { SvodShartnoma } from './nakopitelniy-svod';

let seq = 0;
function q(p: Partial<NakopitelniyQator> & { tur: NakopitelniyQator['tur'] }): NakopitelniyQator {
  seq++;
  return {
    qator_id: 5000 + seq, tartib: seq, kod: null, nom: null, birlik: null, kat: null, qoshimcha: false, zamena: false,
    smeta_hajm: null, smeta_narx: null, smeta_summa: null, fakt_hajm: 0, fakt_summa: 0,
    oldingi_hajm: 0, oldingi_summa: 0, joriy_hajm: 0, joriy_summa: 0, joriy_qoralama_summa: 0,
    jami_hajm: 0, jami_summa: 0, f2_mumkin_hajm: 0, qoldiq_hajm: 0, qoldiq_summa: 0,
    jami_baseline_summa: 0, jami_actual_summa: null, narx_variance_summa: 0, bajarilish_foiz: null, ...p,
  };
}

const NK = { 'ТРАНСПОРТ_МАТЕРИАЛ': 5, 'СКЛАДСКИЕ_МАТЕРИАЛ': 2, 'СКЛАДСКИЕ_МК': 2, 'ТРАНСПОРТ_КАБЕЛЬ': 3, 'ПРОЧИЕ_ПОДРЯДЧИК': 10, 'ТРАНСПОРТ_ОБОРУД': 4, 'ЗАГОТ_СКЛАД_ОБОРУД': 1.5, 'СТРАХОВАНИЕ': 1, 'РИСК': 0, 'НДС': 12 };

const ROWS: NakopitelniyQator[] = [
  q({ tur: 'rz', nom: 'РАЗДЕЛ 1. ЗЕМЛЯНЫЕ РАБОТЫ' }),
  q({ tur: 'bl', kod: 'Е01-01', nom: 'РАЗРАБОТКА ГРУНТА', birlik: 'м3', smeta_hajm: 100, smeta_narx: 16_000, smeta_summa: 1_600_000 }),
  q({ tur: 'rs', kat: 'ЧЕЛ', kod: '1-100', nom: 'ЗАТРАТЫ ТРУДА РАБОЧИХ', birlik: 'ЧЕЛ.-Ч', smeta_hajm: 200, smeta_narx: 5000, smeta_summa: 1_000_000 }),
  q({ tur: 'mat', kat: 'МАТ', kod: 'С101', nom: 'ПЕСОК', birlik: 'м3', smeta_hajm: 50, smeta_narx: 12_000, smeta_summa: 600_000 }),
  q({ tur: 'rz', nom: 'РАЗДЕЛ 2. БЕТОННЫЕ РАБОТЫ' }),
  q({ tur: 'bl', kod: 'Е06-01', nom: 'БЕТОНИРОВАНИЕ', birlik: 'м3', smeta_hajm: 10, smeta_narx: 918_000, smeta_summa: 9_180_000 }),
  q({ tur: 'mat', kat: 'МАТ', kod: 'С401', nom: 'БЕТОН В25', birlik: 'м3', smeta_hajm: 10.2, smeta_narx: 900_000, smeta_summa: 9_180_000 }),
];
const chel = ROWS[2].qator_id, pesok = ROWS[3].qator_id, beton = ROWS[6].qator_id;

// Tiyinli (yaxlitlash sinaydigan) tasdiqlangan F2 summalari.
const MANBA: Forma3Manba = {
  nakopitelniy: [{ obyekt_id: 1, obyektNom: 'Sinov obyekti', qatorlar: ROWS }],
  f2Oylik: [
    { obyekt_id: 1, qator_id: chel, oy: '2025-12', summa: 100_000.33 },
    { obyekt_id: 1, qator_id: pesok, oy: '2026-01', summa: 200_000.17 },
    { obyekt_id: 1, qator_id: chel, oy: '2026-09', summa: 500_000.49 },
    { obyekt_id: 1, qator_id: pesok, oy: '2026-09', summa: 300_000.77 },
    { obyekt_id: 1, qator_id: beton, oy: '2026-09', summa: 123_456.89 },
  ],
};

const REKVIZIT = {
  imzo: { zakazchik: 'Sinov Buyurtmachi', pudratchi: 'Sinov Pudratchi' },
  pudratchi: { toliqNom: 'Sinov Pudratchi MChJ', manzil: 'Sinov manzil 1', inn: '000000001' },
  zakazchik: { toliqNom: 'Sinov Buyurtmachi MChJ', manzil: 'Sinov manzil 2', inn: '000000002' },
  raqam: '7', hujjatSana: '2026-10-03',
  shartnomaRaqam: 'S-1', shartnomaSana: '2026-01-10',
};
const opt = (shakl: Forma3ExportOptions['shakl'], extra: Partial<Forma3ExportOptions> = {}): Forma3ExportOptions =>
  ({ obyektNom: 'Sinov obyekti', davr: '2026-09', asosiyObyektId: 1, nakrutka: NK, ...REKVIZIT, shakl, ...extra });

const PUL: Array<[F3PulUstun, string, string]> = [['G', 'F', 'D'], ['H', 'J', 'E'], ['I', 'M', 'F'], ['J', 'P', 'G']];
const hujjatKataklari = (bytes: Uint8Array) => hujjatTekshir(bytes, {});
const qatorRaqami = (kataklar: Array<{ ref: string; matn?: string | null }>, matn: string) => {
  const k = kataklar.find((x) => (x.matn ?? '').toUpperCase() === matn.toUpperCase());
  return k ? k.ref.replace(/^[A-Z]+/, '') : null;
};

describe('Forma-3 bir qatorli — hujjat (nakopitelniy asosida)', () => {
  const toliq = forma3Hujjat(MANBA, opt('toliq'));
  const bir = forma3Hujjat(MANBA, opt('bir_qatorli'));
  const sukut = forma3Hujjat(MANBA, opt(undefined));

  it('shakl tozalash: noma‘lum qiymat — to‘liq; sukut — to‘liq (o‘zgarmagan)', () => {
    expect(f3ShaklTozala('bir_qatorli')).toBe('bir_qatorli');
    expect(f3ShaklTozala('boshqa')).toBe('toliq');
    expect(f3ShaklTozala(null)).toBe('toliq');
    expect(toliq.shakl).toBe('toliq');
    expect(bir.shakl).toBe('bir_qatorli');
    // shakl berilmasa — to'liq hujjat bilan bir xil mazmun.
    expect(sukut.shakl).toBe('toliq');
    expect(hujjatKataklari(sukut.bytes).matnlar).toEqual(hujjatKataklari(toliq.bytes).matnlar);
  });

  it('ish qatorlari, hajm, razdel va manba varag‘i YO‘Q; bitta yig‘ma qator bor', () => {
    const t = hujjatKataklari(bir.bytes);
    const matn = t.matnlar.join(' | ').toUpperCase();
    for (const yoq of ['РАЗРАБОТКА ГРУНТА', 'БЕТОНИРОВАНИЕ', 'БЕТОН В25', 'ПЕСОК', 'РАЗДЕЛ 1', 'ИТОГО ПО РАЗДЕЛУ', 'ЧЕЛ.-Ч', 'Е01-01']) expect(matn).not.toContain(yoq);
    expect(t.varaqlar.map((v) => v.nom)).not.toContain('Ф-2 (источник)');
    expect(t.varaqlar).toHaveLength(1);
    expect(t.matnlar.filter((x) => /^Выполненные строительно-монтажные работы по объекту/i.test(x))).toHaveLength(1);
    expect(matn).toContain('ЗА ПЕРИОД С 01.09.2026 Г. ПО 30.09.2026 Г.');
    // To'liq shaklda bular bor (o'zgarmagan):
    const tt = hujjatKataklari(toliq.bytes).matnlar.join(' | ').toUpperCase();
    expect(tt).toContain('РАЗРАБОТКА ГРУНТА');
    expect(tt).toContain('РАЗДЕЛ 1. ЗЕМЛЯНЫЕ РАБОТЫ');
    expect(hujjatKataklari(toliq.bytes).varaqlar.map((v) => v.nom)).toContain('Ф-2 (источник)');
  });

  it('summalar to‘liq shakl podvali bilan TIYINGACHA bir xil (yadro natijasi va Excel kataklari)', () => {
    for (const [c] of PUL) {
      expect(bir.vsegoKOplate[c]).toBe(toliq.vsegoKOplate[c]);
      expect(bir.kaskad[c].itogo4).toBe(toliq.kaskad[c].itogo4);
      expect(bir.kaskad[c].qqs).toBe(toliq.kaskad[c].qqs);
      expect(bir.kaskad[c].vsego).toBe(toliq.kaskad[c].vsego);
    }
    expect(bir.vsegoKOplate.J).not.toBeNull();
    const tb = hujjatKataklari(bir.bytes).varaqlar[0].kataklar;
    const tt = hujjatKataklari(toliq.bytes).varaqlar[0].kataklar;
    const rBir = qatorRaqami(tb, 'ВСЕГО К ОПЛАТЕ (С УЧЕТОМ НДС)')!;
    const rTol = qatorRaqami(tt, 'ИТОГО К ОПЛАТЕ (С УЧЕТОМ НДС)')!;
    expect(rBir).toBeTruthy(); expect(rTol).toBeTruthy();
    for (const [c, colTol, colBir] of PUL) {
      const vb = Number(tb.find((k) => k.ref === `${colBir}${rBir}`)!.v);
      const vt = Number(tt.find((k) => k.ref === `${colTol}${rTol}`)!.v);
      expect(vb).toBe(vt);
      expect(vb).toBe(toliq.kaskad[c].vsego);
    }
    // Bir qatorli: NDS siz + NDS = jami (tiyingacha), NDS stavkasi ko'rinadi.
    const rBez = qatorRaqami(tb, 'СУММА БЕЗ НДС')!, rNds = qatorRaqami(tb, 'НДС')!;
    for (const [c, , colBir] of PUL) {
      const bez = Number(tb.find((k) => k.ref === `${colBir}${rBez}`)!.v);
      const nds = Number(tb.find((k) => k.ref === `${colBir}${rNds}`)!.v);
      const jami = Number(tb.find((k) => k.ref === `${colBir}${rBir}`)!.v);
      expect(Math.round((bez + nds) * 100)).toBe(Math.round(jami * 100));
      expect(bez).toBe(toliq.kaskad[c].itogo4);
    }
    expect(tb.find((k) => k.ref === `C${rNds}`)).toBeDefined();
    expect(hujjatKataklari(bir.bytes).dollarFormulalar).toEqual([]);
    expect(hujjatKataklari(bir.bytes).keshsizFormulalar).toEqual([]);
  });

  it('sarlavha, rekvizit, davr qutisi va imzolar to‘liq shakldagidek bor', () => {
    const matn = hujjatKataklari(bir.bytes).matnlar.join(' | ');
    for (const k of ['СПРАВКА-СЧЕТ-ФАКТУРА О СТОИМОСТИ ВЫПОЛНЕННЫХ РАБОТ (ПОНЕСЕННЫХ ЗАТРАТ)', 'ЗА СЕНТЯБРЬ МЕСЯЦ 2026 ГОДА', 'Номер документа', 'Дата составления', 'Отчетный период',
      '03.10.2026 г.', '01.09.2026 г.', '30.09.2026 г.', 'Sinov Pudratchi MChJ', 'Sinov Buyurtmachi MChJ', '000000001', '000000002', '№ S-1 от 10.01.2026 г.',
      'ПОДРЯДЧИК', 'ЗАКАЗЧИК', 'Руководитель', 'Главный бухгалтер', 'М.П.', '(подпись)', 'ИТОГО К ОПЛАТЕ ЗА ОТЧЕТНЫЙ МЕСЯЦ']) expect(matn).toContain(k);
    expect(matn).toMatch(/сум \d\d тийин с НДС/);
    expect(bir.faylNomi).toContain('ФОРМА_3');
    expect(bir.faylNomi).not.toBe(toliq.faylNomi);
  });

  it('NULL ≠ 0: foizlar noma‘lum — jami katak bo‘sh, sababi diqqatda (0 yozilmaydi)', () => {
    const b = forma3Hujjat(MANBA, { ...opt('bir_qatorli'), nakrutka: undefined });
    expect(b.vsegoKOplate.J).toBeNull();
    const k = hujjatKataklari(b.bytes).varaqlar[0].kataklar;
    const r = qatorRaqami(k, 'ВСЕГО К ОПЛАТЕ (С УЧЕТОМ НДС)')!;
    const katak = k.find((x) => x.ref === `G${r}`);
    expect(katak === undefined || katak.v === '' || katak.v === null).toBe(true);
    expect(b.diqqat.some((d) => d.nom === 'ИТОГО К ОПЛАТЕ')).toBe(true);
    expect(hujjatKataklari(b.bytes).matnlar.join(' | ')).toContain('не определено');
  });
});

/* ───────────── sotuv F3 (oylik paket manbai) ───────────── */
function misol(): SvodShartnoma {
  return {
    id: 1, loyiha_id: 1, raqam: 'T-1', nom: 'Sinov', asosiy: true, holat: 'faol', jami_nds_bilan: 1_000_000,
    obyektlar: [{ id: 10, nom: 'Obyekt A' }],
    ds: [], f2: [],
    f3: [
      { id: 12, manba: 'sotuv', raqam: '1', sotuv_sana: '2026-02-10', sotuv_summa: 1_120_000.35, nds_foiz: 12, davr_boshi: '2026-02-01', davr_oxiri: '2026-02-10', holat: 'qoralama', bajarilgan_f2_summa: null, izoh: null, versiya: 1 },
    ],
    tolovlar: [],
  };
}
const jadval = (bytes: Uint8Array) => {
  const wb = XLSX.read(bytes, { type: 'array' });
  return XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true });
};

describe('Forma-3 bir qatorli — sotuv shakli (oylik paket)', () => {
  const toliq = forma3SotuvdanXlsx(misol(), 12, { tashkilot: 'Sinov MChJ' })!;
  const bir = forma3SotuvdanXlsx(misol(), 12, { tashkilot: 'Sinov MChJ', shakl: 'bir_qatorli' })!;

  it('bitta yig‘ma qator + podval; summalar to‘liq shakl bilan tiyingacha teng', () => {
    const rt = jadval(toliq.bytes).find((r) => r.includes('ВСЕГО с НДС'))!;
    const rb = jadval(bir.bytes);
    const jamiB = rb.find((r) => r.includes('ВСЕГО К ОПЛАТЕ (с НДС)'))!;
    const bezB = rb.find((r) => r.includes('СУММА БЕЗ НДС'))!;
    const ndsB = rb.find((r) => r.includes('НДС'))!;
    const nums = (r: unknown[]) => r.filter((x): x is number => typeof x === 'number');
    // To'liq: [smeta?, boshidan, yildan, davr] — oxirgisi davr jami.
    const davrJami = nums(rt).at(-1)!;
    expect(nums(jamiB).at(-1)).toBe(davrJami);
    expect(davrJami).toBe(1_120_000.35);
    const bez = nums(bezB).at(-1)!, nds = nums(ndsB).at(-1)!;
    expect(Math.round((bez + nds) * 100)).toBe(Math.round(davrJami * 100));
    const rtBez = jadval(toliq.bytes).find((r) => r.includes('Стоимость выполненных работ и затрат без НДС'))!;
    expect(bez).toBe(nums(rtBez).at(-1));
    // Ish qatori yagona: «Выполненные строительно-монтажные работы …».
    expect(rb.filter((r) => r.some((x) => typeof x === 'string' && x.startsWith('Выполненные строительно-монтажные работы')))).toHaveLength(1);
    expect(nums(rb.find((r) => r.some((x) => typeof x === 'string' && x.startsWith('Выполненные строительно-монтажные работы')))!).at(-1)).toBe(bez);
  });

  it('sarlavha, titul va imzolar bor; fayl nomi to‘liqdan farq qiladi; hujjat tekshiruvi toza', () => {
    const t = hujjatTekshir(bir.bytes, {});
    const matn = t.matnlar.join(' | ');
    for (const k of ['СПРАВКА О СТОИМОСТИ ВЫПОЛНЕННЫХ РАБОТ И ЗАТРАТ (ФОРМА № 3)', 'Подрядчик:', 'Договор:', 'ЗАКАЗЧИК', 'ПОДРЯДЧИК']) expect(matn).toContain(k);
    expect(t.dollarFormulalar).toEqual([]);
    expect(t.keshsizFormulalar).toEqual([]);
    expect(bir.faylNomi).not.toBe(toliq.faylNomi);
    expect(forma3SotuvdanXlsx(misol(), 99, { shakl: 'bir_qatorli' })).toBeNull();
  });
});
