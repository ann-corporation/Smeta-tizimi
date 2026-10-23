-- Rollback: 20261106840000 — yakunla ta'riflari mandatory_import_rollup_v2 holatiga qaytariladi; yangi RPC lar olib tashlanadi.
-- 'bekor' holatidagi import sessiyalari bo'lsa rollback TO'XTAYDI (ma'lumotni jim o'zgartirmaymiz) — avval ularni ko'rib chiqing.
begin;

do $rollback$
declare spec record; original text; patched text; old_block text; new_block text; old_ret text; new_ret text;
begin
  if exists (select 1 from public.t2_smeta_import_sessiya where holat = 'bekor') then
    raise exception 'ROLLBACK_BLOCKED: bekor qilingan import sessiyalari bor';
  end if;
  for spec in select * from (values
    ('t2_smeta_import_yakunla_unlocked_v1', 'v_sessiya', 'if v_soni < 5000 then',
     'v_prev := jsonb_build_object(''ok'',true,''obyekt_id'',v_sessiya.obyekt_id,''qator_soni'',v_soni);'),
    ('t2_smeta_paket_import_yakunla_unlocked_v1', 'v_session', 'if v_soni<5000 then',
     'v_prev:=jsonb_build_object(''ok'',true,''obyekt_id'',v_session.obyekt_id,''paket_id'',v_session.paket_id,''qator_soni'',v_soni);')
  ) as x(fn, sv, guard, ret) loop
    select pg_get_functiondef(p.oid) into strict original from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = spec.fn;
    if position('-- import_rollup_bosqich_v1' in original) = 0 then continue; end if;
    new_block := '-- import_rollup_bosqich_v1: >=5000 qatorda rollup alohida RPC (t2_smeta_import_rollup_v1) — har bosqich o''z vaqt limitida.' || chr(10)
      || '  if v_soni < 5000 then perform public.t2_rollup(' || spec.sv || '.obyekt_id); end if;' || chr(10)
      || '  ' || spec.guard;
    old_block := '-- mandatory_import_rollup_v2' || chr(10)
      || '  if v_soni >= 5000 then ANALYZE public.t2_qator; end if;' || chr(10)
      || '  perform public.t2_rollup(' || spec.sv || '.obyekt_id);' || chr(10)
      || '  ' || spec.guard;
    old_ret := spec.ret;
    new_ret := replace(spec.ret, '''qator_soni'',v_soni)', '''qator_soni'',v_soni,''rollup_kerak'',v_soni >= 5000)');
    patched := replace(replace(original, new_block, old_block), new_ret, old_ret);
    if position('-- import_rollup_bosqich_v1' in patched) > 0 then raise exception 'Unexpected import definition: %', spec.fn; end if;
    execute patched;
  end loop;
end $rollback$;

alter function public.t2_smeta_import_yakunla_v1(bigint, bigint, bigint) reset statement_timeout;
alter function public.t2_smeta_paket_import_yakunla_v1(bigint, bigint, bigint) reset statement_timeout;
drop function if exists public.t2_smeta_import_rollup_v1(bigint, bigint, bigint);
drop function if exists public.t2_smeta_import_bekor_v1(bigint, bigint, bigint);
alter table public.t2_smeta_import_sessiya drop constraint if exists t2_smeta_import_sessiya_holat_check;
alter table public.t2_smeta_import_sessiya add constraint t2_smeta_import_sessiya_holat_check check (holat in ('ochiq', 'yakunlandi'));

commit;
