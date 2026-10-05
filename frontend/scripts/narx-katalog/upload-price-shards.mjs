// Upload built price catalogue shards to private R2 (resumable, idempotent; CURRENT written last).
//   node scripts/narx-katalog/upload-price-shards.mjs <built-dir> [--activate]
// Uses the operator's existing `wrangler login` OAuth token (refresh with `npx wrangler whoami`).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

const [dir, flag] = process.argv.slice(2);
if (!dir) throw new Error('usage: upload-price-shards.mjs <built-dir> [--activate]');
const toml = readFileSync(join(process.env.APPDATA ?? '', 'xdg.config/.wrangler/config/default.toml'), 'utf8');
const token = process.env.CLOUDFLARE_API_TOKEN ?? toml.match(/oauth_token = "([^"]+)"/)?.[1];
const expires = toml.match(/expiration_time = "([^"]+)"/)?.[1];
if (!process.env.CLOUDFLARE_API_TOKEN && expires && Date.parse(expires) < Date.now() + 60_000) throw new Error('TOKEN_EXPIRED: npx wrangler whoami');
const account = process.env.CLOUDFLARE_ACCOUNT_ID ?? JSON.parse(readFileSync('node_modules/.cache/wrangler/wrangler-account.json', 'utf8')).account.id;
const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
if (!/^[a-f0-9]{16}$/.test(manifest.revision)) throw new Error('REVISION_INVALID');
const prefix = `narx-katalog/${manifest.revision}/`;
const logPath = join(dir, 'upload-log.json');
const log = existsSync(logPath) ? JSON.parse(readFileSync(logPath, 'utf8')) : {};
const files = [manifest.files.dict, ...manifest.files.rows, ...(manifest.files.lookup ?? [])];

async function put(key, body) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets/smeta-tizimi-canonical/objects/${key.split('/').map(encodeURIComponent).join('/')}`;
  for (let attempt = 1; ; attempt++) {
    const r = await fetch(url, { method: 'PUT', body, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' } });
    if (r.ok) return;
    if (attempt >= 4 || (r.status < 500 && r.status !== 429)) throw new Error(`PUT ${key} → ${r.status} ${(await r.text()).slice(0, 300)}`);
    await new Promise(ok => setTimeout(ok, attempt * 2000));
  }
}
let done = 0;
for (const f of [...files, { path: 'manifest.json' }]) {
  const gz = readFileSync(join(dir, 'gz', f.path + '.gz'));
  const sha = createHash('sha256').update(gunzipSync(gz)).digest('hex');
  if (f.sha256 && sha !== f.sha256) throw new Error('LOCAL_SHA_MISMATCH ' + f.path);
  if (log[f.path] === sha) continue;
  await put(prefix + f.path, gz);
  log[f.path] = sha; writeFileSync(logPath, JSON.stringify(log, null, 1)); done++;
}
console.info('uploaded', done, 'files to', prefix);
if (flag === '--activate') {
  for (const f of files) if (log[f.path] !== f.sha256) throw new Error('NOT_ALL_UPLOADED ' + f.path);
  if (!log['manifest.json']) throw new Error('MANIFEST_NOT_UPLOADED');
  await put('narx-katalog/CURRENT.json', gzipSync(Buffer.from(JSON.stringify({ revision: manifest.revision, schema: manifest.schema }))));
  console.info('activated', manifest.revision);
}
