import { describe, expect, it } from 'vitest';
import type { NakopitelniyQator } from '../api/t2-nakopitelniy';
import { nakopitelniyJamilar, nakopitelniyVedomostHujjat, HujjatToliqEmasXato, NDS_SUKUT_FOIZ } from './nakopitelniy-vedomost-export';
import { yaxlit2 as yaxlit } from './hujjat-yozuvchi';
import { hujjatTekshir, imzoRollariBormi } from './hujjat-yozuvchi';
import { namunaSaqla } from './hujjat-yozuvchi/test-yordam';

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

// bl va rz qatorlarining o'z summasi (t2_qator.summa) — bolalar takrori; hujjat ularni qo'shmaydi.
const ROWS: NakopitelniyQator[] = [
  q({ tur: 'rz', nom: 'РАЗДЕЛ 1. ЗЕМЛЯНЫЕ РАБОТЫ', smeta_summa: 1_600_000 }),
  q({ tur: 'bl', kod: 'Е01-01', nom: 'РАЗРАБОТКА ГРУНТА', birlik: 'м3', smeta_hajm: 100, smeta_summa: 1_600_000, fakt_hajm: 60, oldingi_hajm: 30, joriy_hajm: 20 }),
  q({ tur: 'rs', kat: 'ЧЕЛ', kod: '1-100', nom: 'ЗАТРАТЫ ТРУДА РАБОЧИХ', birlik: 'чел.-ч', smeta_hajm: 200, smeta_narx: 5000, smeta_summa: 1_000_000, fakt_hajm: 120, oldingi_hajm: 60, oldingi_summa: 300_000, joriy_hajm: 40, joriy_summa: 200_000.5 }),
  q({ tur: 'mat', kat: 'МАТ', kod: 'С101', nom: 'ПЕСОК', birlik: 'м3', smeta_hajm: 50, smeta_narx: 12_000, smeta_summa: 600_000, fakt_hajm: 20, oldingi_hajm: 10, oldingi_summa: 120_000, joriy_hajm: 15, joriy_summa: 180_000 }),
  q({ tur: 'rz', nom: 'РАЗДЕЛ 2. БЕТОННЫЕ РАБОТЫ' }),
  q({ tur: 'bl', kod: 'Е06-01', nom: 'БЕТОНИРОВАНИЕ', birlik: 'м3', smeta_hajm: 10, oldingi_hajm: 0, joriy_hajm: 5 }),
  q({ tur: 'mat', kat: 'МАТ', kod: 'С401', nom: 'БЕТОН В25', birlik: 'м3', smeta_hajm: 10.2, smeta_narx: 900_000, smeta_summa: 9_180_000, fakt_hajm: 5, joriy_hajm: 5.1, joriy_summa: 4_590_000 }),
];

describe('Накопительная ведомость — hujjat standarti', () => {
  it('jamilar faqat barglardan (bl/rz summasi ikki marta sanalmaydi)', () => {
    const j = nakopitelniyJamilar(ROWS);
    expect(j).toEqual({ smeta: 10_780_000, oldingi: 420_000, joriy: 4_970_000.5, jami: 5_390_000.5, qoldiq: 5_389_999.5 });
  });

  it('H2–H9: rasmiy shakl, formulalar $ siz, kesh bor, imzo, chop, fayl nomi', () => {
    const { bytes, faylNomi, jamilar } = nakopitelniyVedomostHujjat(ROWS, { obyektNom: 'Сунъий кўл', davr: '2026-09-01', imzo: { zakazchik: 'Дирекция' } });
    namunaSaqla('nakopitelniy.xlsx', bytes);
    expect(faylNomi).toBe('Сунъий кўл_НАКОПИТЕЛЬНАЯ_ВЕДОМОСТЬ_2026-09.xlsx');
    // Obyekt nomi — saytdagi egasining matni (o'zbekcha bo'lishi mumkin, H9 istisno).
    const t = hujjatTekshir(bytes, { ruxsat: [/^Сунъий кўл$/] });
    expect(t.taqiqlangan).toEqual([]);
    expect(t.dollarFormulalar).toEqual([]);
    expect(t.keshsizFormulalar).toEqual([]);
    expect(t.fullCalcOnLoad).toBe(true);
    const v = t.varaqlar[0];
    expect(v.a4 && v.bittaEnli && v.yonalish === 'landscape').toBe(true);
    expect(v.printArea).toMatch(/!\$A\$1:\$S\$\d+$/);
    expect(v.printTitles).toBeTruthy();
    expect(imzoRollariBormi(t, ['ЗАКАЗЧИК', 'ПОДРЯДЧИК', 'СОСТАВИЛ']).yoq).toEqual([]);
    expect(t.matnlar).toEqual(expect.arrayContaining(['НАКОПИТЕЛЬНАЯ ВЕДОМОСТЬ ВЫПОЛНЕННЫХ РАБОТ', 'за отчетный период: сентябрь 2026 г. (учтены только утвержденные акты формы № 2)', 'ВСЕГО ПО ОБЪЕКТУ', 'ИТОГО ПО РАЗДЕЛУ: РАЗДЕЛ 1. ЗЕМЛЯНЫЕ РАБОТЫ']));
    // UI == Excel: ВСЕГО "с начала строительства" keshi = jamilar.jami.
    const vsego = v.kataklar.filter((k) => k.f?.includes('SUMIF(U') && Number(k.v) === jamilar.jami);
    expect(vsego.length).toBeGreaterThan(0);
  });

  it('ichma-ich RZ lar canonical ota_id bo‘yicha alohida yopiladi', () => {
    const rows: NakopitelniyQator[] = [
      q({ qator_id: 501, tur: 'rz', daraja: 0, nom: 'АМФИТЕАТР' }),
      q({ qator_id: 502, tur: 'rz', ota_id: 501, daraja: 1, nom: 'СЦЕНА' }),
      q({ qator_id: 503, tur: 'bl', ota_id: 502, daraja: 2, kod: 'СЦ-01', nom: 'БЕТОННЫЕ РАБОТЫ' }),
      q({ qator_id: 504, tur: 'mat', ota_id: 503, daraja: 3, kat: 'МАТ', kod: 'М-01', nom: 'БЕТОН', birlik: 'м3', smeta_hajm: 10, smeta_summa: 1000, joriy_hajm: 2, joriy_summa: 200 }),
      q({ qator_id: 505, tur: 'rz', ota_id: 501, daraja: 1, nom: 'ЗДАНИЕ' }),
      q({ qator_id: 506, tur: 'bl', ota_id: 505, daraja: 2, kod: 'ЗД-01', nom: 'КЛАДКА' }),
      q({ qator_id: 507, tur: 'mat', ota_id: 506, daraja: 3, kat: 'МАТ', kod: 'М-02', nom: 'КИРПИЧ', birlik: 'м2', smeta_hajm: 20, smeta_summa: 2000, joriy_hajm: 4, joriy_summa: 400 }),
    ];
    const t = hujjatTekshir(nakopitelniyVedomostHujjat(rows, { obyektNom: 'Амфитеатр', davr: '2026-09' }).bytes);
    const sections = t.matnlar.filter((s) => s.startsWith('ИТОГО ПО РАЗДЕЛУ:'));
    expect(sections).toEqual([
      'ИТОГО ПО РАЗДЕЛУ: СЦЕНА',
      'ИТОГО ПО РАЗДЕЛУ: ЗДАНИЕ',
      'ИТОГО ПО РАЗДЕЛУ: АМФИТЕАТР',
    ]);
  });

  it('H7: smeta summasi yo‘q — faqat o‘sha qator bo‘sh, ВСЕГО va остаток ko‘rinadi, ro‘yxatda (egasi qoidasi)', () => {
    const rows = ROWS.map((r) => (r.nom === 'ПЕСОК' ? { ...r, smeta_summa: null } : r));
    const { bytes, jamilar } = nakopitelniyVedomostHujjat(rows, { obyektNom: 'Объект', davr: '2026-09' });
    const toliq = nakopitelniyVedomostHujjat(ROWS, { obyektNom: 'Объект', davr: '2026-09' }).jamilar;
    const pesok = ROWS.find((r) => r.nom === 'ПЕСОК')!.smeta_summa ?? 0;
    expect(jamilar.smeta).toBeCloseTo((toliq.smeta ?? 0) - pesok, 2);
    expect(jamilar.qoldiq).toBeCloseTo(jamilar.smeta - jamilar.jami, 2);
    const t = hujjatTekshir(bytes);
    // ПЕСОК: smeta noma'lum + qabul qilingan > fakt; БЕТОН: qabul qilingan > fakt.
    // + nakrutka foizlari berilmagan (4-band)
    expect(t.matnlar.some((s) => s.startsWith('ПОЗИЦИИ, ТРЕБУЮЩИЕ ВНИМАНИЯ (4)'))).toBe(true);
    expect(t.matnlar.some((s) => s.includes('нет объема или стоимости по смете'))).toBe(true);
    expect(t.taqiqlangan).toEqual([]);
  });

  it('ikki narx: to‘g‘ri xarajat va к оплате (Kf × summa), nakrutka podvali kaskadi, НДС ichida', () => {
    expect(NDS_SUKUT_FOIZ).toBe(12);
    // Amfiteatr (kompaniya 1) foizlari.
    const nakrutka = { ТРАНСПОРТ_МАТЕРИАЛ: 5, СКЛАДСКИЕ_МАТЕРИАЛ: 2, СКЛАДСКИЕ_МК: 0.75, ТРАНСПОРТ_КАБЕЛЬ: 1.5, ПРОЧИЕ_ПОДРЯДЧИК: 18, ТРАНСПОРТ_ОБОРУД: 2, ЗАГОТ_СКЛАД_ОБОРУД: 1.2, СТРАХОВАНИЕ: 0.32, РИСК: 0, НДС: 12 };
    const smetaNakrutka = { pryamye: 43_596_859_620.62, itogo4: 50_556_791_619.97, nds: 6_066_814_994.4, nds_foiz: 12, vsego: 56_623_606_614.37 };
    const r = nakopitelniyVedomostHujjat(ROWS, { obyektNom: 'Объект', davr: '2026-09', ndsFoiz: 12, nakrutka, smetaNakrutka });
    namunaSaqla('nakopitelniy_nds.xlsx', r.bytes);
    const t = hujjatTekshir(r.bytes);
    expect(t.taqiqlangan).toEqual([]);
    expect(t.dollarFormulalar).toEqual([]);
    expect(t.keshsizFormulalar).toEqual([]);
    expect(t.matnlar).toEqual(expect.arrayContaining(['К ОПЛАТЕ (с накладными расходами и НДС)', 'ВСЕГО К ОПЛАТЕ (с накладными расходами и НДС)', 'ПРЯМЫЕ ЗАТРАТЫ — ВСЕГО', 'ИТОГО-4 (без НДС)']));
    // Kaskad (за период, L): ЧЕЛ 200 000,50; МАТ 180 000 + 4 590 000.
    const L = r.kaskad!.L;
    expect(L.pryamye).toBe(4_970_000.5);
    expect(L.vsego).toBeGreaterThan(L.pryamye);
    // Qator к оплате yig'indisi podval ВСЕГО bilan teng (faqat yaxlitlash farqi).
    expect(Math.abs((r.kOplata.davr ?? 0) - L.vsego)).toBeLessThan(0.05);
    expect(Math.abs((r.kOplata.jami ?? 0) - r.kaskad!.N.vsego)).toBeLessThan(0.05);
    const k = t.varaqlar[0].kataklar;
    // Qator formulasi: ROUND(L×Kf) — Kf katagi foiz kataklaridan formula.
    expect(k.some((c) => /^ROUND\(L\d+\*F\d+,2\)$/.test(c.f ?? ''))).toBe(true);
    expect(k.some((c) => /^\(1\+F\d+\/100\)\*\(1\+F\d+\/100\+F\d+\/100\)\*\(1\+F\d+\/100\)$/.test(c.f ?? ''))).toBe(true);
    expect(k.some((c) => /^SUMIF\(T\d+:T\d+,"МАТ",L\d+:L\d+\)$/.test(c.f ?? ''))).toBe(true);
  });

  it('nakrutka foizlari berilmasa — 0 %, к оплате = прямые + НДС, hujjatda aytiladi', () => {
    const r = nakopitelniyVedomostHujjat(ROWS, { obyektNom: 'Объект', davr: '2026-09', ndsFoiz: 12 });
    const t = hujjatTekshir(r.bytes);
    expect(r.kaskad!.L.vsego).toBe(yaxlit(4_970_000.5 * 1.12));
    expect(t.matnlar.some((m) => m.includes('Проценты накладных и прочих расходов') && m.includes('не заданы'))).toBe(true);
  });

  it('qirqilgan ro‘yxatdan hujjat yasalmaydi (chala hujjat — rasmiy emas)', () => {
    expect(() => nakopitelniyVedomostHujjat(ROWS, { obyektNom: 'X', davr: '2026-09', truncated: true })).toThrow(HujjatToliqEmasXato);
  });
});

describe('Накопительная ведомость — har oy alohida ustun (egasi 2026-09-30)', () => {
  it('avgust, sentyabr, oktyabr — o‘z ustunlari; ИТОГО = oylar yig‘indisi formulasi; hisobot davri — oxirgi oy', () => {
    const rs = ROWS[2], mat = ROWS[3];
    // RPC: oldingi = avgust + sentyabr, joriy = oktyabr (rs: 300 000 = 100 000 + 200 000; 200 000.5 oktyabr)
    const qiymat = new Map<number, Map<string, { hajm: number; summa: number }>>([
      [rs.qator_id, new Map([['2026-08', { hajm: 20, summa: 100_000 }], ['2026-09', { hajm: 40, summa: 200_000 }], ['2026-10', { hajm: 40, summa: 200_000.5 }]])],
      [mat.qator_id, new Map([['2026-09', { hajm: 10, summa: 120_000 }], ['2026-10', { hajm: 15, summa: 180_000 }]])],
    ]);
    const qatorlar = ROWS.slice(0, 4);
    const { bytes } = nakopitelniyVedomostHujjat(qatorlar, { obyektNom: 'Obj', davr: '2026-10-01', oylar: { oylar: ['2026-08', '2026-09', '2026-10'], qiymat } });
    namunaSaqla('nakopitelniy-oylar.xlsx', bytes);
    const t = hujjatTekshir(bytes, { ruxsat: [/^Obj$/] });
    expect(t.dollarFormulalar).toEqual([]);
    expect(t.keshsizFormulalar).toEqual([]);
    expect(t.matnlar).toEqual(expect.arrayContaining(['АВГУСТ 2026 Г.', 'СЕНТЯБРЬ 2026 Г.', 'ОКТЯБРЬ 2026 Г. — ОТЧЕТНЫЙ ПЕРИОД', 'С НАЧАЛА СТРОИТЕЛЬСТВА (ИТОГО ЗА ВСЕ МЕСЯЦЫ)']));
    const v = t.varaqlar[0];
    const nomKatak = v.kataklar.find((k) => k.matn === 'ЗАТРАТЫ ТРУДА РАБОЧИХ')!;
    const row = nomKatak.ref.replace(/^[A-Z]+/, '');
    // Oylar: I/J (avg), K/L (sen), M/N (okt); ИТОГО: O (hajm) = I+K+M, P (summa) = J+L+N
    expect(v.kataklar.find((k) => k.ref === `O${row}`)?.f).toBe(`I${row}+K${row}+M${row}`);
    expect(Number(v.kataklar.find((k) => k.ref === `P${row}`)?.v)).toBe(500_000.5);
    expect(v.kataklar.find((k) => k.ref === `P${row}`)?.f).toBe(`J${row}+L${row}+N${row}`);
  });
});

describe('Накопительная ведомость — tirik smeta (egasi 2026-09-30)', () => {
  it('resurs hajmi = norma × ish hajmi, summa = hajm × narx (formula); ish/razdel summasi SUMIF', () => {
    const rz = q({ tur: 'rz', nom: 'РАЗДЕЛ' });
    const bl = q({ tur: 'bl', nom: 'ИШ', birlik: 'м3', smeta_hajm: 100, ota_id: null });
    const rs = q({ tur: 'rs', kat: 'ЧЕЛ', nom: 'ТРУД', birlik: 'чел.-ч', smeta_hajm: 200, smeta_narx: 5000, smeta_summa: 1_000_000, norma: 2 });
    bl.ota_id = rz.qator_id; rs.ota_id = bl.qator_id; rz.ota_id = null;
    const { bytes } = nakopitelniyVedomostHujjat([rz, bl, rs], { obyektNom: 'O', davr: '2026-09-01' });
    const v = hujjatTekshir(bytes, { ruxsat: [/^O$/] }).varaqlar[0];
    const r = (m: string) => v.kataklar.find((k) => k.matn === m)!.ref.replace(/^[A-Z]+/, '');
    const blR = r('ИШ'), rsR = r('ТРУД');
    expect(v.kataklar.find((k) => k.ref === `E${rsR}`)?.f).toBe(`ROUND(2*E${blR},6)`);
    expect(v.kataklar.find((k) => k.ref === `G${rsR}`)?.f).toBe(`IF(OR(E${rsR}="",F${rsR}=""),"",ROUND(E${rsR}*F${rsR},2))`);
    expect(v.kataklar.find((k) => k.ref === `G${blR}`)?.f).toMatch(/SUMIF/);
  });
});
