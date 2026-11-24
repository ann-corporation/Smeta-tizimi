-- Только schema/grant smoke. Поведение: node supabase/tests/jarvis-weekly-pglite.mjs (synthetic).
begin;
do $$
declare f regprocedure := to_regprocedure('public.t2_jarvis_haftalik_taklif_v1(bigint,uuid)');
begin
  if f is null or to_regclass('public.t2_agent_jarvis_week_uq') is null then raise exception 'WEEKLY_SCHEMA_MISSING'; end if;
  if has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute')
     or not has_function_privilege('service_role', f, 'execute') then raise exception 'WEEKLY_GRANTS_INVALID'; end if;
  if not exists (select 1 from pg_proc p where p.oid = f and 'TimeZone=UTC' = any(p.proconfig)) then
    raise exception 'WEEKLY_TIMEZONE_INVALID';
  end if;
  raise notice 'JARVIS_WEEKLY_SCHEMA_GUARD_PASS';
end $$;
rollback;
