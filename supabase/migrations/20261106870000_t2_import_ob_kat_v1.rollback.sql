-- Teskari patch: tur='ob' -> ОБ shartini olib tashlaydi (avvalgi xatti-harakat).
begin;
do $mig$
declare
  d text; fn text;
  yangi1 text := $e$public.t2_kat_birlik(x->>'birlik', x->>'nom')) end,$e$;
  eski1 text := $y$case when (x->>'tur') = 'ob' then 'ОБ' else public.t2_kat_birlik(x->>'birlik', x->>'nom') end) end,$y$;
  yangi2 text := $e$public.t2_kat_birlik(x->>'birlik',x->>'nom')) end,$e$;
  eski2 text := $y$case when x->>'tur' = 'ob' then 'ОБ' else public.t2_kat_birlik(x->>'birlik',x->>'nom') end) end,$y$;
  yangi3 text := $e$case when kind<>'bl' then public.t2_kat_birlik(unit,name) end)$e$;
  eski3 text := $y$case when kind='ob' then 'ОБ' when kind<>'bl' then public.t2_kat_birlik(unit,name) end)$y$;
begin
  foreach fn in array array['t2_smeta_import_bulk_unlocked_v1','t2_smeta_import_yakunla_unlocked_v1'] loop
    select pg_get_functiondef(p.oid) into d from pg_proc p where p.pronamespace='public'::regnamespace and p.proname=fn;
    if d is null or position(eski1 in d) = 0 then raise exception 'ROLLBACK_ANCHOR_MISSING: %', fn; end if;
    execute replace(d, eski1, yangi1);
  end loop;
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='t2_smeta_paket_import_yakunla_unlocked_v1';
  if d is null or position(eski2 in d) = 0 then raise exception 'ROLLBACK_ANCHOR_MISSING: paket'; end if;
  execute replace(d, eski2, yangi2);
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='t2_addrepl_execute_v1';
  if d is null or position(eski3 in d) = 0 then raise exception 'ROLLBACK_ANCHOR_MISSING: addrepl'; end if;
  execute replace(d, eski3, yangi3);
end
$mig$;
commit;