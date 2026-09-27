-- Read-only/static acceptance for the source migration.  Run in a disposable
-- or preview database after applying the migration; never use as a production
-- write shortcut.
do $$
declare
  v_def text;
begin
  select pg_get_viewdef('public.t2_obyekt_nakrutka'::regclass, true) into v_def;
  if v_def not like '%t2_nakrutka_koef%' then
    raise exception 'NAKRUTKA_CANONICAL_VIEW_MISSING';
  end if;
  if v_def like '%t2_nakrutka n%' then
    raise exception 'NAKRUTKA_LEGACY_TABLE_STILL_USED';
  end if;
  if to_regprocedure('public.t2_nakrutka_hisobla_v1(jsonb,jsonb)') is null then
    raise exception 'NAKRUTKA_CANONICAL_FORMULA_MISSING';
  end if;
  raise notice 'T2_NAKOPITELNIY_CANONICAL_NAKRUTKA_SOURCE_PASS';
end $$;
