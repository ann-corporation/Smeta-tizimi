-- SOURCE FIXTURES ONLY: run after the forward migration in a disposable/shadow DB (L0: BEGIN…ROLLBACK).
-- Every fixture and command is rolled back; this file never commits business data.
begin;

do $test$
declare
  c1 bigint; a1 bigint; o1 bigint;
  q_null bigint; q_zero bigint; q_price bigint; q_zero_nomatch bigint;
  v jsonb;
  prices jsonb := jsonb_build_array(jsonb_build_object('kod', 'S', 'nom', 'Бетон Ё 25', 'birlik', 'м3', 'narx', 100));
begin
  if has_function_privilege('anon', 'public.t2_smeta_narxla_res_v3(bigint,bigint,bigint,uuid,jsonb,boolean)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.t2_smeta_narxla_res_v3(bigint,bigint,bigint,uuid,jsonb,boolean)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.t2_smeta_narxla_res_v3(bigint,bigint,bigint,uuid,jsonb,boolean)', 'EXECUTE') then
    raise exception 'V3_GRANTS_FAILED';
  end if;
  if to_regprocedure('public.t2_smeta_narxla_res_v2(bigint,bigint,bigint,uuid,jsonb)') is null then
    raise exception 'V2_MUST_REMAIN_AVAILABLE';
  end if;

  insert into public.t2_kompaniya(nom, kod) values ('_TEST_RES_V3', 'RSV3' || txid_current()) returning id into c1;
  insert into public.t2_foydalanuvchi(login) values ('_TEST_RES_V3_A_' || txid_current()) returning id into a1;
  insert into public.t2_azolik(foydalanuvchi_id, kompaniya_id, rol) values (a1, c1, 'pto');
  insert into public.t2_obyekt(nom, kompaniya_id) values ('_TEST_RES_V3_OBJECT', c1) returning id into o1;
  insert into public.t2_qator(obyekt_id, kompaniya_id, tur, kod, nom, birlik, hajm, narx, summa, tartib)
    values (o1, c1, 'mat', 'A', 'Бетон Ё 25', 'м3', 10, null, null, 1) returning id into q_null;
  insert into public.t2_qator(obyekt_id, kompaniya_id, tur, kod, nom, birlik, hajm, narx, summa, tartib)
    values (o1, c1, 'mat', 'B', 'Бетон Ё 25', 'м3', 2, 0, 0, 2) returning id into q_zero;
  insert into public.t2_qator(obyekt_id, kompaniya_id, tur, kod, nom, birlik, hajm, narx, summa, tartib)
    values (o1, c1, 'mat', 'C', 'Бетон Ё 25', 'м3', 5, 99, 495, 3) returning id into q_price;
  insert into public.t2_qator(obyekt_id, kompaniya_id, tur, kod, nom, birlik, hajm, narx, summa, tartib)
    values (o1, c1, 'rs', 'D', 'Нет в RES', 'чел-ч', 1, 0, 0, 4) returning id into q_zero_nomatch;

  -- 1) p_nol_ham=false — v2 bilan bir xil: 0 narx tegilmaydi.
  v := public.t2_smeta_narxla_res_v3(c1, a1, o1, gen_random_uuid(), prices, false);
  if (v->>'narxsiz')::integer <> 1 or (v->>'yozildi')::integer <> 1 or (v->>'nol_ham')::boolean then raise exception 'V3_FALSE_MODE_FAILED %', v; end if;
  if (select narx from public.t2_qator where id = q_zero) <> 0 then raise exception 'ZERO_CHANGED_WITHOUT_FLAG'; end if;

  -- 2) p_nol_ham=true — 0 narxli qator to'ldiriladi; mavjud narx (99) va moslashmagan 0 qoladi.
  v := public.t2_smeta_narxla_res_v3(c1, a1, o1, gen_random_uuid(), prices, true);
  if (v->>'narxsiz')::integer <> 2 or (v->>'yozildi')::integer <> 1 or (v->>'narxsiz_qoldi')::integer <> 1 or not (v->>'nol_ham')::boolean then
    raise exception 'V3_TRUE_MODE_FAILED %', v;
  end if;
  if (select narx from public.t2_qator where id = q_zero) <> 100 or (select summa from public.t2_qator where id = q_zero) <> 200 then raise exception 'ZERO_NOT_FILLED'; end if;
  if (select narx from public.t2_qator where id = q_price) <> 99 then raise exception 'EXISTING_PRICE_CHANGED'; end if;
  if (select narx from public.t2_qator where id = q_zero_nomatch) <> 0 then raise exception 'UNMATCHED_ZERO_CHANGED'; end if;

  -- 3) p_nol_ham majburiy.
  begin
    perform public.t2_smeta_narxla_res_v3(c1, a1, o1, gen_random_uuid(), prices, null);
    raise exception 'NULL_FLAG_ACCEPTED';
  exception when sqlstate '22023' then null;
  end;
end;
$test$;

rollback;
