// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { HUJJAT_TURLARI } from '../hujjat-dvigatel';

/**
 * MANBA QR QAMROVI (egasi 2026-11-13: «tizimdan chiqqan HAR BIR qog'ozda manba QR»). Markaziy nuqta - `downloadBlob`
 * (construction-document-control/export/download-helper.ts): hujjat dvigateli o'tadigan har eksport shu yerdan chiqadi va QR oladi.
 * Bu test: (1) downloadBlob yagona va nashrni chaqiradi; (2) fayl beradigan har fayl downloadBlob ishlatadi YOKI quyidagi
 * «dvigateldan o'tmaydigan» ro'yxatda sababi bilan turadi. Yangi eksport yo'li qo'shilsa shu test eslatadi.
 */
const SRC = join(process.cwd(), 'src');
const izohsiz = (s: string) => s.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
function fayllar(d: string): string[] {
  return readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? (n === 'node_modules' ? [] : fayllar(p)) : /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });
}
const barcha = fayllar(SRC).map((p) => ({ yol: relative(SRC, p).replace(/\\/g, '/'), kod: izohsiz(readFileSync(p, 'utf8')) }));

/** Dvigateldan o'tmaydigan fayl berish yo'llari (xlsx hujjat EMAS yoki o'z fayli) - QR olmaydi. Ro'yxat KENGAYMASLIGI kerak. */
const DVIGATELSIZ: Record<string, string> = {
  'admin/sahifalar/FotoLenta.tsx': 'rasm (foto) yuklab olish - xlsx hujjat emas',
  'admin/sahifalar/NormSmetaWorkbench.tsx': 'ichki review JSON (katalog tekshiruvi), hujjat emas',
  'admin/sahifalar/FaylMenejer.tsx': 'foydalanuvchining o‘z yuklagan fayllari (uning mulki) - qayta yuklab berish',
  'components/imzo/ImzoUi.tsx': 'imzolangan nusxa: IMZO varag‘i o‘zida QR (imzo QR lari) bilan quriladi',
  'lib/construction-document-control/export/download-helper.ts': 'markaziy nuqtaning o‘zi',
};
const TO_GRI = /\.download\s*=|setAttribute\(\s*['"]download['"]|window\.open\(\s*URL\.createObjectURL/;

describe('manba QR qamrovi', () => {
  it('downloadBlob yagona ta\'rif va nashr (QR) ni chaqiradi', () => {
    const tarif = barcha.filter((f) => /export\s+function\s+downloadBlob\b/.test(f.kod)).map((f) => f.yol);
    expect(tarif).toEqual(['lib/construction-document-control/export/download-helper.ts']);
    const h = barcha.find((f) => f.yol === tarif[0])!.kod;
    expect(h).toMatch(/nashrQoy/); expect(h).toMatch(/nashrKompaniyasi/); expect(h).toMatch(/tizimImzosiniQoy/);
  });

  it('fayl beradigan har yo\'l downloadBlob dan o\'tadi yoki dvigatelsiz ro\'yxatda sababi bilan turadi', () => {
    const buzilgan = barcha.filter((f) => TO_GRI.test(f.kod) && !(f.yol in DVIGATELSIZ)).map((f) => f.yol);
    expect(buzilgan, 'Yangi eksport yo‘li: downloadBlob (lib/construction-document-control/export/download-helper.ts) dan foydalaning - QR shu yerda qo‘yiladi').toEqual([]);
    for (const y of Object.keys(DVIGATELSIZ)) expect(barcha.map((f) => f.yol), y).toContain(y);
  });

  it('hujjat dvigateli reestridagi har eksportyor moduli mavjud va hujjat turi QR olishi mumkin (xlsx eksport)', () => {
    // QR markaziy nuqtada (downloadBlob) - har tur uchun alohida qo'shma kerak emas; yangi tur qo'shilsa shu raqam o'zgaradi va test eslatadi.
    const ishlaydi = Object.values(HUJJAT_TURLARI).filter((t) => t.holat === 'ishlaydi' && t.eksport);
    expect(ishlaydi.length).toBeGreaterThan(5);
    for (const t of ishlaydi) expect(barcha.some((f) => f.yol === t.eksport!.modul), `${t.kalit}: ${t.eksport!.modul}`).toBe(true);
    expect(Object.keys(HUJJAT_TURLARI).sort(), 'Hujjat dvigateliga yangi tur qo‘shildi: u downloadBlob orqali beriladimi? (QR qamrovi) - ro‘yxatni yangilang').toEqual(
      ['aosr', 'akt_osvidetelstvovaniya', 'f2', 'forma3', 'lab_protokol', 'loyiha_smeta_fakt', 'm29', 'nakopitelniy', 'ostatka', 'predpisaniya', 'slichitelniy', 'soprovod_xat', 'sub_akt', 'zayavka'].sort());
  });
});
