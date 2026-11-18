-- Bounded keyset paging over conversation headers. Cold content is hydrated only after opening a scoped ID.
create index t2_jarvis_suhbat_history_idx on public.t2_jarvis_suhbat
  (foydalanuvchi_id, kompaniya_id, yangilandi desc, id desc);

create function public.t2_jarvis_suhbat_page_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_before_at timestamptz default null, p_before_id bigint default null
)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  scope jsonb;
  listing jsonb;
  next_cursor jsonb;
begin
  if coalesce(p_actor_id, 0) < 1 or coalesce(p_kompaniya_id, 0) < 1
     or (p_before_at is null) is distinct from (p_before_id is null)
     or (p_before_at is not null and (not isfinite(p_before_at) or p_before_id < 1)) then
    return jsonb_build_object('ok', false, 'code', 'SUHBAT_INVALID');
  end if;
  scope := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not coalesce((scope ->> 'ok')::boolean, false) then
    return coalesce(scope, jsonb_build_object('ok', false, 'code', 'COMPANY_ACCESS_DENIED'));
  end if;

  with page as (
    select id, klient_id, sarlavha, yangilandi, xabarlar is not null or archive_sha256 is not null as toliq
    from public.t2_jarvis_suhbat
    where foydalanuvchi_id = p_actor_id and kompaniya_id = p_kompaniya_id
      and (p_before_at is null or (yangilandi, id) < (p_before_at, p_before_id))
    order by yangilandi desc, id desc limit 21
  ), ordered as (
    select *, row_number() over (order by yangilandi desc, id desc) as position from page
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', klient_id, 'sarlavha', sarlavha, 'yangilandi', yangilandi, 'toliq', toliq
    ) order by position) filter (where position <= 20), '[]'::jsonb),
    case when count(*) > 20 then (select jsonb_build_object('at', yangilandi, 'row', id::text) from ordered where position = 20) end
  into listing, next_cursor from ordered;
  return jsonb_build_object('ok', true, 'royxat', listing, 'keyingi', next_cursor);
end
$$;

revoke all on function public.t2_jarvis_suhbat_page_v1(bigint,bigint,timestamptz,bigint) from public, anon, authenticated;
grant execute on function public.t2_jarvis_suhbat_page_v1(bigint,bigint,timestamptz,bigint) to service_role;
