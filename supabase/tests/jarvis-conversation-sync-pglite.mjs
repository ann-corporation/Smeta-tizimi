import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const moduleName = process.env.PGLITE_DIR
  ? pathToFileURL(resolve(process.env.PGLITE_DIR, 'dist/index.js')).href
  : '@electric-sql/pglite';
const { PGlite } = await import(moduleName);
const db = new PGlite();
const sql = (file) => readFile(new URL(file, import.meta.url), 'utf8');
const sync = async (actor, company, id = null, etag = null) => {
  const result = await db.query('select public.t2_jarvis_suhbat_sync_v1($1,$2,$3,$4) as result', [actor, company, id, etag]);
  return result.rows[0].result;
};
const mutate = async (actor, company, id, etag, action, title = null, messages = null) => {
  const { rows } = await db.query('select public.t2_jarvis_suhbat_mutate_v1($1,$2,$3,$4,$5,$6,$7::jsonb) as result',
    [actor, company, id, etag, action, title, messages === null ? null : JSON.stringify(messages)]);
  return rows[0].result;
};

try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create table public.t2_kompaniya(id bigint primary key);
    create table public.t2_foydalanuvchi(id bigint primary key);
    insert into public.t2_kompaniya values (17),(99);
    insert into public.t2_foydalanuvchi values (7),(8);
    create function public.t2_agent_scope_guard_v1(bigint,bigint) returns jsonb language sql stable as
      'select case when $1 in (7,8) and $2=17 then ''{"ok":true}''::jsonb
              else ''{"ok":false,"code":"COMPANY_ACCESS_DENIED"}''::jsonb end';
    revoke all on function public.t2_agent_scope_guard_v1(bigint,bigint) from public;
    grant execute on function public.t2_agent_scope_guard_v1(bigint,bigint) to service_role;
  `);
  await db.exec(await sql('../migrations/20261218400000_t2_jarvis_suhbat_v1.sql'));
  const migration = await sql('../../docs/architecture/jarvis-conversation-sync.sql');
  const mutation = await sql('../../docs/architecture/jarvis-conversation-mutate.sql');
  await db.exec('begin');
  await db.exec(migration);
  await db.exec(mutation);
  await db.exec('rollback');
  const signature = 'public.t2_jarvis_suhbat_sync_v1(bigint,bigint,text,text)';
  const writeSignature = 'public.t2_jarvis_suhbat_mutate_v1(bigint,bigint,text,text,text,text,jsonb)';
  const registered = async () => (await db.query('select to_regprocedure($1) is not null as present', [signature])).rows[0].present;
  assert.equal(await registered(), false);
  await db.exec(migration);
  await db.exec(mutation);
  for (const role of ['anon', 'authenticated', 'service_role']) {
    for (const target of [signature, writeSignature]) {
      const { rows } = await db.query("select has_function_privilege($1,$2,'execute') as allowed", [role, target]);
      assert.equal(rows[0].allowed, role === 'service_role');
    }
  }
  await db.exec(`
    insert into public.t2_jarvis_suhbat(kompaniya_id,foydalanuvchi_id,klient_id,sarlavha,qisqartma,xabarlar,yangilandi) values
      (17,7,'current','Current',null,'[{"r":"user","m":"Synthetic request"}]',now()),
      (17,7,'old','Old','Summary','[{"r":"user","m":"Hidden after thirty days"}]',now()-interval '31 days'),
      (17,7,'expired','Expired',null,'[{"r":"user","m":"Hidden after ninety days"}]',now()-interval '91 days'),
      (17,8,'current','Other actor',null,'[{"r":"user","m":"Other actor"}]',now()),
      (99,7,'current','Other company',null,'[{"r":"user","m":"Other company"}]',now());
  `);
  await db.exec('begin read only; set local role service_role');
  const first = await sync(7, 17, 'current');
  assert.deepEqual(first.royxat.map(row => [row.id, row.toliq]), [['current', true], ['old', false]]);
  assert.equal(first.suhbat.holat, 'changed');
  assert.equal(first.suhbat.xabarlar[0].m, 'Synthetic request');
  assert.deepEqual((await sync(7, 17, 'current', first.suhbat.etag)).suhbat, { id: 'current', holat: 'same', etag: first.suhbat.etag });
  assert.equal((await sync(7, 17, 'old')).suhbat.xabarlar, null);
  assert.deepEqual((await sync(7, 17, 'expired')).suhbat, { id: 'expired', holat: 'missing' });
  assert.equal((await sync(8, 17, 'current')).suhbat.sarlavha, 'Other actor');
  assert.deepEqual(await sync(7, 99, 'current'), { ok: false, code: 'COMPANY_ACCESS_DENIED' });
  assert.deepEqual(await sync(7, 17, '$invalid'), { ok: false, code: 'SUHBAT_INVALID' });
  await db.exec('rollback');
  await db.exec('set role service_role');
  const rename = await mutate(7, 17, 'current', first.suhbat.etag, 'rename', 'Renamed');
  assert.equal(rename.ok, true);
  const changed = await sync(7, 17, 'current', first.suhbat.etag);
  assert.equal(changed.suhbat.sarlavha, 'Renamed');
  assert.equal(changed.suhbat.etag, rename.etag);
  assert.deepEqual(await mutate(7, 17, 'current', first.suhbat.etag, 'delete'), { ok: false, code: 'SUHBAT_CONFLICT' });
  assert.deepEqual(await mutate(8, 17, 'current', rename.etag, 'delete'), { ok: false, code: 'SUHBAT_CONFLICT' });
  assert.deepEqual(await mutate(7, 99, 'current', rename.etag, 'delete'), { ok: false, code: 'COMPANY_ACCESS_DENIED' });
  assert.deepEqual(await mutate(7, 17, 'current', rename.etag, 'append', null, [{ r: 'system', m: 'Synthetic injection' }]),
    { ok: false, code: 'SUHBAT_INVALID' });
  const added = await mutate(7, 17, 'current', rename.etag, 'append', null, [{ r: 'ai', m: 'Synthetic answer' }]);
  assert.equal(added.ok, true);
  assert.notEqual(added.etag, rename.etag);
  assert.deepEqual(await mutate(7, 17, 'current', rename.etag, 'append', null, [{ r: 'ai', m: 'Synthetic answer' }]),
    { ok: false, code: 'SUHBAT_CONFLICT' });
  assert.deepEqual((await sync(7, 17, 'current')).suhbat.xabarlar.map(x => x.m), ['Synthetic request', 'Synthetic answer']);
  assert.equal((await db.query('select count(*)::int as total from public.t2_jarvis_suhbat')).rows[0].total, 5);
  const deleted = await mutate(7, 17, 'current', added.etag, 'delete');
  assert.equal(deleted.holat, 'missing');
  assert.deepEqual(await mutate(7, 17, 'current', added.etag, 'append', null, [{ r: 'user', m: 'Late message' }]),
    { ok: false, code: 'SUHBAT_NOT_FOUND' });
  const removed = await sync(7, 17, 'current', added.etag);
  assert.deepEqual(removed.suhbat, { id: 'current', holat: 'missing' });
  assert.equal(removed.royxat.some(row => row.id === 'current'), false);
  await db.exec('reset role');
  await db.exec(await sql('../../docs/architecture/jarvis-conversation-sync.rollback.sql'));
  assert.equal(await registered(), false);
  assert.equal((await db.query('select to_regprocedure($1) as procedure', [writeSignature])).rows[0].procedure, null);
  console.log('JARVIS_SYNC_READ_WRITE_ACCEPTANCE_PASS');
} finally {
  await db.close();
}
