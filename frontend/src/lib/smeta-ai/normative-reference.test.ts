import { expect, it } from 'vitest';
import { foundationReference, foundationSourceContext, contradictsFoundationSource } from './normative-reference';

it('ties the reinforced strip-foundation reference to exact rows and the original page', () => {
  expect(foundationReference('E6-1-1-22')).toMatchObject({ document: 'ШНК 4.02.06-04', table: '6-01-001', pdfPage: 12 });
  expect(foundationReference('06-01-001-23')?.operations).toContain('Armaturani o‘rnatish');
  expect(foundationReference('E6-1-1-20')).toBeNull();
  expect(foundationReference('E6-1-1-220')).toBeNull();
  expect(foundationReference('E7-1-1-22')).toBeNull();
});

it('grounds only the audited strip-foundation context and keeps edition uncertainty explicit', () => {
  expect(foundationSourceContext('Tomni ta’mirlash')).toBe('');
  for (const text of ['Lentali fundament', 'ленточный железобетонный фундамент', 'E6-1-1-22']) {
    const source = foundationSourceContext(text);
    expect(source).toContain('ARMATURA O‘RNATISH');
    expect(source).toContain('#page=12');
    expect(source).toContain('hali tasdiqlanmagan');
  }
});

it('rejects the observed blanket contradiction without treating other work scopes as proven', () => {
  expect(contradictsFoundationSource('Lentali fundament quyish normasida armatura o‘rnatish ishlari odatda kirmaydi')).toBe(true);
  expect(contradictsFoundationSource('Lentali fundament jadvalida armatura o‘rnatish bor')).toBe(false);
  expect(contradictsFoundationSource('Podbetonka normasiga armatura kirmaydi')).toBe(false);
  expect(contradictsFoundationSource('Lentali fundament normasiga armatura kirmaydi deyish xato')).toBe(false);
});
