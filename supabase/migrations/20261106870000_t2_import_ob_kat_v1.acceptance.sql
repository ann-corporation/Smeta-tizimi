-- Qabul: 4 funksiyada tur='ob' -> ОБ sharti bor (marker), eski anchor qolmagan; kat ma'lumoti o'zgarmagan (faqat funksiya ta'rifi).
do $t$
declare fn text; d text;
begin
  foreach fn in array array['t2_smeta_import_bulk_unlocked_v1','t2_smeta_import_yakunla_unlocked_v1','t2_smeta_paket_import_yakunla_unlocked_v1'] loop
    select pg_get_functiondef(p.oid) into d from pg_proc p where p.pronamespace='public'::regnamespace and p.proname=fn;
    if position($m$'ob' then 'ОБ' else public.t2_kat_birlik($m$ in d) = 0 then raise exception 'ACCEPT_FAIL: % ob->ОБ yo''q', fn; end if;
  end loop;
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='t2_addrepl_execute_v1';
  if position($m$kind='ob' then 'ОБ'$m$ in d) = 0 then raise exception 'ACCEPT_FAIL: addrepl'; end if;
end $t$;