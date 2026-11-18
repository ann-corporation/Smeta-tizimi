-- Jarvis: scoped snapshots, versioned writes, and verified R2 archive.
alter table public.t2_jarvis_suhbat
  add column archive_sha256 text check (archive_sha256 is null or archive_sha256 ~ '^[a-f0-9]{64}$'),
  add column archive_bytes integer check (archive_bytes is null or archive_bytes between 1 and 32768),
  add column archive_queued_at timestamptz,
  add constraint t2_jarvis_archive_pointer check ((archive_sha256 is null) = (archive_bytes is null));

-- Keep the newest twenty conversations hot per actor and company. Older ones are
-- queued for verified archival; only the archive commit may evict their transcript.
create or replace function public._t2_jarvis_suhbat_tozala(p_actor_id bigint, p_kompaniya_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  with overflow as (
    select id from public.t2_jarvis_suhbat
    where foydalanuvchi_id = p_actor_id and kompaniya_id = p_kompaniya_id
    order by yangilandi desc, id desc offset 20
  )
  update public.t2_jarvis_suhbat s
  set archive_queued_at = now()
  from overflow o
  where s.id = o.id and s.xabarlar is not null
    and (s.archive_queued_at is null or s.archive_queued_at < s.yangilandi);
end
$$;

create function public._t2_jarvis_suhbat_snapshot_v1(s public.t2_jarvis_suhbat)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select visible || jsonb_build_object('etag', md5(jsonb_build_array(s.id, visible)::text))
  from (select jsonb_build_object(
    'id', s.klient_id, 'sarlavha', s.sarlavha, 'qisqartma', s.qisqartma,
    'yangilandi', s.yangilandi at time zone 'UTC',
    'xabarlar', s.xabarlar,
    'archive', case when s.xabarlar is null and s.archive_sha256 is not null then
      jsonb_build_object('row', s.id::text, 'sha256', s.archive_sha256, 'bytes', s.archive_bytes) end
  ) as visible) v
$$;
revoke all on function public._t2_jarvis_suhbat_snapshot_v1(public.t2_jarvis_suhbat) from public, anon, authenticated;
grant execute on function public._t2_jarvis_suhbat_snapshot_v1(public.t2_jarvis_suhbat) to service_role;

create function public.t2_jarvis_suhbat_sync_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_klient_id text default null, p_etag text default null
)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  scope jsonb;
  listing jsonb;
  selected jsonb;
  etag text;
begin
  if p_actor_id is null or p_actor_id < 1 or p_kompaniya_id is null or p_kompaniya_id < 1
     or (p_klient_id is not null and p_klient_id !~ '^[A-Za-z0-9_.-]{1,40}$')
     or (p_etag is not null and (p_klient_id is null or p_etag !~ '^[a-f0-9]{32}$')) then
    return jsonb_build_object('ok', false, 'code', 'SUHBAT_INVALID');
  end if;
  scope := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not coalesce((scope ->> 'ok')::boolean, false) then
    return coalesce(scope, jsonb_build_object('ok', false, 'code', 'COMPANY_ACCESS_DENIED'));
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.klient_id, 'sarlavha', s.sarlavha, 'yangilandi', s.yangilandi, 'toliq', s.toliq
  ) order by s.yangilandi desc, s.id desc), '[]'::jsonb)
  into listing
  from (
    select id, klient_id, sarlavha, yangilandi,
      xabarlar is not null or archive_sha256 is not null as toliq
    from public.t2_jarvis_suhbat
    where foydalanuvchi_id = p_actor_id and kompaniya_id = p_kompaniya_id
    order by yangilandi desc, id desc limit 20
  ) s;

  if p_klient_id is not null then
    select public._t2_jarvis_suhbat_snapshot_v1(s) into selected
    from public.t2_jarvis_suhbat s
    where foydalanuvchi_id = p_actor_id and kompaniya_id = p_kompaniya_id and klient_id = p_klient_id;
    if not found then
      selected := jsonb_build_object('id', p_klient_id, 'holat', 'missing');
    else
      -- After authorization, the same snapshot token fences writes in the mutation RPC.
      etag := selected ->> 'etag';
      if p_etag is not distinct from etag then
        selected := jsonb_build_object('id', p_klient_id, 'holat', 'same', 'etag', etag);
      else
        selected := selected || jsonb_build_object('holat', 'changed', 'etag', etag);
      end if;
    end if;
  end if;
  return jsonb_build_object('ok', true, 'royxat', listing, 'suhbat', selected);
end
$$;

revoke all on function public.t2_jarvis_suhbat_sync_v1(bigint,bigint,text,text) from public, anon, authenticated;
grant execute on function public.t2_jarvis_suhbat_sync_v1(bigint,bigint,text,text) to service_role;

-- Versioned conversation writes.
-- Keep legacy callers on their current routing until protected writes are supported in every channel.
-- Keep a content-free receipt even if history is deleted or pruned. A delayed create must not resurrect it.
create table public.t2_jarvis_suhbat_create_receipt (
  foydalanuvchi_id bigint not null references public.t2_foydalanuvchi(id) on delete cascade,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  klient_id text not null,
  suhbat_id bigint not null,
  etag text not null,
  primary key (foydalanuvchi_id, kompaniya_id, klient_id)
);
alter table public.t2_jarvis_suhbat_create_receipt enable row level security;
revoke all on public.t2_jarvis_suhbat_create_receipt from public, anon, authenticated;
grant select, insert on public.t2_jarvis_suhbat_create_receipt to service_role;

-- Bounded acknowledgements for retried appends. The conversation lock serializes reads, writes and receipt pruning.
create table public.t2_jarvis_suhbat_append_receipt (
  suhbat_id bigint not null references public.t2_jarvis_suhbat(id) on delete cascade,
  operation_id uuid not null,
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  etag text not null,
  yozildi timestamptz not null default clock_timestamp(),
  primary key (suhbat_id, operation_id)
);
alter table public.t2_jarvis_suhbat_append_receipt enable row level security;
revoke all on public.t2_jarvis_suhbat_append_receipt from public, anon, authenticated;
grant select, insert, delete on public.t2_jarvis_suhbat_append_receipt to service_role;

create function public.t2_jarvis_suhbat_mutate_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_klient_id text, p_etag text, p_amal text,
  p_sarlavha text default null, p_xabarlar jsonb default null, p_operation_id uuid default null
)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare
  scope jsonb;
  current_row public.t2_jarvis_suhbat;
  snapshot jsonb;
  title text;
  messages jsonb;
  receipt public.t2_jarvis_suhbat_create_receipt;
  append_receipt public.t2_jarvis_suhbat_append_receipt;
  request_fingerprint text;
begin
  if p_actor_id is null or p_actor_id < 1 or p_kompaniya_id is null or p_kompaniya_id < 1
     or coalesce(p_klient_id,'') !~ '^[A-Za-z0-9_.-]{1,40}$'
     or coalesce(p_amal,'') not in ('create','rename','delete','append')
     or (p_operation_id is not null and p_amal <> 'append')
     or (case when p_amal = 'create' then p_etag is not null else coalesce(p_etag,'') !~ '^[a-f0-9]{32}$' end) then
    return jsonb_build_object('ok', false, 'code', 'SUHBAT_INVALID');
  end if;
  title := btrim(regexp_replace(p_sarlavha, '\s+', ' ', 'g'));
  if (p_amal = 'rename' and (coalesce(length(title), 0) not between 1 and 80 or p_xabarlar is not null))
      or (p_amal = 'create' and coalesce(length(title), 0) not between 1 and 80)
      or (p_amal not in ('rename','create') and p_sarlavha is not null)
      or (p_amal not in ('append','create') and p_xabarlar is not null) then
    return jsonb_build_object('ok', false, 'code', 'SUHBAT_INVALID');
  end if;
  if p_amal in ('append','create') then
    if jsonb_typeof(p_xabarlar) is distinct from 'array' then
      return jsonb_build_object('ok', false, 'code', 'SUHBAT_INVALID');
    end if;
    select jsonb_agg(jsonb_build_object('r', e ->> 'r', 'm', e ->> 'm') order by n)
    into messages from jsonb_array_elements(p_xabarlar) with ordinality turn(e,n);
    if jsonb_array_length(p_xabarlar) not between 1 and 12 or octet_length(p_xabarlar::text) > 21000 or exists (
      select 1 from jsonb_array_elements(p_xabarlar) e
      where jsonb_typeof(e) is distinct from 'object'
        or coalesce(e ->> 'r','') not in ('user','ai') or jsonb_typeof(e -> 'm') is distinct from 'string'
        or length(e ->> 'm') > 400 or length(btrim(e ->> 'm')) = 0
    ) then
      return jsonb_build_object('ok', false, 'code', 'SUHBAT_INVALID');
    end if;
  end if;

  scope := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not coalesce((scope ->> 'ok')::boolean, false) then
    return coalesce(scope, jsonb_build_object('ok', false, 'code', 'COMPANY_ACCESS_DENIED'));
  end if;
  if p_amal = 'create' then
    perform pg_advisory_xact_lock(hashtextextended(
      jsonb_build_array('jarvis-create', p_actor_id, p_kompaniya_id)::text, 0));
    select * into receipt from public.t2_jarvis_suhbat_create_receipt
    where foydalanuvchi_id = p_actor_id and kompaniya_id = p_kompaniya_id and klient_id = p_klient_id;
    if found then
      select * into current_row from public.t2_jarvis_suhbat
      where id = receipt.suhbat_id and foydalanuvchi_id = p_actor_id and kompaniya_id = p_kompaniya_id
        and klient_id = p_klient_id for update;
      if not found then
        return jsonb_build_object('ok', false, 'code', 'SUHBAT_NOT_FOUND');
      end if;
      snapshot := public._t2_jarvis_suhbat_snapshot_v1(current_row);
      if snapshot ->> 'etag' is distinct from receipt.etag
         or current_row.sarlavha is distinct from title or current_row.xabarlar is distinct from messages then
        return jsonb_build_object('ok', false, 'code', 'SUHBAT_CONFLICT');
      end if;
    else
      insert into public.t2_jarvis_suhbat (foydalanuvchi_id, kompaniya_id, klient_id, sarlavha, xabarlar, qisqartma, yangilandi)
      values (p_actor_id, p_kompaniya_id, p_klient_id, title, messages, messages -> -1 ->> 'm', clock_timestamp())
      on conflict (foydalanuvchi_id, kompaniya_id, klient_id) do nothing returning * into current_row;
      if not found then
        return jsonb_build_object('ok', false, 'code', 'SUHBAT_CONFLICT');
      end if;
      snapshot := public._t2_jarvis_suhbat_snapshot_v1(current_row);
      insert into public.t2_jarvis_suhbat_create_receipt (foydalanuvchi_id, kompaniya_id, klient_id, suhbat_id, etag)
      values (p_actor_id, p_kompaniya_id, p_klient_id, current_row.id, snapshot ->> 'etag');
      perform public._t2_jarvis_suhbat_tozala(p_actor_id, p_kompaniya_id);
    end if;
    return jsonb_build_object('ok', true, 'id', p_klient_id, 'etag', snapshot ->> 'etag');
  end if;
  select * into current_row from public.t2_jarvis_suhbat
  where foydalanuvchi_id = p_actor_id and kompaniya_id = p_kompaniya_id and klient_id = p_klient_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'SUHBAT_NOT_FOUND');
  end if;
  if p_operation_id is not null then
    request_fingerprint := encode(sha256(convert_to(jsonb_build_array(p_etag, messages)::text, 'UTF8')), 'hex');
    select * into append_receipt from public.t2_jarvis_suhbat_append_receipt
    where suhbat_id = current_row.id and operation_id = p_operation_id;
    if found then
      if request_fingerprint is distinct from append_receipt.fingerprint then
        return jsonb_build_object('ok', false, 'code', 'SUHBAT_CONFLICT');
      end if;
      return jsonb_build_object('ok', true, 'id', p_klient_id, 'etag', append_receipt.etag);
    end if;
  end if;
  snapshot := public._t2_jarvis_suhbat_snapshot_v1(current_row);
  if p_etag is distinct from snapshot ->> 'etag' then
    return jsonb_build_object('ok', false, 'code', 'SUHBAT_CONFLICT');
  end if;
  if p_amal = 'delete' then
    delete from public.t2_jarvis_suhbat where id = current_row.id;
    return jsonb_build_object('ok', true, 'id', p_klient_id, 'holat', 'missing');
  elsif p_amal = 'rename' then
    update public.t2_jarvis_suhbat set sarlavha = title where id = current_row.id returning * into current_row;
  else
    if snapshot -> 'xabarlar' = 'null'::jsonb then
      return jsonb_build_object('ok', false, 'code', 'SUHBAT_HISTORY_NOT_AVAILABLE');
    end if;
    select jsonb_agg(jsonb_build_object('r', e ->> 'r', 'm', e ->> 'm') order by n)
    into messages
    from (select e,n from jsonb_array_elements(current_row.xabarlar || messages)
      with ordinality as turn(e,n) order by n desc limit 12) visible;
    update public.t2_jarvis_suhbat set xabarlar = messages,
      yangilandi = greatest(clock_timestamp(), current_row.yangilandi + interval '1 microsecond'),
      qisqartma = left((select e ->> 'm' from jsonb_array_elements(messages) with ordinality t(e,n) order by n desc limit 1), 600)
    where id = current_row.id returning * into current_row;
  end if;
  snapshot := public._t2_jarvis_suhbat_snapshot_v1(current_row);
  if p_operation_id is not null then
    insert into public.t2_jarvis_suhbat_append_receipt (suhbat_id, operation_id, fingerprint, etag)
    values (current_row.id, p_operation_id, request_fingerprint, snapshot ->> 'etag');
    delete from public.t2_jarvis_suhbat_append_receipt where suhbat_id = current_row.id and operation_id in (
      select operation_id from public.t2_jarvis_suhbat_append_receipt
      where suhbat_id = current_row.id order by yozildi desc, operation_id desc offset 64
    );
  end if;
  return jsonb_build_object('ok', true, 'id', p_klient_id, 'etag', snapshot ->> 'etag');
end
$$;

revoke all on function public.t2_jarvis_suhbat_mutate_v1(bigint,bigint,text,text,text,text,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.t2_jarvis_suhbat_mutate_v1(bigint,bigint,text,text,text,text,jsonb,uuid) to service_role;

-- Enable the existing arxiv-tick opt-in only after clients can read verified archive bodies.
create index t2_jarvis_suhbat_archive_pick_idx on public.t2_jarvis_suhbat (yangilandi, id) where xabarlar is not null;
create function public.t2_jarvis_suhbat_archive_pick_v1(p_limit integer default 10)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('row', selection.id::text, 'body', selection.body)
    order by selection.yangilandi, selection.id), '[]'::jsonb)
  from (
    select id, yangilandi, jsonb_build_object('v', 1, 'row', id::text, 'turns', xabarlar)::text as body
    from public.t2_jarvis_suhbat
    where xabarlar is not null and (yangilandi < now() - interval '90 days' or archive_queued_at >= yangilandi)
    order by yangilandi, id limit greatest(0, least(coalesce(p_limit, 10), 20))
  ) selection
$$;

create function public.t2_jarvis_suhbat_archive_commit_v1(p_row bigint, p_sha256 text, p_bytes integer)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare body text;
begin
  if coalesce(p_row, 0) < 1 or coalesce(p_sha256, '') !~ '^[a-f0-9]{64}$'
     or coalesce(p_bytes, 0) not between 1 and 32768 then
    return jsonb_build_object('ok', false, 'code', 'JARVIS_ARCHIVE_INVALID');
  end if;
  select jsonb_build_object('v', 1, 'row', id::text, 'turns', xabarlar)::text into body
  from public.t2_jarvis_suhbat
  where id = p_row and xabarlar is not null and (yangilandi < now() - interval '90 days' or archive_queued_at >= yangilandi)
  for update;
  if not found or octet_length(convert_to(body, 'UTF8')) <> p_bytes
     or encode(sha256(convert_to(body, 'UTF8')), 'hex') <> p_sha256 then
    return jsonb_build_object('ok', true, 'archived', false);
  end if;
  update public.t2_jarvis_suhbat set archive_sha256 = p_sha256, archive_bytes = p_bytes, archive_queued_at = null, xabarlar = null where id = p_row;
  return jsonb_build_object('ok', true, 'archived', true);
end
$$;

-- Operator recovery before rollback. The archived bytes must match the current pointer.
create function public.t2_jarvis_suhbat_archive_restore_v1(p_row bigint, p_body text)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare
  packet jsonb;
  size_bytes integer;
  changed integer;
begin
  if coalesce(p_row, 0) < 1 or coalesce(octet_length(p_body), 0) not between 1 and 32768 then
    return jsonb_build_object('ok', false, 'code', 'JARVIS_ARCHIVE_INVALID');
  end if;
  packet := p_body::jsonb;
  if packet ->> 'v' is distinct from '1' or packet ->> 'row' is distinct from p_row::text
     or jsonb_typeof(packet -> 'turns') is distinct from 'array' then
    return jsonb_build_object('ok', false, 'code', 'JARVIS_ARCHIVE_INVALID');
  end if;
  size_bytes := octet_length(convert_to(p_body, 'UTF8'));
  update public.t2_jarvis_suhbat set xabarlar = packet -> 'turns', archive_sha256 = null, archive_bytes = null
  where id = p_row and xabarlar is null and archive_bytes = size_bytes
    and archive_sha256 = encode(sha256(convert_to(p_body, 'UTF8')), 'hex');
  get diagnostics changed = row_count;
  return jsonb_build_object('ok', true, 'restored', changed = 1);
exception when invalid_text_representation then
  return jsonb_build_object('ok', false, 'code', 'JARVIS_ARCHIVE_INVALID');
end
$$;

revoke all on function public.t2_jarvis_suhbat_archive_pick_v1(integer) from public, anon, authenticated;
revoke all on function public.t2_jarvis_suhbat_archive_commit_v1(bigint,text,integer) from public, anon, authenticated;
revoke all on function public.t2_jarvis_suhbat_archive_restore_v1(bigint,text) from public, anon, authenticated;
grant execute on function public.t2_jarvis_suhbat_archive_pick_v1(integer) to service_role;
grant execute on function public.t2_jarvis_suhbat_archive_commit_v1(bigint,text,integer) to service_role;
grant execute on function public.t2_jarvis_suhbat_archive_restore_v1(bigint,text) to service_role;
