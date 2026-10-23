-- SOURCE FIXTURES ONLY: forward migratsiyadan keyin izolyatsiyalangan bazada (L0: BEGIN…ROLLBACK). Hech narsa commit qilinmaydi.
begin;

do $test$
declare c1 bigint; a1 bigint; o1 bigint; s1 bigint; s2 bigint; v jsonb; q jsonb := '[]'::jsonb; i integer;
begin
  if position('-- import_rollup_bosqich_v1' in pg_get_functiondef('public.t2_smeta_import_yakunla_unlocked_v1(bigint,bigint,bigint)'::regprocedure)) = 0
     or position('-- import_rollup_bosqich_v1' in pg_get_functiondef('public.t2_smeta_paket_import_yakunla_unlocked_v1(bigint,bigint,bigint)'::regprocedure)) = 0 then
    raise exception 'PATCH_NOT_APPLIED';
  end if;
  if has_function_privilege('anon', 'public.t2_smeta_import_rollup_v1(bigint,bigint,bigint)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.t2_smeta_import_bekor_v1(bigint,bigint,bigint)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.t2_smeta_import_rollup_v1(bigint,bigint,bigint)', 'EXECUTE') then
    raise exception 'GRANTS_FAILED';
  end if;

  insert into public.t2_kompaniya(nom, kod) values ('_TEST_IMP_BOSQICH', 'IMPB' || txid_current()) returning id into c1;
  insert into public.t2_foydalanuvchi(login) values ('_TEST_IMP_BOSQICH_A_' || txid_current()) returning id into a1;
  insert into public.t2_azolik(foydalanuvchi_id, kompaniya_id, rol) values (a1, c1, 'pto');
  insert into public.t2_obyekt(nom, kompaniya_id) values ('_TEST_IMP_BOSQICH_OBJ', c1) returning id into o1;

  -- 5000 qator (1 rz + 4999 rs) — katta import: yakunla rollupsiz, rollup alohida.
  q := jsonb_build_array(jsonb_build_object('local_id', 'r0', 'tur', 'rz', 'nom', 'Bo''lim'));
  for i in 1..4999 loop
    q := q || jsonb_build_object('local_id', 'r' || i, 'parent_local_id', 'r0', 'tur', 'rs', 'nom', 'Resurs ' || i, 'birlik', 'шт', 'hajm', '1', 'narx', '2', 'summa', '2');
  end loop;
  v := public.t2_smeta_import_boshla_v1(c1, a1, o1, gen_random_uuid(), null);
  s1 := (v->>'sessiya_id')::bigint;
  if s1 is null then raise exception 'BOSHLA_FAILED %', v; end if;
  v := public.t2_smeta_import_bolak_v1(c1, a1, s1, 0, q);
  v := public.t2_smeta_import_yakunla_v1(c1, a1, s1);
  if not (v->>'ok')::boolean or (v->>'qator_soni')::integer <> 5000 or not (v->>'rollup_kerak')::boolean then raise exception 'YAKUNLA_FAILED %', v; end if;
  if (select summa from public.t2_qator where obyekt_id = o1 and tur = 'rz') is not null then
    raise exception 'ROLLUP_SHOULD_BE_DEFERRED';
  end if;
  v := public.t2_smeta_import_rollup_v1(c1, a1, o1);
  if not (v->>'ok')::boolean or (select summa from public.t2_qator where obyekt_id = o1 and tur = 'rz') <> 9998 then raise exception 'ROLLUP_FAILED %', v; end if;

  -- Bekor qilish: ochiq sessiya → bekor, bo'laklar o'chadi; takroriy chaqiriq — takror.
  insert into public.t2_obyekt(nom, kompaniya_id) values ('_TEST_IMP_BOSQICH_OBJ2', c1) returning id into o1;
  v := public.t2_smeta_import_boshla_v1(c1, a1, o1, gen_random_uuid(), null);
  s2 := (v->>'sessiya_id')::bigint;
  v := public.t2_smeta_import_bolak_v1(c1, a1, s2, 0, jsonb_build_array(jsonb_build_object('local_id', 'x', 'tur', 'rz', 'nom', 'B')));
  v := public.t2_smeta_import_bekor_v1(c1, a1, s2);
  if not (v->>'ok')::boolean or (v->>'bolak')::integer <> 1 then raise exception 'BEKOR_FAILED %', v; end if;
  if (select holat from public.t2_smeta_import_sessiya where id = s2) <> 'bekor' or exists (select 1 from public.t2_smeta_import_bolak where sessiya_id = s2) then
    raise exception 'BEKOR_STATE_WRONG';
  end if;
  if not (public.t2_smeta_import_bekor_v1(c1, a1, s2)->>'takror')::boolean then raise exception 'BEKOR_NOT_IDEMPOTENT'; end if;
  if public.t2_smeta_import_yakunla_v1(c1, a1, s2)->>'code' <> 'IMPORT_SESSION_CLOSED' then raise exception 'CANCELLED_SESSION_FINALIZED'; end if;
end;
$test$;

rollback;
