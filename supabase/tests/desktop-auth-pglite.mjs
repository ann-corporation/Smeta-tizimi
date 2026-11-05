// Isolated synthetic Postgres. Never reads env credentials or connects to a server.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const { PGlite } = await import(process.env.PGLITE_DIR ? pathToFileURL(resolve(process.env.PGLITE_DIR,'dist/index.js')).href : '@electric-sql/pglite');
const db = new PGlite();
const file = suffix => readFile(new URL(`../migrations/20261202000000_t2_desktop_auth_v1${suffix}.sql`,import.meta.url),'utf8');
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table public.t2_foydalanuvchi(id bigint generated always as identity primary key,login text unique,ism text,holat text,sessiya_bekor_dan timestamptz);
    grant select on public.t2_foydalanuvchi to service_role;`);
  await db.exec(await file(''));
  await db.exec(await file(''));
  await db.exec(await file('.acceptance'));
  assert.equal((await db.query('select count(*)::int n from public.t2_desktop_qurilma')).rows[0].n,0);
  for (const role of ['anon','authenticated']) {
    for (const command of ['select * from public.t2_desktop_qurilma',"select public.t2_desktop_qurilma_tekshir_v1(repeat('a',64))"]) {
      await db.exec('begin; set local role '+role);
      await assert.rejects(db.query(command),/permission denied/);
      await db.exec('rollback');
    }
  }
  // Run real service-role RPC grants and nonempty rollback safety.
  await db.exec(`insert into t2_foydalanuvchi(login,holat) values('synthetic_grants','faol');`);
  await db.exec('begin; set local role service_role');
  const created = await db.query(`select public.t2_desktop_qurilma_yarat_v1((select id from t2_foydalanuvchi where login='synthetic_grants'),
    '00000000-0000-4000-8000-000000000004',repeat('a',64),(extract(epoch from now())*1000)::bigint+3600000,'00000000-0000-4000-8000-000000000005') r`);
  assert.equal(created.rows[0].r.ok,true);
  assert.equal((await db.query("select public.t2_desktop_qurilma_tekshir_v1(repeat('a',64)) r")).rows[0].r.ok,true);
  await db.exec('savepoint rollback_guard');
  await assert.rejects(db.exec(await file('.rollback')),/DESKTOP_ROLLBACK_NONEMPTY/);
  await db.exec('rollback to savepoint rollback_guard');
  await db.exec('rollback');
  await db.exec(await file('.rollback'));
  assert.equal((await db.query("select to_regclass('public.t2_desktop_qurilma') n")).rows[0].n,null);
  await db.exec(await file(''));
  await db.exec(await file('.acceptance'));
  console.log('PASS desktop auth: synthetic acceptance, public deny, service RPCs, rollback/reapply');
} finally { await db.close(); }
