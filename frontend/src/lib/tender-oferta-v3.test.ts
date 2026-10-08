import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import * as XLSX from 'xlsx';
import { readXlsx } from './f2-import-parse';
import { ofertaResursVaraqlariniAniqla, ofertaTanlanganQatorlari } from './tender-oferta-parser';
import { ofertaHisobla, ofertaResursKaliti, type OfertaQator } from './tender-oferta';
import { formulaKochir, tenderOfertaXlsx } from './tender-oferta-export';
import { paketFaylHisobi, paketQatorlari, paketSvodXlsx, paketZip, type OfertaPaketFayl } from './tender-oferta-paket';
import { NAKRUTKA_STANDART } from './nakrutka-kaskad';

type Katak = string | number | null | { f: string; v?: number };

/** ABC4 RES_A shakli: sarlavha, 1..6 raqamlar, materiallar, podval foizlari. */
function resVaraq(qator: Katak[][], izoh?: { ref: string; f: string }) {
  const ws = XLSX.utils.aoa_to_sheet(qator.map((r) => r.map((c) => (c && typeof c === 'object' ? null : c))));
  qator.forEach((r, ri) => r.forEach((c, ci) => {
    if (c && typeof c === 'object') ws[XLSX.utils.encode_cell({ r: ri, c: ci })] = { t: 'n', f: c.f, v: c.v ?? 0 };
  }));
  if (izoh) ws[izoh.ref] = { t: 'n', f: izoh.f, v: 1 };
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: qator.length - 1, c: izoh ? 7 : 5 } });
  return ws;
}

const ASOSIY: Katak[][] = [
  ['НАИМЕНОВАНИЕ СТРОЙКИ: SINOV'],
  [],
  ['№№', 'НАИМЕНОВАНИЕ РЕСУРСА', 'ЕД.ИЗМ', 'КОЛ-ВО', 'ЦЕНА', 'СУММА'],
  [1, 2, 3, 4, 5, 6],
  ['СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ'],
  [1, 'ПЕСОК', 'М3', 10, 1000, { f: 'D6*E6', v: 10000 }],
  [2, 'ЦЕМЕНТ', 'Т', 2, 5000, { f: 'D7*E7', v: 10000 }],
  [null, 'ИТОГО', 'СУМ', null, null, { f: 'SUM(F6:F7)', v: 20000 }],
  [null, 'ЗАГОТОВИТЕЛЬНО-СКЛАДСКИЕ РАСХОДЫ =2%  И  М/К=0,75%', 'СУМ', null, 0.02, { f: 'F8*E9', v: 400 }],
  [null, 'ТРАНСПОРТНЫЕ УСЛУГИ=5%', 'СУМ', null, null, 1000],
  [null, 'ВСЕГО С УЧЕТОМ ЗАГОТОВИТЕЛЬНО-СКЛАДСКИХ РАСХОДОВ И ТРАНСПОРТА', 'СУМ', null, null, { f: 'SUM(F8:F10)', v: 21400 }],
];

function kitob(varaqlar: Array<{ nom: string; ws: XLSX.WorkSheet; yashirin?: boolean }>): Uint8Array {
  const wb = XLSX.utils.book_new();
  for (const v of varaqlar) XLSX.utils.book_append_sheet(wb, v.ws, v.nom);
  wb.Workbook = { Sheets: varaqlar.map((v) => ({ name: v.nom, Hidden: v.yashirin ? 1 : 0 })) } as XLSX.WBProps;
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx', compression: true }) as ArrayBuffer);
}

async function tahlil(bytes: Uint8Array) {
  const t = ofertaResursVaraqlariniAniqla(await readXlsx(bytes));
  const tan = t.filter((s) => s.role === 'res' && !s.yashirin).map((s) => s.nom);
  return { t, tan, q: ofertaTanlanganQatorlari(t, tan) };
}

const foiz10 = { sozlama: { rejim: 'foiz' as const, yon: 'pasaytirish' as const, foiz: 10 }, nakrutka: NAKRUTKA_STANDART };
const katak = (xml: string, ref: string) => xml.match(new RegExp(`<c r="${ref}"[^>]*?(?:/>|>([\\s\\S]*?)</c>)`));

describe('oferta v3 — hujjat shakli', () => {
  it('yashirin varaq o‘qiladi, belgilanadi va sukut tanlovga kirmaydi', async () => {
    const { t, tan } = await tahlil(kitob([{ nom: 'RES', ws: resVaraq(ASOSIY) }, { nom: 'ESKI', ws: resVaraq(ASOSIY), yashirin: true }]));
    expect(t.find((s) => s.nom === 'ESKI')?.yashirin).toBe(true);
    expect(tan).toEqual(['RES']);
  });

  it('ustunlar F dan keyin darhol (G/H/I); raqamlash 7-8-9; podval formulasi ko‘chadi, koeffitsient katagi joyida', async () => {
    const bytes = kitob([{ nom: 'RES', ws: resVaraq(ASOSIY) }]);
    const { t, tan, q } = await tahlil(bytes);
    const hisob = ofertaHisobla(q, foiz10);
    const n = await tenderOfertaXlsx({ manbaFaylNomi: 'r.xlsx', manbaBytes: bytes, tanlanganVaraqlar: tan, tahlillar: t, hisob, imzo: { zakazchik: 'OOO BUYURTMACHI', pudratchi: '' } });
    expect(n.ustunlar.RES).toEqual({ hajm: 'G', narx: 'H', summa: 'I', kategoriya: 'J' });
    const xml = strFromU8(unzipSync(n.bytes)['xl/worksheets/sheet1.xml']);
    expect(katak(xml, 'G3')?.[1]).toContain('КОЛ-ВО');
    expect(katak(xml, 'I4')?.[1]).toContain('<v>9</v>');
    expect(katak(xml, 'I8')?.[1]).toContain('<f>SUM(I6:I7)</f>');
    // =F8*E9 → =ROUND(I8*E9,2): E9 (0,02 koeffitsient) asl joyida qoladi.
    expect(katak(xml, 'I9')?.[1]).toContain('<f>ROUND(I8*E9,2)</f>');
    // Formula yo'q, faqat qiymat (1000 = 5% × 20000) — yozuvdagi foiz tushuniladi.
    expect(katak(xml, 'I10')?.[1]).toContain('<f>ROUND(I8*5/100,2)</f>');
    expect(katak(xml, 'I11')?.[1]).toContain('<f>SUM(I8:I10)</f>');
    const r = (nom: string) => hisob.qatorlar.find((x) => x.nom.startsWith(nom))!;
    expect(r('ИТОГО').pudratchiSumma).toBe(18000);
    expect(r('ЗАГОТОВИТЕЛЬНО').pudratchiSumma).toBe(360);
    expect(r('ТРАНСПОРТНЫЕ').pudratchiSumma).toBe(900);
    expect(r('ВСЕГО С УЧЕТОМ').pudratchiSumma).toBe(19260);
    // Imzo: nom kiritilgan tomon — nomi bilan, kiritilmagani — chiziq.
    expect(xml).toContain('ЗАКАЗЧИК:  OOO BUYURTMACHI');
    expect(xml).toMatch(/ПОДРЯДЧИК:  _{10,}/);
    // Yashirin texnik КАТЕГОРИЯ ustuni.
    expect(xml).toMatch(/<col min="10" max="10"[^>]*hidden="1"/);
  });

  it('G ustunida egasining yozuvi bo‘lsa, unga tegilmaydi — blok undan keyin', async () => {
    const bytes = kitob([{ nom: 'RES', ws: resVaraq(ASOSIY, { ref: 'H6', f: 'E6*2' }) }]);
    const { t, tan, q } = await tahlil(bytes);
    const n = await tenderOfertaXlsx({ manbaFaylNomi: 'r.xlsx', manbaBytes: bytes, tanlanganVaraqlar: tan, tahlillar: t, hisob: ofertaHisobla(q, foiz10) });
    expect(n.ustunlar.RES.hajm).toBe('I');
    const xml = strFromU8(unzipSync(n.bytes)['xl/worksheets/sheet1.xml']);
    expect(katak(xml, 'H6')?.[1]).toContain('<f>E6*2</f>');
  });

  it('asl podvalda qo‘lda 0 (склад 2%+М/К 0,75%, кабель 1,5%) — bo‘lim resurslaridan kategoriya bo‘yicha hisoblanadi', async () => {
    const rows: Katak[][] = [
      ['НАИМЕНОВАНИЕ СТРОЙКИ: SINOV'], [],
      ['№№', 'НАИМЕНОВАНИЕ РЕСУРСА', 'ЕД.ИЗМ', 'КОЛ-ВО', 'ЦЕНА', 'СУММА'],
      [1, 2, 3, 4, 5, 6],
      ['СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ'],
      [1, 'ПЕСОК', 'М3', 10, 1000, { f: 'D6*E6', v: 10000 }],
      [2, 'КАБЕЛЬ СИЛОВОЙ ВВГ 3Х2,5', 'М', 100, 100, { f: 'D7*E7', v: 10000 }],
      [3, 'КОНСТРУКЦИИ СТАЛЬНЫЕ', 'Т', 1, 20000, { f: 'D8*E8', v: 20000 }],
      [null, 'ИТОГО', 'СУМ', null, null, { f: 'SUM(F6:F8)', v: 40000 }],
      [null, 'ЗАГОТОВИТЕЛЬНО-СКЛАДСКИЕ РАСХОДЫ =2%  И  М/К=0,75%', 'СУМ', null, null, 0],
      [null, 'ТРАНСПОРТНЫЕ УСЛУГИ НА КАБЕЛЬНО ПРОВОД.ПРОДУК.=1,5%', 'СУМ', null, null, 0],
      [null, 'ТРАНСПОРТНЫЕ УСЛУГИ=5%', 'СУМ', null, null, { f: 'F9*0.05', v: 2000 }],
      [null, 'ВСЕГО С УЧЕТОМ ЗАГОТОВИТЕЛЬНО-СКЛАДСКИХ РАСХОДОВ И ТРАНСПОРТА', 'СУМ', null, null, { f: 'SUM(F9:F12)', v: 42000 }],
    ];
    const bytes = kitob([{ nom: 'RES', ws: resVaraq(rows) }]);
    const { t, tan, q } = await tahlil(bytes);
    const hisob = ofertaHisobla(q, { ...foiz10, sozlama: { rejim: 'foiz', yon: 'pasaytirish', foiz: 0 } });
    const kat = (nom: string) => hisob.qatorlar.find((x) => x.nom.startsWith(nom))!;
    expect([kat('ПЕСОК').samaraliKategoriya, kat('КАБЕЛЬ').samaraliKategoriya, kat('КОНСТРУКЦИИ').samaraliKategoriya]).toEqual(['МАТ', 'КАБ', 'М/К']);
    // склад = (10000 + 10000) × 2% + 20000 × 0,75% = 400 + 150
    expect(kat('ЗАГОТОВИТЕЛЬНО').pudratchiSumma).toBe(550);
    expect(kat('ТРАНСПОРТНЫЕ УСЛУГИ НА КАБЕЛЬНО').pudratchiSumma).toBe(150);
    expect(kat('ТРАНСПОРТНЫЕ УСЛУГИ=5%').pudratchiSumma).toBe(2000);
    expect(kat('ВСЕГО С УЧЕТОМ').pudratchiSumma).toBe(40000 + 550 + 150 + 2000);
    const n = await tenderOfertaXlsx({ manbaFaylNomi: 'r.xlsx', manbaBytes: bytes, tanlanganVaraqlar: tan, tahlillar: t, hisob });
    const xml = strFromU8(unzipSync(n.bytes)['xl/worksheets/sheet1.xml']);
    expect(katak(xml, 'I10')?.[1]).toContain('<f>ROUND((SUMIFS(I6:I8,J6:J8,&quot;МАТ&quot;)+SUMIFS(I6:I8,J6:J8,&quot;КАБ&quot;))*2/100+(SUMIFS(I6:I8,J6:J8,&quot;М/К&quot;))*0.75/100,2)</f>');
    expect(katak(xml, 'I11')?.[1]).toContain('<f>ROUND((SUMIFS(I6:I8,J6:J8,&quot;КАБ&quot;))*1.5/100,2)</f>');
    expect(katak(xml, 'I13')?.[1]).toContain('<f>SUM(I9:I12)</f>');
    expect(xml).not.toMatch(/<f>[^<]*\$[^<]*<\/f>/);
  });

  it('uskuna bloki: foizsiz СКЛАД (asl 0) — koeffitsient 1,2%; transport asl formula bilan', async () => {
    const rows: Katak[][] = [
      ['НАИМЕНОВАНИЕ СТРОЙКИ: SINOV'], [],
      ['№№', 'НАИМЕНОВАНИЕ РЕСУРСА', 'ЕД.ИЗМ', 'КОЛ-ВО', 'ЦЕНА', 'СУММА'],
      [1, 2, 3, 4, 5, 6],
      ['ОБОРУДОВАНИЕ'],
      [1, 'НАСОС ФИЛЬТРАЦИОННЫЙ 50М3/H', 'ШТ', 4, 25000, { f: 'D6*E6', v: 100000 }],
      [null, 'ИТОГО', 'СУМ', null, null, { f: 'SUM(F6:F6)', v: 100000 }],
      [null, 'ЗАГОТОВИТЕЛЬНО-СКЛАДСКИЕ РАСХОДЫ', 'СУМ', null, null, 0],
      [null, 'ТРАНСПОРТНЫЕ УСЛУГИ', 'СУМ', null, null, { f: 'F7*0.02', v: 2000 }],
      [null, 'ИТОГО ОБОРУДОВАНИЕ С УЧЕТОМ ЗАГОТОВИТЕЛЬНО-СКЛАДСКИХ И ТРАНСПОРТНЫХ', 'СУМ', null, null, { f: 'SUM(F7:F9)', v: 102000 }],
    ];
    const bytes = kitob([{ nom: 'RES', ws: resVaraq(rows) }]);
    const { q } = await tahlil(bytes);
    const h = ofertaHisobla(q, { ...foiz10, sozlama: { rejim: 'foiz', yon: 'pasaytirish', foiz: 0 } });
    const r = (nom: string) => h.qatorlar.find((x) => x.nom.startsWith(nom))!;
    expect(r('НАСОС').samaraliKategoriya).toBe('ОБ');
    expect(r('ЗАГОТОВИТЕЛЬНО').pudratchiSumma).toBe(1200);
    expect(r('ТРАНСПОРТНЫЕ').pudratchiSumma).toBe(2000);
    expect(r('ИТОГО ОБОРУДОВАНИЕ').pudratchiSumma).toBe(103200);
  });

  it('formulaKochir: boshqa varaq havolasi va ko‘chmaydigan formula rad etiladi', () => {
    const m = new Map([[5, 8]]);
    expect(formulaKochir("F8*'RES 2'!E9", m, true)).toBeNull();
    expect(formulaKochir('E9*1000', m, true)).toBeNull();
    expect(formulaKochir('SUM($F$8:F10)', m, true)).toBe('SUM($I$8:I10)');
    expect(formulaKochir('LOG10(F8)', m, true)).toBe('LOG10(I8)');
  });
});

describe('oferta v3 — material bir marta, paket', () => {
  const q = (o: Partial<OfertaQator>): OfertaQator => ({
    sourceId: 'x', sourceSheet: 'A', sourceRow: 1, tartibRaqami: 1, shifr: null, nom: 'ВОДА', birlik: 'М3', hajm: 1, smetaBirlikNarx: 100,
    smetaSumma: 100, rol: 'RESOURCE', hisobTuri: 'birlik', kategoriya: 'МАТ', kategoriyaManbasi: 'bolim', ...o,
  });

  it('kalit: NBSP/qator ko‘chishi/Ё/tinish belgilari farq qilmaydi, 2,0 va 20 farqli', () => {
    expect(ofertaResursKaliti(q({ nom: 'КАБЕЛЬ ВВГ-3х2,5' }))).toBe(ofertaResursKaliti(q({ nom: 'кабель ввг 3х2.5' })));
    expect(ofertaResursKaliti(q({ nom: 'ЩЁТКА' }))).toBe(ofertaResursKaliti(q({ nom: 'ЩЕТКА' })));
    expect(ofertaResursKaliti(q({ nom: 'ТРУБА 2,0Х2' }))).not.toBe(ofertaResursKaliti(q({ nom: 'ТРУБА 20Х2' })));
  });

  it('bir material turli varaqlarda: yagona kategoriya yoyiladi, narx bir xil (asosiy), farq ogohlantirish', () => {
    const rows = [
      q({ sourceId: 'a', sourceSheet: 'A', smetaBirlikNarx: 100, smetaSumma: 100 }),
      q({ sourceId: 'b', sourceSheet: 'B', smetaBirlikNarx: 100, smetaSumma: 100 }),
      q({ sourceId: 'c', sourceSheet: 'C', smetaBirlikNarx: 120, smetaSumma: 120, kategoriya: 'UNKNOWN', kategoriyaManbasi: 'yoq' }),
    ];
    const h = ofertaHisobla(rows, foiz10);
    expect(h.guruhlar).toHaveLength(1);
    expect(new Set(h.qatorlar.map((x) => x.pudratchiBirlikNarx))).toEqual(new Set([90]));
    expect(h.qatorlar.find((x) => x.sourceId === 'c')).toMatchObject({ samaraliKategoriya: 'МАТ', kategoriyaManbasi: 'guruh' });
    expect(h.guruhlar[0].muammolar).toContain('NARX_HAR_XIL');
    expect(h.halQilinmagan).toBe(0);
  });

  it('paket: ikki obyekt birga narxlanadi, har biri o‘z yig‘indisi; svod va ZIP', async () => {
    const b1 = kitob([{ nom: 'RES', ws: resVaraq(ASOSIY) }]);
    const b2 = kitob([{ nom: 'RES', ws: resVaraq(ASOSIY) }]);
    const f = async (id: string, nom: string, b: Uint8Array): Promise<OfertaPaketFayl> => {
      const t = ofertaResursVaraqlariniAniqla(await readXlsx(b));
      return { id, nom, faylNomi: `${nom}.xlsx`, tahlillar: t, tanlanganVaraqlar: ['RES'] };
    };
    const fayllar = [await f('p1', 'Obyekt 1', b1), await f('p2', 'Obyekt 2', b2)];
    const qatorlar = paketQatorlari(fayllar);
    expect(new Set(qatorlar.map((x) => x.sourceId)).size).toBe(qatorlar.length);
    expect(qatorlar[0].sourceSheet).toBe('Obyekt 1 › RES');
    const hisob = ofertaHisobla(qatorlar, { ...foiz10, manualNarxlar: { 'p1|RES::r6': 700, 'p2|RES::r6': 700 } });
    const h1 = paketFaylHisobi(hisob, fayllar[0], true, NAKRUTKA_STANDART, 'kaskad');
    const h2 = paketFaylHisobi(hisob, fayllar[1], true, NAKRUTKA_STANDART, 'kaskad');
    expect(h1.qatorlar[0].sourceId.startsWith('RES::')).toBe(true);
    expect(h1.qatorlar.every((x) => x.sourceSheet === 'RES')).toBe(true);
    expect(h1.togridanJami + h2.togridanJami).toBeCloseTo(hisob.togridanJami, 6);
    expect(h1.yakuniyOferta).not.toBeNull();
    const n1 = await tenderOfertaXlsx({ manbaFaylNomi: 'Obyekt 1.xlsx', manbaBytes: b1, tanlanganVaraqlar: ['RES'], tahlillar: fayllar[0].tahlillar, hisob: h1 });
    expect(strFromU8(unzipSync(n1.bytes)['xl/worksheets/sheet1.xml'])).toContain('<f>SUM(I6:I7)</f>');
    const svod = paketSvodXlsx([{ nom: 'Obyekt 1', faylNomi: 'a', hisob: h1 }, { nom: 'Obyekt 2', faylNomi: 'b', hisob: h2 }], { zakazchik: 'Z' });
    const ws = XLSX.read(svod, { type: 'array', cellFormula: true }).Sheets['СВОД ПАКЕТА'];
    const itogo = Object.entries(ws).find(([k, c]) => !k.startsWith('!') && typeof (c as { f?: string }).f === 'string' && (c as { f: string }).f.startsWith('SUM(D'))!;
    expect((itogo[1] as { f: string }).f).toMatch(/^SUM\(D\d+:D\d+\)$/);
    expect((itogo[1] as { v: number }).v).toBeCloseTo((h1.yakuniyOferta ?? 0) + (h2.yakuniyOferta ?? 0), 2);
    const zip = unzipSync(paketZip([{ nom: 'a.xlsx', bytes: n1.bytes }, { nom: 'a.xlsx', bytes: n1.bytes }]));
    expect(Object.keys(zip).sort()).toEqual(['a (2).xlsx', 'a.xlsx']);
  });
});
