-- Read-only target acceptance: actor, grants, body parity va real <50ms probe.
begin transaction read only;
do $$
declare v_actor bigint; v_o bigint; v_hash text; v_body jsonb; v_started timestamptz; v_ms numeric; v_count int:=0;
begin
  if has_function_privilege('anon','public.t2_obyekt_paket_muhr_v1(bigint,bigint)','execute')
     or has_function_privilege('authenticated','public.t2_obyekt_paket_muhr_v1(bigint,bigint)','execute')
     or has_function_privilege('anon','public.t2_obyekt_paket_etag_v1(bigint,bigint)','execute')
     or has_function_privilege('authenticated','public.t2_obyekt_paket_etag_v1(bigint,bigint)','execute') then raise exception 'P0 grants'; end if;
  if not has_function_privilege('service_role','public.t2_obyekt_paket_etag_v1(bigint,bigint)','execute') then raise exception 'P0 service_role'; end if;
  if exists(select 1 from pg_proc where oid in ('public.t2_obyekt_paket_muhr_v1(bigint,bigint)'::regprocedure,
    'public.t2_obyekt_paket_etag_v1(bigint,bigint)'::regprocedure) and (provolatile<>'s' or not prosecdef)) then raise exception 'P0 stable/definer'; end if;
  select f.id into v_actor from public.t2_foydalanuvchi f where f.holat='faol' and public.t2_platforma_superadmin(f.id) order by f.id limit 1;
  if v_actor is null then raise exception 'Functional acceptance actor missing (not skipped)'; end if;
  for v_o in select obyekt_id from public.t2_qator where versiya_holat='faol' group by obyekt_id order by count(*) desc limit 3 loop
    v_count:=v_count+1;
    v_hash:=public.t2_obyekt_paket_muhr_v1(v_o,v_actor);
    if v_hash !~ '^W/"t2-paket-1-[0-9a-f]{32}"$' then raise exception 'ETag shape'; end if;
    if public.t2_obyekt_paket_muhr_v1(v_o,v_actor) is distinct from v_hash then raise exception 'Unchanged hash differs'; end if;
    v_body:=public.t2_obyekt_paket_etag_v1(v_o,v_actor)::jsonb;
    if v_body is distinct from public.t2_obyekt_paket_v1(v_o,v_actor)::jsonb then raise exception 'Wrapper changed body'; end if;
    if current_setting('response.headers')::jsonb->0->>'ETag' is distinct from v_hash then raise exception 'Body/header mismatch'; end if;
    v_started:=clock_timestamp();
    perform public.t2_obyekt_paket_muhr_v1(v_o,v_actor);
    v_ms:=extract(epoch from clock_timestamp()-v_started)*1000;
    raise notice 'D2 probe object %, %ms',v_o,v_ms;
    if v_ms>=50 then raise exception 'D2 probe target failed: %ms',v_ms; end if;
  end loop;
  if v_count=0 then raise exception 'No object for functional acceptance (not skipped)'; end if;
end $$;
rollback;
