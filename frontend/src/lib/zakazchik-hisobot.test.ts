import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { BugunObyekt } from '../api/t2-tomon';
import { zakazchikOylikHisobot } from './zakazchik-hisobot';

const ob = (o: Partial<BugunObyekt>): BugunObyekt => ({
  aloqa_id: 1, qarshi_kompaniya_id: 9, qarshi_nom: 'Pudratchi A', obyekt_id: 1, obyekt_nom: 'Obyekt 1', shartnoma_id: 5, shartnoma_raqam: '12', shartnoma_summa: 1000,
  smeta: null, fakt: null, f2: null, f3: null, tolangan: null, qarz: null, xabar_kutilmoqda: 0, kutayotgan_taqdim: 0, ochiq_murojaat: 0, ...o,
});

describe('buyurtmachi oylik hisoboti (Excel)', () => {
  it('qarz = F3 − to‘langan formula; noma‘lum katak bo‘sh, jami SUM formulasi', async () => {
    const r = await zakazchikOylikHisobot([
      ob({ obyekt_id: 1, f3: { soni: 1, summa: 500, oxirgi_sana: null }, tolangan: { soni: 1, summa: 200, oxirgi_sana: null }, qarz: 300 }),
      ob({ obyekt_id: 2, obyekt_nom: 'Obyekt 2' }),
    ], { kompaniya: 'Zakazchik', sana: '2026-11-11' });
    expect(r.faylNomi).toBe('ОТЧЁТ_ЗАКАЗЧИКА_2026-11-11.xlsx');
    expect(r.yacheykalar).toBeGreaterThan(0);
    const xml = strFromU8(unzipSync(r.bytes)['xl/worksheets/sheet1.xml']);
    expect(xml).toMatch(/<f>[A-Z]+\d+-[A-Z]+\d+<\/f><v>300<\/v>/);      // qarz formulasi
    expect(xml).toMatch(/<f>SUM\(/);                                       // jami
    for (const k of ['E10', 'J10', 'K10', 'L10']) expect(xml).toMatch(new RegExp(`<c r="${k}" s="\\d+"/>`)); // noma'lum 0 bo'lib yozilmaydi
  });
});
