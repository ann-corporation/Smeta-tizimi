-- Обязательный rollup для импортов любого размера. Source resources immutable.
-- Удаляется только обход финансового расчёта; auth/tenant/locks/idempotency сохранены.
-- Полный signal refresh по-прежнему выполняется только для малых импортов.
begin;
do $migration$
declare spec record; original text; patched text; call text; guard text;
begin
 for spec in select * from (values
 ('t2_smeta_import_yakunla_unlocked_v1','v_sessiya'),
 ('t2_smeta_paket_import_yakunla_unlocked_v1','v_session')
 ) as x(fn,session_var) loop
  select pg_get_functiondef(p.oid) into strict original from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname=spec.fn;
  call := 'perform public.t2_rollup(' || spec.session_var || '.obyekt_id);';
  guard := case when spec.session_var='v_sessiya' then 'if v_soni < 5000 then' else 'if v_soni<5000 then' end;
  if position('-- mandatory_import_rollup_v2' in original)>0 then continue; end if;
  if position(guard in original)=0 or
    (length(original)-length(replace(original,call,'')))/length(call)<>1 then
    raise exception 'Unexpected import definition: %',spec.fn;
  end if;
  patched:=replace(original,call,'-- rollup completed before optional signal refresh');
  patched:=replace(patched,guard,
    '-- mandatory_import_rollup_v2' || chr(10) ||
    '  if v_soni >= 5000 then ANALYZE public.t2_qator; end if;' || chr(10) ||
    '  ' || call || chr(10) || '  ' || guard);
  execute patched;
 end loop;
end $migration$;
commit;
