import { describe, expect, it } from 'vitest';
import { tizimdaOchishYoli } from './disk-manba-yol';

describe('Tizimda ochish: manba turidan ishchi oynaga yo‘l (mavjud sahifalar)', () => {
  it('F-2: tayyorlash ekrani akt bilan; obyekt yo‘q bo‘lsa F2 tarixi', () => {
    expect(tizimdaOchishYoli({ manba_turi: 'f2', manba_id: 41, obyekt_id: 80 })).toEqual({ yol: '/admin/f2-tayyorlash?obyekt=80&akt=41', qayerda: 'F2 tayyorlash' });
    expect(tizimdaOchishYoli({ manba_turi: 'f2', manba_id: 41 })?.yol).toBe('/admin/f2-tarix');
    expect(tizimdaOchishYoli({ manba_turi: 'f2_akt', obyekt_id: 80 })?.yol).toBe('/admin/f2-tarix?obyekt=80');
  });
  it('F-3: saqlangan (id bor) - shartnoma rejimi; qoralama (id yo‘q) - davr bilan', () => {
    expect(tizimdaOchishYoli({ manba_turi: 'forma3', manba_id: 9, obyekt_id: 80 })?.yol).toBe('/admin/nakopitelniy?obyekt=80&f3=shartnoma');
    expect(tizimdaOchishYoli({ manba_turi: 'forma3', manba_id: null, obyekt_id: 80, hujjat_kalit: 'tmp:f3:5:2026-08' })?.yol).toBe('/admin/nakopitelniy?obyekt=80&f3=1&davr=2026-08');
  });
  it('nakopitelniy, M-29, slichitelniy, ostatka, AOSR, smeta, paket', () => {
    expect(tizimdaOchishYoli({ manba_turi: 'nakopitelniy', obyekt_id: 80 })?.yol).toBe('/admin/nakopitelniy?obyekt=80');
    expect(tizimdaOchishYoli({ manba_turi: 'm29', obyekt_id: 80 })?.yol).toBe('/admin/m29?obyekt=80');
    expect(tizimdaOchishYoli({ manba_turi: 'slichitelniy', obyekt_id: 80 })?.yol).toBe('/admin/holat/80#slichitelniy');
    expect(tizimdaOchishYoli({ manba_turi: 'ostatka', obyekt_id: 80 })?.yol).toBe('/admin/holat/80#slichitelniy');
    expect(tizimdaOchishYoli({ manba_turi: 'aosr', obyekt_id: 80 })?.yol).toBe('/admin/aosr?obyekt=80');
    expect(tizimdaOchishYoli({ manba_turi: 'smeta_lrv', obyekt_id: 80 })?.yol).toBe('/admin/smeta?obyekt=80');
    expect(tizimdaOchishYoli({ manba_turi: 'shartnoma_oylik_paket', manba_id: 5 })?.yol).toBe('/admin/f2-reestr');
  });
  it('manba yo‘q yoki noma’lum: tugma ko‘rsatilmaydi', () => {
    expect(tizimdaOchishYoli({})).toBeNull();
    expect(tizimdaOchishYoli({ manba_turi: 'nashr' })).toBeNull();
  });
  it('barcha yo‘llar haqiqiy marshrutlarga mos (App.tsx)', async () => {
    const { readFileSync } = await import('node:fs'); const { join } = await import('node:path');
    const app = readFileSync(join(process.cwd(), 'src', 'App.tsx'), 'utf8');
    for (const r of ['f2-tayyorlash', 'f2-tarix', 'nakopitelniy', 'm29', 'holat/:id', 'aosr', 'smeta', 'f2-reestr', 'shartnoma-liniya']) expect(app, r).toContain(`path="${r}"`);
  });
});