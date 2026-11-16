-- Draft for L0 allocation. Read-only polling on the existing Jarvis conversation table.
alter table public.t2_jarvis_suhbat
  add column archive_sha256 text check (archive_sha256 is null or archive_sha256 ~ '^[a-f0-9]{64}$'),
  add column archive_bytes integer check (archive_bytes is null or archive_bytes between 1 and 32768),
  add constraint t2_jarvis_archive_pointer check ((archive_sha256 is null) = (archive_bytes is null));

-- Old readers still call this function. The archive worker now owns transcript eviction.
-- No conversation or text is deleted by an ordinary read, a new conversation, or the legacy writer.
create or replace function public._t2_jarvis_suhbat_tozala(p_actor_id bigint, p_kompaniya_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  return;
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
