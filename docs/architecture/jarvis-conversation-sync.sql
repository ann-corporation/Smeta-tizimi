-- Draft for L0 allocation. Read-only polling on the existing Jarvis conversation table.
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
      xabarlar is not null and yangilandi >= now() - interval '30 days' as toliq
    from public.t2_jarvis_suhbat
    where foydalanuvchi_id = p_actor_id and kompaniya_id = p_kompaniya_id
      and yangilandi >= now() - interval '90 days'
    order by yangilandi desc, id desc limit 20
  ) s;

  if p_klient_id is not null then
    select jsonb_build_object(
      'id', klient_id, 'sarlavha', sarlavha, 'qisqartma', qisqartma, 'yangilandi', yangilandi,
      'xabarlar', case when yangilandi >= now() - interval '30 days' then xabarlar end
    ) into selected
    from public.t2_jarvis_suhbat
    where foydalanuvchi_id = p_actor_id and kompaniya_id = p_kompaniya_id and klient_id = p_klient_id
      and yangilandi >= now() - interval '90 days';
    if not found then
      selected := jsonb_build_object('id', p_klient_id, 'holat', 'missing');
    else
      -- A cache validator for the visible snapshot, including title and retention changes.
      -- It is never accepted as a write precondition or authorization token.
      etag := md5(selected::text);
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
