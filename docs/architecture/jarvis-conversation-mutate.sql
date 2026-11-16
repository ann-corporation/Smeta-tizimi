-- Draft, apply after jarvis-conversation-sync.sql.
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

create function public.t2_jarvis_suhbat_mutate_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_klient_id text, p_etag text, p_amal text,
  p_sarlavha text default null, p_xabarlar jsonb default null
)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare
  scope jsonb;
  current_row public.t2_jarvis_suhbat;
  snapshot jsonb;
  title text;
  messages jsonb;
  receipt public.t2_jarvis_suhbat_create_receipt;
begin
  if p_actor_id is null or p_actor_id < 1 or p_kompaniya_id is null or p_kompaniya_id < 1
     or coalesce(p_klient_id,'') !~ '^[A-Za-z0-9_.-]{1,40}$'
     or coalesce(p_amal,'') not in ('create','rename','delete','append')
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
    and yangilandi >= now() - interval '90 days'
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'SUHBAT_NOT_FOUND');
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
  return jsonb_build_object('ok', true, 'id', p_klient_id,
    'etag', public._t2_jarvis_suhbat_snapshot_v1(current_row) ->> 'etag');
end
$$;

revoke all on function public.t2_jarvis_suhbat_mutate_v1(bigint,bigint,text,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.t2_jarvis_suhbat_mutate_v1(bigint,bigint,text,text,text,text,jsonb) to service_role;
