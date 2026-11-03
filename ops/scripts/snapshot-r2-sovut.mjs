#!/usr/bin/env node
// snapshot.bolak_mazmun sovuq mazmunini R2 ga ko'chirish (saqlash dietasi). IDEMPOTENT, TO'XTATIB DAVOM ETTIRILADI.
//
//   node ops/scripts/snapshot-r2-sovut.mjs --dry-run                       # nima ko'chishi va qancha MB bo'shashi (hech narsa yozilmaydi)
//   node ops/scripts/snapshot-r2-sovut.mjs --apply --older-than-days 3     # haqiqiy ko'chirish
//   node ops/scripts/snapshot-r2-sovut.mjs --statistika                    # issiq/sovuq hisobot
//   node ops/scripts/snapshot-r2-sovut.mjs --apply --hammasini-tikla       # hammasini R2 dan bazaga qaytarish (rollback oldidan)
//
// Bayroqlar: --older-than-days N (standart 3) · --limit N (bir partiya, standart 200) · --max-blok N (jami chegara) ·
//            --include-latest (obyektning so'nggi snapshoti bloklari ham) · --log <fayl> (JSONL; standart: tmp)
// Muhit (mavjud nomlar, hech qachon chop etilmaydi): SMETA_DB_URL; CLOUDFLARE_API_TOKEN va CLOUDFLARE_ACCOUNT_ID
//   (bo'lmasa — `wrangler login` OAuth tokeni va frontend/node_modules/.cache/wrangler, upload-price-shards.mjs kabi).
//   `pg` moduli: `cd ops/scripts && npm i --no-save pg` yoki PG_MODULE_DIR=<pg turgan papka>.
//
// XAVFSIZLIK: har blok uchun R2 ga yozilgach QAYTA O'QILADI va sha256 solishtiriladi; faqat shundan keyin DB (o'zi ham sha256 ni
// tekshirib) mazmunni NULL qiladi. Hech narsa o'chirilmaydi. Bo'shagan joy: VACUUM FULL snapshot.bolak_mazmun dan keyin (oxirida eslatiladi).
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cloudflareR2, sovutBlok, tiklaBlok } from '../../frontend/src/lib/snapshot-r2/sovuq.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const bayroq = (n) => argv.includes(n);
const qiymat = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const apply = bayroq('--apply');
const dryRun = bayroq('--dry-run') || !apply;
const kun = Number(qiymat('--older-than-days', '3'));
const limit = Number(qiymat('--limit', '200'));
const maxBlok = Number(qiymat('--max-blok', '1000000'));
const songgiHam = bayroq('--include-latest');
const logFayl = qiymat('--log', join(tmpdir(), 'snapshot-r2-sovut.log.jsonl'));
if (!Number.isInteger(kun) || kun < 1) throw new Error('--older-than-days butun son >= 1 bo\'lishi kerak');

const jurnal = (o) => appendFileSync(logFayl, JSON.stringify({ t: new Date().toISOString(), ...o }) + '\n');
const chop = (s) => { console.info(s); };
const mb = (b) => (b / 1048576).toFixed(1) + ' MB';

async function pgYukla() {
  const dir = process.env.PG_MODULE_DIR;
  try {
    const req = createRequire(dir ? join(resolve(dir), 'x.js') : join(__dirname, 'x.js'));
    return req('pg');
  } catch {
    throw new Error('`pg` moduli topilmadi: `cd ops/scripts && npm i --no-save pg` yoki PG_MODULE_DIR=<papka> bering.');
  }
}

function r2Muhit() {
  let token = process.env.CLOUDFLARE_API_TOKEN;
  let account = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token) {
    const toml = join(process.env.APPDATA ?? '', 'xdg.config/.wrangler/config/default.toml');
    if (!existsSync(toml)) throw new Error('CLOUDFLARE_API_TOKEN yo\'q va wrangler login topilmadi');
    const t = readFileSync(toml, 'utf8');
    token = t.match(/oauth_token = "([^"]+)"/)?.[1];
    const exp = t.match(/expiration_time = "([^"]+)"/)?.[1];
    if (exp && Date.parse(exp) < Date.now() + 60_000) throw new Error('TOKEN_EXPIRED: npx wrangler whoami');
  }
  if (!account) {
    const p = resolve(__dirname, '../../frontend/node_modules/.cache/wrangler/wrangler-account.json');
    if (existsSync(p)) account = JSON.parse(readFileSync(p, 'utf8')).account?.id;
  }
  if (!token || !account) throw new Error('R2 sozlamasi yetarli emas (CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID)');
  return { token, account };
}

const dbUrl = process.env.SMETA_DB_URL?.trim();
if (!dbUrl) throw new Error('SMETA_DB_URL muhit o\'zgaruvchisi o\'rnatilmagan');
const pg = await pgYukla();
const u = new URL(dbUrl);
for (const k of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'uselibpqcompat']) u.searchParams.delete(k);
const lokal = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(u.hostname);
const client = new pg.Client({ connectionString: u.toString(), ssl: lokal ? false : { rejectUnauthorized: false }, application_name: 'snapshot-r2-sovut' });
await client.connect();
const db = { query: (sql, params) => client.query(sql, params) };

try {
  if (bayroq('--statistika')) {
    const s = (await db.query('select snapshot.sovuq_statistika() as s')).rows[0].s;
    chop(`issiq: ${s.issiq_blok} blok, ${mb(s.issiq_bayt)} · sovuq: ${s.sovuq_blok} blok, ${mb(s.sovuq_bayt)} (R2: ${mb(s.r2_bayt)})`);
  } else if (bayroq('--hammasini-tikla')) {
    const r2 = cloudflareR2(r2Muhit());
    const rows = (await db.query('select xesh, r2_key, r2_sha256 from snapshot.bolak_mazmun where qatorlar is null')).rows;
    chop(`tiklanadigan sovuq bloklar: ${rows.length}${dryRun ? ' (dry-run — yozilmaydi)' : ''}`);
    let n = 0;
    for (const b of rows) {
      if (dryRun) continue;
      if (await tiklaBlok(db, r2, b)) n++;
      jurnal({ amal: 'tikla', xesh: b.xesh });
    }
    chop(`tiklandi: ${n}`);
  } else {
    const r2 = dryRun ? null : cloudflareR2(r2Muhit());
    let jamiBlok = 0, jamiBayt = 0, jamiR2 = 0, xato = 0;
    chop(`${dryRun ? 'DRY-RUN' : 'HAQIQIY'}: ${kun} kundan eski snapshotlar bloklari${songgiHam ? ' (so\'nggi snapshot ham)' : ''}, partiya ${limit}, jurnal: ${logFayl}`);
    const korilgan = new Set();
    for (;;) {
      const nomzodlar = (await db.query('select xesh, jadval, qator_soni, bayt from snapshot.sovuq_nomzod($1, $2, $3)', [kun, limit, songgiHam])).rows
        .filter((n) => !korilgan.has(n.xesh));
      if (!nomzodlar.length || jamiBlok >= maxBlok) break;
      for (const n of nomzodlar) {
        if (jamiBlok >= maxBlok) break;
        korilgan.add(n.xesh);
        try {
          const r = await sovutBlok(db, r2, { ...n, qator_soni: Number(n.qator_soni), bayt: Number(n.bayt) }, { dryRun, log: () => undefined });
          jamiBlok++; jamiBayt += r.bayt_bosh; jamiR2 += r.r2_bayt;
          jurnal({ amal: dryRun ? 'dry-run' : 'sovut', xesh: n.xesh, jadval: n.jadval, db_bayt: r.bayt_bosh, r2_bayt: r.r2_bayt, holat: r.holat });
          if (jamiBlok % 25 === 0) chop(`... ${jamiBlok} blok, ${mb(jamiBayt)} bo'shadi, R2 ${mb(jamiR2)}`);
        } catch (e) {
          xato++;
          jurnal({ amal: 'xato', xesh: n.xesh, xato: String(e instanceof Error ? e.message : e) });
          chop(`XATO ${n.xesh.slice(0, 12)}: ${e instanceof Error ? e.message : e} (blok bazada TEGILMAGAN, davom etamiz)`);
          if (xato >= 20) throw new Error('20 ta xato — to\'xtatildi (jurnalni ko\'ring)');
        }
      }
      if (dryRun) break; // dry-run: bitta partiya ro'yxati yetarli emas — pastda umumiy hisob
    }
    if (dryRun) {
      const jami = (await db.query('select count(*)::int n, coalesce(sum(bayt),0)::bigint b from snapshot.sovuq_nomzod($1, 5000, $2)', [kun, songgiHam])).rows[0];
      chop(`DRY-RUN natija: ko'chadi ~${jami.n} blok (bir so'rovda eng ko'pi 5000), DB dan ~${mb(Number(jami.b))} bo'shaydi. Hech narsa yozilmadi.`);
    } else {
      chop(`TAYYOR: ${jamiBlok} blok sovutildi, bazadan ${mb(jamiBayt)} (siqilmagan hisobda), R2 ga ${mb(jamiR2)}; xatolar: ${xato}`);
      chop('Diskni qaytarish uchun (jadval qisqa muddat qulflanadi): VACUUM FULL snapshot.bolak_mazmun;');
    }
  }
} finally {
  await client.end();
}
