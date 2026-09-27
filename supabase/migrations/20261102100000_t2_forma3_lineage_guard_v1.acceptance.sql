-- Read-only/static acceptance. Real data mutation is intentionally absent.
do $$
declare
  v_trigger boolean;
  v_fn boolean;
begin
  select exists (
    select 1 from pg_trigger
     where tgrelid = 'public.t2_forma3'::regclass
       and tgname = 't2_forma3_lineage_guard_trg'
       and not tgisinternal
  ) into v_trigger;
  select to_regprocedure('public.t2_forma3_lineage_guard_v1()') is not null into v_fn;
  if not v_trigger or not v_fn then
    raise exception 'FORMA3_LINEAGE_GUARD_NOT_READY';
  end if;
  raise notice 'FORMA3_LINEAGE_GUARD_ACCEPTANCE_PASS';
end;
$$;

