-- Read-only acceptance AFTER selective apply, never a business writer.
-- Mutation/NULL/zero/signed/source/rollback tests: supabase/tests/desktop-etag-pglite.mjs.
begin transaction read only;
do $$
declare v_actor bigint; v_o bigint; v_p jsonb; v_wrapped jsonb; v_expected jsonb;
        v_podval jsonb; v_hash text; v_count integer:=0;
begin
  if has_function_privilege('anon','public.t2_obyekt_paket_v1(bigint,bigint)','execute')
     or has_function_privilege('authenticated','public.t2_obyekt_paket_v1(bigint,bigint)','execute')
     or not has_function_privilege('service_role','public.t2_obyekt_paket_v1(bigint,bigint)','execute') then
    raise exception 'Package grants';
  end if;
  if exists(select 1 from pg_proc where oid='public.t2_obyekt_paket_v1(bigint,bigint)'::regprocedure
    and (provolatile<>'s' or not prosecdef)) then raise exception 'Package stable/definer'; end if;
  select f.id into v_actor from public.t2_foydalanuvchi f
    where f.holat='faol' and public.t2_platforma_superadmin(f.id) order by f.id limit 1;
  if v_actor is null then raise exception 'Acceptance actor missing (not skipped)'; end if;
  for v_o in select distinct obyekt_id from public.t2_qator where versiya_holat='faol' loop
    v_count:=v_count+1;
    v_p:=public.t2_obyekt_paket_v1(v_o,v_actor)::jsonb;
    select coalesce(jsonb_agg(h.f2_summa_yoq order by q.tartib,q.id),'[]'::jsonb) into v_expected
      from public.t2_qator q join public.t2_qator_holat h on h.id=q.id and h.obyekt_id=v_o
      where q.obyekt_id=v_o and q.versiya_holat='faol';
    if v_p->'h'->'f2_summa_yoq' is distinct from v_expected then raise exception 'Counter parity object %',v_o; end if;
    if jsonb_array_length(v_p->'h'->'f2_summa_yoq') is distinct from (v_p->>'soni')::integer then
      raise exception 'Parallel array length object %',v_o;
    end if;
    v_podval:=public.t2_akt_podval_ol_v1(v_o,v_actor);
    if v_podval->'ok' is distinct from 'true'::jsonb then raise exception 'Canonical podval reader rejected object %',v_o; end if;
    if v_p->'meta'->'akt_podval' is distinct from v_podval->'podvallar' then
      raise exception 'Podval projection parity object %',v_o;
    end if;
    v_hash:=public.t2_obyekt_paket_muhr_v1(v_o,v_actor);
    v_wrapped:=public.t2_obyekt_paket_etag_v1(v_o,v_actor)::jsonb;
    if v_wrapped is distinct from v_p then raise exception 'Wrapper body parity object %',v_o; end if;
    if current_setting('response.headers')::jsonb->0->>'ETag' is distinct from v_hash then
      raise exception 'Wrapper header parity object %',v_o;
    end if;
  end loop;
  if v_count=0 then raise exception 'No active object (not skipped)'; end if;
  raise notice 'D2 extension accepted for % objects',v_count;
end $$;
rollback;
