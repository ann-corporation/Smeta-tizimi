import { expect, it } from 'vitest';
import { jarvisLanguage, jarvisText } from './reply-language';

it('uses the language of mixed-script questions and honours a saved language setting', () => {
  expect(jarvisLanguage('НДС bilan Park qiymati qancha?')).toBe('uz');
  expect(jarvisLanguage('Покажи ШНҚ 4.02.06-04')).toBe('ru');
  expect(jarvisLanguage('Шу объект бўйича НДС билан қанча?')).toBe('uz-Cyrl');
  expect(jarvisLanguage('Shu obyekt F2 holati qanday?', 'ru')).toBe('ru');
});

it('preserves the name, URL and code in a Cyrillic reply', () => {
  const text = jarvisText('uz-Cyrl');
  expect(text('Obyekt {name} · QQS · {code} · [Manbani ochish]({url})', 'unused', {
    name: 'Mir A-17', code: 'Е06-01-001-1', url: '/admin/holat/125?panel=versiya',
  })).toBe('Объект Mir A-17 · ҚҚС · Е06-01-001-1 · [Манбани очиш](/admin/holat/125?panel=versiya)');
});
