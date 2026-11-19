import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * Windows/Android (Kotlin :shared) sayt bilan BIR XIL matnlar va tarjimalarni ishlatadi: lug'at `android-native/shared/src/main/resources/site-i18n/`
 * ga `scripts/site-i18n.mjs` bilan YOZILADI (qo'lda tahrir qilinmaydi). Lug'at o'zgarib fayllar yangilanmasa shu test yiqiladi.
 */
describe('site-i18n (Kotlin ilovalar lug\'ati)', () => {
  it('yaratilgan fayllar src/i18n/lugat bilan mos', () => {
    const script = resolve(__dirname, '../../scripts/site-i18n.mjs');
    let chiqish = '';
    try { execFileSync(process.execPath, [script, '--check'], { encoding: 'utf8' }); }
    catch (e) { chiqish = String((e as { stderr?: string }).stderr ?? e); }
    expect(chiqish).toBe('');
  });
});
