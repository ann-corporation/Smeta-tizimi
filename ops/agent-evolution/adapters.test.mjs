import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { validatePatch, childEnv } from './services.mjs';
import { createAdapters } from './github-pages-adapters.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const SRC = 'ops/agent-evolution/x.mjs', TST = 'ops/agent-evolution/x.test.mjs', OTHER = 'ops/agent-evolution/y.mjs';

async function fixture(t, answer) {
  const dir = await mkdtemp(join(tmpdir(), 'evolution-adapters-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const main = join(dir, 'main'), wt = join(dir, 'wt'), priv = join(dir, 'private');
  await mkdir(join(main, 'ops/agent-evolution'), { recursive: true });
  git(dir, 'init', '-q', main);
  await writeFile(join(main, SRC), 'export const a = 1;\n');
  await writeFile(join(main, TST), 'export const t = 1;\n');
  await writeFile(join(main, OTHER), 'export const b = 1;\n');
  git(main, 'add', '.');
  git(main, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'base');
  const baseSha = git(main, 'rev-parse', 'HEAD');
  git(main, 'worktree', 'add', '-q', '--detach', wt, baseSha);
  const entry = join(dir, 'fake-codex.mjs');
  await writeFile(join(dir, 'answer.json'), JSON.stringify(answer));
  await writeFile(entry, `import {readFileSync,writeFileSync} from 'node:fs';
const a=process.argv,o=a[a.indexOf('-o')+1];
writeFileSync(o,readFileSync(${JSON.stringify(join(dir, 'answer.json'))},'utf8'));
writeFileSync(${JSON.stringify(join(dir, 'env.json'))},JSON.stringify(Object.keys(process.env)));
`);
  const reproducer = join(dir, 'repro.mjs');
  await writeFile(reproducer, `console.log(JSON.stringify({reproduced:true,baselineRecorded:true}));`);
  const adapters = createAdapters({ repo: 'a/b', project: 'p', sourceFiles: [SRC, TST, OTHER], worktree: wt, privateDirectory: priv, codexEntry: entry, reproducer });
  const job = { id: 'j1', goal: 'g', baseSha, ownedPaths: [SRC], acceptanceCriteria: [], results: {} };
  return { dir, main, wt, baseSha, adapters, job, signal: new AbortController().signal };
}

test('validatePatch rejects test files, workflows and paths outside ownedPaths', () => {
  assert.throws(() => validatePatch([{ path: TST, content: 'x' }], [TST]), /PATCH_PROTECTED_PATH/);
  assert.throws(() => validatePatch([{ path: '.github/workflows/a.yml', content: 'x' }], ['.github/workflows/a.yml']), /PATCH_PROTECTED_PATH/);
  assert.throws(() => validatePatch([{ path: OTHER, content: 'x' }], [SRC, OTHER], 60000, [SRC]), /OUTSIDE_OWNED_PATHS/);
  assert.equal(validatePatch([{ path: SRC, content: 'x' }], [SRC], 60000, ['ops/agent-evolution']).length, 1);
});

test('childEnv is an allowlist without credentials', () => {
  const env = childEnv({ PATH: 'p', HOME: 'h', GH_TOKEN: 'x', GITHUB_TOKEN: 'x', SMETA_DB_URL: 'x', CLOUDFLARE_API_TOKEN: 'x', OPENAI_API_KEY: 'x', RANDOM: 'x' });
  assert.deepEqual(Object.keys(env).sort(), ['HOME', 'PATH']);
});

test('engineer rejects a patch touching a test file and leaves the worktree clean', async t => {
  const f = await fixture(t, { files: [{ path: TST, content: 'export const t = 2;\n' }], summary: 's' });
  await assert.rejects(f.adapters.engineer({ job: { ...f.job, ownedPaths: ['ops/agent-evolution'] }, signal: f.signal }), /PATCH_PROTECTED_PATH/);
  assert.equal(git(f.wt, 'status', '--porcelain'), '');
  assert.equal(git(f.wt, 'rev-parse', 'HEAD'), f.baseSha);
});

test('engineer enforces ownedPaths before writing', async t => {
  const f = await fixture(t, { files: [{ path: OTHER, content: 'export const b = 2;\n' }], summary: 's' });
  await assert.rejects(f.adapters.engineer({ job: f.job, signal: f.signal }), /OUTSIDE_OWNED_PATHS/);
  assert.equal(git(f.wt, 'status', '--porcelain'), '');
  assert.match(await readFile(join(f.wt, OTHER), 'utf8'), /b = 1;/);
});

test('failed diff --check cleans the worktree; model child gets no credentials', async t => {
  const f = await fixture(t, { files: [{ path: SRC, content: 'export const a = 2; \n' }], summary: 's' });
  process.env.GH_TOKEN = 'secret'; t.after(() => { delete process.env.GH_TOKEN; });
  await assert.rejects(f.adapters.engineer({ job: f.job, signal: f.signal }), /PROCESS_FAILED:git/);
  assert.equal(git(f.wt, 'status', '--porcelain'), '');
  assert.equal(JSON.parse(await readFile(join(f.dir, 'env.json'), 'utf8')).includes('GH_TOKEN'), false);
});

test('worktree returns to base for the next job after a successful engineer', async t => {
  const f = await fixture(t, { files: [{ path: SRC, content: 'export const a = 2;\n' }], summary: 's' });
  const r = await f.adapters.engineer({ job: f.job, signal: f.signal });
  assert.deepEqual(r.changedPaths, [SRC]);
  assert.notEqual(git(f.wt, 'rev-parse', 'HEAD'), f.baseSha);
  const d = await f.adapters.diagnose({ job: f.job, signal: f.signal });
  assert.equal(d.reproduced, true);
  assert.equal(git(f.wt, 'rev-parse', 'HEAD'), f.baseSha);
});

test('cleanup refuses a non-linked (main) worktree', async t => {
  const f = await fixture(t, {});
  const a = createAdapters({ repo: 'a/b', project: 'p', sourceFiles: [SRC], worktree: f.main, privateDirectory: join(f.dir, 'p2'), codexEntry: 'x', reproducer: 'y' });
  await assert.rejects(a.diagnose({ job: f.job, signal: f.signal }), /NOT_DEDICATED_WORKTREE/);
});
