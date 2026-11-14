import { describe, expect, it } from 'vitest';
import type { T2Qator, T2QatorHolat } from '../api/supabase';
import { slichitelniyHujjatXlsx, slichitelniyModeli } from './slichitelniy-vedomost';
import { slichitelniyTsiklYuki } from './slichitelniy-tsikl';
import { yaxlitQatorIdlari, type SvodYaxlit } from './svod-yaxlit';

/* Sintetik. Svod (yaxlit) bo'lim — bitta butun summa: uning ichidagi qatorlar bo'yicha fakt va Ф-2 turli taqsimlanishi mumkin
 * (Ф-2 qayta yozilganda qator tarkibi o'zgaradi), shuning uchun «к доплате / к снятию» BO'LIM DARAJASIDA sof farq bilan olinadi
 * (ichki + va − bir-birini qoplaydi). Oddiy bo'limlarda — qator bo'yicha (qoplamaydi). */
const q = (id: number, ota: number | null, tur: string, hajm: number | null, o: Partial<T2Qator> = {}): T2Qator => ({
  id, obyekt_id: 1, obyekt: null, kompaniya_id: 1, ota_id: ota, daraja: 0, tartib: id, tur, kod: null, nom: `Q${id}`, birlik: 'м3', hajm, narx: tur === 'bl' || tur === 'rz' ? null : 1000,
  summa: null, kat: tur === 'bl' || tur === 'rz' ? null : 'МАТ', narx_usul: null, qoshimcha: false, zamena: false, xom_qator: null, versiya: 1, norma: null, ...o,
} as unknown as T2Qator);
const h = (id: number, fakt: number | null, f2h: number): T2QatorHolat => ({ qator_id: id, fakt_hajm: fakt, fakt_summa: fakt == null ? null : fakt * 1000, f2_hajm: f2h, f2_summa: f2h * 1000 } as unknown as T2QatorHolat);

const ROWS = [
  q(1, null, 'rz', null, { nom: 'СВОД' }), q(2, 1, 'bl', 3),
  q(3, 2, 'mat', 10), q(4, 2, 'mat', 10), q(5, 2, 'mat', 10),
  q(10, null, 'rz', null, { nom: 'ОБЫЧНЫЙ' }), q(11, 10, 'bl', 3),
  q(12, 11, 'mat', 10), q(13, 11, 'mat', 10),
];
// svod: 3: fakt 8 / F-2 5 (+3000); 4: fakt 4 / F-2 7 (−3000); 5: fakt 9 / F-2 5 (+4000) → bo'lim sofi +4000.
// oddiy: 12: fakt 8 / F-2 5 (+3000); 13: fakt 4 / F-2 7 (−3000) → qator bo'yicha.
const HOLAT = [h(3, 8, 5), h(4, 4, 7), h(5, 9, 5), h(12, 8, 5), h(13, 4, 7)];
const SVOD = { qqssiz: 30000, barglar: 30000, summasiz: 0, bolimlar: [{ id: 1, qator_id: 1, nom: 'S', svod_summa: 33600, qqs_stavka: 12, qqssiz: 30000, barglar: 30000, asos: 'svod', dalil: {} }] } as unknown as SvodYaxlit;

describe('slichitelniy: svod bo‘limi — к доплате / к снятию bo‘lim darajasida (sof)', () => {
  const m = slichitelniyModeli(ROWS, HOLAT, { svodYaxlit: SVOD });
  it('svod bo‘limida ichki + va − qoplanadi; oddiy bo‘limda qator bo‘yicha qoladi; qator ustunlari o‘zgarmaydi', () => {
    expect(m.qatorlar.filter((r) => r.id >= 3 && r.id <= 5).map((r) => r.doplataSumma)).toEqual([3000, -3000, 4000]);
    expect(m.pereraschet.doplata).toBe(4000 + 3000);
    expect(m.pereraschet.snyatie).toBe(-3000);
    expect(m.pereraschet.net).toBe(4000 + 3000 - 3000);
  });
  it('doplata + snyatie = net (jami farq saqlanadi)', () => {
    expect(m.pereraschet.doplata + m.pereraschet.snyatie).toBe(m.pereraschet.net);
  });
  it('sikl yuki: svod bo‘limi bitta ishorali, sof summaga teng qoralama qatorlari beradi; jami model bilan teng', () => {
    const y = slichitelniyTsiklYuki(m, yaxlitQatorIdlari(ROWS, SVOD));
    expect(y.doplataJami).toBe(m.pereraschet.doplata);
    expect(y.snyatieJami).toBe(m.pereraschet.snyatie);
    const svodD = y.doplata.filter((x) => x.qatorId >= 3 && x.qatorId <= 5);
    expect(svodD.reduce((s, x) => s + x.certifiedAmount, 0)).toBe(4000);
    expect(y.snyatie.some((x) => x.qatorId >= 3 && x.qatorId <= 5)).toBe(false);
    for (const x of svodD) expect(x.certifiedAmount / x.certifiedQuantity).toBeCloseTo(1000, 1);
  });
  it('xlsx: ВСЕГО dagi yashirin Д+/С− kataklari model bilan teng (Свод изменений jami ham)', async () => {
    const { bytes } = slichitelniyHujjatXlsx(m, { obyektNomi: 'О', sana: '2026-11-14', svodYaxlit: SVOD, yaxlitIdlar: yaxlitQatorIdlari(ROWS, SVOD) });
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
    const ws = wb.getWorksheet('Сличительная ведомость')!;
    const kesh = (v: unknown): number => Number(v && typeof v === 'object' && 'result' in (v as object) ? (v as { result: number }).result : v);
    let d = NaN, s = NaN;
    ws.eachRow((row) => { if (String(row.getCell(3).value).startsWith('ИТОГО ПО ОБЪЕКТУ')) { d = kesh(row.getCell(21).value); s = kesh(row.getCell(22).value); } });
    expect(d).toBe(m.pereraschet.doplata);
    expect(s).toBe(m.pereraschet.snyatie);
  });
});

describe('pereraschet yopiladi: sikl qoralamalari tasdiqlansa keyingi slichitelniyda к доплате / к снятию qolmaydi', () => {
  it('oddiy qatorlar qator bo‘yicha, svod bo‘limi bo‘lim sofi bo‘yicha nolga tushadi', () => {
    const m1 = slichitelniyModeli(ROWS, HOLAT, { svodYaxlit: SVOD });
    const y = slichitelniyTsiklYuki(m1, yaxlitQatorIdlari(ROWS, SVOD));
    const qosh = new Map<number, { h: number; s: number }>();
    for (const x of [...y.doplata, ...y.snyatie]) { const a = qosh.get(x.qatorId) ?? { h: 0, s: 0 }; a.h += x.certifiedQuantity; a.s += x.certifiedAmount; qosh.set(x.qatorId, a); }
    const holat2 = HOLAT.map((x) => { const a = qosh.get(Number(x.qator_id)); return a ? ({ ...x, f2_hajm: Number(x.f2_hajm) + a.h, f2_summa: Number(x.f2_summa) + a.s } as unknown as T2QatorHolat) : x; });
    const m2 = slichitelniyModeli(ROWS, holat2, { svodYaxlit: SVOD });
    expect(m2.pereraschet.doplata).toBeCloseTo(0, 2);
    expect(m2.pereraschet.snyatie).toBeCloseTo(0, 2);
    expect(m2.pereraschet.net).toBeCloseTo(0, 2);
  });
});