import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * QOIDA (egasi, 2026-10-16: "tizim maksimal pul ishlasin — har xizmat token hisoblasin"): foydalanuvchiga fayl
 * beradigan har joy (`downloadBlob(`, `a.download =`) token orqali beradi — `hujjatTokenBilan` (lib/token-hujjat.ts)
 * yoki `tokenBilan`. Yangi eksport tugmasi buni chetlab o'tolmaydi: bepul bo'lishi kerak bo'lsa — quyidagi
 * BEPUL ro'yxatiga SABABI bilan yoziladi (egasi ko'radi). AI uchun xuddi shu qoida: ai-hisob-qoidasi.test.ts.
 */
const ILDIZ = join(process.cwd(), 'src');   // vitest frontend/ papkasidan ishga tushadi

/** Ataylab bepul — sababi bilan. */
const BEPUL: Record<string, string> = {
  'lib/construction-document-control/export/download-helper.ts': 'yuklab berish yordamchisining o‘zi',
  'umumiy/hujjat/HujjatKorinish.tsx': 'ko‘rish oynasi — bu baytlar ochilishdan oldin token bilan to‘langan',
  'admin/sahifalar/FaylMenejer.tsx': 'foydalanuvchining o‘zi yuklagan fayllari (uning mulki)',
  'umumiy/ui/IlgorJadval.tsx': 'ekrandagi jadvalning CSV nusxasi — foydalanuvchi maʼlumoti, rasmiy hujjat emas',
  'admin/sahifalar/NormSmetaWorkbench.tsx': 'ichki review JSON (katalog tekshiruvi), hujjat emas',
  'lib/lrv-plus-export.ts': '`lrvPlusYuklab` — chaqiruvchisi yo‘q (LRV HolatNative orqali token bilan beriladi)',
};

/** Boshqa agent lane'ida — ulanishi kutilmoqda (KOORDINATSIYA 2026-10-16). Ulangach shu ro'yxatdan o'chiring. */
const KUTILMOQDA: Record<string, string> = {
};

const FAYL_BERISH = /downloadBlob\(|\.download\s*=|setAttribute\(\s*['"]download['"]/;
const TOKEN = /\b(hujjatTokenBilan|tokenBilan)\(/;
const izohsiz = (s: string) => s.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
function fayllar(d: string): string[] {
  return readdirSync(d).flatMap((n: string) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? fayllar(p) : /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });
}

describe('Token hujjat qoidasi — fayl faqat token bilan beriladi', () => {
  const barcha = fayllar(ILDIZ).map((p) => relative(ILDIZ, p).replace(/\\/g, '/'));
  const beruvchi = barcha.filter((r) => FAYL_BERISH.test(izohsiz(readFileSync(join(ILDIZ, r), 'utf8'))));

  it('fayl beradigan har fayl token oladi, yoki BEPUL/KUTILMOQDA ro‘yxatida sababi bilan', () => {
    const buzilgan = beruvchi
      .filter((r) => !(r in BEPUL) && !(r in KUTILMOQDA))
      .filter((r) => !TOKEN.test(izohsiz(readFileSync(join(ILDIZ, r), 'utf8'))));
    expect(buzilgan).toEqual([]);
  });

  it('ro‘yxatlar eskirmaydi: KUTILMOQDA dagi fayl token olsa — ro‘yxatdan o‘chirilsin; yo‘q fayl qolmasin', () => {
    for (const r of [...Object.keys(BEPUL), ...Object.keys(KUTILMOQDA)]) expect(barcha, r).toContain(r);
    const ulangan = Object.keys(KUTILMOQDA).filter((r) => TOKEN.test(izohsiz(readFileSync(join(ILDIZ, r), 'utf8'))));
    expect(ulangan).toEqual([]);
  });

  it('rasmiy hujjat sahifalari token bilan beradi', () => {
    for (const f of ['admin/sahifalar/HolatNative.tsx', 'admin/sahifalar/M29Native.tsx', 'admin/sahifalar/NakopitelniyVedomost.tsx',
      'admin/sahifalar/LrvResSverkaPanel.tsx', 'admin/sahifalar/OfertaNative.tsx', 'admin/sahifalar/ResursVedomostNative.tsx',
      'admin/sahifalar/F2TarixNative.tsx', 'admin/sahifalar/F2TayyorlashNative.tsx', 'test02/TestAosr.tsx']) {
      expect(izohsiz(readFileSync(join(ILDIZ, f), 'utf8')), f).toMatch(TOKEN);
    }
  });
});
