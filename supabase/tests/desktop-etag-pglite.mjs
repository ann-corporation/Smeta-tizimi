// Local synthetic-only test. PGLITE_DIR points to an installed @electric-sql/pglite package.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const runtime = process.env.PGLITE_DIR;
const { PGlite } = await import(runtime ? pathToFileURL(resolve(runtime,'dist/index.js')).href : '@electric-sql/pglite');
const db = new PGlite();
const migration = new URL('../migrations/20261122000000_t2_obyekt_paket_muhr_v1.sql',import.meta.url);
const rollback = new URL('../migrations/20261122000000_t2_obyekt_paket_muhr_v1.rollback.sql',import.meta.url);
const extension = new URL('../migrations/20261122000100_t2_obyekt_paket_f2_summa_yoq_v1.sql',import.meta.url);
const extensionRollback = new URL('../migrations/20261122000100_t2_obyekt_paket_f2_summa_yoq_v1.rollback.sql',import.meta.url);
let checks=0;
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema snapshot;
    create table snapshot.qaytarish_jurnal(id bigint,kompaniya_id bigint,obyekt_id bigint);
    create table t2_obyekt(id bigint primary key,kompaniya_id bigint,nom text);
    create table t2_qator(id bigint primary key,obyekt_id bigint,versiya int not null,versiya_holat text,nom text);
    create table t2_akt(id bigint primary key,obyekt_id bigint,versiya int not null,holat text);
    create table t2_akt_qator(id bigint primary key,akt_id bigint,versiya int not null,certified_amount numeric);
    create table t2_nakrutka_podval(id bigint,obyekt_id bigint,kompaniya_id bigint,nom text,versiya int,qatorlar jsonb,faol boolean);
    create table t2_svod_yaxlit(id bigint,obyekt_id bigint,qator_id bigint,svod_summa numeric,qqs_stavka numeric,turi text,versiya int,faol boolean,dalil text,kontragent_nom text);
    create table t2_smeta_versiya(id bigint,obyekt_id bigint,nom text,tur text,holat text,manba_sana date,yaratildi timestamptz);
    create table t2_nakrutka_koef(id bigint,kompaniya_id bigint,shartnoma_id bigint,koef_kod text,qiymat numeric,versiya int);
    create table t2_shartnoma_bog(id bigint,obyekt_id bigint,shartnoma_id bigint,holat text);
    create view t2_qator_holat as select id from t2_qator;
    create view t2_zamena_qoplash as select id from t2_qator;
    create function t2_actor_kompaniya_azo_tekshir(k bigint,a bigint) returns text language plpgsql as $$begin
      if k<>8 or a<>7 then raise exception 'DENIED' using errcode='42501'; end if; return 'pto'; end$$;
    create function t2_obyekt_nakrutka_v1(o bigint,a bigint,s bigint) returns jsonb language plpgsql stable as $$begin raise exception 'SLOW_NK_MUST_NOT_RUN_IN_PROBE'; end$$;
    create function t2_nakrutka_default_v1() returns jsonb language sql immutable as $$select '{}'::jsonb$$;
    create function t2_nakrutka_koef_ol_v1(k bigint,a bigint,s bigint) returns jsonb language sql stable as $$select '{}'::jsonb$$;
    create function t2_nakrutka_podval_smeta_nk_v1(q jsonb) returns jsonb language sql immutable as $$select q$$;
    create function t2_svod_yaxlit_obyekt_v1(o bigint) returns jsonb language sql stable as $$select '{}'::jsonb$$;
    create function t2_almashtirilgan_hajm(q bigint) returns numeric language sql stable as $$select 0::numeric$$;
    create function t2_almashtirilgan_oz_hajm(q bigint) returns numeric language sql stable as $$select 0::numeric$$;
    create function _t2_f2_narxda_v1(p_fakt numeric,p_f2_hajm numeric,p_f2_summa numeric) returns numeric language sql immutable as $$select p_fakt*p_f2_summa/nullif(p_f2_hajm,0)$$;
    create function t2_obyekt_paket_v1(p_obyekt_id bigint,p_actor_id bigint) returns json language sql stable as $$select json_build_object('obyekt_id',p_obyekt_id,'fixture',true)$$;
    insert into t2_obyekt values(4,8,'SYNTHETIC'),(5,9,'FOREIGN_SYNTHETIC');
    insert into t2_qator values(10,4,1,'faol','ACTIVE'),(11,4,1,'almashtirilgan','HISTORY');
    insert into t2_akt values(20,4,1,'qoralama');
    insert into t2_akt_qator values(30,20,1,null);
  `);
  // Exact deployed podval table schema, synthetic parent tables only.
  await db.exec('create table t2_kompaniya(id bigint primary key); insert into t2_kompaniya values(8),(9)');
  const podvalMigration=await readFile(new URL('../migrations/20261121000000_t2_akt_podval_v1.sql',import.meta.url),'utf8');
  await db.exec(podvalMigration.slice(podvalMigration.indexOf('create table if not exists'),podvalMigration.indexOf('create index if not exists')));
  const sql=await readFile(migration,'utf8');
  await db.exec('begin');
  await db.exec(sql);
  assert.notEqual((await db.query("select to_regprocedure('t2_obyekt_paket_muhr_v1(bigint,bigint)') p")).rows[0].p,null); checks++;
  await db.exec('rollback');
  assert.equal((await db.query("select to_regprocedure('t2_obyekt_paket_muhr_v1(bigint,bigint)') p")).rows[0].p,null); checks++;
  await db.exec(sql);
  const hash=async()=> (await db.query('select t2_obyekt_paket_muhr_v1(4,7) h')).rows[0].h;
  const changed=async(q)=>{const before=await hash(); await db.exec(q); assert.notEqual(await hash(),before);checks++;};
  const first=await hash(); assert.match(first,/^W\/"t2-paket-1-[a-f0-9]{32}"$/); checks++;
  assert.equal(await hash(),first); checks++;
  // Monotonic versiya comes from live verified t2_versiya_oshir; no business writer is mocked as verified.
  await changed('update t2_qator set versiya=versiya+1 where id=10');
  await changed('update t2_qator set versiya=versiya+1 where id=11'); // historical replacement dependency
  await changed('update t2_akt set holat=\'bekor\',versiya=versiya+1 where id=20');
  await changed('update t2_akt_qator set certified_amount=0,versiya=versiya+1 where id=30');
  await changed('insert into t2_akt_qator values(31,20,1,0)');
  await changed('delete from t2_akt_qator where id=31');
  await changed("insert into t2_nakrutka_koef values(70,8,null,'SYNTHETIC',1,1)");
  await changed("update t2_nakrutka_koef set qiymat=2,versiya=versiya+1 where id=70");
  await changed("insert into t2_shartnoma_bog values(80,4,90,'faol')");
  await changed("insert into t2_nakrutka_koef values(71,8,90,'SYNTHETIC',3,1)");
  await changed("create or replace function t2_nakrutka_default_v1() returns jsonb language sql immutable as $$select '{\"synthetic\":null}'::jsonb$$");
  await changed("update t2_obyekt set nom='SYNTHETIC_RENAMED' where id=4");
  await changed("insert into t2_nakrutka_podval values(40,4,8,'P',1,'[]',true)");
  await changed("insert into t2_svod_yaxlit values(50,4,10,0,null,'fixture',1,true,null,null)");
  await changed("update t2_svod_yaxlit set dalil='SYNTHETIC_EVIDENCE' where id=50");
  await changed("insert into t2_smeta_versiya values(60,4,'V','fixture','faol',null,null)");
  await changed("update t2_qator set nom='RESTORED' where id=10; insert into snapshot.qaytarish_jurnal values(1,8,4)");
  await changed("insert into snapshot.qaytarish_jurnal values(2,8,null)");
  const otherScope=await hash(); await db.exec('insert into snapshot.qaytarish_jurnal values(3,9,null)'); assert.equal(await hash(),otherScope);checks++;
  const same=await hash(); await db.exec('update t2_qator set nom=nom where id=10'); assert.equal(await hash(),same); checks++;
  await assert.rejects(db.query('select t2_obyekt_paket_muhr_v1(5,7)')); checks++;
  await db.exec('begin');
  const original=(await db.query('select t2_obyekt_paket_v1(4,7) j')).rows[0].j;
  const wrapped=(await db.query('select t2_obyekt_paket_etag_v1(4,7) j')).rows[0].j;
  assert.deepEqual(wrapped,original);checks++;
  const headers=(await db.query("select current_setting('response.headers') h")).rows[0].h;
  assert.equal(JSON.parse(headers)[0].ETag,await hash());checks++;
  await db.exec('rollback');
  const grants=await db.query("select has_function_privilege('anon','t2_obyekt_paket_muhr_v1(bigint,bigint)','execute') a, has_function_privilege('authenticated','t2_obyekt_paket_etag_v1(bigint,bigint)','execute') b, has_function_privilege('service_role','t2_obyekt_paket_etag_v1(bigint,bigint)','execute') s");
  assert.deepEqual(grants.rows[0],{a:false,b:false,s:true});checks++;

  // Exercise the exact main view + package, not a reimplemented F2 formula.
  // Fixture policies/NK stay synthetic. Version increments below are explicit:
  // production triggers/writers are NOT claimed verified by this test.
  await db.exec(`
    alter table t2_qator
      add ota_id bigint, add daraja int default 0, add tartib int default 0,
      add tur text default 'bl', add kat text, add kod text, add birlik text,
      add hajm numeric default 10, add narx numeric default 10, add summa numeric default 100,
      add norma numeric, add narx_usul text, add qoshimcha boolean default false,
      add zamena boolean default false, add xom_qator jsonb, add raqam text, add replaces_line_id bigint;
    alter table t2_akt add tur text default 'f2', add raqam text, add oy date,
      add lifecycle_status text, add hujjat_jami numeric, add manba text;
    alter table t2_akt_qator add qator_id bigint, add certified_quantity numeric,
      add hajm numeric, add summa numeric, add narx_manba text, add raw_snapshot jsonb;
    create or replace function t2_obyekt_nakrutka_v1(o bigint,a bigint,s bigint) returns jsonb language sql stable as $$select '{}'::jsonb$$;
    update t2_akt set holat='tasdiqlangan',versiya=versiya+1 where id=20;
    update t2_akt_qator set qator_id=10,certified_quantity=2,certified_amount=null,hajm=2,summa=null,versiya=versiya+1 where id=30;
  `);
  // DROP/CREATE is necessary because the minimal fixture view had fewer columns.
  const beforeMainView=await hash();
  await db.exec('drop view t2_qator_holat');
  const mainView=await readFile(new URL('../migrations/20261117400000_t2_qator_holat_fakt_f2_narx_v1.sql',import.meta.url),'utf8');
  await db.exec(mainView);
  assert.notEqual(await hash(),beforeMainView); checks++;
  // Helper-only change: pg_get_viewdef remains identical, yet cache must expire.
  await changed(`create or replace function _t2_f2_narxda_v1(p_fakt numeric,p_f2_hajm numeric,p_f2_summa numeric)
    returns numeric language sql immutable as $$select null::numeric$$`);
  await changed(mainView);
  await db.exec(await readFile(new URL('../migrations/20261116400000_t2_obyekt_paket_v1.sql',import.meta.url),'utf8'));
  const definition=async()=> (await db.query("select pg_get_functiondef('t2_obyekt_paket_v1(bigint,bigint)'::regprocedure) d")).rows[0].d;
  const previousDefinition=await definition();
  const extensionSql=await readFile(extension,'utf8');
  await db.exec('begin');
  await db.exec(extensionSql);
  assert.match(await definition(),/f2_summa_yoq/); checks++;
  await db.exec('rollback');
  assert.equal(await definition(),previousDefinition); checks++;
  await changed(extensionSql); // literal definition change invalidates existing cache
  const view=async()=> (await db.query('select f2_hajm,f2_summa,f2_summa_nomalum,f2_summa_yoq,fakt_summa from t2_qator_holat where id=10')).rows[0];
  const packet=async()=> (await db.query('select t2_obyekt_paket_etag_v1(4,7) j')).rows[0].j;
  assert.equal((await view()).f2_summa_yoq,1); checks++;
  assert.deepEqual((await packet()).h.f2_summa_yoq,[1]); checks++;
  assert.equal((await view()).f2_summa_nomalum,0); checks++; // BL has a different legacy counter
  await changed('update t2_akt_qator set certified_amount=0,versiya=versiya+1 where id=30');
  assert.equal((await view()).f2_summa_yoq,0); checks++; // NULL != 0
  assert.deepEqual((await packet()).h.f2_summa_yoq,[0]); checks++;
  await changed('update t2_akt_qator set certified_amount=null,versiya=versiya+1 where id=30');
  assert.equal((await view()).f2_summa_yoq,1); checks++;
  await changed(`insert into t2_qator(id,obyekt_id,versiya,versiya_holat,nom,tartib) values(12,4,1,'faol','SECOND',-1)`);
  assert.deepEqual((await packet()).q.id,[12,10]);
  assert.deepEqual((await packet()).h.f2_summa_yoq,[0,1]); checks++;
  await changed('delete from t2_qator where id=12');
  const knownBefore=await packet();
  await changed(`update t2_akt set manba='storno',versiya=versiya+1 where id=20`);
  assert.notEqual((await packet()).f2[0].versiya,knownBefore.f2[0].versiya); checks++;
  await changed(`update t2_akt_qator set raw_snapshot='{"source":"import","meta":{"stornoOf":18}}',versiya=versiya+1 where id=30`);
  assert.notEqual((await packet()).f2[0].muhr_xesh,knownBefore.f2[0].muhr_xesh); checks++;
  await changed(`update t2_akt_qator set raw_snapshot='{"source":"storno","stornoOf":19}',versiya=versiya+1 where id=30`);
  await changed(`insert into t2_akt(id,obyekt_id,versiya,holat,tur) values(21,4,1,'qoralama','f2');
    insert into t2_akt_qator(id,akt_id,versiya,qator_id,certified_quantity,certified_amount,raw_snapshot)
    values(32,21,1,10,-2,null,'{"source":"storno","stornoOf":20}')`);
  assert.equal((await view()).f2_hajm,'2'); checks++; // draft storno does not change approved total
  await changed(`update t2_akt set holat='tasdiqlangan',versiya=versiya+1 where id=21`);
  assert.equal((await view()).f2_hajm,'0'); checks++;
  assert.equal((await view()).f2_summa_yoq,2); checks++; // signed quantities cancel, unknown evidence stays
  assert.deepEqual((await packet()).h.f2_summa_yoq,[2]); checks++;
  await changed(`update t2_akt set holat='bekor',versiya=versiya+1 where id=21`);
  assert.equal((await view()).f2_summa_yoq,1); checks++;
  await changed('update t2_akt_qator set certified_amount=20,versiya=versiya+1 where id=30');
  await changed('update t2_akt_qator set certified_amount=-20,versiya=versiya+1 where id=32');
  await changed(`update t2_akt set holat='tasdiqlangan',versiya=versiya+1 where id=21`);
  assert.equal((await view()).f2_summa,'0'); checks++;
  assert.equal((await view()).f2_summa_yoq,0); checks++;
  const signed=await packet();
  assert.equal(signed.h.f2_hajm[0],0); assert.equal(signed.h.f2_summa[0],0); checks++;
  assert.equal(signed.f2.length,2); checks++;
  assert.deepEqual(signed.h.f2_summa_yoq,[0]); checks++;
  const aktVersions=async()=> (await db.query('select id,versiya from t2_akt order by id')).rows;
  const frozen=await aktVersions();
  await changed(`insert into t2_akt_podval(akt_id,blok,kompaniya_id,obyekt_id,manba,manba_akt_id,ishora,nk)
    values(21,'20',8,4,'storno',20,-1,'{"nds":12}')`);
  assert.equal((await packet()).meta.akt_podval[0].ishora,-1); checks++;
  await changed(`update t2_akt_podval set nk='{"nds":0}',versiya=versiya+1 where akt_id=21`);
  const samePodval=await hash();
  await db.exec('update t2_akt_podval set nk=nk where akt_id=21');
  assert.equal(await hash(),samePodval); checks++;
  await changed(`update t2_akt_podval set hujjat_vsego=null,tekshiruv='{"source":"storno","meta":{"verified":true}}' where akt_id=21`);
  assert.equal((await packet()).meta.akt_podval[0].hujjat_vsego,null); checks++;
  await changed('update t2_akt_podval set hujjat_vsego=0 where akt_id=21');
  assert.equal((await packet()).meta.akt_podval[0].hujjat_vsego,0); checks++;
  await changed('update t2_akt_podval set hujjat_vsego=-20 where akt_id=21');
  assert.equal((await packet()).meta.akt_podval[0].hujjat_vsego,-20); checks++;
  await changed('delete from t2_akt_podval where akt_id=21');
  assert.deepEqual(await aktVersions(),frozen); checks++; // no parent akt version bump needed
  const scope=await hash();
  await db.exec(`insert into t2_akt_podval(akt_id,kompaniya_id,obyekt_id,manba,nk) values(20,9,5,'import','{}')`);
  assert.equal(await hash(),scope); checks++;
  assert.deepEqual((await packet()).meta.akt_podval,[]); checks++;
  await db.exec('delete from t2_akt_podval');
  const extended=await packet();
  await changed(await readFile(extensionRollback,'utf8'));
  assert.equal(await definition(),previousDefinition); checks++;
  assert.equal(Object.hasOwn((await packet()).h,'f2_summa_yoq'),false); checks++;
  assert.equal(Object.hasOwn((await packet()).meta,'akt_podval'),false); checks++;
  await changed(await readFile(extension,'utf8'));
  assert.deepEqual(await packet(),extended); checks++;
  await db.exec(`create table t2_foydalanuvchi(id bigint,holat text); insert into t2_foydalanuvchi values(7,'faol');
    create function t2_platforma_superadmin(a bigint) returns boolean language sql stable as $$select a=7$$;
    create function t2_require_permission_v2(k bigint,a bigint,p text) returns void language sql stable as $$select$$;`);
  // Canonical reader projection from exact main, with synthetic permission guard.
  await db.exec(podvalMigration.slice(podvalMigration.indexOf('create or replace function public.t2_akt_podval_ol_v1('),podvalMigration.indexOf('-- Backfill nomzodlari:')));
  await db.exec(await readFile(new URL('../migrations/20261122000100_t2_obyekt_paket_f2_summa_yoq_v1.acceptance.sql',import.meta.url),'utf8')); checks++;
  await db.exec("insert into t2_obyekt values(6,8,'EMPTY_SYNTHETIC')");
  const empty=(await db.query('select t2_obyekt_paket_v1(6,7) j')).rows[0].j;
  assert.deepEqual(empty.h.f2_summa_yoq,[]); assert.deepEqual(empty.meta.akt_podval,[]); checks++;
  await db.exec('begin');
  assert.deepEqual(await packet(),(await db.query('select t2_obyekt_paket_v1(4,7) j')).rows[0].j); checks++;
  assert.equal(JSON.parse((await db.query("select current_setting('response.headers') h")).rows[0].h)[0].ETag,await hash());checks++;
  await db.exec('rollback');
  await db.exec(await readFile(rollback,'utf8'));
  assert.equal((await db.query("select to_regprocedure('t2_obyekt_paket_muhr_v1(bigint,bigint)') p")).rows[0].p,null);checks++;
  await db.exec(sql); checks++;
  console.log(JSON.stringify({checks,status:'PASS',scope:'synthetic schema; real actor policy/performance not proven'}));
} catch (error) {
  console.error({status:'FAIL',checks,error:error.message,detail:error.detail,where:error.where});
  process.exitCode=1;
} finally {await db.close();}
