import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const pkg = process.env.PGLITE_DIR ? pathToFileURL(resolve(process.env.PGLITE_DIR, 'dist/index.js')).href : '@electric-sql/pglite';
const { PGlite } = await import(pkg);
const db = new PGlite();
const migration = '20270101002400_t2_jarvis_smeta_qator_aniq';
const sql = suffix => readFile(new URL(`../migrations/${migration}${suffix}.sql`, import.meta.url), 'utf8');
const query = async (actor, company, object, code) => (await db.query(
  'select public.t2_jarvis_smeta_qator_aniq_v1($1,$2,$3,$4) as value', [actor, company, object, code],
)).rows[0].value;

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table t2_obyekt(id bigint primary key, kompaniya_id bigint not null);
    create table t2_qator(id bigint primary key, ota_id bigint, obyekt_id bigint not null, kompaniya_id bigint not null,
      tartib integer, kod text, nom text, tur text, birlik text, hajm numeric, narx numeric, versiya_holat text);
    create function t2_actor_kompaniya_azo_tekshir(company bigint, actor bigint) returns text language plpgsql as $$
      begin if company <> 1 or actor not in (7,8) then raise exception 'denied' using errcode='42501'; end if; return 'fixture'; end $$;
    create function t2_require_permission_v2(company bigint, actor bigint, permission text) returns void language plpgsql as $$
      begin if actor <> 7 or company <> 1 or permission <> 'smeta.read' then raise exception 'denied' using errcode='42501'; end if; end $$;
    insert into t2_obyekt values (34,1),(35,2),(36,1);
    insert into t2_qator values
      (10,null,34,1,1,null,'Root','rz',null,null,null,'faol'),
      (11,10,34,1,2,null,'Civil','rz',null,null,null,'faol'),
      (12,11,34,1,3,'Е06-01-001-1 К-8','Selected work','bl','м³',-2.75,99999,'faol'),
      (13,11,34,1,4,'E06-01-001-10','Longer code','bl','м³',0,99999,'faol'),
      (14,11,34,1,5,'E06-01-001-1','Retired work','bl','м³',0,99999,'almashtirilgan'),
      (15,null,35,2,6,'E06-01-001-1 К-8','Other company','bl','м³',99,99999,'faol'),
      (16,15,34,1,7,'С100-1','Invalid parent','mat',null,null,99999,'faol'),
      (17,18,34,1,8,'E7-1','Cycle','bl','м²',0,99999,'faol'),
      (18,17,34,1,9,null,'Cyclic parent','rz',null,null,null,'faol'),
      (19,null,36,1,10,'E06-01-001-1 K-8','Different object','bl','м³',0,99999,'faol');
  `);
  await db.exec('begin');
  await db.exec(await sql(''));
  const selected = await query(7, 1, 34, 'E06–01–001–1 k-8');
  assert.deepEqual(selected.qatorlar, [{ id: 12, kod: 'Е06-01-001-1 К-8', nom: 'Selected work', tur: 'bl', birlik: 'м³', hajm: -2.75,
    ierarxiya: ['Root', 'Civil'], ierarxiya_toliq: true }]);
  assert.deepEqual((await query(7, 1, 34, 'E06-01-001-1')).qatorlar, []);
  assert.deepEqual((await query(7, 1, 34, 'C100-1')).qatorlar[0].ierarxiya, []);
  assert.equal((await query(7, 1, 34, 'C100-1')).qatorlar[0].ierarxiya_toliq, false);
  assert.equal((await query(7, 1, 34, 'E7-1')).qatorlar[0].ierarxiya_toliq, false);
  assert.equal((await query(7, 1, 34, 'E7-1')).qatorlar[0].hajm, 0);
  const signature = 'public.t2_jarvis_smeta_qator_aniq_v1(bigint,bigint,bigint,text)';
  for (const role of ['anon', 'authenticated', 'service_role']) {
    const { rows } = await db.query("select has_function_privilege($1,$2,'execute') as valid", [role, signature]);
    assert.equal(rows[0].valid, role === 'service_role');
  }
  for (const [actor, object] of [[7,35],[8,34],[19,34]]) {
    await db.exec('savepoint permission_case');
    await assert.rejects(query(actor, 1, object, 'E06-01-001-1 K-8'), error => error.code === '42501');
    await db.exec('rollback to savepoint permission_case');
  }
  await db.exec(await sql('.rollback'));
  assert.equal((await db.query('select to_regprocedure($1) as name', [signature])).rows[0].name, null);
  await db.exec('rollback');
  console.log('JARVIS_ESTIMATE_ROW_ACCEPTANCE_PASS');
} finally { await db.close(); }
