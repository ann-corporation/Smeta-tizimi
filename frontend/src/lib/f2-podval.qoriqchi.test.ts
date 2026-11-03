import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * F2 hujjat podvali qatlami qo'riqchisi (egasi 2026-11-03): yangi fayllarda pul yaxlitlash / QQS ajratish yadrodan tashqarida yo'q,
 * fayl berish (yuklab olish) faqat token orqali (`hujjatTokenBilan` / `tokenBilan`), podval o'qilmasa jim smeta podvaliga o'tilmaydi.
 * Umumiy qoidalar `hisob-yadro.guard.test.ts` va `api/token-hujjat-qoidasi.test.ts` da; bu — shu ishning fayllari uchun aniq ro'yxat.
 */
const ILDIZ = join(process.cwd(), 'src');
const FAYLLAR = [
  'lib/akt-podval.ts', 'lib/akt-podval-moslash.ts', 'lib/f2-pereraschet.ts', 'lib/hisob-yadro/f2-podval.ts', 'api/t2-akt-podval.ts',
  'umumiy/ui/useAktPodvallar.ts', 'components/f2-tayyorlash/PereraschetPanel.tsx', 'admin/sahifalar/F2PodvalBackfillOyna.tsx',
  'admin/sahifalar/F2StornoOyna.tsx', 'admin/sahifalar/F2StornoTanlov.tsx',
];
const izohsiz = (s: string) => s.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

describe('F2 podval qo‘riqchisi', () => {
  it('yangi fayllar mavjud', () => {
    for (const f of FAYLLAR) expect(existsSync(join(ILDIZ, f)), f).toBe(true);
  });

  it('pul yaxlitlash (Math.round(x*100)/100) va /1.12 yo‘q', () => {
    for (const f of FAYLLAR.filter((x) => !x.startsWith('lib/hisob-yadro/'))) {
      const m = izohsiz(readFileSync(join(ILDIZ, f), 'utf8'));
      expect(/Math\.round\([^;]*\*\s*100\)\s*\/\s*100/.test(m), f).toBe(false);
      expect(/\/\s*1\.12\b/.test(m), f).toBe(false);
    }
  });

  it('bu fayllar o‘zi fayl bermaydi; Excel beruvchi sahifalar token oladi', () => {
    const BERISH = /downloadBlob\(|\.download\s*=|\bkorinish\.ochish\(/;
    for (const f of FAYLLAR) expect(BERISH.test(izohsiz(readFileSync(join(ILDIZ, f), 'utf8'))), f).toBe(false);
    for (const f of ['admin/sahifalar/F2TarixNative.tsx', 'admin/sahifalar/F2TayyorlashNative.tsx']) {
      expect(/\b(hujjatTokenBilan|tokenBilan)\(/.test(izohsiz(readFileSync(join(ILDIZ, f), 'utf8'))), f).toBe(true);
    }
  });

  it('hujjat podvali o‘qilmasa Excel jim smeta podvaliga o‘tmaydi', () => {
    for (const f of ['admin/sahifalar/F2TarixNative.tsx', 'admin/sahifalar/F2TayyorlashNative.tsx']) {
      expect(readFileSync(join(ILDIZ, f), 'utf8'), f).toMatch(/aktPodval(lariniOl|\.holat)/);
    }
  });
});
