import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { ichkiKalitMi, ichkiKalitNomi, ichkiKalitTitle } from './ichki-kalit';
import { _tilniTestdaQoy } from '../i18n/til';

afterEach(() => _tilniTestdaQoy('uz'));

const KALITLAR = ['company.context.read', 'membership.read', 'permission.analyze', 'finance.payment.prepare', 'muddati_otgan_tolanmagan', 'nk_manba', 'document_missing', 'muddat_tugadi', 'ai_sarf', 'sklad_kirim', 'tolov_majburiyatlari', 'ish_haqi', 'v_boss_init', 'warehouse_receipt', 'smeta_res', 'document_canonical_stored', 'akt_podval_yoz'];

describe('ichkiKalitNomi', () => {
  it('QA da topilgan xom kalitlar uz/ru/en da odam tiliga aylanadi (xom kalit ko‘rinmaydi)', () => {
    for (const til of ['uz', 'ru', 'en'] as const) {
      _tilniTestdaQoy(til);
      for (const k of KALITLAR) {
        const nom = ichkiKalitNomi(k);
        expect(nom, `${til}:${k}`).not.toBe(k);
        expect(nom).not.toMatch(/[_.]/);
      }
    }
  });
  it('ru/en tarjimalari lug‘atda bor (o‘zbekcha qolmaydi)', async () => {
    const { LUGAT_RU, LUGAT_EN } = await import('../i18n/lugat');
    for (const k of ['company.context.read', 'muddati_otgan_tolanmagan', 'v_boss_init']) {
      const uz = ichkiKalitNomi(k);
      expect(LUGAT_RU[uz], uz).toBeTruthy();
      expect(LUGAT_EN[uz], uz).toBeTruthy();
    }
  });
  it('lug‘atda yo‘q kalit o‘qiladigan matnga; oddiy matn o‘zgarmaydi; title faqat kalitda', () => {
    expect(ichkiKalitNomi('yangi_texnik_kod')).toBe('Yangi texnik kod');
    expect(ichkiKalitNomi('Oddiy matn')).toBe('Oddiy matn');
    expect(ichkiKalitNomi(null)).toBe('');
    expect(ichkiKalitMi('a.b')).toBe(true);
    expect(ichkiKalitTitle('nk_manba')).toBe('nk_manba');
    expect(ichkiKalitTitle('Oddiy matn')).toBeUndefined();
  });
});

describe('telefon va jadval tuzatishlari (QA 2026-11-15) — manba qoidalari', () => {
  const oqi = (f: string) => fs.readFileSync(f, 'utf8');
  it('Narxlar nazorati: qator nomi 280px da kesilmaydi — 2 qatorga o‘raladi, to‘liq nom title da', () => {
    const s = oqi('src/admin/sahifalar/NarxNazoratNative.tsx');
    expect(s).not.toMatch(/max-w-\[280px\] truncate/);
    expect(s).toMatch(/line-clamp-2[^"]*"\s+title=\{q\.nom/);
  });
  it('AOSR ro‘yxati: telefonda akt nomi o‘raladi (truncate faqat md+), to‘liq nom title da', () => {
    const s = oqi('src/test02/TestAosr.tsx');
    expect(s).toMatch(/data-testid="aosr-akt-nom"/);
    expect(s).toMatch(/break-words[^"]*md:truncate/);
  });
  it('Narxlar (bozor taqqoslash): selectlar telefonda to‘liq eni', () => {
    const s = oqi('src/components/smeta-studio-pro/MarketPriceComparison.tsx');
    expect((s.match(/max-md:basis-full/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
  it('KPI kartalari: kartada hamma qiymat bir xil chap tekislanadi', () => {
    const s = oqi('src/components/pto-workspace/ProjectNavigator.tsx');
    expect(s).toMatch(/kartada \? 'items-start text-left' : 'items-end text-right'/);
    expect((s.match(/,true\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});
