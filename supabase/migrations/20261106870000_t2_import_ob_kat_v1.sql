-- T2 import xatosi #24 (koordinator 2026-10-24, Amfiteatr ustama bilan 61,1 mlrd): tur='ob' (uskuna) qatorlar import qilinganda kat='МАТ'
-- bo'lib kirardi (kat = registr yoki t2_kat_birlik(birlik, nom), u faqat ЧЕЛ/МАШ/МАТ qaytaradi). Natija: uskuna nakrutka bazasiga
-- МАТ sifatida tushib (transport 5% + ombor 2% + 18% «прочие») ustama bilan oshib ketardi (uskuna: 2% + 1,2%, 18% yo'q).
-- Tuzatish: registrda aniq yozuv bo'lmasa tur='ob' -> kat='ОБ' (3 import RPC + qo'shimcha/zamena yaratish). Registr ustuvor (operator qarori saqlanadi).
begin;
do $mig$
declare
  d text; fn text;
  eski1 text := $e$public.t2_kat_birlik(x->>'birlik', x->>'nom')) end,$e$;
  yangi1 text := $y$case when (x->>'tur') = 'ob' then 'ОБ' else public.t2_kat_birlik(x->>'birlik', x->>'nom') end) end,$y$;
  eski2 text := $e$public.t2_kat_birlik(x->>'birlik',x->>'nom')) end,$e$;
  yangi2 text := $y$case when x->>'tur' = 'ob' then 'ОБ' else public.t2_kat_birlik(x->>'birlik',x->>'nom') end) end,$y$;
  eski3 text := $e$case when kind<>'bl' then public.t2_kat_birlik(unit,name) end)$e$;
  yangi3 text := $y$case when kind='ob' then 'ОБ' when kind<>'bl' then public.t2_kat_birlik(unit,name) end)$y$;
begin
  foreach fn in array array['t2_smeta_import_bulk_unlocked_v1','t2_smeta_import_yakunla_unlocked_v1'] loop
    select pg_get_functiondef(p.oid) into d from pg_proc p where p.pronamespace='public'::regnamespace and p.proname=fn;
    if d is null or (length(d) - length(replace(d, eski1, ''))) <> length(eski1) then raise exception 'ANCHOR_NOT_FOUND_ONCE: %', fn; end if;
    execute replace(d, eski1, yangi1);
  end loop;
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='t2_smeta_paket_import_yakunla_unlocked_v1';
  if d is null or (length(d) - length(replace(d, eski2, ''))) <> length(eski2) then raise exception 'ANCHOR_NOT_FOUND_ONCE: paket'; end if;
  execute replace(d, eski2, yangi2);
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='t2_addrepl_execute_v1';
  if d is null or (length(d) - length(replace(d, eski3, ''))) <> length(eski3) then raise exception 'ANCHOR_NOT_FOUND_ONCE: addrepl'; end if;
  execute replace(d, eski3, yangi3);
end
$mig$;
commit;