// Delete superseded norm-katalog revisions from R2. Never touches the revision CURRENT points to,
// and never touches keys outside `norm-katalog/<16-hex>/`.
//   node scripts/catalog-extraction/prune-norm-revisions.mjs            (dry run)
//   node scripts/catalog-extraction/prune-norm-revisions.mjs --delete
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

const del = process.argv.includes('--delete');
const toml = readFileSync(join(process.env.APPDATA ?? '', 'xdg.config/.wrangler/config/default.toml'), 'utf8');
const token = toml.match(/oauth_token = "([^"]+)"/)[1];
const account = JSON.parse(readFileSync('node_modules/.cache/wrangler/wrangler-account.json', 'utf8')).account.id;
const base = `https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets/smeta-tizimi-canonical/objects`;
const H = { Authorization: 'Bearer ' + token };

const cur = await fetch(base + '/norm-katalog/CURRENT.json', { headers: H });
if (!cur.ok) throw new Error('CURRENT not readable: ' + cur.status);
const buf = Buffer.from(await cur.arrayBuffer());
let text; try { text = gunzipSync(buf).toString(); } catch { text = buf.toString(); }
const current = JSON.parse(text).revision;
if (!/^[a-f0-9]{16}$/.test(current)) throw new Error('CURRENT invalid');

const keys = [];
for (let cursor = ''; ;) {
  const r = await (await fetch(`${base}?prefix=norm-katalog/&per_page=1000${cursor ? '&cursor=' + cursor : ''}`, { headers: H })).json();
  if (!r.success) throw new Error(JSON.stringify(r.errors));
  keys.push(...r.result.map(o => o.key));
  cursor = r.result_info?.cursor; if (!r.result_info?.is_truncated || !cursor) break;
}
const victims = keys.filter(k => { const m = k.match(/^norm-katalog\/([a-f0-9]{16})\//); return m && m[1] !== current; });
console.log('CURRENT', current, '· jami', keys.length, '· o‘chiriladigan', victims.length, [...new Set(victims.map(k => k.split('/')[1]))].join(' '));
if (del) for (const k of victims) {
  const r = await fetch(base + '/' + k.split('/').map(encodeURIComponent).join('/'), { method: 'DELETE', headers: H });
  if (!r.ok) throw new Error('DELETE ' + k + ' ' + r.status);
}
if (del) console.log('deleted', victims.length);
