import { expect, it, vi } from 'vitest';
import { emptyDoc, type WorkSource } from './model';
import { ishKoeffitsientlari, koefgaAylantir, type KoefKatalog } from './koef-katalog';
import { coefficientCandidates, coefficientCandidateSummary, coefficientApplyCommand } from './coefficient-agent';
import { COEFFICIENT_SOURCE_REVISION as revision, coefficientCatalogsForDoc, normLibraryCoefficients, sourceCoefficientCatalog, type SourceRules } from './norm-library-coefficients';

const data: SourceRules = { revision, status: 'SOURCE_CANDIDATES_NOT_AUTOMATIC_ACCEPTANCE', rules: [
  { id: 1, kind: 'Е', cc: '01', code: '3.4', title: 'hydro condition', basis: 'ШНК 4.02.01-04, ТЧ п. 3.4', labour: 1, machines: 0.95, materials: 1 },
  { id: 2, kind: 'Е', cc: '06', code: '3.1', title: 'height condition', basis: 'ШНК 4.02.06-04, ТЧ п. 3.1', labour: 1.04, machines: 1, materials: 1 },
], targets: [ { correction_id: 1, otdel: '01', tbl: '030', n_from: 1, n_to: 4 }, { correction_id: 2, otdel: '*', tbl: '', n_from: 0, n_to: 0 } ] };
const source = (key = 'Е01-01-030-1'): WorkSource => ({ catalogRevision: revision, workId: `norm-library:${revision}:${key}`, code: key, name: 'test', unitCode: 'm3', tableLabel: null });
const legacy: KoefKatalog = { schema: 'koef-katalog-v1', manba: 'test', jadval: { '1-1-30': ['old'] }, koef: { old: { a: 'test', t: 'test', s: 'test', q: '', k: { ЧЕЛ: 2 } } } };
it('matches native exact collection/section/table/inclusive row range and collection wildcard', () => {
  const kat = sourceCoefficientCatalog(data);
  expect(ishKoeffitsientlari(kat, source().code, source()).map(n => n.kod)).toEqual(['01-3.4']);
  for (const key of ['Е01-01-030-4', 'Е06-01-001-1']) expect(coefficientCandidates(kat, source(key))).toHaveLength(1);
  for (const key of ['Е01-01-030-5', 'Е01-02-030-1', 'Е02-01-030-1', 'Ц01-01-030-1', 'Е51-1-1', 'E01-01-030-1']) expect(coefficientCandidates(kat, source(key))).toEqual([]);
  expect(koefgaAylantir(coefficientCandidates(kat, source())[0]).every(c => !c.accepted)).toBe(true);
});
it('new source never falls back to old code matches, and requires valid revision and literal identity', () => {
  const kat = sourceCoefficientCatalog(data);
  expect(coefficientCandidates([legacy, kat], source())).toHaveLength(1);
  expect(ishKoeffitsientlari(kat, source().code)).toEqual([]);
  for (const bad of [{ ...source(), catalogRevision: 'bad' }, { ...source(), workId: 'norm' }, { ...source(), code: 'Е01-01-030-2' }, { ...source(), workId: 'norm-library:bad:Е01-01-030-1' }]) expect(coefficientCandidates([legacy, kat], bad)).toEqual([]);
  expect(coefficientCandidates(legacy, source('E1-1-30-1'))).toEqual([]);
  expect(coefficientCandidates(kat, { ...source(), catalogRevision: 'old', workId: 'norm' })).toEqual([]);
  expect(coefficientCandidates(legacy, { ...source('E1-1-30-1'), catalogRevision: 'old', workId: 'norm' })).toHaveLength(1);
});
it('AI summary/apply resolve the same source candidates and preserve explicit condition and shared command', () => {
  const kat = sourceCoefficientCatalog(data), doc = emptyDoc('test');
  doc.rootOrder = ['s']; doc.sections.s = { id: 's', parentId: null, name: 'test', children: [], items: ['o'] };
  doc.occurrences.o = { id: 'o', sectionId: 's', source: source(), quantity: '1', basis: { scale: null, unitLabel: null, evidence: null, origin: null }, recipe: [], overrides: {} };
  expect(coefficientCandidateSummary(doc, [legacy, kat])).toContain('[i1] 01-3.4');
  expect(coefficientCandidateSummary(doc, legacy)).not.toContain('01-3.4');
  expect(() => coefficientApplyCommand(doc, [legacy, kat], 'i1', '01-3.4', '')).toThrow('COEFFICIENT_CONDITION_REQUIRED');
  expect(() => coefficientApplyCommand(doc, [legacy, kat], 'i1', 'old', 'confirmed')).toThrow('COEFFICIENT_NOT_APPLICABLE');
  expect(coefficientApplyCommand(doc, [legacy, kat], 'i1', '01-3.4', 'confirmed')).toMatchObject({ type: 'SET_COEFFICIENTS', occurrenceId: 'o', coefficients: expect.arrayContaining([expect.objectContaining({ scope: 'МАШ', value: '0.95', accepted: true })]) });
});
it('unresolved targets and missing factors never become candidates', () => {
  const invalid = structuredClone(data); invalid.targets[0].tbl = '030-040'; invalid.rules[1].machines = null as unknown as number;
  expect(coefficientCandidates(sourceCoefficientCatalog(invalid), source())).toEqual([]);
  expect(coefficientCandidates(sourceCoefficientCatalog(invalid), source('Е06-01-001-1'))).toEqual([]);
});
it('loads only represented sources', async () => {
  const old = vi.fn(async () => legacy), fresh = vi.fn(async () => sourceCoefficientCatalog(data)), doc = emptyDoc('test');
  await coefficientCatalogsForDoc(doc, old, fresh); expect(old).not.toHaveBeenCalled(); expect(fresh).not.toHaveBeenCalled();
  doc.occurrences.o = { id: 'o', sectionId: 's', source: source(), quantity: null, basis: { scale: null, unitLabel: null, evidence: null, origin: null }, recipe: [], overrides: {} };
  await coefficientCatalogsForDoc(doc, old, fresh); expect(old).not.toHaveBeenCalled(); expect(fresh).toHaveBeenCalledTimes(1);
  doc.occurrences.other = { ...doc.occurrences.o, id: 'other', source: { ...source(), workId: 'legacy', catalogRevision: 'old' } };
  await coefficientCatalogsForDoc(doc, old, fresh); expect(old).toHaveBeenCalledTimes(1); expect(fresh).toHaveBeenCalledTimes(2);
});
it('verifies raw bytes and hash, deduplicates concurrent requests and retries failure', async () => {
  const body = JSON.stringify(data), bytes = new TextEncoder().encode(body);
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
  let corrupt = true;
  const fetcher = vi.fn(async (url: string) => new Response(url.includes('manifest') ? JSON.stringify({ schema: 'norm-library-release-v1', revision, objects: [{ file: 'coefficient-rules.json', bytes: bytes.length, sha256: hash }] }) : corrupt ? body + ' ' : body));
  await expect(normLibraryCoefficients(fetcher)).rejects.toThrow('COEFFICIENT_INTEGRITY_FAILED');
  corrupt = false;
  const [a, b] = await Promise.all([normLibraryCoefficients(fetcher), normLibraryCoefficients(fetcher)]);
  expect(a).toBe(b); expect(fetcher).toHaveBeenCalledTimes(4);
  await normLibraryCoefficients(fetcher); expect(fetcher).toHaveBeenCalledTimes(4);
});
it('rejects wrong manifest revision before requesting rules', async () => {
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ schema: 'norm-library-release-v1', revision: 'other', objects: [] })));
  await expect(normLibraryCoefficients(fetcher)).rejects.toThrow('COEFFICIENT_MANIFEST_INVALID'); expect(fetcher).toHaveBeenCalledTimes(1);
});

it('keeps distinct native records with duplicate display codes addressable', () => {
  const duplicate = structuredClone(data); duplicate.rules.push({ ...duplicate.rules[0], id: 3, machines: 0.8 }); duplicate.targets.push({ ...duplicate.targets[0], correction_id: 3 });
  expect(coefficientCandidates(sourceCoefficientCatalog(duplicate), source()).map(n => n.kod)).toEqual(['01-3.4#1', '01-3.4#3']);
});

it.skipIf(!process.env.COEFFICIENT_NATIVE_AUDIT)('agrees with native scope probe on the audited raw source', async () => {
  const { readFileSync } = await import('node:fs');
  const base = process.env.COEFFICIENT_NATIVE_AUDIT!;
  const raw = readFileSync(`${base}/library-release/coefficient-rules.json`);
  const manifest = JSON.parse(readFileSync(`${base}/library-release/manifest.json`, 'utf8'));
  const probe = JSON.parse(readFileSync(`${base}/coefficient-scope-probe.json`, 'utf8').replace(/^\uFEFF/, '')) as { key: string; rules: { Code: string; Labour: number; Machines: number; Materials: number }[] }[];
  const kat = sourceCoefficientCatalog(JSON.parse(raw.toString('utf8')));
  for (const test of probe) {
    const candidates = coefficientCandidates(kat, source(test.key));
    expect(candidates.map(c => ({ Code: c.kod.split('#')[0], Labour: c.yozuv.k.ЧЕЛ, Machines: c.yozuv.k.МАШ, Materials: c.yozuv.k.МАТ }))).toEqual(test.rules.map(({ Code, Labour, Machines, Materials }) => ({ Code, Labour, Machines, Materials })));
  }
  const bounded = coefficientCandidates(kat, source('Е01-01-033-3')).find(n => n.kod === '01-3.79');
  expect(bounded?.yozuv.op).toBe('MUL'); expect(bounded?.yozuv.k.МАШ).toBe(1.1);
  expect(coefficientCandidates(kat, source('Е01-01-033-2')).some(n => n.kod === '01-3.79')).toBe(false);
  const fetcher = async (url: string) => new Response(url.includes('manifest') ? JSON.stringify(manifest) : raw);
  expect((await normLibraryCoefficients(fetcher)).sourceRevision).toBe(revision);
});


it('native zero lower bound means the exact table, and never a neighboring section/table', () => {
  const allRows = structuredClone(data); allRows.targets[0].n_from = 0; allRows.targets[0].n_to = 0;
  const kat = sourceCoefficientCatalog(allRows);
  expect(coefficientCandidates(kat, source('Е01-01-030-999'))).toHaveLength(1);
  expect(coefficientCandidates(kat, source('Е01-01-031-1'))).toEqual([]);
  expect(coefficientCandidates(kat, source('Е01-02-030-1'))).toEqual([]);
});

it('rejects same-size tampered JSON by SHA-256 rather than trusting parsed fields', async () => {
  const body = JSON.stringify(data), bytes = new TextEncoder().encode(body);
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
  const fetcher = async (url: string) => new Response(url.includes('manifest') ? JSON.stringify({ schema: 'norm-library-release-v1', revision, objects: [{ file: 'coefficient-rules.json', bytes: bytes.length, sha256: hash }] }) : body.replace('0.95', '0.85'));
  await expect(normLibraryCoefficients(fetcher)).rejects.toThrow('COEFFICIENT_INTEGRITY_FAILED');
});

