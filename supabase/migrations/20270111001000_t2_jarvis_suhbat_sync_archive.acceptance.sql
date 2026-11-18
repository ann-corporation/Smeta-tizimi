-- Read-only schema acceptance. Run after the migration inside the rehearsal transaction.
do $$
declare
  signature text;
begin
  foreach signature in array array[
    'public.t2_jarvis_suhbat_sync_v1(bigint,bigint,text,text)',
    'public.t2_jarvis_suhbat_mutate_v1(bigint,bigint,text,text,text,text,jsonb,uuid)',
    'public.t2_jarvis_suhbat_archive_pick_v1(integer)',
    'public.t2_jarvis_suhbat_archive_commit_v1(bigint,text,integer)',
    'public.t2_jarvis_suhbat_archive_restore_v1(bigint,text)'
  ] loop
    if to_regprocedure(signature) is null
      or not has_function_privilege('service_role', signature, 'execute')
      or has_function_privilege('authenticated', signature, 'execute')
      or has_function_privilege('anon', signature, 'execute') then
      raise exception 'JARVIS_RPC_GRANT_INVALID %', signature;
    end if;
  end loop;

  if not exists (
    select from pg_constraint where conrelid = 'public.t2_jarvis_suhbat'::regclass and conname = 't2_jarvis_archive_pointer'
  ) or to_regclass('public.t2_jarvis_suhbat_archive_pick_idx') is null then
    raise exception 'JARVIS_ARCHIVE_SCHEMA_INVALID';
  end if;

  raise notice 'JARVIS_M2_SCHEMA_ACCEPTANCE_PASS';
end
$$;
