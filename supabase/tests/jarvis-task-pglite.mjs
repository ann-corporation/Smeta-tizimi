import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Synthetic PGlite acceptance only; SQL input is the architecture draft, not a migration.
const runtime = process.env.PGLITE_DIR || 'C:/Temp/hr-pglite/node_modules/@electric-sql/pglite';
const { PGlite } = await import(pathToFileURL(resolve(runtime, 'dist/index.js')).href);
const sql = await readFile(new URL('../../docs/architecture/ai-task-checkpoint.sql', import.meta.url), 'utf8');
const rollback = await readFile(new URL('../../docs/architecture/ai-task-checkpoint.rollback.sql', import.meta.url), 'utf8');
const db = new PGlite();
const okTask = (id, revision = 0, extra = {}) => ({
  id, goal: 'Check object context', scope: { actorId: 11, companyId: 21, objectId: 31 },
  revision, cancelled: false,
  steps: ['object.summary', 'object.discrepancies'].map((tool) => ({
    id: tool, tool, input: { objectId: 31 }, operationId: `${id}-${tool.replace('.', '-')}`,
    write: false, expectedVersion: null, state: 'queued', evidence: null,
  })),
  ...extra,
});
const rpc = async (name, args) => (await db.query(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) as result`, args)).rows[0].result;
const rejected = async (promise, code) => {
  const value = await promise;
  assert.equal(value.ok, false, `expected rejection ${code}; got ${JSON.stringify(value)}`);
  assert.equal(value.code, code);
};

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table public.synthetic_scope(actor_id bigint, company_id bigint, object_id bigint, primary key(actor_id,company_id,object_id));
    insert into public.synthetic_scope values (11,21,31),(12,21,31),(11,22,31),(11,21,32);
    create function public.t2_agent_scope_guard_v1(p_actor_id bigint,p_company_id bigint,p_project_id bigint,p_object_id bigint)
    returns jsonb language sql stable as $$
      select case when p_actor_id is null or p_company_id is null or p_object_id is null
        then jsonb_build_object('ok',false,'code','SCOPE_REQUIRED')
        when exists(select 1 from public.synthetic_scope where actor_id=p_actor_id and company_id=p_company_id and object_id=p_object_id)
        then jsonb_build_object('ok',true,'rol','member','scope','object')
        else jsonb_build_object('ok',false,'code','OBJECT_LINEAGE_INVALID') end
    $$;
  `);
  await db.exec(sql);

  const first = okTask('jarvis-check-1');
  const created = await rpc('t2_jarvis_vazifa_saqla_v1', [11, 21, 31, first.id, -1, first]);
  assert.deepEqual(created, { ok: true, task: first });
  assert.deepEqual(await rpc('t2_jarvis_vazifa_saqla_v1', [11, 21, 31, first.id, -1, first]), created, 'identical create retry is idempotent');
  assert.deepEqual(await rpc('t2_jarvis_vazifa_ol_v1', [11, 21, 31, first.id]), { ok: true, task: first });
  assert.deepEqual(await rpc('t2_jarvis_vazifa_royxat_v1', [11, 21, 31]), { ok: true, tasks: [first] });

  const running = { ...first, revision: 1, steps: first.steps.map((step, i) => i === 0 ? { ...step, state: 'running' } : step) };
  const runningSaved = await rpc('t2_jarvis_vazifa_saqla_v1', [11, 21, 31, first.id, 0, running]);
  assert.deepEqual(runningSaved, { ok: true, task: running });
  assert.deepEqual(await rpc('t2_jarvis_vazifa_saqla_v1', [11, 21, 31, first.id, 0, running]), runningSaved, 'identical update retry is idempotent');
  const verified = { ...running, revision: 2, steps: running.steps.map((step, i) => i === 0 ? { ...step, state: 'verified', evidence: 'readback: object summary confirmed' } : step) };
  const verifiedSaved = await rpc('t2_jarvis_vazifa_saqla_v1', [11, 21, 31, first.id, 1, verified]);
  assert.deepEqual(verifiedSaved, { ok: true, task: verified });
  assert.deepEqual(await rpc('t2_jarvis_vazifa_ol_v1', [11, 21, 31, first.id]), { ok: true, task: verified }, 'reload returns verified revision 2');
  assert.deepEqual(await rpc('t2_jarvis_vazifa_royxat_v1', [11, 21, 31]), { ok: true, tasks: [verified] }, 'list returns verified revision 2');
  await rejected(rpc('t2_jarvis_vazifa_saqla_v1', [11, 21, 31, first.id, 1, { ...verified, cancelled: true }]), 'REVISION_CONFLICT');
  await rejected(rpc('t2_jarvis_vazifa_saqla_v1', [12, 21, 31, first.id, -1, { ...first, scope: { actorId: 12, companyId: 21, objectId: 31 } }]), 'TASK_SCOPE_CONFLICT');
  await rejected(rpc('t2_jarvis_vazifa_ol_v1', [12, 21, 31, first.id]), 'TASK_NOT_FOUND');
  await rejected(rpc('t2_jarvis_vazifa_ol_v1', [11, null, 31, first.id]), 'SCOPE_REQUIRED');
  await rejected(rpc('t2_jarvis_vazifa_saqla_v1', [11, 21, null, 'x', -1, okTask('x')]), 'SCOPE_REQUIRED');

  const badTool = okTask('bad-tool'); badTool.steps[0].tool = 'object.write';
  await rejected(rpc('t2_jarvis_vazifa_saqla_v1', [11, 21, 31, badTool.id, -1, badTool]), 'TASK_TOOL_INVALID');
  const badWrite = okTask('bad-write'); badWrite.steps[1].write = true;
  await rejected(rpc('t2_jarvis_vazifa_saqla_v1', [11, 21, 31, badWrite.id, -1, badWrite]), 'TASK_WRITE_FORBIDDEN');
  const nullWrite = okTask('null-write'); nullWrite.steps[1].write = null;
  await rejected(rpc('t2_jarvis_vazifa_saqla_v1', [11, 21, 31, nullWrite.id, -1, nullWrite]), 'TASK_WRITE_FORBIDDEN');
  const badState = okTask('bad-state'); badState.steps[0].state = 'done';
  await rejected(rpc('t2_jarvis_vazifa_saqla_v1', [11, 21, 31, badState.id, -1, badState]), 'TASK_STATE_INVALID');
  const nullState = okTask('null-state'); nullState.steps[0].state = null;
  await rejected(rpc('t2_jarvis_vazifa_saqla_v1', [11, 21, 31, nullState.id, -1, nullState]), 'TASK_STATE_INVALID');
  const badScope = okTask('bad-scope'); badScope.scope.objectId = 32;
  await rejected(rpc('t2_jarvis_vazifa_saqla_v1', [11, 21, 31, badScope.id, -1, badScope]), 'TASK_SCOPE_MISMATCH');
  const extraField = okTask('extra-field', 0, { arbitraryAuthority: true });
  await rejected(rpc('t2_jarvis_vazifa_saqla_v1', [11, 21, 31, extraField.id, -1, extraField]), 'TASK_FIELDS_INVALID');
  const tooLarge = okTask('too-large'); tooLarge.goal = 'x'.repeat(66000);
  await rejected(rpc('t2_jarvis_vazifa_saqla_v1', [11, 21, 31, tooLarge.id, -1, tooLarge]), 'TASK_TOO_LARGE');

  const privilege = await db.query(`
    select has_table_privilege('anon','public.t2_jarvis_vazifa','select') as anon_read,
      has_table_privilege('authenticated','public.t2_jarvis_vazifa','insert') as auth_insert,
      has_function_privilege('anon','public.t2_jarvis_vazifa_ol_v1(bigint,bigint,bigint,text)','execute') as anon_rpc,
      has_function_privilege('authenticated','public.t2_jarvis_vazifa_saqla_v1(bigint,bigint,bigint,text,integer,jsonb)','execute') as auth_save,
      has_function_privilege('service_role','public.t2_jarvis_vazifa_ol_v1(bigint,bigint,bigint,text)','execute') as service_read,
      has_function_privilege('service_role','public.t2_jarvis_vazifa_royxat_v1(bigint,bigint,bigint)','execute') as service_list,
      has_function_privilege('service_role','public.t2_jarvis_vazifa_saqla_v1(bigint,bigint,bigint,text,integer,jsonb)','execute') as service_save
  `);
  assert.deepEqual(privilege.rows[0], { anon_read: false, auth_insert: false, anon_rpc: false, auth_save: false, service_read: true, service_list: true, service_save: true });

  await db.exec(rollback);
  const gone = await db.query(`select to_regclass('public.t2_jarvis_vazifa') is null as table_gone,
    to_regprocedure('public.t2_jarvis_vazifa_ol_v1(bigint,bigint,bigint,text)') is null as get_gone,
    to_regprocedure('public.t2_jarvis_vazifa_royxat_v1(bigint,bigint,bigint)') is null as list_gone,
    to_regprocedure('public.t2_jarvis_vazifa_saqla_v1(bigint,bigint,bigint,text,integer,jsonb)') is null as save_gone,
    to_regprocedure('public._t2_jarvis_vazifa_tekshir_v1(jsonb,bigint,bigint,bigint,integer)') is null as validator_gone`).then((r) => r.rows[0]);
  assert.deepEqual(gone, { table_gone: true, get_gone: true, list_gone: true, save_gone: true, validator_gone: true });
  console.log('PASS Jarvis checkpoint PGlite: create/retry/update/CAS/scope/validation/grants/rollback');
} finally {
  await db.close();
}
