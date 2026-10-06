// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { emptyDoc, type EstimateDoc } from '../../lib/smeta-studio/model';
import { expandThroughDepth, indexEstimate, outlineBreadcrumb, visibleOutline } from './hierarchy';

function sample(): EstimateDoc {
  const doc = emptyDoc('draft');
  doc.rootOrder = ['a'];
  doc.sections.a = { id: 'a', name: 'Амфитеатр', parentId: null, children: ['b'], items: [] };
  doc.sections.b = { id: 'b', name: 'Сцена', parentId: 'a', children: ['c'], items: [] };
  doc.sections.c = { id: 'c', name: 'Фундамент', parentId: 'b', children: [], items: ['work'] };
  doc.occurrences.work = { id: 'work', sectionId: 'c', source: { catalogRevision: 'rev', workId: 'source',
    code: 'E06', name: 'Бетонирование', unitCode: 'м3', tableLabel: null }, quantity: '4',
    basis: { scale: '1', unitLabel: 'м3', evidence: 'source', origin: 'OBSERVED' }, overrides: {},
    recipe: [{ recipeId: 'r', status: 'EXACT', resource: { id: 'mat', name: 'Бетон B7.5', code: 'C1', unitCode: 'м3', type: 'M' },
      norm: '1.02', candidates: [], candidateCount: 0, prices: [], priceCount: 0 }] };
  return doc;
}
describe('professional estimate outline', () => {
  it('nested section → work → resource, without mutating the canonical draft', () => {
    const doc = sample(), before = JSON.stringify(doc), tree = indexEstimate(doc);
    expect(tree.rows.map(r => r.depth)).toEqual([0, 1, 2, 3, 4]);
    expect(JSON.stringify(doc)).toBe(before);
    expect(outlineBreadcrumb(tree, tree.rows[4])).toEqual(['Амфитеатр', 'Сцена', 'Фундамент', 'Бетонирование', 'Бетон B7.5']);
  });
  it('collapsed, level controls, and all expanded', () => {
    const tree = indexEstimate(sample());
    expect(visibleOutline(tree, new Set())).toHaveLength(1);
    expect(visibleOutline(tree, expandThroughDepth(tree, 1))).toHaveLength(2);
    expect(visibleOutline(tree, expandThroughDepth(tree, 3))).toHaveLength(4);
    expect(visibleOutline(tree, expandThroughDepth(tree, Infinity))).toHaveLength(5);
  });
  it('a resource search retains every ancestor even when collapsed', () => {
    const tree = indexEstimate(sample());
    expect(visibleOutline(tree, new Set(), 'B7.5').map(r => r.kind)).toEqual(['section', 'section', 'section', 'work', 'resource']);
    expect(visibleOutline(tree, new Set(), '  ФУНДАМЕНТ ')).toHaveLength(3);
    expect(visibleOutline(tree, new Set(), 'not present')).toHaveLength(0);
  });
  it('replacement shows new resource but preserves source resource and work identity', () => {
    const doc = sample();
    doc.occurrences.work.overrides.r = { substitution: { resource: { id: 'new', name: 'Бетон B15', code: 'C2', unitCode: 'м3', type: 'M' },
      reason: 'project', conversion: '1', conversionEvidence: null, normOverride: null } };
    const tree = indexEstimate(doc);
    expect(tree.rows[4].label).toBe('Бетон B15');
    expect(tree.rows[4].occurrenceId).toBe('work');
    expect(doc.occurrences.work.recipe[0].resource?.name).toBe('Бетон B7.5');
  });
  it('collision-safe composite resource keys', () => {
    const doc = sample();
    const w = doc.occurrences.work;
    doc.occurrences['work:x'] = { ...w, id: 'work:x', recipe: [{ ...w.recipe[0], recipeId: 'x:r' }] };
    doc.sections.c.items.push('work:x');
    expect(indexEstimate(doc).byKey.size).toBe(7);
  });
  it('invalid parent fails closed rather than inventing hierarchy', () => {
    const doc = sample(); doc.sections.c.parentId = 'a';
    expect(() => indexEstimate(doc)).toThrow('OUTLINE_SECTION_LINEAGE');
  });
  it('duplicate root is rejected', () => {
    const doc = sample(); doc.rootOrder.push('a');
    expect(() => indexEstimate(doc)).toThrow('OUTLINE_CYCLE_OR_DUPLICATE_SECTION');
  });
  it('cycle fails closed and never recurses', () => {
    const doc = sample(); doc.sections.c.children.push('a');
    expect(() => indexEstimate(doc)).toThrow('OUTLINE_CYCLE_OR_DUPLICATE_SECTION');
  });
  it('orphan works are not silently dropped', () => {
    const doc = sample(); doc.sections.c.items = [];
    expect(() => indexEstimate(doc)).toThrow('OUTLINE_ORPHAN');
  });
  it('duplicate recipes are rejected', () => {
    const doc = sample(); doc.occurrences.work.recipe.push(doc.occurrences.work.recipe[0]);
    expect(() => indexEstimate(doc)).toThrow('OUTLINE_DUPLICATE_ID');
  });
  it('work cannot appear under a different section', () => {
    const doc = sample(); doc.occurrences.work.sectionId = 'b';
    expect(() => indexEstimate(doc)).toThrow('OUTLINE_WORK_LINEAGE');
  });
  it('30,000 nested sections build and filter without stack overflow', () => {
    const doc = emptyDoc('deep'), count = 30_000;
    doc.rootOrder = ['0'];
    for (let i = 0; i < count; i++) doc.sections[String(i)] = {
      id: String(i), name: i === count - 1 ? 'needle' : 'section', parentId: i === 0 ? null : String(i - 1),
      children: i === count - 1 ? [] : [String(i + 1)], items: [],
    };
    const start = performance.now();
    const tree = indexEstimate(doc);
    expect(visibleOutline(tree, new Set(), 'needle')).toHaveLength(count);
    expect(visibleOutline(tree, expandThroughDepth(tree, Infinity))).toHaveLength(count);
    const elapsed = performance.now() - start;
    console.info(`30k deep hierarchy build/filter/expand: ${Math.round(elapsed)} ms`);
    expect(elapsed).toBeLessThan(5000);
  });
  it('50,000 rows retain stable keys across reorder', () => {
    const doc = sample(), base = doc.occurrences.work;
    doc.sections.c.items = []; doc.occurrences = {};
    for (let i = 0; i < 25_000; i++) {
      const id = String(i); doc.sections.c.items.push(id); doc.occurrences[id] = { ...base, id };
    }
    const tree = indexEstimate(doc);
    expect(tree.rows).toHaveLength(50_003);
    const resourceKey = tree.rows[4].key;
    doc.sections.c.items.reverse();
    expect(indexEstimate(doc).byKey.has(resourceKey)).toBe(true);
  });
});
