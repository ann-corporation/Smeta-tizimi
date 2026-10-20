import { describe, expect, it } from 'vitest';
import { jarvisKichikGap, jarvisSalommi } from './intent';

describe('Jarvis kichik suhbat — model kerak emas (egasi: «oddiy gaplar uchun ham 5 minut»)', () => {
  it.each(['salom', 'Salom!', '  ASSALOMU ALAYKUM  ', 'salom jarvis', 'salom jarvis qalaysan', 'Assalomu alaykum, ishlar qalay?',
    'qalaysiz', 'привет', 'Привет, Джарвис, как дела?', 'hi jarvis', 'nima gap'])('«%s» — salomlashuv', (s) => {
    expect(jarvisKichikGap(s)).toBe('salom');
  });
  it.each(['rahmat', 'Raxmat jarvis!', 'katta rahmat', 'спасибо', 'ok, tushunarli'])('«%s» — minnatdorchilik', (s) => {
    expect(jarvisKichikGap(s)).toBe('rahmat');
  });
  it.each(['Amfiteatrda fakt qancha?', 'salom, amfiteatrda beton narxi qancha?', 'kun', 'nima', 'jarvis', '',
    'salom jarvis bugun qaysi obyektda F2 tasdiqlanmagan', 'rahmat endi smeta summasini ayt'])('«%s» — oddiy savol (modelga boradi)', (s) => {
    expect(jarvisKichikGap(s)).toBeNull();
    expect(jarvisSalommi(s)).toBe(false);
  });
});
