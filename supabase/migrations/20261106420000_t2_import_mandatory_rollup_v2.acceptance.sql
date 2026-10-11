-- Проверка финансового расчёта отдельно от необязательного signal refresh.
begin;
do $test$
declare d text; g integer; c integer; spec record;
begin
 for spec in select * from (values
 ('t2_smeta_import_yakunla_unlocked_v1','v_sessiya','if v_soni < 5000 then'),
 ('t2_smeta_paket_import_yakunla_unlocked_v1','v_session','if v_soni<5000 then')
 ) as x(fn,session_var,guard) loop
  select pg_get_functiondef(p.oid) into strict d from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname=spec.fn;
  c:=position('perform public.t2_rollup('||spec.session_var||'.obyekt_id);' in d);
  g:=position(spec.guard in d);
  if c=0 or g=0 or c>=g then raise exception 'ROLLUP_GATED: %',spec.fn; end if;
  if position('perform public.t2_smeta_import_ruxsat' in d)=0 or
     position('t2_onboarding_command_log' in d)=0 or
     position('ANALYZE public.t2_qator' in d)=0 then
    raise exception 'IMPORT_GUARDS_MISSING: %',spec.fn;
  end if;
 end loop;
end $test$;
rollback;
