// Isolated synthetic DB: no production URLs/keys or business documents.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const pkg=process.env.PGLITE_DIR||'C:/Temp/hr-pglite/node_modules/@electric-sql/pglite';
const {PGlite}=await import(pathToFileURL(resolve(pkg,'dist/index.js')).href);
const {pg_trgm}=await import(pathToFileURL(resolve(pkg,'dist/contrib/pg_trgm.js')).href);
const db=new PGlite({extensions:{pg_trgm}});
const file=s=>readFile(new URL('../migrations/20261203001100_t2_normativ_v1'+s+'.sql',import.meta.url),'utf8');
try {
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table t2_foydalanuvchi(id bigint generated always as identity primary key,login text unique,ism text,holat text);
 create table t2_kompaniya(id bigint generated always as identity primary key,nom text,kod text unique,faol boolean default true);
 create table t2_azolik(foydalanuvchi_id bigint,kompaniya_id bigint,rol text,holat text);
 create function t2_platforma_superadmin(bigint) returns boolean language sql stable as $$select exists(select 1 from t2_foydalanuvchi u join t2_azolik a on a.foydalanuvchi_id=u.id where u.id=$1 and u.holat='faol' and a.holat='faol' and a.rol='superadmin')$$;
 grant select on t2_foydalanuvchi,t2_kompaniya,t2_azolik to service_role;`);
 await db.exec(await file('')); await db.exec(await file(''));
 await db.exec(await file('.acceptance'));
 assert.equal((await db.query('select count(*)::int n from t2_normativ_hujjat')).rows[0].n,0);
 for(const role of ['anon','authenticated']) {
  for(const sql of ['select * from t2_normativ_hujjat', 'select * from t2_normativ_bolak', 'select t2_normativ_oqi_v1(1,1,null)']) {
   await db.exec('begin;set local role '+role);await assert.rejects(db.query(sql),/permission denied/);await db.exec('rollback');
  }
 }
 await db.exec('begin;set local role service_role');
 assert.equal((await db.query('select t2_normativ_oqi_v1(999,1,null) r')).rows[0].r.code,'FORBIDDEN');
 await db.exec('rollback');
 await db.exec(`begin;insert into t2_foydalanuvchi(login,holat) values('synthetic-service','faol');
 insert into t2_azolik select id,1,'superadmin','faol' from t2_foydalanuvchi where login='synthetic-service';set local role service_role;`);
 const actor=(await db.query("select id from t2_foydalanuvchi where login='synthetic-service'")).rows[0].id;
 const created=(await db.query(`select t2_normativ_hujjat_qosh_v1($1,gen_random_uuid(),
 jsonb_build_object('source_sha',repeat('a',64),'job_sha',repeat('b',64),'reader_versiya','SYN','nom','SYNTHETIC','bayt',1),
 jsonb_build_array(jsonb_build_object('sha256',repeat('c',64),'unit_sha',repeat('d',64),'unit','page-1','tartib',0,'bayt',1))) r`,[actor])).rows[0].r;
 assert.equal(created.ok,true);assert.equal((await db.query('select t2_normativ_oqi_v1($1,null,$2) r',[actor,created.id])).rows[0].r.hujjatlar.length,1);
 await db.exec('rollback');
 await db.exec('begin'); await db.exec(await file('.acceptance').then(s=>s.replace(/^begin;/m,'').replace(/^rollback;/m,'')));
 await db.exec('savepoint guard');await assert.rejects(db.exec(await file('.rollback')),/NORMATIV_ROLLBACK_NONEMPTY/);
 await db.exec('rollback to savepoint guard;rollback');
 await db.exec(await file('.rollback'));await db.exec(await file('.rollback'));await db.exec(await file(''));await db.exec(await file('.acceptance'));
 const k3=s=>readFile(new URL('../migrations/20261203001400_t2_normativ_qidir_v1'+s+'.sql',import.meta.url),'utf8');
 // Match the Supabase service_role grant on the shared extensions schema.
 await db.exec('grant usage on schema extensions to service_role');
 await db.exec(await k3('')); await db.exec(await k3('')); await db.exec(await k3('.acceptance'));
 for(const role of ['anon','authenticated']) {
  await db.exec('begin;set local role '+role);
  await assert.rejects(db.query("select t2_normativ_qidir_v1(1,1,'test',null,null,null,1)"),/permission denied/);
  await db.exec('rollback');
 }
 await db.exec(await k3('.rollback')); await db.exec(await k3('.rollback')); await db.exec(await k3('')); await db.exec(await k3('.acceptance'));
 console.log('PASS K3: exact, lexical, trigram, edition collision, citation, published-only, actor/tenant, grants and rollback');
 console.log('PASS normativ: replay, actor/member/admin/CAS/review, FTS/trigram, public deny, grants, rollback/reapply');
} catch(error) {console.error(error.message,error.detail||'');process.exitCode=1;} finally {await db.close();}
