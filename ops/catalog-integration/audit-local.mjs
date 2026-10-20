import { createReadStream, openSync, writeSync, closeSync } from 'node:fs';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline';
import { resolve, dirname, join, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CoefficientAudit } from './coefficient-gate.mjs';

export async function sha256(path) {
  const hash = createHash('sha256'); for await (const chunk of createReadStream(path)) hash.update(chunk); return hash.digest('hex');
}
export async function* jsonLines(path) {
  const reader = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  let row = 0;
  try { for await (const line of reader) { row++; if (!line.trim()) continue; if (line.length > 2_000_000) throw new Error(`JSONL_ROW_TOO_LARGE:${row}`); try { yield JSON.parse(line); } catch { throw new Error(`JSONL_INVALID:${row}`); } } }
  finally { reader.close(); }
}
export async function auditLocal(root, runtimePath, options) {
  const source = join(root, 'compact-estimate-reference-v1-20261005');
  const support = join(root, 'outputs/norm-suggestion-support-v1');
  const manifest = JSON.parse(await readFile(join(support, 'manifest.json'), 'utf8'));
  const paths = { rules: join(source, 'COEFFICIENT_RULES.jsonl'), links: join(source, 'COEFFICIENT_LINKS.jsonl') };
  const hashes = {};
  for (const [name, file] of Object.entries(paths)) {
    const field = name === 'rules' ? 'COEFFICIENT_RULES.jsonl' : 'COEFFICIENT_LINKS.jsonl';
    hashes[name] = await sha256(file);
    if (hashes[name] !== manifest.sourceHashes?.[field]) throw new Error(`SOURCE_HASH_MISMATCH:${name}`);
  }
  const runtimeBytes = await readFile(runtimePath);
  const audit = new CoefficientAudit(JSON.parse(runtimeBytes.toString('utf8')), options);
  for await (const row of jsonLines(paths.rules)) audit.addRule(row);
  for await (const row of jsonLines(paths.links)) audit.addLink(row);
  const report = audit.finish();
  if (report.counts.sourceRules !== manifest.counts?.rules || report.counts.sourceLinks !== manifest.counts?.links) throw new Error('SOURCE_COUNT_MISMATCH');
  const inventory = [];
  for (const [kind, relative] of [
    ['edition-and-scope', 'compact-estimate-reference-v1-20261005/SCOPE_VERIFICATION.json'],
    ['recipe-quality', 'compact-estimate-reference-v1-20261005/recipe-review-v2/manifest.json'],
    ['recipe-drilldown', 'compact-estimate-reference-v1-20261005/recipe-drilldown-v1/manifest.json'],
    ['hour-prices', 'outputs/hour-price-catalog-v1/manifest.json'],
    ['coefficient-support', 'outputs/norm-suggestion-support-v1/manifest.json'],
  ]) {
    const path = join(root, relative);
    try { const s = await stat(path); inventory.push({ kind, path, bytes: s.size, sha256: await sha256(path), status: 'LOCAL_MANIFEST_PRESENT', runtimeBindingVerified: false }); }
    catch (e) { if (e.code !== 'ENOENT') throw e; inventory.push({ kind, path, status: 'LOCAL_MANIFEST_NOT_FOUND', runtimeBindingVerified: false }); }
  }
  return { ...report, evidence: { sourceRevision: manifest.sourceVersionRevision, supportRevision: manifest.revision, hashes: { ...hashes, runtime: createHash('sha256').update(runtimeBytes).digest('hex') }, runtimePath }, inventory };
}
async function main(args) {
  const options = new Map();
  for (let i = 0; i < args.length; i += 2) { if (!['--root', '--runtime', '--report'].includes(args[i]) || !args[i + 1] || options.has(args[i])) throw new Error('ARGS_INVALID'); options.set(args[i], args[i + 1]); }
  if (options.size !== 3) throw new Error('USE --root <CatalogMigration> --runtime <koef.json> --report <private-output.json>');
  const output = resolve(options.get('--report'));
  const outputRelative = relative(resolve(options.get('--root'), 'outputs'), output);
  if (!outputRelative || outputRelative.startsWith('..') || isAbsolute(outputRelative)) throw new Error('OUTPUT_MUST_BE_IN_GENERATED_OUTPUTS');
  if (output === resolve(options.get('--runtime'))) throw new Error('OUTPUT_OVERWRITES_INPUT');
  if (output.startsWith(resolve(options.get('--root'), 'compact-estimate-reference-v1-20261005'))) throw new Error('OUTPUT_INSIDE_IMMUTABLE_SOURCE');
  await mkdir(dirname(output), { recursive: true });
  const ledgerPath = `${output}.issues.jsonl`, fd = openSync(ledgerPath, 'wx');
  let report;
  try { report = await auditLocal(resolve(options.get('--root')), resolve(options.get('--runtime')), { onIssue: issue => writeSync(fd, `${JSON.stringify(issue)}\n`) }); }
  finally { closeSync(fd); }
  report.issueLedger = { path: ledgerPath, sha256: await sha256(ledgerPath), complete: true };
  await writeFile(output, JSON.stringify(report, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ counts: report.counts, publicationGate: report.publicationGate, findings: report.findings, output }));
  if (report.blockingFindings) process.exitCode = 2;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main(process.argv.slice(2)).catch(e => { console.error(e.message); process.exitCode = 1; });
