import { afterEach, describe, expect, it } from 'vitest';
import { _tilniTestdaQoy, kutilayotganTil, lugatniYukla, lugatTayyormi, raqamFormatla, sanaFormatla, t, tilLocale, tilOl, tilQoy } from './til';
import { lugatHolat } from './lugat-holat';
import { LUGAT_EN as en, LUGAT_RU as ru } from './lugat';
import { ENTITY_CONFIGS } from '../umumiy/ui/forms/SharedForms';

afterEach(() => _tilniTestdaQoy('uz'));

describe('interfeys tili', () => {
  it('lug‘at, fallback va o‘rinbosarni xavfsiz qaytaradi', () => {
    _tilniTestdaQoy('ru');
    expect(t('Saqlash')).toBe('Сохранить');
    expect(t('{n} ta qator', { n: 4 })).toBe('4 ta qator');
    expect(t('Lug‘atda yo‘q')).toBe('Lug‘atda yo‘q');
  });

  it('lugat/qism/*.json bo‘laklari ham yuklanadi', () => {
    _tilniTestdaQoy('ru');
    expect(t('Lug‘at bo‘laklari')).toBe('Части словаря');
    _tilniTestdaQoy('en');
    expect(t('Lug‘at bo‘laklari')).toBe('Dictionary parts');
  });

  it('tanlovni brauzer xotirasiga saqlaydi va document tilini yangilaydi', () => {
    tilQoy('en');
    expect(tilOl()).toBe('en');
    expect(localStorage.getItem('til')).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('lug‘at yuklanmagan bo‘lsa: avval «kutilmoqda», yuklangach til almashadi va tinglovchilar xabar oladi', async () => {
    const asl = lugatHolat.lugat;
    lugatHolat.lugat = null;
    try {
      tilQoy('en');
      expect(tilOl()).toBe('uz'); // yarim tarjima ko'rinmasin — til hali almashmagan
      expect(kutilayotganTil()).toBe('en');
      expect(lugatTayyormi()).toBe(true); // uz uchun lug'at kerak emas
      await lugatniYukla();
      await Promise.resolve();
      expect(tilOl()).toBe('en');
      expect(kutilayotganTil()).toBeNull();
      expect(t('Saqlash')).toBe('Save');
    } finally { lugatHolat.lugat = asl; }
  });

  it('raqam va sana tanlangan locale bilan ko‘rsatiladi, noaniq qiymat nolga aylanmaydi', () => {
    _tilniTestdaQoy('ru');
    expect(tilLocale()).toBe('ru-RU');
    expect(raqamFormatla(null)).toBe('—');
    expect(raqamFormatla(1234.5, { minimumFractionDigits: 2 })).toContain('1');
    expect(sanaFormatla('noto‘g‘ri')).toBe('—');
    expect(sanaFormatla('2026-10-02T00:00:00Z', { year: 'numeric' })).toContain('2026');
  });

  it('umumiy forma sozlamasidagi barcha statik matnlar tarjima qilingan', () => {
    const kalitlar = Object.values(ENTITY_CONFIGS).flatMap((config) => [
      config.title,
      ...config.fields.flatMap((field) => [field.label, field.placeholder, ...(field.options?.map((option) => option.label) ?? [])].filter(Boolean)),
    ]);
    for (const kalit of kalitlar) {
      expect(ru).toHaveProperty(kalit!);
      expect(en).toHaveProperty(kalit!);
    }
  });
});
