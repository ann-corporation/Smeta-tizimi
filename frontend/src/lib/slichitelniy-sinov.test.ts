import { describe, expect, it } from 'vitest';
import type { T2Qator, T2QatorHolat } from '../api/supabase';
import { slichitelniyHujjatXlsx, slichitelniyModeli, QOSHIMCHA_BOLIM_NOMI } from './slichitelniy-vedomost';
import type { SvodYaxlit } from './svod-yaxlit';

// Sinov (real Stella 152 topilmalari) — sintetik ma'lumot bilan.
const q = (id: number, ota: number | null, tur: string, hajm: number | null, o: Partial<T2Qator> = {}): T2Qator => ({
  id, obyekt_id: 1, obyekt: null, kompaniya_id: 1, ota_id: ota, daraja: 0, tartib: id, tur, kod: null, nom: `Q${id}`, birlik: 'м3', hajm, narx: tur === 'bl' || tur === 'rz' ? null : 1000,
  summa: null, kat: null, narx_usul: null, qoshimcha: false, zamena: false, xom_qator: null, versiya: 1, norma: null, ...o,
} as unknown as T2Qator);
const h = (id: number, fakt: number | null, f2 = 0): T2QatorHolat => ({ qator_id: id, fakt_hajm: fakt, f2_hajm: f2, f2_summa: f2 * 1000 } as unknown as T2QatorHolat);

describe('Slichitelniy: real obyekt topilmalari', () => {
  it('svod yaxlit bo‘limi ichidagi qo‘shimcha qatorlar «ДОПОЛНИТЕЛЬНЫЕ РАБОТЫ» ga ko‘chmaydi, svod taqsimi ishlaydi; bo‘lim tashqarisidagi qo‘shimchaning smetasi 0', () => {
    const rows = [
      q(1, null, 'rz', null, { nom: 'СВОД БО‘ЛИМ', qoshimcha: true }),
      q(2, 1, 'bl', 2, { qoshimcha: true }), q(3, 2, 'mat', 2, { qoshimcha: true }),
      q(4, null, 'rz', null, { nom: 'ОБЫЧНЫЙ' }),
      q(5, 4, 'bl', 3, { qoshimcha: true }), q(6, 5, 'mat', 3, { qoshimcha: true }),
    ];
    const svod: SvodYaxlit = { qqssiz: 4000, barglar: 2000, summasiz: 0, bolimlar: [{ id: 1, qator_id: 1, nom: 'S', svod_summa: 4480, qqs_stavka: 12, qqssiz: 4000, barglar: 2000 }] } as unknown as SvodYaxlit;
    const m = slichitelniyModeli(rows, [h(2, 1), h(3, 1, 1), h(5, 1), h(6, 1, 1)], { svodYaxlit: svod });
    expect(m.qatorlar.find((x) => x.nom === QOSHIMCHA_BOLIM_NOMI)).toBeTruthy();
    const lump = m.qatorlar.find((x) => x.id === 3)!;
    expect(lump.yaxlitTaqsim).toBe(1);
    expect(lump.smetaSumma).toBe(4000); // svod summasi (QQS siz), ko‘chirilmagan
    const tashqari = m.qatorlar.find((x) => x.id === 6)!;
    expect([tashqari.smetaHajm, tashqari.smetaSumma]).toEqual([0, 0]); // asl smetada yo‘q
    expect(tashqari.farqSumma).toBe(1000); // fakt 1 × 1000 − 0
    // pereraschet: to‘g‘ri narxdagi fakt − Ф-2 (svod taqsimi doplataga ta'sir qilmaydi): lump 1000−1000=0
    expect(lump.doplataSumma).toBe(0);
  });

  it('norma × ish hajmi formulasi faqat keshni aynan qaytarsa yoziladi (7 xonali hajm — qiymat)', async () => {
    const rows = [q(1, null, 'rz', null), q(2, 1, 'bl', 4337.9), q(3, 2, 'mat', 109.0244407, { norma: 0.025133 })];
    const m = slichitelniyModeli(rows, [h(2, 4337.9), h(3, 109.0244407)]);
    const { bytes } = slichitelniyHujjatXlsx(m, { obyektNomi: 'О', sana: '2026-11-14' });
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
    const ws = wb.getWorksheet('Сличительная ведомость')!;
    let topildi = false;
    ws.eachRow((row) => { if (String(row.getCell(3).value) === 'Q3') { topildi = true; expect(typeof row.getCell(5).value).toBe('number'); } });
    expect(topildi).toBe(true);
  });

  it('«Плюсы и минусы» varag‘i: eng katta farqlar, ± ustuni Ф-2 farqiga teng', async () => {
    const rows = [q(1, null, 'rz', null), q(2, 1, 'bl', 1), q(3, 2, 'mat', 10), q(4, 2, 'mat', 5)];
    const m = slichitelniyModeli(rows, [h(3, 10, 4), h(4, 0, 5)]);
    const { bytes } = slichitelniyHujjatXlsx(m, { obyektNomi: 'О', sana: '2026-11-14' });
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
    const ws = wb.getWorksheet('Плюсы и минусы')!;
    const matn: string[] = [];
    ws.eachRow((row) => matn.push(String(row.getCell(7).value ?? '')));
    expect(matn.some((s) => s.startsWith('ПЛЮС'))).toBe(true);
    expect(matn.some((s) => s.startsWith('МИНУС: ПРЕДЪЯВЛЕНО ПО Ф-2, ФАКТИЧЕСКИ НЕ ВЫПОЛНЕНО'))).toBe(true);
  });
});

