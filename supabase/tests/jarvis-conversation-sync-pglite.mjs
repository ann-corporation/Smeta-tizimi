import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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
const mutate = async (actor, company, id, etag, action, title = null, messages = null, op = null) => {
  const { rows } = await db.query('select public.t2_jarvis_suhbat_mutate_v1($1,$2,$3,$4,$5,$6,$7::jsonb,$8::uuid) as result',
    [actor, company, id, etag, action, title, messages === null ? null : JSON.stringify(messages), op]);
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
  const migration = await sql('../migrations/20270111001000_t2_jarvis_suhbat_sync_archive.sql');
  await db.exec('begin');
  await db.exec(migration);
  await db.exec(await sql('../migrations/20270111001000_t2_jarvis_suhbat_sync_archive.acceptance.sql'));
  await db.exec('rollback');
  const signature = 'public.t2_jarvis_suhbat_sync_v1(bigint,bigint,text,text)';
  const writeSignature = 'public.t2_jarvis_suhbat_mutate_v1(bigint,bigint,text,text,text,text,jsonb,uuid)';
  const registered = async () => (await db.query('select to_regprocedure($1) is not null as present', [signature])).rows[0].present;
  assert.equal(await registered(), false);
  await db.exec(migration);
  for (const role of ['anon', 'authenticated', 'service_role']) {
    for (const target of [signature, writeSignature, 'public.t2_jarvis_suhbat_archive_pick_v1(integer)',
      'public.t2_jarvis_suhbat_archive_commit_v1(bigint,text,integer)',
      'public.t2_jarvis_suhbat_archive_restore_v1(bigint,text)']) {
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
  assert.deepEqual(first.royxat.map(row => [row.id, row.toliq]), [['current', true], ['old', true], ['expired', true]]);
  assert.equal(first.suhbat.holat, 'changed');
  assert.equal(first.suhbat.xabarlar[0].m, 'Synthetic request');
  assert.deepEqual((await sync(7, 17, 'current', first.suhbat.etag)).suhbat, { id: 'current', holat: 'same', etag: first.suhbat.etag });
  assert.equal((await sync(7, 17, 'old')).suhbat.xabarlar.length, 1);
  assert.equal((await sync(7, 17, 'expired')).suhbat.xabarlar.length, 1);
  assert.equal((await sync(8, 17, 'current')).suhbat.sarlavha, 'Other actor');
  assert.deepEqual(await sync(7, 99, 'current'), { ok: false, code: 'COMPANY_ACCESS_DENIED' });
  assert.deepEqual(await sync(7, 17, '$invalid'), { ok: false, code: 'SUHBAT_INVALID' });
  await db.exec('rollback');
  await db.exec('set role service_role');
  const candidates = (await db.query('select public.t2_jarvis_suhbat_archive_pick_v1(10) as rows')).rows[0].rows;
  assert.equal(candidates.length, 1);
  const cold = candidates[0];
  const bytes = Buffer.byteLength(cold.body);
  const sha = createHash('sha256').update(cold.body).digest('hex');
  const commit = async (length, digest) => (await db.query(
    'select public.t2_jarvis_suhbat_archive_commit_v1($1,$2,$3) as r', [cold.row, digest, length],
  )).rows[0].r;
  assert.deepEqual(await commit(bytes, '0'.repeat(64)), { ok: true, archived: false });
  assert.deepEqual(await commit(bytes - 1, sha), { ok: true, archived: false });
  assert.deepEqual(await commit(bytes, sha), { ok: true, archived: true });
  assert.deepEqual(await commit(bytes, sha), { ok: true, archived: false });
  const frozen = (await sync(7, 17, 'expired')).suhbat;
  assert.equal(frozen.xabarlar, null);
  assert.deepEqual(frozen.archive, { row: cold.row, sha256: sha, bytes });
  assert.equal((await sync(8, 17, 'expired')).suhbat.holat, 'missing');
  await db.exec(`
    begin;
    insert into public.t2_jarvis_suhbat(kompaniya_id,foydalanuvchi_id,klient_id,sarlavha,xabarlar,yangilandi)
    select 17,7,'fixture-'||i,'Fixture','[{"r":"user","m":"Synthetic archive overflow"}]',now()-interval '1 day'
    from generate_series(1,22) i;
    select public._t2_jarvis_suhbat_tozala(7,17);
  `);
  const overflow = (await db.query('select public.t2_jarvis_suhbat_archive_pick_v1(20) as rows')).rows[0].rows;
  assert.equal(overflow.length, 4);
  assert.equal((await sync(7, 17, 'fixture-1')).suhbat.xabarlar[0].m, 'Synthetic archive overflow');
  assert.equal((await sync(8, 17, 'fixture-1')).suhbat.holat, 'missing');
  await db.query("update public.t2_jarvis_suhbat set yangilandi=now()+interval '1 second' where klient_id='fixture-1'");
  const afterEdit = (await db.query('select public.t2_jarvis_suhbat_archive_pick_v1(20) as rows')).rows[0].rows;
  assert.equal(afterEdit.length, 3);
  await db.exec('rollback');
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
  const operation = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const turns = [{ r: 'ai', m: 'Synthetic answer' }];
  const added = await mutate(7, 17, 'current', rename.etag, 'append', null, turns, operation);
  assert.equal(added.ok, true);
  assert.notEqual(added.etag, rename.etag);
  assert.deepEqual(await mutate(7, 17, 'current', rename.etag, 'append', null, turns, operation), added);
  assert.deepEqual(await mutate(7, 17, 'current', added.etag, 'append', null, [{ r: 'ai', m: 'Different' }], operation),
    { ok: false, code: 'SUHBAT_CONFLICT' });
  assert.deepEqual(await mutate(8, 17, 'current', rename.etag, 'append', null, turns, operation),
    { ok: false, code: 'SUHBAT_CONFLICT' });
  assert.deepEqual(await mutate(7, 17, 'current', rename.etag, 'append', null, [{ r: 'ai', m: 'Synthetic answer' }]),
    { ok: false, code: 'SUHBAT_CONFLICT' });
  assert.deepEqual((await sync(7, 17, 'current')).suhbat.xabarlar.map(x => x.m), ['Synthetic request', 'Synthetic answer']);
  assert.equal((await db.query('select count(*)::int as total from public.t2_jarvis_suhbat')).rows[0].total, 5);
  const deleted = await mutate(7, 17, 'current', added.etag, 'delete');
  assert.equal(deleted.holat, 'missing');
  assert.deepEqual(await mutate(7, 17, 'current', rename.etag, 'append', null, turns, operation),
    { ok: false, code: 'SUHBAT_NOT_FOUND' });
  assert.equal((await db.query('select count(*)::int as total from public.t2_jarvis_suhbat_append_receipt')).rows[0].total, 0);
  assert.deepEqual(await mutate(7, 17, 'current', added.etag, 'append', null, [{ r: 'user', m: 'Late message' }]),
    { ok: false, code: 'SUHBAT_NOT_FOUND' });
  const removed = await sync(7, 17, 'current', added.etag);
  assert.deepEqual(removed.suhbat, { id: 'current', holat: 'missing' });
  assert.equal(removed.royxat.some(row => row.id === 'current'), false);
  const message = [{ r: 'user', m: 'Synthetic first message' }];
  const create = (actor = 7, company = 17, title = 'New chat') =>
    mutate(actor, company, 'new-chat', null, 'create', title, message);
  assert.deepEqual(await create(7, 99), { ok: false, code: 'COMPANY_ACCESS_DENIED' });
  const created = await create();
  assert.equal(created.ok, true);
  assert.deepEqual(await create(), created);
  assert.deepEqual((await sync(7, 17, 'new-chat')).suhbat.xabarlar, message);
  assert.deepEqual(await create(7, 17, 'Different'), { ok: false, code: 'SUHBAT_CONFLICT' });
  const other = await create(8);
  assert.equal(other.ok, true);
  assert.notEqual(other.etag, created.etag);
  const appended = await mutate(7, 17, 'new-chat', created.etag, 'append', null, [{ r: 'ai', m: 'Later answer' }]);
  assert.equal(appended.ok, true);
  assert.deepEqual(await create(), { ok: false, code: 'SUHBAT_CONFLICT' });
  await mutate(7, 17, 'new-chat', appended.etag, 'delete');
  assert.deepEqual(await create(), { ok: false, code: 'SUHBAT_NOT_FOUND' });
  assert.equal((await sync(7, 17, 'new-chat')).suhbat.holat, 'missing');
  const busyId = 'many-appends';
  const busy = await mutate(7, 17, busyId, null, 'create', 'Synthetic', message);
  let tag = busy.etag;
  for (let index = 1; index <= 65; index++) {
    const op = 'ffffffff-eeee-4ddd-8ccc-' + String(index).padStart(12, '0');
    const result = await mutate(7, 17, busyId, tag, 'append', null, turns, op);
    assert.equal(result.ok, true);
    tag = result.etag;
  }
  assert.equal((await db.query('select count(*)::int as total from public.t2_jarvis_suhbat_append_receipt')).rows[0].total, 64);
  assert.deepEqual(await mutate(7, 17, busyId, busy.etag, 'append', null, turns, 'ffffffff-eeee-4ddd-8ccc-000000000001'),
    { ok: false, code: 'SUHBAT_CONFLICT' });
  for (let index = 0; index <= 20; index++) {
    assert.equal((await mutate(7, 17, `synthetic-${index}`, null, 'create', 'Synthetic', message)).ok, true);
  }
  assert.equal((await sync(7, 17)).royxat.length, 20);
  assert.equal((await sync(7, 17, 'synthetic-0')).suhbat.holat, 'changed');
  await db.exec('reset role');
  const undo = await sql('../migrations/20270111001000_t2_jarvis_suhbat_sync_archive.rollback.sql');
  await assert.rejects(() => db.exec(undo), /JARVIS_ARCHIVE_ROLLBACK_REQUIRES_RESTORE/);
  assert.equal(await registered(), true);
  const restore = async body => (await db.query(
    'select public.t2_jarvis_suhbat_archive_restore_v1($1,$2) as r', [cold.row, body],
  )).rows[0].r;
  assert.deepEqual(await restore(cold.body.replace('Hidden', 'Broken')), { ok: true, restored: false });
  assert.deepEqual(await restore(cold.body), { ok: true, restored: true });
  await db.exec(undo);
  await db.query('select public._t2_jarvis_suhbat_tozala($1,$2)', [7, 17]);
  assert.equal((await db.query('select xabarlar from public.t2_jarvis_suhbat where id=$1', [cold.row])).rows[0].xabarlar.length, 1);
  assert.equal(await registered(), false);
  assert.equal((await db.query('select to_regprocedure($1) as procedure', [writeSignature])).rows[0].procedure, null);
  assert.equal((await db.query("select to_regclass('public.t2_jarvis_suhbat_create_receipt') as receipt")).rows[0].receipt, null);
  assert.equal((await db.query("select to_regclass('public.t2_jarvis_suhbat_append_receipt') as receipt")).rows[0].receipt, null);
  console.log('JARVIS_SYNC_READ_WRITE_ACCEPTANCE_PASS');
} finally {
  await db.close();
}
