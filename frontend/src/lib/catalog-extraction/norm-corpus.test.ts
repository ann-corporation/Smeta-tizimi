// @vitest-environment node
import { it, expect } from 'vitest';
import { createReadStream, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { NormCatalog } from './norm-catalog';

const directory = process.env.NORM_SOURCE_DIRECTORY;
it.skipIf(!directory)('real supplied four-table corpus: no skipped rows, bounded exact joins', async () => {
  const catalog = new NormCatalog();
  const started = performance.now();
  for (const table of ['basis', 'material', 'basisres', 'bprice']) {
    const lines = createInterface({ input: createReadStream(join(directory!, table + '.jsonl'), { encoding: 'utf8' }), crlfDelay: Infinity });
    for await (const line of lines) if (line.trim()) catalog.add(table, JSON.parse(line));
  }
  expect(catalog.counts).toEqual({ basis: 54013, basisres: 531015, material: 337016, bprice: 167566 });
  expect(catalog.search('', 0).total).toBe(54013);
  expect(catalog.search('', 0).rows).toHaveLength(25);
  let exact = 0, missing = 0, ambiguous = 0;
  for (const work of catalog.works.values()) {
    const first = catalog.detail(work.id);
    if (first.workCodeAmbiguous) continue;
    for (let page = 0; page * 25 < first.recipeCount; page++) {
      const detail = page === 0 ? first : catalog.detail(work.id, page);
      expect(detail.recipes.length).toBeLessThanOrEqual(25);
      for (const recipe of detail.recipes) {
        expect(recipe.candidateCount).toBeGreaterThanOrEqual(recipe.candidates.length);
        if (recipe.resourceStatus === 'EXACT') exact++;
        else if (recipe.resourceStatus === 'MISSING') missing++;
        else ambiguous++;
      }
    }
  }
  expect(exact + missing + ambiguous).toBe(528962);
  expect({ exact, missing, ambiguous }).toEqual({ exact: 528210, missing: 709, ambiguous: 43 });
  const report = { status: 'PASS', counts: catalog.counts, uniquelyLinkedWorkRecipes: { exact, missing, ambiguous },
    milliseconds: Math.round(performance.now() - started), nodeRssBytes: process.memoryUsage().rss,
    notes: 'Node corpus test, not browser memory or authenticated production acceptance' };
  if (process.env.NORM_ACCEPTANCE_REPORT) writeFileSync(process.env.NORM_ACCEPTANCE_REPORT, JSON.stringify(report, null, 2), { flag: 'wx' });
  console.info(JSON.stringify({ counts: catalog.counts, uniquelyLinkedWorkRecipes: { exact, missing, ambiguous } }));
}, 180000);
