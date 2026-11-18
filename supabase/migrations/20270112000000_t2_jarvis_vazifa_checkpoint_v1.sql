-- Jarvis vazifa checkpoint (T2): durable, read-only task checkpoints (object.summary, object.discrepancies).
-- Biznes buyruqlari bu do'konda YO'Q; yozuvchi qadam (write=true) validatorda rad etiladi.
-- t2_qator o'qilmaydi (versiya guard - AGENTS.md 2c - talab qilinmaydi). Pul hisobi yo'q.
-- Jadval to'g'ridan-to'g'ri yopiq (RLS + no_direct_access + revoke); faqat service_role RPC (actor sessiyadan, t2_agent_scope_guard_v1).
-- Migratsiya faylida o'z BEGIN/COMMIT yo'q.

create table public.t2_jarvis_vazifa (
  id text primary key,
  actor_id bigint not null,
  kompaniya_id bigint not null,
  obyekt_id bigint not null,
  task jsonb not null,
  revision integer not null check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint t2_jarvis_vazifa_id_ck check (id ~ '^[A-Za-z0-9_.-]{1,40}$'),
  constraint t2_jarvis_vazifa_task_size_ck check (octet_length(task::text) <= 65536),
  constraint t2_jarvis_vazifa_task_revision_ck check ((task->>'revision') ~ '^(0|[1-9][0-9]*)$' and (task->>'revision')::numeric = revision)
);

alter table public.t2_jarvis_vazifa enable row level security;
create index t2_jarvis_vazifa_scope_yangilandi_idx
  on public.t2_jarvis_vazifa(actor_id,kompaniya_id,obyekt_id,updated_at desc,id);
create policy t2_jarvis_vazifa_no_direct_access on public.t2_jarvis_vazifa
  using (false) with check (false);
revoke all on table public.t2_jarvis_vazifa from public, anon, authenticated;

-- Return a stable error code when any task field is invalid. The BFF canonicalizes
-- and strips unknown fields first; this validator deliberately repeats trust checks.
create or replace function public._t2_jarvis_vazifa_tekshir_v1(
  p_task jsonb, p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint,
  p_expected_revision integer
) returns text
language plpgsql immutable set search_path = public, pg_temp as $$
declare s jsonb; i integer; v_tool text; v_op text; v_state text; v_evidence jsonb;
begin
  if p_task is null or jsonb_typeof(p_task) <> 'object' then return 'TASK_INVALID'; end if;
  if octet_length(p_task::text) > 65536 then return 'TASK_TOO_LARGE'; end if;
  if not (p_task ?& array['id','goal','scope','revision','cancelled','steps'])
     or exists (select 1 from jsonb_object_keys(p_task) k where k <> all(array['id','goal','scope','revision','cancelled','steps'])) then return 'TASK_FIELDS_INVALID'; end if;
  if jsonb_typeof(p_task->'id') <> 'string' or length(p_task->>'id') not between 1 and 40
     or (p_task->>'id') !~ '^[A-Za-z0-9_.-]+$' then return 'TASK_ID_INVALID'; end if;
  if jsonb_typeof(p_task->'goal') <> 'string' or length(btrim(p_task->>'goal')) not between 1 and 2000 then return 'TASK_GOAL_INVALID'; end if;
  if jsonb_typeof(p_task->'scope') <> 'object'
     or not ((p_task->'scope') ?& array['actorId','companyId','objectId'])
     or exists (select 1 from jsonb_object_keys(p_task->'scope') k where k <> all(array['actorId','companyId','objectId']))
     or (p_task#>>'{scope,actorId}') is distinct from p_actor_id::text
     or (p_task#>>'{scope,companyId}') is distinct from p_kompaniya_id::text
     or (p_task#>>'{scope,objectId}') is distinct from p_obyekt_id::text then return 'TASK_SCOPE_MISMATCH'; end if;
  if p_expected_revision is null or p_expected_revision < -1 or p_expected_revision = 2147483647
     or jsonb_typeof(p_task->'revision') <> 'number'
     or (p_task->>'revision') !~ '^(0|[1-9][0-9]*)$'
     or (p_task->>'revision')::numeric <> (p_expected_revision + 1)::numeric then return 'TASK_REVISION_INVALID'; end if;
  if jsonb_typeof(p_task->'cancelled') <> 'boolean' then return 'TASK_STATE_INVALID'; end if;
  if jsonb_typeof(p_task->'steps') <> 'array' or jsonb_array_length(p_task->'steps') <> 2 then return 'TASK_STEPS_INVALID'; end if;
  for i in 0..1 loop
    s := p_task->'steps'->i;
    v_tool := case i when 0 then 'object.summary' else 'object.discrepancies' end;
    if jsonb_typeof(s) <> 'object'
       or not (s ?& array['id','tool','input','operationId','write','expectedVersion','state','evidence'])
       or exists (select 1 from jsonb_object_keys(s) k where k <> all(array['id','tool','input','operationId','write','expectedVersion','state','evidence']))
       or s->>'id' is distinct from v_tool or s->>'tool' is distinct from v_tool then return 'TASK_TOOL_INVALID'; end if;
    if jsonb_typeof(s->'input') <> 'object'
       or (s->'input') <> jsonb_build_object('objectId', p_obyekt_id) then return 'TASK_INPUT_INVALID'; end if;
    v_op := s->>'operationId';
    if jsonb_typeof(s->'operationId') <> 'string' or length(v_op) not between 1 and 80
       or v_op !~ '^[A-Za-z0-9_.-]+$'
       or v_op = p_task->'steps'->(1-i)->>'operationId' then return 'TASK_OPERATION_INVALID'; end if;
    if s->'write' is distinct from 'false'::jsonb or s->'expectedVersion' is distinct from 'null'::jsonb then return 'TASK_WRITE_FORBIDDEN'; end if;
    v_state := s->>'state'; v_evidence := s->'evidence';
    if jsonb_typeof(s->'state') is distinct from 'string'
       or v_state is null
       or v_state not in ('queued','running','reconciling','verified')
       or (v_evidence <> 'null'::jsonb and (jsonb_typeof(v_evidence) <> 'string' or length(s->>'evidence') > 2048))
       or (v_state = 'verified' and (v_evidence = 'null'::jsonb or length(btrim(s->>'evidence')) = 0)) then return 'TASK_STATE_INVALID'; end if;
  end loop;
  return null;
end $$;

create or replace function public.t2_jarvis_vazifa_ol_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint, p_id text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare g jsonb; r public.t2_jarvis_vazifa%rowtype;
begin
  if p_actor_id is null or p_kompaniya_id is null or p_obyekt_id is null or p_id is null then
    return jsonb_build_object('ok',false,'code','SCOPE_REQUIRED'); end if;
  g := public.t2_agent_scope_guard_v1(p_actor_id,p_kompaniya_id,null,p_obyekt_id);
  if not coalesce((g->>'ok')::boolean,false) then return g; end if;
  select * into r from public.t2_jarvis_vazifa where id=p_id
    and actor_id=p_actor_id and kompaniya_id=p_kompaniya_id and obyekt_id=p_obyekt_id;
  if not found then return jsonb_build_object('ok',false,'code','TASK_NOT_FOUND'); end if;
  return jsonb_build_object('ok',true,'task',r.task);
end $$;

create or replace function public.t2_jarvis_vazifa_royxat_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare g jsonb; v_tasks jsonb;
begin
  if p_actor_id is null or p_kompaniya_id is null or p_obyekt_id is null then
    return jsonb_build_object('ok',false,'code','SCOPE_REQUIRED'); end if;
  g := public.t2_agent_scope_guard_v1(p_actor_id,p_kompaniya_id,null,p_obyekt_id);
  if not coalesce((g->>'ok')::boolean,false) then return g; end if;
  select coalesce(jsonb_agg(task order by updated_at desc,id), '[]'::jsonb) into v_tasks
    from (select task,updated_at,id from public.t2_jarvis_vazifa
           where actor_id=p_actor_id and kompaniya_id=p_kompaniya_id and obyekt_id=p_obyekt_id
           order by updated_at desc,id limit 50) recent;
  return jsonb_build_object('ok',true,'tasks',v_tasks);
end $$;

create or replace function public.t2_jarvis_vazifa_saqla_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint,
  p_id text, p_expected_revision integer, p_task jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare g jsonb; r public.t2_jarvis_vazifa%rowtype; v_error text; v_count integer;
begin
  if p_actor_id is null or p_kompaniya_id is null or p_obyekt_id is null
     or p_id is null or p_expected_revision is null or p_task is null then
    return jsonb_build_object('ok',false,'code','SCOPE_REQUIRED'); end if;
  if p_id !~ '^[A-Za-z0-9_.-]{1,40}$' then return jsonb_build_object('ok',false,'code','TASK_ID_INVALID'); end if;
  g := public.t2_agent_scope_guard_v1(p_actor_id,p_kompaniya_id,null,p_obyekt_id);
  if not coalesce((g->>'ok')::boolean,false) then return g; end if;
  v_error := public._t2_jarvis_vazifa_tekshir_v1(p_task,p_actor_id,p_kompaniya_id,p_obyekt_id,p_expected_revision);
  if v_error is not null then return jsonb_build_object('ok',false,'code',v_error); end if;
  if p_task->>'id' <> p_id then return jsonb_build_object('ok',false,'code','TASK_ID_MISMATCH'); end if;

  if p_expected_revision = -1 then
    insert into public.t2_jarvis_vazifa(id,actor_id,kompaniya_id,obyekt_id,task,revision)
    values(p_id,p_actor_id,p_kompaniya_id,p_obyekt_id,p_task,0)
    on conflict (id) do nothing;
    get diagnostics v_count = row_count;
    if v_count = 1 then return jsonb_build_object('ok',true,'task',p_task); end if;
    select * into r from public.t2_jarvis_vazifa where id=p_id;
    if r.actor_id=p_actor_id and r.kompaniya_id=p_kompaniya_id and r.obyekt_id=p_obyekt_id and r.revision=0 and r.task=p_task then
      return jsonb_build_object('ok',true,'task',r.task);
    end if;
    if found and (r.actor_id<>p_actor_id or r.kompaniya_id<>p_kompaniya_id or r.obyekt_id<>p_obyekt_id) then
      return jsonb_build_object('ok',false,'code','TASK_SCOPE_CONFLICT');
    end if;
    return jsonb_build_object('ok',false,'code','REVISION_CONFLICT');
  end if;

  select * into r from public.t2_jarvis_vazifa where id=p_id for update;
  if not found then return jsonb_build_object('ok',false,'code','REVISION_CONFLICT'); end if;
  if r.actor_id<>p_actor_id or r.kompaniya_id<>p_kompaniya_id or r.obyekt_id<>p_obyekt_id then
    return jsonb_build_object('ok',false,'code','TASK_SCOPE_CONFLICT'); end if;
  if r.revision=p_expected_revision+1 and r.task=p_task then return jsonb_build_object('ok',true,'task',r.task); end if;
  if r.revision<>p_expected_revision then return jsonb_build_object('ok',false,'code','REVISION_CONFLICT'); end if;
  update public.t2_jarvis_vazifa set task=p_task,revision=p_expected_revision+1,updated_at=now()
   where id=p_id and actor_id=p_actor_id and kompaniya_id=p_kompaniya_id and obyekt_id=p_obyekt_id and revision=p_expected_revision
   returning * into r;
  if not found then return jsonb_build_object('ok',false,'code','REVISION_CONFLICT'); end if;
  return jsonb_build_object('ok',true,'task',r.task);
end $$;

revoke all on function public._t2_jarvis_vazifa_tekshir_v1(jsonb,bigint,bigint,bigint,integer) from public, anon, authenticated;
revoke all on function public.t2_jarvis_vazifa_ol_v1(bigint,bigint,bigint,text),
  public.t2_jarvis_vazifa_royxat_v1(bigint,bigint,bigint),
  public.t2_jarvis_vazifa_saqla_v1(bigint,bigint,bigint,text,integer,jsonb) from public, anon, authenticated;
grant execute on function public.t2_jarvis_vazifa_ol_v1(bigint,bigint,bigint,text),
  public.t2_jarvis_vazifa_royxat_v1(bigint,bigint,bigint),
  public.t2_jarvis_vazifa_saqla_v1(bigint,bigint,bigint,text,integer,jsonb) to service_role;
