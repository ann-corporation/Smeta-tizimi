import { describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { mazmunXeshi } from './mazmun-xesh';

/* Qayta yuklash bepul bo'lishi uchun: har yasalganda o'zgaradigan qismlar (docProps, zip sanasi) xeshga kirmasin. */
const xlsx = (yaratilgan: string, varaq: string, mtime: number) => zipSync({
  'xl/worksheets/sheet1.xml': strToU8(varaq),
  'docProps/core.xml': strToU8(`<created>${yaratilgan}</created>`),
}, { mtime });

describe('mazmunXeshi (barqaror)', () => {
  it('faqat docProps/zip sanasi farq qilsa — xesh bir xil', async () => {
    const a = await mazmunXeshi(xlsx('2026-11-11T10:00:00Z', '<c><f>A1*2</f></c>', 1_700_000_000_000));
    const b = await mazmunXeshi(xlsx('2026-11-12T09:30:00Z', '<c><f>A1*2</f></c>', 1_800_000_000_000));
    expect(a).toBe(b);
  });
  it('mazmun o‘zgarsa — xesh boshqa', async () => {
    const a = await mazmunXeshi(xlsx('2026-11-11T10:00:00Z', '<c><f>A1*2</f></c>', 1_700_000_000_000));
    const b = await mazmunXeshi(xlsx('2026-11-11T10:00:00Z', '<c><f>A1*3</f></c>', 1_700_000_000_000));
    expect(a).not.toBe(b);
  });
  it('ichki zip (paket) ham barqaror; zip bo‘lmagan baytlar — oddiy xesh', async () => {
    const p1 = zipSync({ '001_akt.xlsx': xlsx('2026-11-11T10:00:00Z', 'X', 1_700_000_000_000) }, { mtime: 1_700_000_000_000 });
    const p2 = zipSync({ '001_akt.xlsx': xlsx('2027-01-01T00:00:00Z', 'X', 1_900_000_000_000) }, { mtime: 1_900_000_000_000 });
    expect(await mazmunXeshi(p1)).toBe(await mazmunXeshi(p2));
    expect(await mazmunXeshi(new Uint8Array([1, 2, 3]))).toBe(await mazmunXeshi(new Uint8Array([1, 2, 3])));
    expect(await mazmunXeshi(new Uint8Array([1, 2, 3]))).not.toBe(await mazmunXeshi(new Uint8Array([1, 2, 4])));
  });
});
