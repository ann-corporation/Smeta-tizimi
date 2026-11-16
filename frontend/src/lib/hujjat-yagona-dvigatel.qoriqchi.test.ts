import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { kompaniyaDizayniniQoy } from '../api/f2-hujjat-kontekst';
import { DIZAYN_PRESETLAR, SUKUT_DIZAYN, hujjatDizayniniOrnat, joriyHujjatDizayni } from './hujjat-yozuvchi/dizayn';

/**
 * QOIDA (egasi 2026-11-17): Ф-2 ni FAQAT bitta server dvigateli (`POST /api/hujjat-yarat`) yasaydi — F2 tarixi, F2 oynasi
 * (saqlangan akt), F2 reestr/paket sahifasi va mobil ilova bir xil shablon va bir xil kompaniya dizaynini oladi.
 * Dizayn manbai bitta: kompaniya sozlamasi `hujjat.dizayn._uslub` (`kompaniyaDizayniniQoy`).
 */
const SRC = join(process.cwd(), 'src');
const FUNCTIONS = join(process.cwd(), 'functions');
const oqi = (ildiz: string, yol: string) => readFileSync(join(ildiz, yol), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
const F2_SO_ROV = /hujjatYaratYuklab\(\s*\{[^}]*tur:\s*'f2'/;

describe('Yagona hujjat dvigateli — Ф-2 kirish nuqtalari', () => {
  it.each([
    ['F2 tarixi', 'admin/sahifalar/F2TarixNative.tsx'],
    ['F2 oynasi (saqlangan akt)', 'admin/sahifalar/F2TayyorlashNative.tsx'],
    ['F2 reestr / hujjatlar paketi', 'admin/sahifalar/F2OylikPaket.tsx'],
  ])('%s Ф-2 ni /api/hujjat-yarat dan so‘raydi', (_nom, yol) => {
    const m = oqi(SRC, yol);
    expect(m).toMatch(/import \{ hujjatYarat as hujjatYaratYuklab \} from '\.\.\/\.\.\/api\/hujjat-yarat'/);
    expect(m).toMatch(F2_SO_ROV);
  });

  it('F2 reestr/paket sahifasida mijoz Ф-2 quruvchisi yo‘q (dublikat generator o‘chirilgan)', () => {
    const m = oqi(SRC, 'admin/sahifalar/F2OylikPaket.tsx');
    expect(m).not.toMatch(/\bpaketAktExcel\b|\bf2Hujjat\(|\bf2HujjatVaraqlar\(/);
  });

  it('server dvigateli HAR hujjat turi uchun kompaniya dizaynini qo‘llaydi', () => {
    const m = oqi(FUNCTIONS, 'api/hujjat-yarat.ts');
    const ichki = m.slice(m.indexOf('ichkiRejimda(ctx, async () => {'));
    expect(ichki.indexOf('hujjatDizayniniYukla(')).toBeGreaterThan(-1);
    expect(ichki.indexOf('hujjatDizayniniYukla(')).toBeLessThan(ichki.indexOf("b.tur === 'f2'"));
  });
});

describe('Yagona dizayn manbai — kompaniya sozlamasi', () => {
  afterEach(() => { hujjatDizayniniOrnat(null); });

  it('localStorage yo‘q muhitda (Worker) ham kompaniya dizayni qo‘llanadi', () => {
    expect(globalThis.localStorage?.getItem('hujjat-dizayn-uslub') ?? null).toBeNull();
    const maxsus = { ...DIZAYN_PRESETLAR.minimal, preset: 'maxsus', sarlavhaFon: 'AABBCC' };
    kompaniyaDizayniniQoy({ sozlamalar: { 'hujjat.dizayn': { qiymat: { _uslub: maxsus } } } });
    expect(joriyHujjatDizayni().sarlavhaFon).toBe('AABBCC');
  });

  it('kompaniya dizayni serverda yo‘q bo‘lsa — sukut (eski mahalliy nusxa farq qildirmaydi)', () => {
    hujjatDizayniniOrnat({ ...SUKUT_DIZAYN, sarlavhaFon: '112233' });
    kompaniyaDizayniniQoy({ sozlamalar: {} });
    expect(joriyHujjatDizayni().sarlavhaFon).toBe(SUKUT_DIZAYN.sarlavhaFon);
  });

  it('server o‘qilmasa (null) — joriy nusxa o‘zgarmaydi', () => {
    hujjatDizayniniOrnat({ ...SUKUT_DIZAYN, sarlavhaFon: '112233' });
    kompaniyaDizayniniQoy(null);
    expect(joriyHujjatDizayni().sarlavhaFon).toBe('112233');
  });
});
