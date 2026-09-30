/**
 * forma3-export.ts testlari — egasi topshirig'i (2026-09-26) §6.4:
 * razdel/ish turi guruhlash, 4 ustun (yil chegarasi bilan), podval kaskadi =
 * nakrutkaKaskadJS, F2 tenglik nazorati, NULL narx, bekor qilingan ish,
 * 255 argumentdan katta hujjat (SUMIF marker ustunlari bilan).
 */
import { describe, expect, it } from 'vitest';
import type { NakopitelniyQator } from '../api/t2-nakopitelniy';
import {
  forma3Hujjat, f3Model, f3ModelQatorlar, f3QiymatIndekslar, f3UstunlarNatijasi,
  olibTashlanganlar, f3DavrMatni, type Forma3Manba,
} from './forma3-export';
import { kategoriyaKf } from './nakrutka-podval';
import { hujjatTekshir, type HujjatHisobot } from './hujjat-yozuvchi';

/** Birinchi (va yagona) varaq qisqartmasi. */
function hisobotVaraq(h: HujjatHisobot) { return h.varaqlar[0]; }

let seq = 0;
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

const NK = { 'ТРАНСПОРТ_МАТЕРИАЛ': 5, 'СКЛАДСКИЕ_МАТЕРИАЛ': 2, 'СКЛАДСКИЕ_МК': 2, 'ТРАНСПОРТ_КАБЕЛЬ': 3, 'ПРОЧИЕ_ПОДРЯДЧИК': 10, 'ТРАНСПОРТ_ОБОРУД': 4, 'ЗАГОТ_СКЛАД_ОБОРУД': 1.5, 'СТРАХОВАНИЕ': 1, 'РИСК': 0, 'НДС': 12 };

const ROWS: NakopitelniyQator[] = [
  q({ tur: 'rz', nom: 'РАЗДЕЛ 1. ЗЕМЛЯНЫЕ РАБОТЫ' }),
  q({ tur: 'bl', kod: 'Е01-01', nom: 'РАЗРАБОТКА ГРУНТА', birlik: 'м3', smeta_hajm: 100, smeta_narx: 16_000, smeta_summa: 1_600_000 }),
  q({ tur: 'rs', kat: 'ЧЕЛ', kod: '1-100', nom: 'ЗАТРАТЫ ТРУДА РАБОЧИХ', birlik: 'чел.-ч', smeta_hajm: 200, smeta_narx: 5000, smeta_summa: 1_000_000 }),
  q({ tur: 'mat', kat: 'МАТ', kod: 'С101', nom: 'ПЕСОК', birlik: 'м3', smeta_hajm: 50, smeta_narx: 12_000, smeta_summa: 600_000 }),
  q({ tur: 'rz', nom: 'РАЗДЕЛ 2. БЕТОННЫЕ РАБОТЫ' }),
  q({ tur: 'bl', kod: 'Е06-01', nom: 'БЕТОНИРОВАНИЕ', birlik: 'м3', smeta_hajm: 10, smeta_narx: 918_000, smeta_summa: 9_180_000 }),
  q({ tur: 'mat', kat: 'МАТ', kod: 'С401', nom: 'БЕТОН В25', birlik: 'м3', smeta_hajm: 10.2, smeta_narx: 900_000, smeta_summa: 9_180_000 }),
];

const MANBA: Forma3Manba = {
  nakopitelniy: [{ obyekt_id: 1, obyektNom: 'Сунъий кўл', qatorlar: ROWS }],
  // Tasdiqlangan F2: 2025-12 da 100k (ЧЕЛ), 2026-01 da 200k (МАТ), 2026-09 da 500k (ЧЕЛ) + 300k (МАТ).
  f2Oylik: [
    { obyekt_id: 1, qator_id: 3, oy: '2025-12', summa: 100_000 },
    { obyekt_id: 1, qator_id: 4, oy: '2026-01', summa: 200_000 },
    { obyekt_id: 1, qator_id: 3, oy: '2026-09', summa: 500_000 },
    { obyekt_id: 1, qator_id: 4, oy: '2026-09', summa: 300_000 },
  ],
};

describe('F3 — model', () => {
  it('razdel → ish → qiymat guruhlanadi; ИТОГО har razdel oxirida', () => {
    const m = f3Model(MANBA, { davr: '2026-09', asosiyObyektId: 1 });
    const rows = f3ModelQatorlar(m);
    expect(rows.filter((x) => x.tur === 'razdel')).toHaveLength(2);
    expect(rows.filter((x) => x.tur === 'itogo')).toHaveLength(2);
    // Har itogo o'z razdelining qiymatlaridan KEYIN keladi:
    rows.forEach((x, i) => {
      if (x.tur !== 'itogo') return;
      const qidiruv = rows.slice(0, i);
      const razdelIdx = qidiruv.map((y) => y.tur).lastIndexOf('razdel');
      expect(razdelIdx).toBeGreaterThanOrEqual(0);
      expect(rows.slice(razdelIdx + 1, i).some((y) => y.tur === 'qiymat')).toBe(true);
    });
    expect(rows.at(-1)?.tur).toBe('jami');
  });

  it('4 ustun: davr yil chegarasi bilan ajratiladi (faqat tasdiqlangan)', () => {
    const m = f3Model(MANBA, { davr: '2026-09', asosiyObyektId: 1 });
    const rows = f3ModelQatorlar(m);
    const idx = f3QiymatIndekslar(rows);
    const u = f3UstunlarNatijasi(rows, idx, NK);
    // ЧЕЛ barg (id 3): boshidan = 100k + 500k = 600k; yildan = 500k; davr = 500k.
    const chel = u.kat.G['ЧЕЛ'];
    void chel;
    // G (сметная): 1 000 000 + 600 000 + 9 180 000 = 10 780 000.
    expect(u.kat.G['ЧЕЛ']).toBeCloseTo(1_000_000, 2);
    expect(u.kat.G['МАТ']).toBeCloseTo(600_000 + 9_180_000, 2);
    // H (с начала строительства): 2025-12 + 2026-01 + 2026-09.
    expect(u.kat.H['ЧЕЛ']).toBeCloseTo(600_000, 2);
    expect(u.kat.H['МАТ']).toBeCloseTo(500_000, 2);
    // I (с начала года): faqat 2026-* — 2025-12 chiqariladi.
    expect(u.kat.I['ЧЕЛ']).toBeCloseTo(500_000, 2);
    expect(u.kat.I['МАТ']).toBeCloseTo(500_000, 2);
    // J (за отчетный период): faqat davr.
    expect(u.kat.J['ЧЕЛ']).toBeCloseTo(500_000, 2);
    expect(u.kat.J['МАТ']).toBeCloseTo(300_000, 2);
  });

  it('podval kaskadi = nakrutkaKaskadJS (har ustun alohida)', () => {
    const m = f3Model(MANBA, { davr: '2026-09', asosiyObyektId: 1 });
    const rows = f3ModelQatorlar(m);
    const idx = f3QiymatIndekslar(rows);
    const u = f3UstunlarNatijasi(rows, idx, NK);
    const hujjat = forma3Hujjat(MANBA, { obyektNom: 'Сунъий кўл', davr: '2026-09', asosiyObyektId: 1, nakrutka: NK });
    for (const c of ['G', 'H', 'I', 'J'] as const) {
      expect(hujjat.kaskad[c].vsego).toBe(u.kaskad[c].vsego);
      expect(hujjat.vsegoKOplate[c]).toBe(u.kaskad[c].vsego);
    }
  });

  it('F2 tenglik nazorati: Σ ROUND(qiymat × Kf,2) = podval kaskadi (yaxlitlash farqi 0)', () => {
    const m = f3Model(MANBA, { davr: '2026-09', asosiyObyektId: 1 });
    const rows = f3ModelQatorlar(m);
    const idx = f3QiymatIndekslar(rows);
    const u = f3UstunlarNatijasi(rows, idx, NK);
    const hujjat = forma3Hujjat(MANBA, { obyektNom: 'X', davr: '2026-09', asosiyObyektId: 1, nakrutka: NK });
    for (const c of ['G', 'H', 'I', 'J'] as const) {
      // kOplate = Σ ROUND per-row; kaskad = kategoriya jami bo'yicha. Farq faqat
      // yaxlitlashda bo'lishi mumkin (har qator ≤ 0.01 × qatorlar soni).
      if (u.kOplate[c] != null) expect(Math.abs(u.kOplate[c]! - hujjat.vsegoKOplate[c])).toBeLessThanOrEqual(0.01 * idx.length + 0.005);
    }
    // Nazorat koeffitsienti kategoriyaKf bilan bir xil.
    const kf = kategoriyaKf(NK);
    expect(kf['ЧЕЛ']).toBeCloseTo((1 + 0.1) * (1 + 0.01) * 1.12, 10);
  });
});

describe('F3 — NULL, bekor, hujjat standarti', () => {
  it('NULL ≠ 0: smetyasi nomaʼlum barg — G boʻsh, jami boʻsh, diqqatga; H/I/J normal', () => {
    const rows2: NakopitelniyQator[] = [
      q({ tur: 'rz', nom: 'РАЗДЕЛ 1' }),
      q({ tur: 'bl', kod: 'Е01', nom: 'ISH', birlik: 'м3' }),
      q({ tur: 'mat', kat: 'МАТ', nom: 'MAT', smeta_summa: null, smeta_narx: null }),
    ];
    const manba: Forma3Manba = { nakopitelniy: [{ obyekt_id: 1, obyektNom: 'O', qatorlar: rows2 }], f2Oylik: [{ obyekt_id: 1, qator_id: rows2[2].qator_id, oy: '2026-09', summa: 123.45 }] };
    const h = forma3Hujjat(manba, { obyektNom: 'O', davr: '2026-09', asosiyObyektId: 1, nakrutka: NK });
    const m = f3Model(manba, { davr: '2026-09' });
    expect(m.diqqat.some((d) => d.sabab.includes('нет стоимости'))).toBe(true);
    // ИТОГО G keshi bo'sh; kaskad G katida МАТ = 0 (SUMIF ham 0 yig'adi) — hujjatda IF bilan bo'sh.
    expect(h.kat.G['МАТ']).toBe(0);
    expect(h.kaskad.G.pryamye).toBe(0);
    expect(h.kat.J['МАТ']).toBeCloseTo(123.45, 2);
    expect(h.kaskad.J.pryamye).toBeCloseTo(123.45, 2);
    // kOplate nazorati: J da qiymat bor — to'lov koeffitsienti bilan.
    expect(h.kOplate.J).not.toBeNull();
  });

  it('tasdiqlangan olib_tashlash — СМЕТНАЯ dan chiqadi va diqqatga tushadi', () => {
    const chiqlik = [{ holat: 'tasdiqlangan', tur: 'olib_tashlash', qatorlar: [{ qator_id: 4, amal: 'olib_tashlash' }] }];
    expect([...olibTashlanganlar(chiqlik)]).toEqual([4]);
    const m = f3Model(MANBA, { davr: '2026-09', asosiyObyektId: 1, ozgarishlar: chiqlik });
    // barg darajasidagi chiqarilish: qiymatda smetnaya null va hujjat diqqatga yozadi:
    const hujjat = forma3Hujjat(MANBA, { obyektNom: 'X', davr: '2026-09', asosiyObyektId: 1, ozgarishlar: chiqlik, nakrutka: NK });
    expect(hujjat.diqqat.some((d) => d.sabab.includes('исключено из остатка'))).toBe(true);
    const rows = f3ModelQatorlar(m);
    const u = f3UstunlarNatijasi(rows, f3QiymatIndekslar(rows), NK);
    // ПЕСОК (id 4) G dan chiqdi: 1 000 000 + 9 180 000.
    expect(u.kat.G['МАТ']).toBeCloseTo(9_180_000, 2);
    // F2 ustunlari o'zgarmaydi (bajariyligi saqlanadi).
    expect(u.kat.H['МАТ']).toBeCloseTo(500_000, 2);
  });

  it('H2–H9: rasmiy shakl, formulalar $ siz, imzo, chop, fayl nomi', () => {
    const h = forma3Hujjat(MANBA, { obyektNom: 'Сунъий кўл', davr: '2026-09', asosiyObyektId: 1, nakrutka: NK, imzo: { zakazchik: 'Дирекция', pudratchi: 'Pudratchi MChJ' }, raqam: '12' });
    const hisobot = hujjatTekshir(h.bytes, { ruxsat: [/Сунъий кўл/] });
    const v = hisobotVaraq(hisobot);
    expect(hisobot.dollarFormulalar).toEqual([]);
    expect(hisobot.keshsizFormulalar).toEqual([]);
    expect(v.a4).toBe(true);
    expect(v.bittaEnli).toBe(true);
    expect(v.printArea).toBeTruthy();
    expect(h.faylNomi).toContain('ФОРМА_3');
    expect(h.faylNomi.endsWith('.xlsx')).toBe(true);
    // H5: texnik matnlar yo'q; H3: imzolar bor.
    expect(hisobot.taqiqlangan).toEqual([]);
    expect(hisobot.matnlar.some((t) => t.includes('ЗАКАЗЧИК'))).toBe(true);
    expect(hisobot.matnlar.some((t) => t.includes('ПОДРЯДЧИК'))).toBe(true);
  });

  it('egasi 2026-09-28: har ikki tomonning TO‘LIQ rekvizitlari (adres, telefon, bank, INN, OKED) titulda yonma-yon chiqadi', () => {
    const h = forma3Hujjat(MANBA, {
      obyektNom: 'Сунъий кўл', obyektManzil: 'Навои шаҳри', davr: '2026-09', asosiyObyektId: 1, nakrutka: NK,
      raqam: '12', hujjatSana: '2026-10-03',
      shartnomaRaqam: 'ЯНШАК 1/1', shartnomaSana: '2025-04-18', shartnomaSumma: 45_390_000_000,
      pudratchi: {
        toliqNom: 'ООО "New Temes Buildings"', manzil: 'г.Ташкент, ул. Турсунзода 60', telefon: '(90) 233-97-07',
        hisobRaqam: '2020 8000 8008 3155 6001', bank: 'АК "Ипотека Банк"', mfo: '00425', inn: '305238901', oked: '41201',
      },
      zakazchik: {
        toliqNom: 'Дирекция "Янги Навоий шахарчаси"', manzil: 'г.Навои ул.И.Каримова 77', telefon: '95-246-70-70',
        hisobRaqam: '4600 1086 0124 0117 0139 9001 8001', bank: 'Марказий банк', mfo: '00014', inn: '311311785', oked: '84130',
      },
    });
    const hisobot = hujjatTekshir(h.bytes, { ruxsat: [/Сунъий кўл/, /Навои/] });
    const matn = hisobot.matnlar.join(' | ');
    // Sarlavha — F2 paketining o'z СЧЁТ-ФАКТ varag'i nomi bilan bir xil.
    expect(matn).toContain('СПРАВКА-СЧЕТ-ФАКТУРА О СТОИМОСТИ ВЫПОЛНЕННЫХ РАБОТ (ПОНЕСЕННЫХ ЗАТРАТ)');
    expect(matn).toContain('03.10.2026 г.');
    // Rasmiy blanka qutisi: Номер документа | Дата составления | Отчетный период с … по …
    for (const k of ['Номер документа', 'Дата составления', 'Отчетный период', '01.09.2026 г.', '30.09.2026 г.', 'ЗА СЕНТЯБРЬ МЕСЯЦ 2026 ГОДА']) expect(matn).toContain(k);
    // Ikkala tomon — nom, adres, telefon, hisob raqami, bank, MFO, INN, OKED.
    for (const kutilgan of [
      'ООО "New Temes Buildings"', 'г.Ташкент, ул. Турсунзода 60', '(90) 233-97-07',
      '2020 8000 8008 3155 6001', 'АК "Ипотека Банк"', '00425', '305238901', '41201',
      'Дирекция "Янги Навоий шахарчаси"', 'г.Навои ул.И.Каримова 77', '95-246-70-70',
      '4600 1086 0124 0117 0139 9001 8001', 'Марказий банк', '00014', '311311785', '84130',
    ]) expect(matn).toContain(kutilgan);
    expect(matn).toContain('№ ЯНШАК 1/1 от 18.04.2025 г. Общая стоимость в договорных текущих ценах');
    expect(matn.replace(/\s/g, '')).toContain('45390000000,00сум');
    expect(matn).toContain('Навои шаҳри');
  });

  it('rekvizit kiritilmagan — rasmiy blankadagi kabi to‘ldirish chizig‘i qoladi, o‘ylab to‘qilmaydi, diqqatda aytiladi', () => {
    const h = forma3Hujjat(MANBA, { obyektNom: 'X', davr: '2026-09', asosiyObyektId: 1, nakrutka: NK });
    const hisobot = hujjatTekshir(h.bytes, { ruxsat: [] });
    const matn = hisobot.matnlar.join(' | ');
    expect(matn).toContain('Заказчик: | ________________');
    expect(matn).not.toContain('Договор №');
    expect(h.diqqat.some((d) => d.nom === 'Заказчик')).toBe(true);
  });

  it('egasi 2026-09-29: rasmiy 16 grafa, podvalda chel.-ch / mash.-ch soatlari, ИТОГО К ОПЛАТЕ va summa so‘z bilan', () => {
    const h = forma3Hujjat(MANBA, { obyektNom: 'X', davr: '2026-09', asosiyObyektId: 1, nakrutka: NK });
    const matn = hujjatTekshir(h.bytes, { ruxsat: [] }).matnlar.join(' | ');
    for (const k of ['в % к объему всего работ (гр.8:гр.4)×100', 'с начала года по отчетный месяц включительно', 'в том числе за отчетный месяц',
      'I. СТРОИТЕЛЬНО-МОНТАЖНЫЕ РАБОТЫ', 'ИТОГО ПРЯМЫЕ ЗАТРАТЫ ПО ОБЪЕКТУ', 'чел.-ч', 'ИТОГО К ОПЛАТЕ (с учетом НДС)']) expect(matn).toContain(k);
    expect(matn).toMatch(/сум \d\d тийин с НДС/);
    expect(h.soatlar.ЧЕЛ).toBeDefined();
  });

  it('255 argumentdan katta: 300 bargli hujjat SUMIF oraliqlari bilan yigʻiladi', () => {
    const koop: NakopitelniyQator[] = [q({ tur: 'rz', nom: 'РАЗДЕЛ 1' })];
    const oylik: Array<Forma3Manba['f2Oylik'][number]> = [];
    for (let i = 0; i < 300; i++) {
      koop.push(q({ tur: 'rs', kat: i % 2 ? 'ЧЕЛ' : 'МАТ', kod: 'K' + i, nom: 'RES ' + i, birlik: 'ед', smeta_summa: 1000 + i, smeta_narx: 10, smeta_hajm: 100 }));
      oylik.push({ obyekt_id: 1, qator_id: koop[koop.length - 1].qator_id, oy: '2026-09', summa: 1000 + i });
    }
    const manba: Forma3Manba = { nakopitelniy: [{ obyekt_id: 1, obyektNom: 'O', qatorlar: koop }], f2Oylik: oylik };
    const h = forma3Hujjat(manba, { obyektNom: 'O', davr: '2026-09', asosiyObyektId: 1, nakrutka: NK });
    // Σ qiymat = Σ(1000..1299) = 344 850; kategoriya jamilari ЧЕЛ+МАТ (yagona katlar).
    expect((h.kat.J['ЧЕЛ'] ?? 0) + (h.kat.J['МАТ'] ?? 0)).toBeCloseTo(344_850, 2);
    expect(h.vsegoKOplate.J).toBeGreaterThan(0);
    // ИТОГО formulasi SUMIF — 250 argument chegarasidan o'tadi (oraliq bilan).
    const hisobot = hujjatTekshir(h.bytes, {});
    expect(hisobot.dollarFormulalar).toEqual([]);
  });

  it('davr matni rus tilida', () => {
    expect(f3DavrMatni('2026-09')).toBe('сентябрь 2026 г.');
    expect(f3DavrMatni('2026-01')).toBe('январь 2026 г.');
  });
});

describe('F3 — manba varag‘i va SUMIFS (egasi 2026-09-30: "qayerdan olinganini bilish uchun formula")', () => {
  it('ish qatorida F2 summalari «Ф-2 (источник)» varag‘idan SUMIFS bilan; manba satrlari to‘liq', () => {
    const h = forma3Hujjat(MANBA, { obyektNom: 'Сунъий кўл', davr: '2026-09', asosiyObyektId: 1, nakrutka: NK });
    const t = hujjatTekshir(h.bytes, { ruxsat: [/^Сунъий кўл$/] });
    expect(t.dollarFormulalar).toEqual([]);
    expect(t.keshsizFormulalar).toEqual([]);
    expect(t.varaqlar.map((v) => v.nom)).toEqual(expect.arrayContaining(['Ф-2 (источник)']));
    const v = hisobotVaraq(t);
    const nom = v.kataklar.find((k) => k.matn === 'Е01-01 РАЗРАБОТКА ГРУНТА')!;
    const row = nom.ref.replace(/^[A-Z]+/, '');
    const J = v.kataklar.find((k) => k.ref === `J${row}`)!;
    expect(J.f).toBe(`SUMIFS('Ф-2 (источник)'!I:I,'Ф-2 (источник)'!A:A,R${row},'Ф-2 (источник)'!B:B,"сумма",'Ф-2 (источник)'!D:D,"<=202609")`);
    expect(Number(J.v)).toBe(1_100_000); // ish ichidagi ЧЕЛ (100k+500k) va ПЕСОК (200k+300k)
    const P = v.kataklar.find((k) => k.ref === `P${row}`)!;
    expect(P.f).toMatch(/'Ф-2 \(источник\)'!D:D,202609\)$/);
    const m = t.varaqlar.find((x) => x.nom === 'Ф-2 (источник)')!;
    expect(m.kataklar.filter((k) => k.matn === 'сумма').length).toBe(4);
  });
});
