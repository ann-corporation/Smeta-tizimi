import { describe, expect, it } from 'vitest';
import type { T2Qator, T2QatorHolat } from '../api/supabase';
import { QOSHIMCHA_BOLIM_ID, ozgarishSvodi, slichitelniyHujjatXlsx, slichitelniyModeli } from './slichitelniy-vedomost';
import { yaxlitQatorIdlari, type SvodYaxlit } from './svod-yaxlit';

/* Sintetik. Egasi: zamena va qo'shimcha ishlar slichitelniyda aniq ko'rinsin — zamena asl qator yonida («взамен»), asl «исключается»,
 * qo'shimcha ish alohida bo'limda, «Свод изменений» da «смета до изменений → замена → доп. работы → смета после изменений». Asl smeta o'zgarmaydi. */
const q = (id: number, ota: number | null, tur: string, hajm: number | null, o: Partial<T2Qator> = {}): T2Qator => ({
  id, obyekt_id: 1, obyekt: null, kompaniya_id: 1, ota_id: ota, daraja: 0, tartib: id, tur, kod: null, nom: `Q${id}`, birlik: 'м3', hajm, narx: tur === 'bl' || tur === 'rz' ? null : 1000,
  summa: null, kat: tur === 'bl' || tur === 'rz' ? null : 'МАТ', narx_usul: null, qoshimcha: false, zamena: false, xom_qator: null, versiya: 1, norma: null, ...o,
} as unknown as T2Qator);
const h = (id: number, fakt: number | null, f2h = 0): T2QatorHolat => ({ qator_id: id, fakt_hajm: fakt, fakt_summa: null, f2_hajm: f2h, f2_summa: f2h * 1000 } as unknown as T2QatorHolat);

const ZAM = { qoshimcha: true, zamena: true, change_type: 'REPLACEMENT' } as Partial<T2Qator>;
const ROWS = [
  q(1, null, 'rz', null, { nom: 'СМЕТА' }),
  q(2, 1, 'bl', 5), q(3, 2, 'mat', 5),               // asl (zamena bilan almashtiriladi): smeta 5 × 1000 = 5000
  q(4, 1, 'bl', 2), q(5, 4, 'mat', 2),               // oddiy ish: smeta 2000
  q(6, 1, 'bl', 5, { ...ZAM, replaces_line_id: 2 }), q(7, 6, 'mat', 5, { ...ZAM, narx: 1200 }), // zamena: reja 6000
  q(8, 1, 'bl', 2, { qoshimcha: true, change_type: 'ADDITIONAL' }), q(9, 8, 'mat', 2, { qoshimcha: true, change_type: 'ADDITIONAL', narx: 500 }), // qo'shimcha: reja 1000
];
const HOLAT = [h(3, 0), h(5, 2, 2), h(7, 5), h(9, 2)];

describe('slichitelniy: zamena asl yonida, qo‘shimcha alohida bo‘limda', () => {
  const m = slichitelniyModeli(ROWS, HOLAT);
  const idlar = (rzId: number): number[] => m.qatorlar.find((r) => r.id === rzId && r.tur === 'itogo')!.bolalar.map((i) => m.qatorlar[i].id);
  it('zamena (6) asl qator (2) bilan bir bo‘limda va uning darhol keyingi qatorida; qo‘shimcha (8) faqat «ДОПОЛНИТЕЛЬНЫЕ РАБОТЫ» da', () => {
    expect(idlar(1)).toEqual([2, 6, 4]);
    expect(idlar(QOSHIMCHA_BOLIM_ID)).toEqual([8]);
  });
  it('asl «исключается», zamena «взамен поз. N»; asl smetasi o‘zgarmaydi, zamena smetasi 0 (faqat fakt)', () => {
    const asl = m.qatorlar.find((r) => r.id === 2)!, zam = m.qatorlar.find((r) => r.id === 6)!;
    expect(asl.smetaSumma).toBe(5000);
    expect(asl.izoh).toContain('исключается (заменена поз. ' + zam.tartib + ')');
    expect(zam.izoh).toContain('взамен поз. ' + asl.tartib);
    expect(zam.smetaSumma).toBe(0);
    expect(zam.faktSumma).toBe(6000);
  });
  it('bo‘lim jami asl (−5000 fakt farqi) va zamena (+6000) ni birga ushlaydi', () => {
    const it = m.qatorlar.find((r) => r.id === 1 && r.tur === 'itogo')!;
    expect(it.smetaSumma).toBe(5000 + 2000);
    expect(it.faktSumma).toBe(0 + 2000 + 6000);
  });
  it('ozgarishSvodi: smeta до изменений → (а) исключено → (б) замена → (в) доп. работы → после изменений', () => {
    const o = ozgarishSvodi(m);
    expect(o.asl.reja).toBe(7000);
    expect(o.istisno.reja).toBe(-5000);
    expect(o.zamena.reja).toBe(6000);
    expect(o.qoshimcha.reja).toBe(1000);
    expect(o.keyin.reja).toBe(7000 - 5000 + 6000 + 1000);
    expect(o.keyin.fakt).toBe(m.jami.fakt);
    expect(o.zamena.fakt).toBe(6000);
    expect(o.qoshimcha.fakt).toBe(1000);
  });
  it('asl smeta o‘zgarmaydi: jami smeta faqat asl qatorlar yig‘indisi', () => {
    expect(m.jami.smeta).toBe(7000);
  });
});

describe('xlsx: «Свод изменений» da o‘zgarishlar bloki; «Плюсы и минусы» da svod bo‘limi bitta pozitsiya', () => {
  const ExcelJS = import('exceljs');
  it('blok qatorlari va jami (smeta после изменений) hujjatda', async () => {
    const m = slichitelniyModeli(ROWS, HOLAT);
    const { bytes } = slichitelniyHujjatXlsx(m, { obyektNomi: 'О', sana: '2026-11-14' });
    const wb = new (await ExcelJS).default.Workbook();
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
    const ws = wb.getWorksheet('Свод изменений')!;
    const kesh = (v: unknown): number => Number(v && typeof v === 'object' && 'result' in (v as object) ? (v as { result: number }).result : v);
    const satr: Record<string, number> = {};
    ws.eachRow((row) => { const t = String(row.getCell(2).value ?? ''); if (/^(смета до изменений|\(а\)|\(б\)|\(в\)|смета после)/i.test(t)) satr[t.slice(0, 12).toLowerCase()] = kesh(row.getCell(3).value); });
    expect(Object.values(satr)).toEqual([7000, -5000, 6000, 1000, 9000]);
  });
  it('svod bo‘limi ichki qatorlari ro‘yxatga alohida kirmaydi — «РАЗДЕЛ ПО СВОДУ» bitta pozitsiya', async () => {
    const R = [q(1, null, 'rz', null, { nom: 'СВОД' }), q(2, 1, 'bl', 3), q(3, 2, 'mat', 10), q(4, 2, 'mat', 10), q(5, 2, 'mat', 10)];
    const H = [h(3, 8, 5), h(4, 4, 7), h(5, 9, 5)];
    const SV = { qqssiz: 30000, barglar: 30000, summasiz: 0, bolimlar: [{ id: 1, qator_id: 1, nom: 'S', svod_summa: 33600, qqs_stavka: 12, qqssiz: 30000, barglar: 30000, asos: 'svod', dalil: {} }] } as unknown as SvodYaxlit;
    const m2 = slichitelniyModeli(R, H, { svodYaxlit: SV });
    const { bytes } = slichitelniyHujjatXlsx(m2, { obyektNomi: 'О', sana: '2026-11-14', svodYaxlit: SV, yaxlitIdlar: yaxlitQatorIdlari(R, SV) });
    const wb = new (await ExcelJS).default.Workbook();
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
    const ws = wb.getWorksheet('Плюсы и минусы')!;
    const nomlar: string[] = [];
    ws.eachRow((row) => nomlar.push(String(row.getCell(2).value ?? '')));
    expect(nomlar.filter((t) => /^Q[345]$/.test(t))).toEqual([]);
    expect(nomlar.filter((t) => t.startsWith('РАЗДЕЛ ПО СВОДУ: СВОД'))).toHaveLength(1);
  });
});
