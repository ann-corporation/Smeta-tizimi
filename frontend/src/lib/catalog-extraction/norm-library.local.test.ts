// @vitest-environment node
/** Optional actual-release audit. Source files stay outside the repository. */
import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { calcDoc } from '../smeta-studio/calc';
import { applyCommand } from '../smeta-studio/commands';
import { emptyDoc } from '../smeta-studio/model';
import { snapshotWork } from '../smeta-studio/catalog-bridge';
import { resourceUnitText } from '../smeta-studio/resource-units';
import { resourceFacts } from '../resource-semantics';

const root = process.env.NORM_LIBRARY_FIXTURE_ROOT;
const REV = '66bb1a23bd18c63006d447b5';
type SourceWork = { key: string; source_id: string; source: number; collection_key: string; table_key: string; measure: string | null };
type SourceRecipe = { norm_key: string; pos: number; res_code: string | null; grp: string; name: string | null; unit: string | null; qty: number | null };
type SourceCollection = { works: SourceWork[]; recipes: Record<string, SourceRecipe[]> };

// Independent string-only expansion of JS's shortest source-number spelling.
// No multiplication, fixed precision, or rounding is used by this oracle.
function sourceDecimal(qty: number | null): string | null {
  if (qty === null) return null;
  const text = String(qty);
  if (!/[eE]/.test(text)) return text;
  const [mantissa, exponent] = text.toLowerCase().split('e');
  const negative = mantissa.startsWith('-');
  const unsigned = negative ? mantissa.slice(1) : mantissa;
  const [whole, fraction = ''] = unsigned.split('.');
  const digits = whole + fraction;
  const point = whole.length + Number(exponent);
  const expanded = point <= 0 ? `0.${'0'.repeat(-point)}${digits}`
    : point >= digits.length ? digits + '0'.repeat(point - digits.length)
    : `${digits.slice(0, point)}.${digits.slice(point)}`;
  return (negative ? '-' : '') + expanded;
}

describe.skipIf(!root)('actual pinned norm-library release (external fixture)', () => {
  it('preserves the full tree, every source recipe, and unpriced review snapshots', async () => {
    // Dynamic import keeps the disabled fixture independent of adapter availability.
    const { NormLibraryCatalog } = await import('./norm-library');
    const local = async (file: string) => readFile(resolve(root!, file));
    const asked: string[] = [];
    const fetcher = async (input: string) => {
      const url = new URL(input, 'https://fixture.test');
      expect(url.searchParams.get('rev')).toBe(REV);
      const file = url.searchParams.get('f');
      if (!file || !/^(?:manifest\.json|navigation\.json|works\.jsonl\.gz|coefficient-rules\.json|collection-\d{3}\.json\.gz)$/.test(file))
        throw new Error('FIXTURE_PATH_INVALID');
      asked.push(file);
      return new Response(new Uint8Array(await local(file)), {
        headers: { 'Content-Type': file.endsWith('.gz') ? 'application/octet-stream' : 'application/json' },
      });
    };
    const catalog = await NormLibraryCatalog.open(fetcher);
    const manifest = JSON.parse((await local('manifest.json')).toString());
    const nav = JSON.parse((await local('navigation.json')).toString());
    const index: SourceWork[] = gunzipSync(await local('works.jsonl.gz')).toString().trim().split(/\r?\n/).map(l => JSON.parse(l));
    expect(catalog.manifest).toEqual(manifest);
    expect(manifest.calculation_approved).toBe(false);
    expect(manifest.status).toBe('REVIEW_ONLY');
    expect(index).toHaveLength(48083);
    expect(nav.collections).toHaveLength(112);
    expect(Object.keys(manifest.collection_shards)).toHaveLength(112);
    const works = catalog.allWorks();
    expect(works).toHaveLength(48083);
    const byId = new Map(works.map(w => [w.id, w]));
    const tables = new Map(catalog.nodes.map((n, i) => [n[4], i]).filter(([k]) => k != null) as [string, number][]);
    expect(catalog.nodes).toHaveLength(nav.collections.length + nav.sections.length + nav.tables.length + 4);
    // O(works * depth), rather than an O(works squared) scoped search for every row.
    const expectedTableCounts = new Map<string, number>();
    for (const source of index) {
      const work = byId.get(source.source_id);
      if (!work || work.code !== source.key || work.tableCode !== source.table_key || work.unitCode !== source.measure)
        throw new Error(`WORK_SOURCE_MISMATCH:${source.key}`);
      const table = tables.get(source.table_key);
      if (table == null) throw new Error(`WORK_NOT_REACHABLE:${source.key}`);
      const path = catalog.breadcrumb(table);
      if (catalog.nodes[path[1].index][0] !== `norm-library:${REV}:${source.collection_key}`)
        throw new Error(`COLLECTION_PATH_MISMATCH:${source.key}`);
      expectedTableCounts.set(source.table_key, (expectedTableCounts.get(source.table_key) ?? 0) + 1);
    }
    for (const [key, count] of expectedTableCounts) expect(catalog.node(tables.get(key)!).workCount).toBe(count);
    expect(catalog.childNodes(-1).nodes.map(n=>n.name)).toEqual(['Строительные работы','Монтажные работы','Ремонтно-строительные работы','Пусконаладочные работы']);
    expect(catalog.childNodes(-1).nodes.reduce((sum,n)=>sum+n.workCount,0)).toBe(48083);
    expect(catalog.search('', 0).total).toBe(48083);
    const representative = index.find(w => /[ЕE]51/.test(w.key));
    expect(representative).toBeDefined();
    if (representative) {
      const table = tables.get(representative.table_key)!;
      const expected = index.filter(w => w.table_key === representative.table_key).map(w => w.source_id);
      const found: string[] = [];
      for (let page = 0; page * 25 < expected.length; page++) found.push(...catalog.search('', page, table).rows.map(w => w.id));
      expect(found).toEqual(expected);
    }
    let recipeCount = 0, workCount = 0, snapshots = 0, exponentialQuantities = 0;
    const sourceIds = new Set<string>();
    for (const [collectionKey, metadata] of Object.entries(manifest.collection_shards) as [string, { file: string; works: number }][]) {
      const source: SourceCollection = JSON.parse(gunzipSync(await local(metadata.file)).toString());
      expect(source.works.length).toBe(metadata.works);
      expect(source.works.length).toBeGreaterThan(0);
      // One awaited load per collection: adapter verifies the raw compressed SHA.
      await catalog.load(source.works[0].source_id);
      for (const work of source.works) {
        workCount++;
        expect(work.collection_key).toBe(collectionKey);
        const recipes = source.recipes[work.key] ?? [];
        const actual = [];
        for (let page = 0; page * 25 < recipes.length || page === 0; page++) {
          const detail = catalog.detail(work.source_id, page);
          expect(detail.recipeCount).toBe(recipes.length);
          actual.push(...detail.recipes);
        }
        // Compare all source quantities and identities, not only representative rows.
        const expected = recipes.map(r => {
          const id = `${work.source_id}:source:${work.source}:resource:${r.pos}:${encodeURIComponent(r.res_code ?? '')}`;
          if (sourceIds.has(id)) throw new Error(`DUPLICATE_RESOURCE_ID:${id}`);
          sourceIds.add(id);
          if (r.qty !== null && /e/i.test(String(r.qty))) exponentialQuantities++;
          const type = ({ labour: 'NORM_LABOUR', machinist: 'NORM_MACHINIST', machine: 'NORM_MACHINE', material: 'NORM_MATERIAL' } as Record<string, string>)[r.grp] ?? null;
          return [id, `${id}:recipe`, r.res_code, sourceDecimal(r.qty), r.name, r.unit, type, r.unit, r.res_code, r.res_code];
        });
        expect(actual.map(r => [r.candidates[0].id, r.id, r.resourceCode, r.norm,
          r.candidates[0].name, resourceUnitText(r.candidates[0].unitCode), r.candidates[0].type,
          resourceFacts(r.candidates[0]).unit, r.resourceIdCode, r.candidates[0].resourceIdCode])).toEqual(expected);
        expect(actual.every(r => r.priceCount === 0 && r.prices.length === 0)).toBe(true);
        recipeCount += recipes.length;
        if (snapshots < 3 && actual.length && (snapshots === 0 || /[ЕE]51/.test(work.key) || collectionKey === nav.collections.at(-1).key)) {
          const snapshot = snapshotWork(catalog, work.source_id, REV, catalog.tableLabel(work.source_id));
          const recipe = snapshot.recipe;
          let doc = applyCommand(emptyDoc('fixture-review'), { type: 'ADD_SECTION', sectionId: 's', parentId: null, name: 'Review' });
          doc = applyCommand(doc, { type: 'ADD_OCCURRENCE', occurrenceId: 'o', sectionId: 's', recipe, quantity: '1',
            basis: { scale: null, unitLabel: work.measure, evidence: null, origin: null }, source: snapshot.source });
          expect(doc.occurrences.o.recipe).toEqual(recipe);
          const result = calcDoc(doc);
          expect(result.total.amount).toBeNull();
          expect(result.occurrences.o.lines.every(l => l.price === null && l.amount === null && l.issues.includes('PRICE_MISSING'))).toBe(true);
          expect(result.occurrences.o.issues).toContain('BASIS_UNCONFIRMED');
          snapshots++;
        }
      }
    }
    expect(workCount).toBe(48083);
    expect(recipeCount).toBe(432277);
    expect(sourceIds.size).toBe(432277);
    expect(exponentialQuantities).toBe(2);
    expect(snapshots).toBe(3);
    expect(asked.filter(f => f.startsWith('collection-'))).toHaveLength(112);
    expect(new Set(asked.filter(f => f.startsWith('collection-'))).size).toBe(112);
  }, 180_000);
});
