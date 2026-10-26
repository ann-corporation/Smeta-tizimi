// 1C akt-sverka importi — SINTETIK namunalar (real ma'lumot emas): parser (ikki ustun joylashuvi, Основной договор, xato yil),
// takror (bir xil bank № turli shartnomada), yo'qolgan/ko'chgan sotuv, saldo solishtiruvi, F2 moslash, FIFO taqsimot, reestr CSV.
import { describe, expect, it } from 'vitest';
import { pulOqi, sanaOqi, sverkaJadvalOqi } from './tahlil';
import { barqarorUuid, importReja, shartnomaKaliti, shartnomaTop, unikalTolovlar, type YuklanganFayl } from './reja';
import { davrOyi, f2Birliklar, f2Taklif, kalitlardanIdlar, qatorQqsBilan, shartnomaMoslash } from './f2-moslash';
import { fifoTaklif, taqsimotTekshir } from './taqsimot';
import { reestrCsvOqi, reestrMosla } from './reestr-csv';
import { obyektKesimi, ulushlarga } from '../nakopitelniy-svod';
import type { MoslashShartnoma, TizimShartnoma } from './turlar';

type Q = [string, string, number | null, number | null];
/** Sintetik akt-sverka varag'i; `surish` — ustunlar o'ngga suriladi (xls eksporti kabi). */
function varaq(o: { dan: string; gacha: string; bosh?: [number | null, number | null]; bloklar: { sarlavha: string; bosh?: [number | null, number | null]; qatorlar: Q[]; yakuniy: [number | null, number | null] }[]; yakuniy: [number | null, number | null] }, surish = 0): unknown[][] {
  const p = (r: unknown[]) => [...Array(surish).fill(null), ...r];
  const rows: unknown[][] = [
    p(['Акт сверки']), p([`взаимных расчетов за период: ${o.dan} - ${o.gacha}`]),
    p(['Показатели', null, 'ООО Пудратчи', null, 'Заказчик', null]),
    p(['Дата', 'Документ', 'Дебет', 'Кредит', 'Дебет', 'Кредит']),
    p([`Сальдо начальное на ${o.dan} г.`, null, o.bosh?.[0] ?? null, o.bosh?.[1] ?? null, o.bosh?.[1] ?? null, null]),
  ];
  for (const b of o.bloklar) {
    rows.push(p([b.sarlavha, null, b.bosh?.[0] ?? null, b.bosh?.[1] ?? null, null, null]));
    for (const q of b.qatorlar) rows.push(p([q[0], q[1], q[2], q[3], null, null]));
    rows.push(p([null, 'Итого по договору:', null, null, null, null]));
    rows.push(p(['Сальдо конечное на  г.', null, b.yakuniy[0], b.yakuniy[1], null, null]));
  }
  rows.push(p(['Обороты за период', null, 1, 1, null, null]));
  rows.push(p([`Сальдо конечное на ${o.gacha} г.`, null, o.yakuniy[0], o.yakuniy[1], null, null]));
  rows.push(p(['По данным ООО Пудратчи']));
  return rows;
}

const SH: TizimShartnoma[] = [
  { id: 1, raqam: '№7 (01.02.2025)', jami_nds_bilan: 1000, obyektlar: [{ id: 11, nom: 'Bino A' }], joriySumma: 1000 },
  { id: 2, raqam: 'ТСТ-2 (01.03.2025)', jami_nds_bilan: null, obyektlar: [{ id: 21, nom: 'Karting' }, { id: 22, nom: 'Kafe' }], joriySumma: null },
];
const bosh = (): MoslashShartnoma[] => SH.map((s) => ({ id: s.id, raqam: s.raqam, f2: [], f3: [], f2_reestr: [], tolovlar: [] }));

const IYUN = varaq({
  dan: '01.01.2025', gacha: '30.06.2026',
  bloklar: [
    { sarlavha: 'дог. №7 от 01.02.2025 г., сумма договора 1 000,00 сум.', qatorlar: [
      ['10.02.25', 'Оплата (№900 от 10.02.2025)', null, 600.10],
      ['01.03.25', 'Продажа (1 от 01.03.2025)', 200.5, null],
      ['12.05.26', 'Продажа (2 от 12.05.2026)', 100, null],
    ], yakuniy: [null, 299.6] },
    { sarlavha: 'дог. №ТСТ-2 от 01.03.2025 г., сумма договора 5 000 сум.', qatorlar: [
      ['15.03.25', 'Оплата (№900 от 15.03.2025)', null, 700],
    ], yakuniy: [null, 700] },
    { sarlavha: 'Основной договор', qatorlar: [
      ['11.04.25', '09510~~~~4600108601~bank', 50, null],
      ['17.04.25', 'Возврат средств (№55 от 17.04.2025)', null, 50],
    ], yakuniy: [null, null] },
  ],
  yakuniy: [null, 999.6],
}, 1);

const OKT = varaq({
  dan: '01.01.2026', gacha: '22.10.2026', bosh: [null, 1099.6],
  bloklar: [
    // 12.05.2026 dagi sotuv 1C da 2025 ga ko'chirilgan: davr ichida yo'q, boshlang'ich saldo 100 ga kamaygan (−399.6 → −299.6)
    { sarlavha: 'дог. №7 от 01.02.2025 г., сумма договора 1 000 сум. (Obyekt)', bosh: [null, 299.6], qatorlar: [
      ['01.06.26', 'Продажа (3 от 01.06.0026)', 10743236164.669998, null],
      ['02.06.26', 'Оплата (№901 от 02.06.2026)', null, 500],
    ], yakuniy: [10743235365.07, null] },
  ],
  yakuniy: [10743234565.07, null],
});

const fayl = (nom: string, rows: unknown[][]): YuklanganFayl => ({ nom, tahlil: sverkaJadvalOqi(rows)! });

describe('tahlil (parser)', () => {
  it('ustunlar sarlavha orqali topiladi (surilgan va surilmagan), bloklar va saldo', () => {
    const a = sverkaJadvalOqi(IYUN)!;
    expect(a.davrDan).toBe('2025-01-01');
    expect(a.bloklar.map((b) => b.raqam)).toEqual(['7', 'ТСТ-2', null]);
    expect(a.bloklar[0].summa).toBe(100000);
    expect(a.bloklar[0].qatorlar.map((q) => [q.tur, q.raqam, q.summa])).toEqual([['tolov', '900', 60010], ['sotuv', '1', 20050], ['sotuv', '2', 10000]]);
    expect(a.bloklar[0].yakuniy).toBe(-29960);
    expect(a.bloklar[0].ichkiMos).toBe(true);
    expect(a.bloklar[2].asosiyDogovor).toBe(true);
    expect(a.bloklar[2].qatorlar.map((q) => q.tur)).toEqual(['nomalum', 'qaytarim']);
    expect(a.bloklar[2].ichkiMos).toBe(true); // netto 0
    expect(a.korsatilmaganQoldiq).toBe(0);
  });
  it('xato yil (0026) — qator sanasi olinadi, ogohlantirish; float tiyinga to\'g\'ri yaxlitlanadi', () => {
    const b = sverkaJadvalOqi(OKT)!;
    const q = b.bloklar[0].qatorlar[0];
    expect(q.sana).toBe('2026-06-01');
    expect(q.hujjatSana).toBeNull();
    expect(q.hujjatSanaXato).toBe(true);
    expect(q.summa).toBe(1074323616467);
    expect(b.ogohlantirishlar.some((m) => m.includes('0026'))).toBe(true);
    expect(b.bloklar[0].boshlangich).toBe(-29960);
    // faylda ko'rsatilmagan (harakatsiz) shartnoma qoldig'i: −1099.6 − (−299.6) = −800 → yakuniy farqi
    expect(b.korsatilmaganQoldiq).toBe(-80000);
  });
  it('sana va pul o\'qish', () => {
    expect(sanaOqi('25.05.26')).toBe('2026-05-25');
    expect(sanaOqi('23.09.0026')).toBeNull();
    expect(sanaOqi(46000)).toBe('2025-12-09');
    expect(pulOqi('35 810 787 215,57')).toBe(3581078721557);
    expect(pulOqi('')).toBeNull();
    expect(sverkaJadvalOqi([['foo', 'bar']])).toBeNull();
  });
});

describe('reja (dedup, shartnoma, yo\'qolgan, saldo)', () => {
  it('shartnoma raqami normallashadi', () => {
    expect(shartnomaKaliti('№3 (28.05.2025)')).toBe(shartnomaKaliti('3'));
    expect(shartnomaKaliti('ЯНШСХК 1/1 (18.04.2025)')).toBe(shartnomaKaliti('ЯНШСХК 1/1'));
    expect(shartnomaTop({ raqam: 'ТСТ-2', sarlavha: '', asosiyDogovor: false }, SH)).toBe(2);
    expect(shartnomaTop({ raqam: '99', sarlavha: '', asosiyDogovor: false }, SH)).toBeNull();
  });
  it('bir xil bank № turli shartnomada — ikkala to\'lov ham yangi; ikki fayl ustma-ust — takror bir marta', () => {
    const r = importReja([fayl('iyun', IYUN), fayl('okt', OKT)], { shartnomalar: SH, moslash: bosh() });
    const t900 = r.yozuvlar.filter((y) => y.raqam === '900');
    expect(t900.map((y) => [y.shartnomaId, y.holat])).toEqual([[1, 'yangi'], [2, 'yangi']]);
    expect(unikalTolovlar(r)).toHaveLength(3);
    expect(r.yozuvlar.find((y) => y.tur === 'qaytarim')?.holat).toBe('shartnoma_yoq');
    expect(r.yozuvlar.find((y) => y.tur === 'nomalum')?.holat).toBe('tushunilmadi');
    expect(r.ogohlantirishlar.some((o) => o.shartnomaId === 1 && o.manba === 'sarlavha')).toBe(true); // 1100.10 > 1000
    // takror fayl yuklash
    const r2 = importReja([fayl('iyun', IYUN), fayl('iyun2', IYUN)], { shartnomalar: SH, moslash: bosh() });
    expect(r2.soni.takror).toBe(5); // «tushunilmagan» qatorlar fayl bo'yicha alohida
  });
  it('operation_id barqaror va UUID shaklida', () => {
    const a = importReja([fayl('iyun', IYUN)], { shartnomalar: SH, moslash: bosh() });
    const b = importReja([fayl('boshqa-nom', IYUN)], { shartnomalar: SH, moslash: bosh() });
    const op = (x: typeof a) => x.yozuvlar.filter((y) => y.tur !== 'nomalum').map((y) => y.operationId);
    expect(op(a)).toEqual(op(b));
    expect(barqarorUuid('x')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(barqarorUuid('x')).not.toBe(barqarorUuid('y'));
  });
  it('tizimda bor → tizimda_bor; yangi faylda yo\'q sotuv → yo\'qolgan + «sana ko\'chgan» belgisi; saldo mos', () => {
    const tizim = bosh();
    tizim[0].f3 = [
      { id: 501, raqam: '1', sotuv_sana: '2025-03-01', sotuv_summa: 200.5, nds_foiz: 12, holat: 'tayyor', versiya: 1, operation_id: null, akt_ids: [] },
      { id: 502, raqam: '2', sotuv_sana: '2026-05-12', sotuv_summa: 100, nds_foiz: 12, holat: 'tayyor', versiya: 1, operation_id: null, akt_ids: [] },
    ];
    tizim[0].tolovlar = [{ id: 601, sana: '2025-02-10', summa: 600.1, tur: 'tolov', izoh: null, hujjat_raqam: '900', manba: 'sverka_1c', obyekt_id: 11, operation_id: null, versiya: 1, taqsimot: [] }];
    const r = importReja([fayl('okt', OKT)], { shartnomalar: SH, moslash: tizim });
    expect(r.yoqolgan.map((y) => y.id)).toEqual([502]);
    const s = r.saldo[0];
    expect(s.faylBoshlangich).toBe(-29960);
    expect(s.tizimBoshlangich).toBe(-39960);
    expect(s.sanaKochganBolishiMumkin).toBe(true);
    expect(s.mos).toBe(true); // yakuniy: ko'chgan sotuv hali tizimda — 1C yakuniysi bilan teng
    const r2 = importReja([fayl('iyun', IYUN)], { shartnomalar: SH, moslash: tizim });
    expect(r2.yozuvlar.filter((y) => y.shartnomaId === 1).map((y) => y.holat)).toEqual(['tizimda_bor', 'tizimda_bor', 'tizimda_bor']);
  });
});

describe('F2 moslash', () => {
  const m: MoslashShartnoma = {
    id: 1, raqam: '7',
    f2: [
      { akt_id: 1, obyekt_id: 11, oy: '2025-02-01', raqam: '1', holat: 'tasdiqlangan', hujjat_jami: 100, ustama: { pryamye: 100, katsiz: 10, ustamali: 130, podval: { itogo4: 120, nds: 14.4, vsego: 134.4 } } },
      { akt_id: 2, obyekt_id: 11, oy: '2025-04-01', raqam: '2', holat: 'tasdiqlangan', hujjat_jami: 50, ustama: null },
      { akt_id: 3, obyekt_id: 11, oy: '2026-05-01', raqam: '3', holat: 'qoralama', hujjat_jami: 20, ustama: null },
    ],
    f2_reestr: [
      { id: 9, akt_id: 2, raqam: '2', lot: null, obyekt_ish: 'Bino A', davr: '04.2025', oy: null, qqssiz: 60, qqs: 7.2, qqs_bilan: 67.2, holat_matn: null, forma3_id: null, versiya: 1 },
      { id: 10, akt_id: null, raqam: '37', lot: null, obyekt_ish: 'Magic', davr: '01.05.2026 - 31.05.2026', oy: null, qqssiz: 100, qqs: 12, qqs_bilan: 112, holat_matn: null, forma3_id: null, versiya: 1 },
    ],
    f3: [
      { id: 101, raqam: '1', sotuv_sana: '2025-03-01', sotuv_summa: 150, nds_foiz: 12, holat: 'tayyor', versiya: 1, operation_id: null, akt_ids: [] },
      { id: 102, raqam: '2', sotuv_sana: '2026-06-01', sotuv_summa: 300, nds_foiz: 12, holat: 'tayyor', versiya: 1, operation_id: null, akt_ids: [] },
      { id: 103, raqam: '3', sotuv_sana: '2026-07-01', sotuv_summa: 5, nds_foiz: 12, holat: 'tayyor', versiya: 1, operation_id: null, akt_ids: [] },
    ],
    tolovlar: [],
  };
  it('birliklar: reestr asosiy, qatorlardan QQS bilan = vsego + katsiz × (1 + nds/itogo4); tizimda yo\'q reestr F2', () => {
    const b = f2Birliklar(m);
    expect(qatorQqsBilan(m.f2[0].ustama)).toBe(14560); // 134.4 + 10 + 10×0.12
    const a1 = b.find((x) => x.kalit === 'akt:1')!;
    expect([a1.asosiy, a1.asosiyManba, a1.ogoh]).toEqual([14560, 'qatorlar', ['REESTR_YOQ']]);
    const a2 = b.find((x) => x.kalit === 'akt:2')!;
    expect([a2.asosiy, a2.reestrQqssiz, a2.asosiyManba]).toEqual([6720, 6000, 'reestr']);
    const a3 = b.find((x) => x.kalit === 'akt:3')!;
    expect(a3.asosiy).toBeNull(); // summa noma'lum — 0 emas
    expect(b.find((x) => x.kalit === 'reestr:10')?.ogoh).toContain('TIZIMDA_YOQ');
    expect(davrOyi('01.05.2026 - 31.05.2026')).toBe('2026-05');
  });
  it('sukut taklifi: oldingi Продажадан keyin va shu Продажагача; F2 siz Продажа va Продажага kirmagan F2', () => {
    const tk = f2Taklif(m.f3, f2Birliklar(m));
    expect(tk.get(101)).toEqual(['akt:1']);
    expect(tk.get(102)?.sort()).toEqual(['akt:2', 'akt:3', 'reestr:10']);
    expect(tk.get(103)).toEqual([]);
    const n = shartnomaMoslash(m);
    expect(n.f2sizSotuv.map((s) => s.id)).toEqual([103]);
    expect(n.sotuvlar[0].farq).toBe(15000 - 14560);
    expect(n.sotuvlar[1].nomalumSoni).toBe(1);
    expect(n.jami.farq).toBe(45500 - (14560 + 6720 + 11200));
    // operator: 102 dan reestr:10 ni olib tashlaydi → Продажага kirmagan F2 ga tushadi
    const n2 = shartnomaMoslash(m, new Map([[102, ['akt:2', 'akt:3']]]));
    expect(n2.sotuvsizF2.map((b) => b.kalit)).toEqual(['reestr:10']);
    expect(kalitlardanIdlar(['akt:2', 'reestr:10'])).toEqual({ aktIds: [2], reestrIds: [10] });
  });
  it('saqlangan bog\' taklifni bosib o\'tadi', () => {
    const m2 = { ...m, f3: m.f3.map((f) => (f.id === 103 ? { ...f, akt_ids: [1] } : f)) };
    const tk = f2Taklif(m2.f3, f2Birliklar(m2));
    expect(tk.get(103)).toEqual(['akt:1']);
    expect(tk.get(101)).toEqual([]);
  });
});

describe('FIFO taqsimot va obyekt kesimi', () => {
  it('eng eski qarzdan yopadi, qolgani taqsimlanmagan; saqlangan taqsimot navbatni oldindan yopadi', () => {
    const navbat = [{ obyektId: 21, sana: '2026-05-01', summa: 300 }, { obyektId: 22, sana: '2026-05-01', summa: 200 }, { obyektId: 21, sana: '2026-06-01', summa: 100 }];
    const r = fifoTaklif([
      { id: 1, sana: '2026-05-25', summa: 250, saqlangan: [] },
      { id: 2, sana: '2026-06-17', summa: 1000, saqlangan: [] },
      { id: 3, sana: '2026-05-01', summa: 100, saqlangan: [{ obyektId: 21, summa: 100 }] },
    ], navbat);
    expect(r.get(1)).toEqual([{ obyektId: 21, summa: 200 }, { obyektId: 22, summa: 50 }]);
    expect(r.get(2)).toEqual([{ obyektId: 22, summa: 150 }, { obyektId: 21, summa: 100 }, { obyektId: null, summa: 750 }]);
    expect(r.has(3)).toBe(false);
    expect(taqsimotTekshir(250, r.get(1)!)).toEqual({ ok: true });
    expect(taqsimotTekshir(250, [{ obyektId: 21, summa: 249 }])).toEqual({ ok: false, sabab: 'JAMI', farq: 1 });
    expect(taqsimotTekshir(2, [{ obyektId: 21, summa: 1 }, { obyektId: 21, summa: 1 }])).toEqual({ ok: false, sabab: 'TAKROR' });
  });
  it('obyekt kesimi: F3 ulushi tiyinda aniq, taqsimlanmagan qator, netto qarz va avans alohida', () => {
    expect(ulushlarga(100, [1, 1, 1])).toEqual([34, 33, 33]);
    const k = obyektKesimi({
      obyektlar: [{ id: 21, nom: 'Karting' }, { id: 22, nom: 'Kafe' }],
      sotuvlar: [{ summa: 1000, ulush: [{ obyektId: 21, vazn: 3 }, { obyektId: 22, vazn: 1 }] }, { summa: 50, ulush: [] }],
      tolovlar: [{ summa: 2000, obyektId: null, taqsimot: [{ obyektId: 21, summa: 500 }, { obyektId: null, summa: 1500 }] }, { summa: -10, obyektId: 22, taqsimot: [] }],
    });
    expect(k).toEqual([
      { obyektId: 22, nom: 'Kafe', f3: 250, tolangan: -10, qoldiq: 260 },
      { obyektId: 21, nom: 'Karting', f3: 750, tolangan: 500, qoldiq: 250 },
      { obyektId: null, nom: null, f3: 50, tolangan: 1500, qoldiq: -1450 },
    ]);
  });
});

describe('reestr CSV', () => {
  it('o\'qiydi, NULL saqlaydi, obyekt va № bo\'yicha moslaydi', () => {
    const csv = '﻿№;Lot;Obyekt_ish;Davr;QQSsiz;QQS;QQS_bilan;Holat\n28;1-lot;Karting;06.2026;25 750 000 000,50;3 090 000 000,06;28 840 000 000,56;imzolangan\n37;;Kafe;;100;;;\nИтого;;;;1;;;\n;;;;;;;\n';
    const r = reestrCsvOqi(csv);
    expect(r.qatorlar.map((q) => [q.raqam, q.qqssiz, q.qqsBilan])).toEqual([['28', 2575000000050, 2884000000056], ['37', 10000, null]]);
    const tizim = bosh();
    tizim[1].f2 = [{ akt_id: 77, obyekt_id: 21, oy: '2026-06-01', raqam: '№28', holat: 'tasdiqlangan', hujjat_jami: 1, ustama: null }];
    const mos = reestrMosla(r.qatorlar, SH, tizim);
    expect(mos.map((q) => [q.shartnomaId, q.aktId, q.obyektId])).toEqual([[2, 77, 21], [2, null, 22]]);
    expect(reestrCsvOqi('a;b\n1;2').xatolar[0].qator).toBe(0);
  });
});
