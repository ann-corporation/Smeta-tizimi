/** QA 2026-11-15: telefon CSS qoidalari (matn tekshiruvi — jsdom layout hisoblamaydi). Desktop (>=768px) qoidalari o'zgarmasligi ham tekshiriladi. */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const css = fs.readFileSync('src/dizayn/mobil.css', 'utf8');
const telefonBlok = css.slice(css.indexOf('@media (max-width: 767px)'));

describe('mobil.css — tegish maydoni', () => {
  it('kichik tugmalarga ::after bilan 44x44 tegish maydoni beriladi (faqat telefon media-so‘rovi ichida)', () => {
    expect(telefonBlok).toMatch(/\.fz-btn--sm[^{]*::after\s*\{[^}]*width:\s*max\(100%,\s*44px\)[^}]*height:\s*max\(100%,\s*44px\)/);
    const tashqari = css.slice(0, css.indexOf('@media (max-width: 767px)'));
    expect(tashqari).not.toMatch(/::after/);
  });
  it('Jarvis tabi doimiy accent rangda emas (faqat faol bo‘lganda)', () => {
    expect(css).not.toMatch(/\.mobil-tab__item--ai/);
  });
});
