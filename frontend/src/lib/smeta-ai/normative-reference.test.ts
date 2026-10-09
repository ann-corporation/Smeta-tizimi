import { expect, it } from 'vitest';
import { foundationReference } from './normative-reference';

it('ties the reinforced strip-foundation reference to exact rows and the original page', () => {
  expect(foundationReference('E6-1-1-22')).toMatchObject({ document: 'ШНК 4.02.06-04', table: '6-01-001', pdfPage: 12 });
  expect(foundationReference('06-01-001-23')?.operations).toContain('Armaturani o‘rnatish');
  expect(foundationReference('E6-1-1-20')).toBeNull();
  expect(foundationReference('E6-1-1-220')).toBeNull();
  expect(foundationReference('E7-1-1-22')).toBeNull();
});
