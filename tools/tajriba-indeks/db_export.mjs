// READ-ONLY export of the approved/active smeta norm lines for the LOCAL experience-index build and eval.
//   node db_export.mjs <out.jsonl>
// Needs the `pg` package (resolve it with TAJRIBA_PG_DIR=<folder that has node_modules/pg> when it is not installed here) and
// SMETA_DB_URL in the environment (never printed). Runs inside one READ ONLY transaction: it cannot write.
// Same selection as supabase/manual/NOT_APPLIED_t2_tajriba_indeks_oqish_v1.sql (active object of type 'obyekt', active norm lines,
// no added extras / replacements). The output holds real smeta text: keep it OUTSIDE the repository (the repo is public).
import fs from 'node:fs';
import { createRequire } from 'node:module';

const out = process.argv[2];
if (!out) { console.error('usage: node db_export.mjs <out.jsonl>'); process.exit(2); }
if (!process.env.SMETA_DB_URL) { console.error('SMETA_DB_URL is not set'); process.exit(2); }
const req = createRequire((process.env.TAJRIBA_PG_DIR ? process.env.TAJRIBA_PG_DIR.replace(/[\\/]+$/, '') + '/' : import.meta.url));
const { Client } = req('pg');

const SQL = `
select o.kompaniya_id, q.obyekt_id, q.id, q.tartib, q.kod, q.nom, q.birlik, p.nom as b1, g.nom as b2,
       extract(epoch from q.yaratildi)::bigint as t
from public.t2_qator q
join public.t2_obyekt o on o.id = q.obyekt_id and o.holat = 'faol' and o.tur = 'obyekt'
left join public.t2_qator p on p.id = q.ota_id
left join public.t2_qator g on g.id = p.ota_id
where q.tur = 'bl' and q.versiya_holat = 'faol' and q.kod is not null and q.kod <> '' and q.nom is not null
  and not q.qoshimcha and not q.zamena
order by q.obyekt_id, q.tartib, q.id`;

const c = new Client({ connectionString: process.env.SMETA_DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
try {
  await c.query('begin read only');
  const r = await c.query(SQL);
  await c.query('rollback');
  const w = fs.createWriteStream(out, { encoding: 'utf8' });
  for (const x of r.rows) {
    w.write(JSON.stringify({ kompaniya: x.kompaniya_id, obyekt: x.obyekt_id, id: Number(x.id), tartib: x.tartib, kod: x.kod, nom: x.nom, birlik: x.birlik, bolim: [x.b2, x.b1].filter(Boolean), t: Number(x.t) }) + '\n');
  }
  await new Promise(ok => w.end(ok));
  console.log(`rows: ${r.rows.length}, objects: ${new Set(r.rows.map(x => x.obyekt_id)).size}`);
} finally { await c.end(); }
