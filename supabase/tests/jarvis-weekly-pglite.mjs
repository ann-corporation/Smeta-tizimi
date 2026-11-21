import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const runtime = process.env.PGLITE_DIR ? pathToFileURL(resolve(process.env.PGLITE_DIR, 'dist/index.js')).href : '@electric-sql/pglite';
const { PGlite } = await import(runtime);
const db = new PGlite();
const sql = file => readFile(new URL(file, import.meta.url), 'utf8');
const migration = '../migrations/20270121000100_t2_jarvis_haftalik_taklif_v1';
const extract = (source, start, end) => {
  const from = source.indexOf(start); const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from); return source.slice(from, to + end.length);
};
const run = async (actor = 7, op = randomUUID()) => (await db.query('select public.t2_jarvis_haftalik_taklif_v1($1,$2) as result', [actor, op])).rows[0].result;
try {
  await db.exec(`begin; set local timezone='UTC';
    create role anon; create role authenticated; create role service_role;
    create table public.t2_kompaniya(id bigint primary key);
    create table public.t2_agent_profile(kod text primary key);
    insert into public.t2_agent_profile values ('platform_orchestrator');
    insert into public.t2_kompaniya select generate_series(1,8);
    create function public.t2_agent_scope_guard_v1(bigint,bigint) returns jsonb language sql as
      'select case when $1=7 and $2 is null then ''{"ok":true}''::jsonb else ''{"ok":false,"code":"GLOBAL_SCOPE_DENIED"}''::jsonb end';
    create table public.t2_tajriba_sozlama(kompaniya_id bigint primary key, oqish boolean, hissa boolean);
    insert into public.t2_tajriba_sozlama select i,true,true from generate_series(1,8) i;
    create table public.t2_friksiya(kun date, kompaniya_id bigint, sahifa text, amal text, hodisa text, kod text, soni bigint);
    create table public.t2_friksiya_hafta(hafta date, kompaniya_id bigint, sahifa text, amal text, hodisa text, kod text, soni bigint);`);
  const existing = await sql('../migrations/20261106260000_t2_agent_ish_muhiti_v1.sql');
  // REAL existing proposal schema/default status and creator; only the external authority boundary is a fixture.
  await db.exec(extract(existing, 'create table if not exists public.t2_agent_taklif (', '\n);'));
  await db.exec(extract(existing, 'create or replace function public.t2_agent_taklif_yarat_v1(', '\nend $$;'));
  await db.exec(await sql(migration + '.sql'));
  await db.exec((await sql(migration + '.acceptance.sql')).replace(/^begin;\s*/m, '').replace(/^rollback;\s*/m, ''));
  const config = (await db.query("select proconfig from pg_proc where oid='public.t2_jarvis_haftalik_taklif_v1(bigint,uuid)'::regprocedure")).rows[0].proconfig;
  assert.ok(config.some(value => value.toLowerCase() === 'timezone=utc'));
  assert.equal((await run(8)).code, 'GLOBAL_SCOPE_DENIED');
  assert.equal((await run(null)).code, 'GLOBAL_SCOPE_DENIED');
  assert.equal((await run(7, null)).code, 'OPERATION_REQUIRED');
  assert.equal((await run()).sabab, 'NO_ELIGIBLE_FAILURES');
  const grants = (await db.query(`select has_function_privilege('anon','public.t2_jarvis_haftalik_taklif_v1(bigint,uuid)','execute') as a,
    has_function_privilege('authenticated','public.t2_jarvis_haftalik_taklif_v1(bigint,uuid)','execute') as u,
    has_function_privilege('service_role','public.t2_jarvis_haftalik_taklif_v1(bigint,uuid)','execute') as s`)).rows[0];
  assert.deepEqual(grants, { a: false, u: false, s: true });
  // Four companies with MANY attempts do not satisfy five distinct companies.
  await db.exec(`insert into public.t2_friksiya
    select date_trunc('week',current_date)::date-7,i,'jarvis','read.object_search','xato','NO_ANSWER',1000 from generate_series(1,4) i;
    insert into public.t2_friksiya select current_date,5,'jarvis','read.object_search','xato','NO_ANSWER',999;
    insert into public.t2_friksiya select date_trunc('week',current_date)::date-14,5,'jarvis','read.object_search','xato','NO_ANSWER',999;`);
  assert.equal((await run()).sabab, 'NO_ELIGIBLE_FAILURES');
  // The fifth contributor is archived; exact closed-week daily + weekly records compose without inventing dates.
  await db.exec(`insert into public.t2_friksiya_hafta values (date_trunc('week',current_date)::date-7,5,'jarvis','read.object_search','xato','NO_ANSWER',3);
    insert into public.t2_friksiya values (date_trunc('week',current_date)::date-1,5,'jarvis','read.object_search','xato','NO_ANSWER',5);
    update public.t2_tajriba_sozlama set hissa=false where kompaniya_id=5;`);
  assert.equal((await run()).sabab, 'NO_ELIGIBLE_FAILURES');
  await db.exec(`update public.t2_tajriba_sozlama set hissa=true,oqish=false where kompaniya_id=5;`);
  assert.equal((await run()).sabab, 'NO_ELIGIBLE_FAILURES');
  await db.exec(`update public.t2_tajriba_sozlama set oqish=true where kompaniya_id=5;
    insert into public.t2_friksiya select date_trunc('week',current_date)::date-7,i,'jarvis','private_alias_123456','xato','NO_ANSWER',999999 from generate_series(1,8) i;
    insert into public.t2_friksiya select date_trunc('week',current_date)::date-7,i,'jarvis','read.object_search','xato','FORBIDDEN',999999 from generate_series(1,8) i;
    insert into public.t2_friksiya select date_trunc('week',current_date)::date-7,i,'jarvis','read.object_search','tugadi','t0',999999 from generate_series(1,8) i;`);
  // Threshold applies to EACH failure key, not the total companies across unrelated keys.
  await db.exec(`insert into public.t2_friksiya select date_trunc('week',current_date)::date-7,i,'jarvis','feedback_bad','tashlandi','',1 from generate_series(1,4) i;`);
  const operation = randomUUID();
  const first = await run(7, operation); assert.equal(first.yaratildi, true); assert.equal(typeof first.taklif_id, 'string');
  const proposal = (await db.query('select * from public.t2_agent_taklif')).rows[0];
  assert.equal(proposal.holat, 'kutilmoqda'); assert.equal(proposal.doira, 'global');
  assert.equal(proposal.mazmun.odam_soni, null); assert.equal(proposal.mazmun.k_min, 5);
  assert.equal(proposal.mazmun.operation_id, operation);
  assert.deepEqual(proposal.mazmun.signallar, [{ amal: 'read.object_search', hodisa: 'xato', kod: 'NO_ANSWER', urinishlar: '4008', kompaniya_soni: '5' }]);
  assert.ok(!JSON.stringify(proposal.mazmun).includes('private_alias'));
  assert.equal(proposal.mazmun.jarvis_hafta, first.hafta); assert.equal(proposal.mazmun.gacha, first.gacha);
  assert.equal((await db.query('select count(*)::int as n from public.t2_agent_taklif')).rows[0].n, 1);
  // Generic creator cannot bypass the one-report/week invariant either.
  await db.exec('savepoint duplicate');
  await assert.rejects(db.query(`select public.t2_agent_taklif_yarat_v1(7,null,'rivojlanish','global','platform_orchestrator',
    'Synthetic duplicate',$1::jsonb,'[]'::jsonb,null)`, [JSON.stringify(proposal.mazmun)]), /duplicate key/);
  await db.exec('rollback to savepoint duplicate');
  await db.exec(`update public.t2_agent_taklif set holat='tasdiqlandi'; update public.t2_friksiya set soni=soni+1;`);
  const again = await run(7, operation); assert.equal(again.taklif_id, first.taklif_id); assert.equal(again.yaratildi, false);
  assert.equal((await run()).taklif_id, first.taklif_id);
  const unchanged = (await db.query('select * from public.t2_agent_taklif')).rows[0];
  assert.deepEqual(unchanged.mazmun, proposal.mazmun); assert.equal(unchanged.holat, 'tasdiqlandi');
  await db.exec(`savepoint old_week; update public.t2_agent_taklif set mazmun=jsonb_set(mazmun,'{jarvis_hafta}',to_jsonb((date_trunc('week',current_date)::date-14)::text));`);
  assert.equal((await run(7, operation)).code, 'OPERATION_REUSE');
  await db.exec('rollback to savepoint old_week');
  // Rollback only disables this wrapper; it must not delete existing counters or review decisions.
  await db.exec(await sql(migration + '.rollback.sql'));
  assert.equal((await db.query('select count(*)::int as n from public.t2_agent_taklif')).rows[0].n, 1);
  assert.equal((await db.query("select to_regprocedure('public.t2_jarvis_haftalik_taklif_v1(bigint,uuid)') as f")).rows[0].f, null);
  assert.equal((await db.query("select to_regclass('public.t2_agent_jarvis_week_uq') as i")).rows[0].i, null);
  await db.exec('rollback');
  assert.equal((await db.query("select to_regclass('public.t2_agent_taklif') as t")).rows[0].t, null);
  console.log('JARVIS_WEEKLY_REAL_CREATOR_K5_PERIOD_OPTOUT_IDEMPOTENCY_ROLLBACK_PASS');
} finally { await db.close(); }
