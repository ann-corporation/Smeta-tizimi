-- T2-BEZ-SKLAD-V1 acceptance (read-only metadata checks; no production writes).
begin;
do $$
declare c text; f text; v text;
begin
  select pg_get_constraintdef(oid) into c
  from pg_constraint
  where conrelid = 'public.t2_resurs_kategoriya'::regclass
    and conname = 't2_resurs_kategoriya_kategoriya_check';
  if c is null or position('БЕЗСКЛАД' in c) = 0 then
    raise exception 'BEZ_SKLAD_CONSTRAINT_MISSING';
  end if;
  select p.prosrc into f from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='t2_resurs_kategoriya_belgila_v1';
  if f is null or position('БЕЗСКЛАД' in f) = 0 then
    raise exception 'BEZ_SKLAD_REGISTRY_RPC_MISSING';
  end if;
  select pg_get_viewdef('public.t2_obyekt_nakrutka'::regclass, true) into v;
  if v is null or position('БЕЗСКЛАД' in v) = 0 or position('e.bez' in v) = 0 then
    raise exception 'BEZ_SKLAD_VIEW_CASCADE_MISSING';
  end if;
  select p.prosrc into f from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='t2_obyekt_nakrutka_v1';
  if f is null or position('БЕЗСКЛАД' in f) = 0 then
    raise exception 'BEZ_SKLAD_OBJECT_RPC_MISSING';
  end if;
end $$;
rollback;
