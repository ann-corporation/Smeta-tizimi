/**
 * P5 — katta smeta o'qish o'lchovi. 27 000 qatorli sintetik LRV (real shaklli:
 * ish + resurslar, 8 ustun). Worker bo'lmagan muhitda (vitest/jsdom)
 * readXlsxFonda asosiy oqimdagi readXlsx ga qaytadi — natija aynan bir xil.
 * Brauzerda shu vaqt Worker ichida o'tadi (asosiy oqim bloklanmaydi) — jonli
 * "uzun vazifa" o'lchovi egasining brauzerida (UNKNOWN shu muhitda).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { readXlsx } from './xlsxReader';
import { readXlsxFonda } from './xlsxFonda';
import { kitobAnatomiyasi } from '../smeta-anatomiya';

function kattaSmeta(n: number): Uint8Array {
  const rows: Array<Array<string | number | null>> = [
    ['ЛОКАЛЬНАЯ СМЕТА № 01-01'],
    ['№', 'ШИФР', 'НАИМЕНОВАНИЕ РАБОТ И ЗАТРАТ', 'ЕД.ИЗМ', 'НА ЕДИНИЦУ', 'КОЛ-ВО', 'ЦЕНА', 'СУММА'],
    [1, 2, 3, 4, 5, 6, 7, 8],
  ];
  let ish = 0;
  while (rows.length < n) {
    if (ish % 200 === 0) rows.push([`РАЗДЕЛ ${ish / 200 + 1}. РАБОТЫ`]);
    ish++;
    rows.push([ish, `Е01-${ish}`, `РАБОТА ${ish}`, 'м3', null, 10, null, 3000]);
    for (let k = 1; k <= 4; k++) rows.push([`${ish}.${k}`, `1-${k}`, `РЕСУРС ${k}`, 'чел.-ч', 0.1 * k, k, 150, 150 * k]);
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'LRV');
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx', compression: true }) as ArrayBuffer);
}

describe('P5 — 27 000 qatorli smeta o‘qish', () => {
  it('readXlsxFonda natijasi readXlsx bilan aynan bir xil; o‘qish va anatomiya vaqti o‘lchanadi', async () => {
    const bytes = kattaSmeta(27_000);
    const t0 = performance.now();
    const a = await readXlsx(bytes);
    const t1 = performance.now();
    const b = await readXlsxFonda(bytes);
    const anat = kitobAnatomiyasi({ fayl: 'katta.xlsx', varaqlar: b.sheets.map((s) => ({ nom: s.name, rows: s.rows })) });
    const t2 = performance.now();
    console.info(`[P5] 27 000 qator: o'qish ${Math.round(t1 - t0)} ms (worker'da asosiy oqimdan tashqarida); anatomiya ${Math.round(t2 - t1 - (t1 - t0))} ms; ishlar=${anat.varaqlar[0].ishlar.length}`);
    expect(b.sheets.map((s) => [s.name, s.rows.length])).toEqual(a.sheets.map((s) => [s.name, s.rows.length]));
    expect(b.sheet('LRV')?.rows[27_000 - 1]).toEqual(a.sheet('LRV')?.rows[27_000 - 1]);
    expect(anat.varaqlar[0].ishlar.length).toBeGreaterThan(5000);
  });
});

describe('legacy XLS worker safety', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('BIFF8 .xls ni katta natijani Worker postMessage clone stackiga bermaydi', async () => {
    let workerConstructed = 0;
    vi.stubGlobal('Worker', class {
      constructor() { workerConstructed++; }
    });
    const biff8 = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    await expect(readXlsxFonda(biff8)).rejects.toThrow();
    expect(workerConstructed).toBe(0);
  });
});
