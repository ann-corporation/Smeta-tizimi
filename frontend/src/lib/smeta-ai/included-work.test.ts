import { expect, it } from 'vitest';
import { emptyDoc } from '../smeta-studio/model';
import { includedWorkReviews } from './included-work';

const foundation = { id: 'f', bolim: 'Fundament', tavsif: 'Lentali fundament', tanlangan: { kod: 'E6-1-1-22', nom: 'ЖЕЛЕЗОБЕТОННЫЙ ФУНДАМЕНТ' } };
const armature = { id: 'a', bolim: 'Fundament', tavsif: 'Armatura o‘rnatish A3', tanlangan: null };
it('blocks both overlapping proposals in either order, without deleting quantities', () => {
  for (const rows of [[foundation, armature], [armature, foundation]]) {
    expect([...includedWorkReviews(rows).keys()].sort()).toEqual(['a', 'f']);
    expect(includedWorkReviews(rows).get('a')).toMatchObject({ code: 'E6-1-1-22', page: 12 });
  }
});
it('does not generalize to unknown norms, other sections, fabrication or removal alone', () => {
  for (const standalone of ['Armatura tayyorlash', 'Qolip demontaj', 'ДЕМОНТАЖ ОПАЛУБКИ', 'ИЗГОТОВЛЕНИЕ АРМАТУРЫ']) {
    expect(includedWorkReviews([foundation, { ...armature, tavsif: standalone }]).size).toBe(0);
  }
  expect(includedWorkReviews([foundation, { ...armature, bolim: 'Boshqa fundament' }]).size).toBe(0);
  expect(includedWorkReviews([{ ...foundation, tanlangan: { ...foundation.tanlangan, kod: 'E6-1-1-20' } }, armature]).size).toBe(0);
  expect(includedWorkReviews([foundation, { ...armature, tavsif: 'Qolip montaj-demontaj' }]).size).toBe(2);
});
it('checks an existing frozen draft placement, so separate clicks cannot evade review', () => {
  const doc = emptyDoc('d');
  doc.sections.s = { id: 's', name: 'Fundament', parentId: null, children: [], items: ['old'] };
  doc.occurrences.old = { id: 'old', sectionId: 's', source: { catalogRevision: 'rev', workId: 'old', code: 'E6-1-1-22', name: 'ФУНДАМЕНТ', unitCode: null, tableLabel: null }, quantity: '34.56', basis: { scale: null, unitLabel: null, evidence: null, origin: null }, recipe: [], overrides: {} };
  expect(includedWorkReviews([armature], doc).has('a')).toBe(true);
  expect(doc.occurrences.old.quantity).toBe('34.56');
  doc.occurrences.old.source = { ...doc.occurrences.old.source, code: 'ARM', name: 'УСТАНОВКА АРМАТУРЫ' };
  expect(includedWorkReviews([foundation], doc).has('f')).toBe(true);
});
