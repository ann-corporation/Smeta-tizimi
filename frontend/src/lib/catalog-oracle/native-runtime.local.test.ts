// @vitest-environment node
/** Full installed-core oracle. External reference data never enters the repo. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { coefficientCandidates } from '../smeta-studio/coefficient-agent';
import { COEFFICIENT_SOURCE_REVISION as revision, sourceCoefficientCatalog } from '../smeta-studio/norm-library-coefficients';

const nativeRoot = process.env.CONSTRUCT_NATIVE_FIXTURE_ROOT;
const releaseRoot = process.env.NORM_LIBRARY_FIXTURE_ROOT;
type Rule = { Code: string; Title: string; Basis: string; Labour: number; Machines: number; Materials: number };
const canonical = (rules: Rule[]) => rules.map(({ Code, Title, Basis, Labour, Machines, Materials }) =>
  JSON.stringify([Code, Title, Basis, Labour, Machines, Materials])).sort();

it.skipIf(!nativeRoot || !releaseRoot)('matches every installed-core candidate and factor without inventing rules for uncovered work', () => {
  const local = (root: string, file: string) => readFileSync(resolve(root, file));
  const json = (root: string, file: string) => JSON.parse(local(root, file).toString('utf8').replace(/^\uFEFF/, ''));
  const seal = json(nativeRoot!, 'PROBE_MANIFEST.json') as { files: { file: string; sha256: string }[] };
  for (const file of ['NATIVE_COEFFICIENTS.jsonl', 'SOURCE_IDENTITY.json', 'native-all-scope.ps1']) {
    const matches = seal.files.filter(entry => entry.file === file);
    expect(matches).toHaveLength(1);
    expect(createHash('sha256').update(local(nativeRoot!, file)).digest('hex')).toBe(matches[0].sha256);
  }
  const identity = json(nativeRoot!, 'SOURCE_IDENTITY.json') as {
    file: string; sha256: string; snapshot_sha256: string; unchanged_after_probes: boolean;
  }[];
  expect(identity.map(entry => entry.file).sort()).toEqual(['Construct.dll', 'Data\\catalogs.cdb', 'Data\\norms.cdb', 'Pto.Core.dll'].sort());
  for (const entry of identity) {
    expect(entry.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(entry.sha256).toBe(entry.snapshot_sha256);
    expect(entry.unchanged_after_probes).toBe(true);
  }
  const manifest = json(releaseRoot!, 'manifest.json');
  expect(manifest.revision).toBe(revision);
  const rules = local(releaseRoot!, 'coefficient-rules.json');
  const reference = manifest.objects.filter((entry: { file: string }) => entry.file === 'coefficient-rules.json');
  expect(reference).toHaveLength(1);
  expect(createHash('sha256').update(rules).digest('hex')).toBe(reference[0].sha256);
  const catalog = sourceCoefficientCatalog(JSON.parse(rules.toString('utf8')));
  const expectedKeys = new Set(gunzipSync(local(releaseRoot!, 'works.jsonl.gz')).toString('utf8').trim().split(/\r?\n/)
    .map(line => (JSON.parse(line) as { key: string }).key));
  const seen = new Set<string>();
  let links = 0, uncovered = 0;
  for (const line of local(nativeRoot!, 'NATIVE_COEFFICIENTS.jsonl').toString('utf8').trim().split(/\r?\n/)) {
    const native = JSON.parse(line) as { key: string; rules: Rule[] };
    expect(seen.has(native.key), native.key).toBe(false);
    seen.add(native.key);
    const candidates = coefficientCandidates(catalog, {
      catalogRevision: revision, workId: `norm-library:${revision}:${native.key}`,
      code: native.key, name: 'Audit', unitCode: null, tableLabel: null,
    });
    const actual = candidates.map(candidate => ({ Code: candidate.kod.split('#')[0], Title: candidate.yozuv.t,
      Basis: candidate.yozuv.a, Labour: candidate.yozuv.k.ЧЕЛ!, Machines: candidate.yozuv.k.МАШ!, Materials: candidate.yozuv.k.МАТ! }));
    expect(canonical(actual), native.key).toEqual(canonical(native.rules));
    links += candidates.length;
    if (!candidates.length) uncovered++;
  }
  expect([...seen].sort()).toEqual([...expectedKeys].sort());
  expect(seen.size).toBe(48083);
  expect(links).toBe(31340);
  expect(uncovered).toBe(40906);
}, 30000);
