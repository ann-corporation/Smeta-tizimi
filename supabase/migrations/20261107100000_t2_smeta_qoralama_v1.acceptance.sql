-- Qabul: t2_smeta_bogliqlik_v1 mavjud va service_role ga ochiq; t2_smeta_tozalash_v1 yagona tekshiruvni chaqiradi.
do $t$
declare d text;
begin
  if to_regprocedure('public.t2_smeta_bogliqlik_v1(bigint,bigint,bigint)') is null then raise exception 'ACCEPT_FAIL: bogliqlik yo''q'; end if;
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='t2_smeta_tozalash_v1';
  if position('t2_smeta_bogliqlik_v1' in d) = 0 then raise exception 'ACCEPT_FAIL: tozalash yagona tekshiruvni chaqirmaydi'; end if;
  if has_function_privilege('anon','public.t2_smeta_bogliqlik_v1(bigint,bigint,bigint)','execute') then raise exception 'ACCEPT_FAIL: anon ruxsati'; end if;
end $t$;
