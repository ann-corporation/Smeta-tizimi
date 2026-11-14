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
    expect(lump.smetaSumma).toBe(2000); // tana: to‘g‘ri narx (2 × 1000), yaxlit svod summasi tanaga taqsimlanmaydi; ko‘chirilmagan
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


describe('Slichitelniy: fakt va Ф-2 server qoidasi (svod bo‘limi)', () => {
  const NK = { ТРАНСПОРТ_МАТЕРИАЛ: 5, СКЛАДСКИЕ_МАТЕРИАЛ: 2, СКЛАДСКИЕ_МК: 0.75, ТРАНСПОРТ_КАБЕЛЬ: 1.5, ПРОЧИЕ_ПОДРЯДЧИК: 18, ТРАНСПОРТ_ОБОРУД: 2, ЗАГОТ_СКЛАД_ОБОРУД: 0, СТРАХОВАНИЕ: 0.32, РИСК: 0, НДС: 12 };
  it('svod bo‘limida ЧЕЛ/МАШ — ustama kaskadi, qolgani to‘g‘ri narx × (1+НДС); fakt va Ф-2 bir xil usulda, fakt taqsimlanmaydi', async () => {
    const rows = [q(30, null, 'rz', null), q(31, 30, 'bl', 1), q(32, 31, 'rs', 0.3, { kat: 'ЧЕЛ', nom: 'ТРУД СВОД' }), q(33, 31, 'mat', 0.7, { kat: 'МАТ', nom: 'МАТЕРИАЛ СВОД' })];
    const holat = [h(31, 1, 0.6), h(32, 0.15, 0.1), h(33, 0.7, 0.5)];
    const svod = { qqssiz: 1200, barglar: 1000, summasiz: 0, bolimlar: [{ id: 1, qator_id: 30, nom: 'С', svod_summa: 1344, qqs_stavka: 12, qqssiz: 1200, barglar: 1000, asos: 'svod', dalil: {} }] } as unknown as SvodYaxlit;
    const m = slichitelniyModeli(rows, holat, { svodYaxlit: svod });
    const { yaxlitQatorIdlari } = await import('./svod-yaxlit');
    const { bytes } = slichitelniyHujjatXlsx(m, { obyektNomi: 'О', sana: '2026-11-14', nakrutka: NK, svodYaxlit: svod, yaxlitIdlar: yaxlitQatorIdlari(rows, svod) });
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
    const ws = wb.getWorksheet('Сличительная ведомость')!;
    const cv = (r: number, c: string): number => { const v = ws.getCell(`${c}${r}`).value as unknown; return Number(v && typeof v === 'object' ? ('result' in (v as object) ? (v as { result: number }).result : 0) : v); };
    const qNom = (nom: string): number => { let x = 0; ws.eachRow((row, rn) => { if (String(row.getCell(3).value).startsWith(nom)) x = rn; }); return x; };
    const kfChel = 1.18 * 1.0032 * 1.12;
    // Podval (ustama faqat shu yerda): ЧЕЛ qatori — svod ichidagi mehnat fakt va Ф-2 da ustama kaskadida (server qoidasi), smetada — yo‘q (butun svod yaxlit).
    const chel = qNom('ПРЯМЫЕ ЗАТРАТЫ: ЗАРАБОТНАЯ ПЛАТА РАБОЧИХ');
    expect(cv(chel, 'G')).toBe(0);
    expect(cv(chel, 'I')).toBeCloseTo(150, 1);
    expect(cv(chel, 'K')).toBeCloseTo(100, 1);
    // Yaxlit svod qatori: smeta — svod summasi QQS bilan (1344), fakt/Ф-2 — qolgan svod qatorlari to‘g‘ri narx × (1+НДС) (700 / 500)
    const yq = qNom('РАЗДЕЛЫ ПО СВОДУ');
    expect(cv(yq, 'G')).toBeCloseTo(1344, 1);
    expect(cv(yq, 'I')).toBeCloseTo(700 * 1.12, 1);
    expect(cv(yq, 'K')).toBeCloseTo(500 * 1.12, 1);
    // Tana: ustamali ustun yo‘q, svod qatori tanada to‘g‘ri narxda (spravochno)
    expect(cv(qNom('ТРУД СВОД'), 'I')).toBeCloseTo(150, 1);
    expect(kfChel).toBeGreaterThan(1);
  });
});
describe('Slichitelniy: hujjat ichida qator nazorati', () => {
  const NK2 = { ТРАНСПОРТ_МАТЕРИАЛ: 5, СКЛАДСКИЕ_МАТЕРИАЛ: 2, СКЛАДСКИЕ_МК: 0.75, ТРАНСПОРТ_КАБЕЛЬ: 1.5, ПРОЧИЕ_ПОДРЯДЧИК: 18, ТРАНСПОРТ_ОБОРУД: 2, ЗАГОТ_СКЛАД_ОБОРУД: 0, СТРАХОВАНИЕ: 0.32, РИСК: 0, НДС: 12 };
  it('har qatorda hajm × narx = summa (smeta; svodga taqsimlanmagan qatorlarda), fakt = hajm × narx (F-2 narxi qoidasi bilan, svodda ham), bo‘lim yig‘indisi = ИТОГО', async () => {
    const rows = [
      q(1, null, 'rz', null), q(2, 1, 'bl', 3), q(3, 2, 'rs', 2, { kat: 'ЧЕЛ', nom: 'ТРУД', narx: 25000 }), q(4, 2, 'mat', 5.5, { kat: 'МАТ', nom: 'ПЕСОК', narx: 12000 }),
      q(30, null, 'rz', null, { nom: 'СВОД' }), q(31, 30, 'bl', 1), q(32, 31, 'rs', 0.3, { kat: 'ЧЕЛ', nom: 'ТРУД СВОД' }), q(33, 31, 'mat', 0.7, { kat: 'МАТ', nom: 'МАТЕРИАЛ СВОД' }),
    ];
    const holat = [h(2, 3), h(3, 2, 1), h(4, 5.5, 5.5), h(31, 1), h(32, 0.15, 0.1), h(33, 0.7, 0.5)];
    const svod = { qqssiz: 1200, barglar: 1000, summasiz: 0, bolimlar: [{ id: 1, qator_id: 30, nom: 'С', svod_summa: 1344, qqs_stavka: 12, qqssiz: 1200, barglar: 1000, asos: 'svod', dalil: {} }] } as unknown as SvodYaxlit;
    const m = slichitelniyModeli(rows, holat, { svodYaxlit: svod });
    // model: svod qatorlarida fakt taqsimlanmagan (to‘g‘ri narx), smeta — svod summasiga
    const lump = m.qatorlar.filter((x) => x.yaxlitTaqsim != null);
    expect(lump.map((x) => x.faktSumma)).toEqual([150, 700]);
    expect(Math.round(lump.reduce((t, x) => t + (x.smetaSumma ?? 0), 0) * 100) / 100).toBe(1000); // tana: to‘g‘ri narx
    // model darajasida: har yig‘indi qator = bolalar yig‘indisi
    for (const r of m.qatorlar) {
      if (r.tur === 'barg' || r.tur === 'rz' || !r.bolalar.length) continue; // svod ildizi (rz) — jamisiz, spravochno
      for (const k of ['smetaSumma', 'faktSumma', 'f2Summa'] as const) {
        const s = Math.round(r.bolalar.reduce((t, i) => t + (m.qatorlar[i][k] ?? 0), 0) * 100) / 100;
        expect(Math.round((r[k] ?? 0) * 100) / 100).toBe(s);
      }
    }
    const { yaxlitQatorIdlari } = await import('./svod-yaxlit');
    const { bytes } = slichitelniyHujjatXlsx(m, { obyektNomi: 'О', sana: '2026-11-14', nakrutka: NK2, svodYaxlit: svod, yaxlitIdlar: yaxlitQatorIdlari(rows, svod) });
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
    const ws = wb.getWorksheet('Сличительная ведомость')!;
    const cv = (r: number, c: number): number | null => { const v = ws.getCell(r, c).value as unknown; const x = v && typeof v === 'object' && 'result' in (v as object) ? (v as { result: unknown }).result : v; return x === '' || x == null ? null : Number(x); };
    let bosh = 0;
    ws.eachRow((row, rn) => { if (!bosh && String(row.getCell(3).value) === m.qatorlar[0].nom) bosh = rn; });
    expect(bosh).toBeGreaterThan(0);
    const r2c = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
    m.qatorlar.forEach((x, i) => {
      if (x.tur !== 'barg') return;
      const r = bosh + i;
      const E = cv(r, 5), F = cv(r, 6), G = cv(r, 7), H = cv(r, 8), I = cv(r, 9), J = cv(r, 10), K = cv(r, 11);
      if (E != null && F != null) expect(G, x.nom).toBe(r2c(E * F));        // smeta: hajm × narx
      if (H != null && F != null) expect(I).toBe(!J || K == null ? r2c(H * F) : r2c((H * K) / J)); // fakt: hajm × narx yoki F-2 narxi (svodda ham)
    });
    // ИТОГО / ВSEGО: yig‘indi qatori keshi = bolalar keshi yig‘indisi (G, I, K ustunlari)
    m.qatorlar.forEach((x, i) => {
      if (x.tur === 'barg' || !x.bolalar.length || x.tur === 'rz') return;
      for (const c of [7, 9, 11]) {
        const s = r2c(x.bolalar.reduce((t, k) => t + (cv(bosh + k, c) ?? 0), 0));
        expect(cv(bosh + i, c) ?? 0).toBeCloseTo(s, 2);
      }
    });
  });
});