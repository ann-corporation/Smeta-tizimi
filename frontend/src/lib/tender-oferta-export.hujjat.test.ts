/**
 * Tender Oferta — hujjat standarti (H1–H9) va paket end-to-end (P4.5).
 * Sintetik RES fayllar (ABC4 RES_A shakli): real fayl tekshiruvi — UNKNOWN,
 * egasi ofis PC da bajaradi (ops/handoff/PTO_LINIYA_YAKUN_HISOBOT_2026-09-25.md).
 */
import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import * as XLSX from 'xlsx';
import { readXlsx } from './f2-import-parse';
import { ofertaResursVaraqlariniAniqla, ofertaTanlanganQatorlari } from './tender-oferta-parser';
import { fayldagiFoizlar, ofertaHisobla } from './tender-oferta';
import { tenderOfertaXlsx } from './tender-oferta-export';
import { paketFaylHisobi, paketQatorlari, paketSvodXlsx, paketZip, type OfertaPaketFayl } from './tender-oferta-paket';
import { NAKRUTKA_STANDART } from './nakrutka-kaskad';
import { fillSoni, hujjatTekshir, imzoRollariBormi } from './hujjat-yozuvchi';
import { namunaSaqla } from './hujjat-yozuvchi/test-yordam';

type Katak = string | number | null | { f: string; v?: number };

function resVaraq(qator: Katak[][]) {
  const ws = XLSX.utils.aoa_to_sheet(qator.map((r) => r.map((c) => (c && typeof c === 'object' ? null : c))));
  qator.forEach((r, ri) => r.forEach((c, ci) => {
    if (c && typeof c === 'object') ws[XLSX.utils.encode_cell({ r: ri, c: ci })] = { t: 'n', f: c.f, v: c.v ?? 0 };
  }));
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: qator.length - 1, c: 5 } });
  return ws;
}

const RES = (narx: number): Katak[][] => [
  ['НАИМЕНОВАНИЕ СТРОЙКИ: ПАРК'],
  [],
  ['№№', 'НАИМЕНОВАНИЕ РЕСУРСА', 'ЕД.ИЗМ', 'КОЛ-ВО', 'ЦЕНА', 'СУММА'],
  [1, 2, 3, 4, 5, 6],
  ['СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ'],
  [1, 'ПЕСОК', 'М3', 10, narx, { f: 'D6*E6', v: 10 * narx }],
  [2, 'ЦЕМЕНТ', 'Т', 2, 5000, { f: 'D7*E7', v: 10000 }],
  [null, 'ИТОГО', 'СУМ', null, null, { f: 'SUM(F6:F7)', v: 10 * narx + 10000 }],
  [null, 'ТРАНСПОРТНЫЕ УСЛУГИ=5%', 'СУМ', null, 0.05, { f: 'F8*E9', v: (10 * narx + 10000) * 0.05 }],
  [null, 'ВСЕГО С УЧЕТОМ ТРАНСПОРТА', 'СУМ', null, null, { f: 'SUM(F8:F9)', v: (10 * narx + 10000) * 1.05 }],
];

function kitob(ws: XLSX.WorkSheet): Uint8Array {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'RES');
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx', compression: true }) as ArrayBuffer);
}

const foiz10 = { sozlama: { rejim: 'foiz' as const, yon: 'pasaytirish' as const, foiz: 10 }, nakrutka: NAKRUTKA_STANDART };

describe('Tender Oferta — hujjat standarti (H1–H9)', () => {
  it('asl kataklar saqlanadi (H1), yangi kataklarda texnik matn va $ yo‘q, chop sozlamalari, imzo, fayl nomi', async () => {
    const asl = kitob(resVaraq(RES(1000)));
    const t = ofertaResursVaraqlariniAniqla(await readXlsx(asl));
    const hisob = ofertaHisobla(ofertaTanlanganQatorlari(t, ['RES']), foiz10);
    const n = await tenderOfertaXlsx({ obyektNomi: 'Парк', manbaFaylNomi: 'Парк.xlsx', manbaBytes: asl, tanlanganVaraqlar: ['RES'], tahlillar: t, hisob, imzo: { zakazchik: 'Дирекция парка' }, sana: '2026-09-25' });
    namunaSaqla('oferta.xlsx', n.bytes);
    expect(n.faylNomi).toBe('Парк_ОФЕРТА_2026-09-25.xlsx');
    expect(n.saqlanish).toBe('toliq');
    const h = hujjatTekshir(n.bytes, { asl });
    expect(h.taqiqlangan).toEqual([]);
    expect(h.dollarFormulalar).toEqual([]);
    expect(h.keshsizFormulalar).toEqual([]);
    expect(h.fullCalcOnLoad).toBe(true);
    expect(imzoRollariBormi(h, ['ЗАКАЗЧИК', 'ПОДРЯДЧИК'])).toEqual({ yoq: [], podpis: true });
    const res = h.varaqlar.find((v) => v.nom === 'RES')!;
    const jami = h.varaqlar.find((v) => v.nom === n.jamiVaraq)!;
    expect(res.printTitles).toBe("'RES'!$3:$4");
    expect(jami.printTitles).toMatch(/^'OFERTA_JAMI'!\$\d+:\$\d+$/);
    expect(jami.printArea).toMatch(/^'OFERTA_JAMI'!\$A\$1:\$E\$\d+$/);
    expect(jami.a4 && jami.bittaEnli).toBe(true);
    // Yangi rang qo'shilmaydi (egasi 2026-09-24).
    expect(fillSoni(strFromU8(unzipSync(n.bytes)['xl/styles.xml']))).toBe(fillSoni(strFromU8(unzipSync(asl)['xl/styles.xml'])));
    // Asl katak bayt-bayt: F6 formulasi va qiymati o'zgarmagan.
    const aslXml = strFromU8(unzipSync(asl)['xl/worksheets/sheet1.xml']);
    const yangiXml = strFromU8(unzipSync(n.bytes)['xl/worksheets/sheet1.xml']);
    const f6 = aslXml.match(/<c r="F6"[\s\S]*?<\/c>/)![0];
    expect(yangiXml).toContain(f6);
  });

  it('P4.5 paket: 2 obyekt → ZIP ichida har obyekt + svod; svod jami = obyektlar yig‘indisi; imzo; H5', async () => {
    const b1 = kitob(resVaraq(RES(1000)));
    const b2 = kitob(resVaraq(RES(1200)));
    const f = async (id: string, nom: string, b: Uint8Array): Promise<OfertaPaketFayl> => ({ id, nom, faylNomi: `${nom}.xlsx`, tahlillar: ofertaResursVaraqlariniAniqla(await readXlsx(b)), tanlanganVaraqlar: ['RES'] });
    const fayllar = [await f('p1', 'Амфитеатр', b1), await f('p2', 'Автосалон', b2)];
    const hisob = ofertaHisobla(paketQatorlari(fayllar), foiz10);
    const h = fayllar.map((x) => paketFaylHisobi(hisob, x, true, NAKRUTKA_STANDART, 'kaskad'));
    // Bir xil material (ПЕСОК, М3) paketda bitta narx oladi.
    const pesok = hisob.qatorlar.filter((q) => q.nom === 'ПЕСОК').map((q) => q.pudratchiBirlikNarx);
    expect(new Set(pesok).size).toBe(1);
    const fayl = await Promise.all(fayllar.map((x, i) => tenderOfertaXlsx({ obyektNomi: x.nom, manbaFaylNomi: x.faylNomi, manbaBytes: i ? b2 : b1, tanlanganVaraqlar: ['RES'], tahlillar: x.tahlillar, hisob: h[i], sana: '2026-09-25' })));
    const svod = paketSvodXlsx(fayllar.map((x, i) => ({ nom: x.nom, faylNomi: fayl[i].faylNomi, hisob: h[i] })), { zakazchik: 'Дирекция', pudratchi: 'ООО Подрядчик' });
    namunaSaqla('oferta_paket_svod.xlsx', svod);
    const zip = unzipSync(paketZip([...fayl.map((x) => ({ nom: x.faylNomi, bytes: x.bytes })), { nom: 'ПАКЕТ_СВОД_ОФЕРТЫ_2026-09-25.xlsx', bytes: svod }]));
    expect(Object.keys(zip).sort()).toEqual(['Автосалон_ОФЕРТА_2026-09-25.xlsx', 'Амфитеатр_ОФЕРТА_2026-09-25.xlsx', 'ПАКЕТ_СВОД_ОФЕРТЫ_2026-09-25.xlsx']);
    const t = hujjatTekshir(svod);
    expect(t.taqiqlangan).toEqual([]);
    expect(t.dollarFormulalar).toEqual([]);
    expect(t.keshsizFormulalar).toEqual([]);
    expect(imzoRollariBormi(t, ['ЗАКАЗЧИК', 'ПОДРЯДЧИК']).yoq).toEqual([]);
    const itogo = t.varaqlar[0].kataklar.find((k) => k.f?.startsWith('SUM(D'))!;
    expect(Number(itogo.v)).toBeCloseTo((h[0].yakuniyOferta ?? NaN) + (h[1].yakuniyOferta ?? NaN), 2);
    for (const x of fayl) expect(hujjatTekshir(x.bytes).dollarFormulalar).toEqual([]);
  });
});

describe('P4.1 — Oferta parser va yagona smeta anatomiyasi (ustun xaritasi golden)', () => {
  it('sintetik ABC4 RES shaklida anatomiya va Oferta ustunlari aynan mos (farq bo‘lsa dalil sifatida ko‘rinadi)', async () => {
    const t = ofertaResursVaraqlariniAniqla(await readXlsx(kitob(resVaraq(RES(1000)))));
    const res = t.find((s) => s.nom === 'RES')!;
    expect(res.anatomiya?.farqlar).toEqual([]);
    expect(res.anatomiya?.mos).toBe(true);
    expect(res.evidence.some((e) => e.startsWith('anatomiya ustun xaritasi farq qiladi'))).toBe(false);
  });
});

describe('P4.2–P4.4 — podval foizi katakda, fayldagi foizlar, asosiy narx tanlovi', () => {
  const RES_KATAK: Katak[][] = [
    ['№№', 'НАИМЕНОВАНИЕ РЕСУРСА', 'ЕД.ИЗМ', 'КОЛ-ВО', 'ЦЕНА', 'СУММА'],
    [1, 2, 3, 4, 5, 6],
    ['СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ'],
    [1, 'ПЕСОК', 'М3', 10, 1000, { f: 'D4*E4', v: 10000 }],
    [null, 'ИТОГО', 'СУМ', null, null, { f: 'SUM(F4:F4)', v: 10000 }],
    // Foiz yozuvda emas — E katagida (0,05) va D katagida "2%".
    [null, 'ТРАНСПОРТНЫЕ РАСХОДЫ', 'СУМ', null, 0.05, { f: 'F5*E6', v: 500 }],
    [null, 'ЗАГОТОВИТЕЛЬНО-СКЛАДСКИЕ РАСХОДЫ', 'СУМ', '2%', null, 200],
  ];

  it('P4.2: foiz C/D/E kataklaridan o‘qiladi; P4.3: barcha varaqlarda bir xil — taklif, farqli — ziddiyat', async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, resVaraq(RES_KATAK), 'RES1');
    const ikkinchi = RES_KATAK.map((r) => [...r]);
    ikkinchi[3] = [1, 'ЩЕБЕНЬ', 'М3', 10, 1000, { f: 'D4*E4', v: 10000 }]; // boshqa resurs — RES1 ning dublikati emas
    ikkinchi[6] = [null, 'ЗАГОТОВИТЕЛЬНО-СКЛАДСКИЕ РАСХОДЫ', 'СУМ', '3%', null, 300];
    XLSX.utils.book_append_sheet(wb, resVaraq(ikkinchi), 'RES2');
    const t = ofertaResursVaraqlariniAniqla(await readXlsx(new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer)));
    const q = ofertaTanlanganQatorlari(t, ['RES1', 'RES2']);
    expect(q.find((x) => x.sourceSheet === 'RES1' && x.rol === 'TRANSPORT')?.katakFoizlari).toEqual([5]);
    expect(q.find((x) => x.sourceSheet === 'RES1' && x.rol === 'STORAGE')?.katakFoizlari).toEqual([2]);
    const f = fayldagiFoizlar(q);
    expect(f.taklif).toEqual([{ kod: 'ТРАНСПОРТ_МАТЕРИАЛ', foiz: 5, varaqlar: ['RES1', 'RES2'] }]);
    expect(f.ziddiyat.map((z) => [z.kod, z.qiymatlar.map((x) => x.foiz)])).toEqual([['СКЛАДСКИЕ_МАТЕРИАЛ', [2, 3]]]);
    // Podval hisobi katakdagi foiz bilan: transport = taklif ИТОГО × 5%.
    const h = ofertaHisobla(ofertaTanlanganQatorlari(t, ['RES1']), foiz10);
    const tr = h.qatorlar.find((x) => x.rol === 'TRANSPORT')!;
    expect(tr.podval).toMatchObject({ tur: 'foiz', foiz: 5 });
    expect(tr.pudratchiSumma).toBe(450);
  });

  it('P4.4: "smeta narxi har xil" guruhida operator tanlagan asosiy narx qo‘llanadi', () => {
    const q = (id: string, narx: number) => ({ sourceId: id, sourceSheet: id, sourceRow: 5, tartibRaqami: 1, shifr: null, nom: 'ЦЕМЕНТ', birlik: 'Т', hajm: 1, smetaBirlikNarx: narx, smetaSumma: narx, rol: 'RESOURCE' as const, hisobTuri: 'birlik' as const, kategoriya: 'МАТ' as const, kategoriyaManbasi: 'nom' as const });
    const rows = [q('a', 100), q('b', 100), q('c', 120)];
    const kalit = ofertaHisobla(rows, foiz10).guruhlar[0].kalit;
    expect(new Set(ofertaHisobla(rows, foiz10).qatorlar.map((x) => x.pudratchiBirlikNarx))).toEqual(new Set([90]));
    const h = ofertaHisobla(rows, { ...foiz10, asosNarxTanlovi: { [kalit]: 120 } });
    expect(new Set(h.qatorlar.map((x) => x.pudratchiBirlikNarx))).toEqual(new Set([108]));
  });
});
