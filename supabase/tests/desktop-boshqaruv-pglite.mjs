// Isolated synthetic Postgres for 20261203001200_t2_desktop_boshqaruv_v1. Never reads env credentials or connects to a server.
// PGLITE_DIR=<path to @electric-sql/pglite> node supabase/tests/desktop-boshqaruv-pglite.mjs
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const { PGlite } = await import(process.env.PGLITE_DIR ? pathToFileURL(resolve(process.env.PGLITE_DIR,'dist/index.js')).href : '@electric-sql/pglite');
const db = new PGlite();
const auth = suffix => readFile(new URL(`../migrations/20261202000000_t2_desktop_auth_v1${suffix}.sql`,import.meta.url),'utf8');
const file = suffix => readFile(new URL(`../migrations/20261203001200_t2_desktop_boshqaruv_v1${suffix}.sql`,import.meta.url),'utf8');
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table public.t2_foydalanuvchi(id bigint generated always as identity primary key,login text unique,ism text,holat text,sessiya_bekor_dan timestamptz);
    create table public.t2_kompaniya(id bigint generated always as identity primary key,nom text,kod text,faol boolean not null default true);
    create table public.t2_azolik(id bigint generated always as identity primary key,foydalanuvchi_id bigint references t2_foydalanuvchi(id) on delete cascade,
      kompaniya_id bigint references t2_kompaniya(id),rol text,holat text not null default 'faol');
    create function public.t2_platforma_superadmin(p_actor_id bigint) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
      select exists (select 1 from public.t2_foydalanuvchi u join public.t2_azolik a on a.foydalanuvchi_id=u.id
        where u.id=p_actor_id and u.holat='faol' and a.holat='faol' and a.rol='superadmin'); $$;
    grant select on public.t2_foydalanuvchi, public.t2_kompaniya, public.t2_azolik to service_role;`);
  await db.exec(await auth(''));
  await db.exec(await file(''));
  await db.exec(await file('')); // idempotent re-apply
  await db.exec(await file('.acceptance'));
  // The earlier contract still holds on top of the policy layer (default cap 10, revoke, expiry, cascade).
  await db.exec(await auth('.acceptance'));
  assert.equal((await db.query('select count(*)::int n from public.t2_desktop_audit')).rows[0].n, 0);
  assert.equal((await db.query("select count(*)::int n from public.t2_desktop_siyosat where kompaniya_id is null and manba='platforma' and yoqilgan and max_qurilma=10 and lease_soat=72")).rows[0].n, 1);
  for (const role of ['anon','authenticated']) {
    for (const command of ['select * from public.t2_desktop_siyosat','select * from public.t2_desktop_audit',
      'select public.t2_desktop_boshqaruv_v1(1,null)',"select public.t2_desktop_qurilma_tekshir_v2(repeat('a',64),null)"]) {
      await db.exec('begin; set local role '+role);
      await assert.rejects(db.query(command),/permission denied/);
      await db.exec('rollback');
    }
  }
  // Real service-role execution path + rollback guard on audit history.
  await db.exec(`insert into t2_foydalanuvchi(login,ism,holat) values('synthetic_sa','SA','faol');
    insert into t2_kompaniya(nom) values('K');
    insert into t2_azolik(foydalanuvchi_id,kompaniya_id,rol) select f.id,k.id,'superadmin' from t2_foydalanuvchi f, t2_kompaniya k where f.login='synthetic_sa';`);
  await db.exec('begin; set local role service_role');
  const saved = await db.query(`select public.t2_desktop_siyosat_saqla_v1((select id from t2_foydalanuvchi where login='synthetic_sa'),null,'platforma',
    '{"yoqilgan":true,"max_qurilma":10,"lease_soat":72,"oflayn":true,"joriy_versiya":"0.2.0","yuklab_olish_url":"https://example.invalid/setup.exe"}','reliz',(select versiya from t2_desktop_siyosat where kompaniya_id is null and manba='platforma'),gen_random_uuid()) r`);
  assert.equal(saved.rows[0].r.ok, true);
  const read = await db.query(`select public.t2_desktop_boshqaruv_v1((select id from t2_foydalanuvchi where login='synthetic_sa'),null) r`);
  assert.equal(read.rows[0].r.ok, true);
  assert.equal(read.rows[0].r.rol, 'superadmin');
  await db.exec('savepoint rollback_guard');
  await assert.rejects(db.exec(await file('.rollback')),/DESKTOP_BOSHQARUV_ROLLBACK_NONEMPTY/);
  await db.exec('rollback to savepoint rollback_guard');
  await db.exec('rollback');
  await db.exec(await file('.rollback'));
  assert.equal((await db.query("select to_regclass('public.t2_desktop_siyosat') n")).rows[0].n, null);
  assert.equal((await db.query("select to_regprocedure('public.t2_desktop_qurilma_tekshir_v2(text,text)') n")).rows[0].n, null);
  await db.exec(await auth('.acceptance')); // restored v1 bodies still satisfy the original contract
  await db.exec(await file(''));
  await db.exec(await file('.acceptance'));
  console.log('PASS desktop boshqaruv: synthetic acceptance, auth contract, public deny, service RPCs, rollback/reapply');
} finally { await db.close(); }
