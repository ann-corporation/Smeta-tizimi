// Upload built norm shards to the private canonical R2 bucket, resumable and idempotent.
//   node scripts/catalog-extraction/upload-norm-shards.mjs <built-dir> [--activate]
// Uses the operator's existing `wrangler login` OAuth token (no new secret) against the
// Cloudflare R2 object API. Keys are revision-scoped; files already confirmed in
// <built-dir>/upload-log.json are skipped. `--activate` writes the CURRENT pointer LAST,
// only after every file of the revision is confirmed.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

const [dir, flag] = process.argv.slice(2);
if (!dir) throw new Error('usage: upload-norm-shards.mjs <built-dir> [--activate]');
const BUCKET = 'smeta-tizimi-canonical';
const configPath = [join(process.env.APPDATA ?? '', 'xdg.config/.wrangler/config/default.toml'), join(homedir(), '.wrangler/config/default.toml')].find(existsSync);
const toml = configPath ? readFileSync(configPath, 'utf8') : '';
const token = process.env.CLOUDFLARE_API_TOKEN ?? toml.match(/oauth_token = "([^"]+)"/)?.[1];
const expires = toml.match(/expiration_time = "([^"]+)"/)?.[1];
if (!token) throw new Error('NO_CLOUDFLARE_TOKEN: run `npx wrangler login` first');
if (!process.env.CLOUDFLARE_API_TOKEN && expires && Date.parse(expires) < Date.now() + 60_000) throw new Error('TOKEN_EXPIRED: run `npx wrangler whoami` to refresh');
const account = process.env.CLOUDFLARE_ACCOUNT_ID ?? JSON.parse(readFileSync('node_modules/.cache/wrangler/wrangler-account.json', 'utf8')).account.id;

const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
if (!/^[a-f0-9]{16}$/.test(manifest.revision)) throw new Error('REVISION_INVALID');
const prefix = `norm-katalog/${manifest.revision}/`;
const logPath = join(dir, 'upload-log.json');
const log = existsSync(logPath) ? JSON.parse(readFileSync(logPath, 'utf8')) : {};
const files = [manifest.files.tree, manifest.files.works, ...Object.values(manifest.files.shards)];

async function put(key, body) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets/${BUCKET}/objects/${key.split('/').map(encodeURIComponent).join('/')}`;
  for (let attempt = 1; ; attempt++) {
    const r = await fetch(url, { method: 'PUT', body, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' } });
    if (r.ok) return;
    if (attempt >= 4 || r.status < 500 && r.status !== 429) throw new Error(`PUT ${key} → ${r.status} ${(await r.text()).slice(0, 300)}`);
    await new Promise(ok => setTimeout(ok, attempt * 2000));
  }
}
const queue = [...files, { path: 'manifest.json' }].filter(f => {
  const bytes = gunzipSync(readFileSync(join(dir, 'gz', f.path + '.gz')));
  const sha = createHash('sha256').update(bytes).digest('hex');
  if (f.sha256 && sha !== f.sha256) throw new Error('LOCAL_SHA_MISMATCH ' + f.path);
  f.localSha = sha;
  return log[f.path] !== sha;
});
let done = 0;
await Promise.all(Array.from({ length: 8 }, async () => {
  for (let f = queue.shift(); f; f = queue.shift()) {
    await put(prefix + f.path, readFileSync(join(dir, 'gz', f.path + '.gz')));
    log[f.path] = f.localSha; writeFileSync(logPath, JSON.stringify(log, null, 1));
    done++;
  }
}));
console.info('uploaded', done, 'files to', prefix);
if (flag === '--activate') {
  for (const f of files) if (log[f.path] !== f.sha256) throw new Error('NOT_ALL_UPLOADED ' + f.path);
  if (!log['manifest.json']) throw new Error('MANIFEST_NOT_UPLOADED');
  await put('norm-katalog/CURRENT.json', gzipSync(Buffer.from(JSON.stringify({ revision: manifest.revision, schema: manifest.schema }))));
  console.info('activated', manifest.revision);
}
