// Print the latest Cloudflare Pages deployment for a commit (uses the operator's wrangler login).
//   node scripts/catalog-extraction/pages-status.mjs <commit-prefix> [--wait]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const [commit, flag] = process.argv.slice(2);
const toml = readFileSync(join(process.env.APPDATA ?? '', 'xdg.config/.wrangler/config/default.toml'), 'utf8');
const token = toml.match(/oauth_token = "([^"]+)"/)[1];
const account = JSON.parse(readFileSync('node_modules/.cache/wrangler/wrangler-account.json', 'utf8')).account.id;
for (let i = 0; ; i++) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/pages/projects/smeta-tizimi/deployments?per_page=10`, { headers: { Authorization: 'Bearer ' + token } }).catch(() => null);
  if (!r || !r.ok) { console.log(`API_ERROR ${r?.status ?? 'network'} — token eskirgan bo‘lsa: npx wrangler whoami`); if (flag !== '--wait' || i > 60) break; await new Promise(ok => setTimeout(ok, 20000)); continue; }
  const j = await r.json().catch(() => ({}));
  const d = (j.result ?? []).find(x => (x.deployment_trigger?.metadata?.commit_hash ?? '').startsWith(commit));
  const status = d?.latest_stage ? `${d.latest_stage.name}:${d.latest_stage.status}` : 'not-found';
  const done = d && (d.latest_stage.status === 'failure' || d.latest_stage.status === 'canceled' || (d.latest_stage.name === 'deploy' && d.latest_stage.status === 'success'));
  if (done || flag !== '--wait' || i > 60) { console.log(status, d?.environment ?? '', d?.url ?? '', (d?.aliases ?? []).join(' ')); break; }
  await new Promise(ok => setTimeout(ok, 20000));
}
