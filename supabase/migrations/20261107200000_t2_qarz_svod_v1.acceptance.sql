-- Qabul (BEGIN..ROLLBACK): migratsiyani qo'llab, funksiya mavjudligi, anon yopiqligi, service_role ochiqligi va rollback tozaligini tekshiradi.
begin;
\i 20261107200000_t2_qarz_svod_v1.sql
do $t$
begin
  if to_regprocedure('public.t2_qarz_svod_v1(bigint,bigint)') is null then raise exception 'ACCEPT_FAIL: funksiya yo''q'; end if;
  if has_function_privilege('anon','public.t2_qarz_svod_v1(bigint,bigint)','execute') then raise exception 'ACCEPT_FAIL: anon ruxsati'; end if;
  if has_function_privilege('authenticated','public.t2_qarz_svod_v1(bigint,bigint)','execute') then raise exception 'ACCEPT_FAIL: authenticated ruxsati'; end if;
  if not has_function_privilege('service_role','public.t2_qarz_svod_v1(bigint,bigint)','execute') then raise exception 'ACCEPT_FAIL: service_role yo''q'; end if;
end $t$;
rollback;