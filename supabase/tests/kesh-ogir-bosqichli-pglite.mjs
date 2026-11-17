// Local synthetic-only test. PGLITE_DIR points to an installed @electric-sql/pglite package.
// Proves: one step per invocation, stalest/unchanged logic, failed step does not block the queue, escalation to 'katta', budget (statement_timeout) respected.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const runtime = process.env.PGLITE_DIR;
const { PGlite } = await import(runtime ? pathToFileURL(resolve(runtime, 'dist/index.js')).href : '@electric-sql/pglite');
const db = new PGlite();
const sql = await readFile(new URL('../migrations/20261231000000_kesh_ogir_bosqichli.sql', import.meta.url), 'utf8');
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };
const q = async (s) => (await db.query(s)).rows;
const tanla = async (d = 'oddiy') => (await q(`select public.t2_kesh_qadam_tanla_v1('${d}') r`))[0].r;
const bajar = async (d = 'oddiy') => (await q(`select public.t2_kesh_qadam_bajar_v1('${d}') r`))[0].r;
try {
  ok(!/\b(begin|commit)\s*;/i.test(sql), 'migration has no BEGIN/COMMIT');
  await db.exec(`
    create role anon; create role authenticated;
    create table t2_obyekt(id bigint primary key);
    create table t2_obyekt_kesh(obyekt_id bigint primary key, smeta jsonb, smeta_joriy jsonb, hisob_ms int);
    create table t2_obyekt_kesh_iflos(obyekt_id bigint primary key, versiya bigint, vaqt timestamptz);
    create table t2_obyekt_natija_kesh(obyekt_id bigint, kalit text, natija jsonb, hisoblandi timestamptz, primary key(obyekt_id,kalit));
    -- synthetic compute functions: object 3 'muhr_farq' is slow (sleeps), object 2 'price_control' always errors
    create function _t2_smeta_ozgarish_qatlam_hisob_v1(o bigint, a jsonb, b jsonb) returns jsonb language sql as $$select '{"ok":true}'::jsonb$$;
    create function _t2_price_control_hisob_v1(o bigint) returns jsonb language plpgsql as $$begin
      if o = 2 then raise exception 'SYNTHETIC_FAIL'; end if; return '{"ok":true}'::jsonb; end$$;
    create function _t2_akt_reestr_hisob_v1(o bigint) returns jsonb language sql as $$select '{"ok":true,"qatorlar":[]}'::jsonb$$;
    create function _t2_qator_muhr_farq_hisob_v1(o bigint) returns jsonb language plpgsql as $$begin
      -- PGlite has no statement_timeout timer; SQLSTATE 57014 (query_canceled) is what a real timeout raises and is NOT caught by "when others".
      if o = 3 and current_setting('app.slow', true) = '1' then raise exception 'canceling statement due to statement timeout' using errcode = '57014'; end if;
      return '{"ok":true}'::jsonb; end$$;
    insert into t2_obyekt values (1),(2),(3),(4);
    insert into t2_obyekt_kesh values (1,'{}','{}',10),(2,'{}','{}',10),(3,'{}','{}',10),(4,'{}','{}',10);
  `);
  await db.exec(sql); // cron block is skipped: no pg_cron extension in PGlite
  ok((await q("select to_regclass('public.t2_kesh_qadam') t"))[0].t !== null, 'state table exists');

  // 1) incremental: each invocation handles exactly ONE step; akt_reestr first for all objects
  const seen = [];
  for (let i = 0; i < 4; i++) {
    const t = await tanla(); seen.push(t.tanlandi.obyekt_id + ':' + t.tanlandi.kalit);
    const b = await bajar(); ok(b.ok && b.xato === false, 'step ok ' + i);
    ok((await q('select count(*)::int n from t2_obyekt_natija_kesh'))[0].n === i + 1, 'exactly one row added per invocation');
  }
  ok(seen.every((s) => s.endsWith(':akt_reestr')), 'akt_reestr filled for every object first: ' + seen);

  // 2) live claim blocks a second claim (no double work)
  const t1 = await tanla(); ok(t1.tanlandi, 'claimed');
  ok((await tanla()).o_tkazildi === 'band_qadam', 'live claim blocks another claim');
  await bajar();

  // 3) drain price_control: object 2 fails but must not block others; then muhr_farq/qatlam
  for (let i = 0; i < 30; i++) { const t = await tanla(); if (!t.tanlandi) break; await bajar(); }
  const fail = (await q("select * from t2_kesh_qadam where obyekt_id=2 and kalit='price_control'"))[0];
  ok(fail && fail.holat === 'xato' && fail.urinish >= 1, 'failing step recorded as xato');
  ok((await q("select count(*)::int n from t2_obyekt_natija_kesh where natija ? '_xato'"))[0].n === 1, 'failing step marked _xato (readers go live)');
  // object 2 price_control failed twice in oddiy tier -> now only katta tier may pick it
  ok((await q("select urinish from t2_kesh_qadam where obyekt_id=2 and kalit='price_control'"))[0].urinish === 2, 'two oddiy attempts');
  ok((await tanla('oddiy')).navbat === 'bo_sh', 'oddiy queue empty: everything else filled, failing step skipped');
  const done = (await q("select count(*)::int n from t2_obyekt_natija_kesh where not (natija ? '_xato')"))[0].n;
  ok(done === 15, 'all other steps (4x4 - 1) computed: ' + done);

  // 4) unchanged objects are not recomputed
  const before = (await q("select max(hisoblandi) m from t2_obyekt_natija_kesh where obyekt_id=1"))[0].m;
  ok((await tanla()).navbat === 'bo_sh', 'nothing to do for unchanged objects');
  ok(+(await q("select max(hisoblandi) m from t2_obyekt_natija_kesh where obyekt_id=1"))[0].m === +before, 'cache rows untouched');

  // 5) dirty object skipped; stale cache (3 days) re-picked
  await db.exec("insert into t2_obyekt_kesh_iflos values (4,1,now()); update t2_obyekt_natija_kesh set hisoblandi = now() - interval '3 days' where obyekt_id=4");
  ok((await tanla()).navbat === 'bo_sh', 'dirty object is left to the light job');
  await db.exec('delete from t2_obyekt_kesh_iflos');
  const t4 = await tanla(); ok(t4.tanlandi && t4.tanlandi.obyekt_id === 4, 'stale object picked again'); await bajar();

  // 6) katta tier takes the twice-failed step
  const tk = await tanla('katta'); ok(tk.tanlandi && tk.tanlandi.obyekt_id === 2 && tk.tanlandi.kalit === 'price_control', 'katta tier picks failed step');
  ok((await bajar('oddiy')).o_tkazildi === 'tanlanmagan', 'oddiy runner ignores katta claim');
  await bajar('katta');

  // 7) budget: a step that exceeds statement_timeout is cancelled ALONE; the claim survives and the next claim moves on
  await db.exec("create or replace function _t2_price_control_hisob_v1(o bigint) returns jsonb language sql as $$select '{\"ok\":true}'::jsonb$$");
  await db.exec("update t2_obyekt_natija_kesh set natija='{\"ok\":true}' where natija ? '_xato'; delete from t2_obyekt_natija_kesh where obyekt_id=3 and kalit='muhr_farq'; delete from t2_kesh_qadam");
  await db.exec("update t2_obyekt_natija_kesh set hisoblandi = now()"); // everything else fresh
  const t3 = await tanla(); ok(t3.tanlandi.obyekt_id === 3 && t3.tanlandi.kalit === 'muhr_farq', 'slow step claimed');
  await db.exec("set app.slow = '1'");
  let timedOut = false;
  try { await bajar(); } catch (e) { timedOut = /statement timeout/.test(String(e.message)); }
  await db.exec("set app.slow = '0'");
  ok(timedOut, 'slow step hit the budget (statement_timeout)');
  const claim = (await q("select holat, urinish from t2_kesh_qadam where obyekt_id=3 and kalit='muhr_farq'"))[0];
  ok(claim.holat === 'ishlamoqda' && claim.urinish === 1, 'claim committed before the timeout and survives it');
  ok((await q("select count(*)::int n from t2_obyekt_natija_kesh where obyekt_id=3 and kalit='muhr_farq'"))[0].n === 0, 'timed-out step wrote nothing (no partial work, others untouched)');
  await db.exec("update t2_kesh_qadam set tanlandi = now() - interval '5 minutes'"); // claim became stale
  const t3b = await tanla(); ok(t3b.tanlandi && t3b.tanlandi.urinish === 2, 'stale claim counted as failure, retried with urinish 2');
  await db.exec("update t2_kesh_qadam set tanlandi = now() - interval '5 minutes'");
  ok((await tanla()).navbat === 'bo_sh', 'after 2 failures oddiy tier gives up on the step (does not block the queue)');
  ok((await q("select count(*)::int n from t2_kesh_qadam where holat='xato' and urinish=2"))[0].n === 1, 'step marked xato');
  ok((await tanla('katta')).tanlandi?.kalit === 'muhr_farq', 'escalated to katta tier');

  // 8) holat summary + grants
  const h = (await q('select public.t2_kesh_holat_v1() h'))[0].h;
  ok(h.obyektlar === 4 && Array.isArray(h.ogir_qadamlar), 'holat summary');
  ok((await q("select has_function_privilege('anon','public.t2_kesh_qadam_tanla_v1(text,integer)','execute') a"))[0].a === false, 'anon has no execute');
  console.log('OK', checks, 'checks');
} catch (e) { console.error(e); process.exitCode = 1; } finally { await db.close(); }
