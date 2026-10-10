-- SOURCE FIXTURES ONLY: run after the forward migration in a disposable/shadow DB.
-- Every fixture and command is rolled back; this file never commits business data.
begin;

do $test$
declare
  c1 bigint; c2 bigint; a1 bigint; a2 bigint; o1 bigint; o2 bigint; o3 bigint;
  q_null bigint; q_cross_code bigint; q_zero bigint; q_price bigint;
  q_null_qty bigint; q_source_zero bigint; q_conflict bigint;
  q_wrong_unit bigint; q_wrong_name bigint; q_other_tenant bigint;
  v jsonb; first_result jsonb;
  op uuid := gen_random_uuid();
  prices jsonb := jsonb_build_array(
    jsonb_build_object('kod', 'SOURCE-A', 'nom', ' бетон е 25 ', 'birlik', 'М3', 'narx', 123.45),
    jsonb_build_object('kod', 'SOURCE-B', 'nom', 'Бетон Ё 25', 'birlik', 'м³', 'narx', 123.45),
    jsonb_build_object('kod', 'EQUIPMENT-SOURCE', 'nom', 'Оборудование', 'birlik', 'шт', 'narx', 250),
    jsonb_build_object('kod', 'ZERO-SOURCE', 'nom', 'Нулевой тариф', 'birlik', 'чел-ч', 'narx', 0),
    jsonb_build_object('kod', 'CONFLICT-A', 'nom', 'Щебень', 'birlik', 'м3', 'narx', 100),
    jsonb_build_object('kod', 'CONFLICT-B', 'nom', 'щебень', 'birlik', 'М3', 'narx', 200)
  );
begin
  if has_function_privilege('anon', 'public.t2_smeta_narxla_res_v2(bigint,bigint,bigint,uuid,jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.t2_smeta_narxla_res_v2(bigint,bigint,bigint,uuid,jsonb)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.t2_smeta_narxla_res_v2(bigint,bigint,bigint,uuid,jsonb)', 'EXECUTE') then
    raise exception 'V2_GRANTS_FAILED';
  end if;
  if to_regprocedure('public.t2_smeta_narxla_res_v1(bigint,bigint,bigint,uuid,jsonb)') is null then
    raise exception 'V1_MUST_REMAIN_AVAILABLE';
  end if;

  insert into public.t2_kompaniya(nom, kod) values ('_TEST_RES_V2_1', 'RSV21' || txid_current()) returning id into c1;
  insert into public.t2_kompaniya(nom, kod) values ('_TEST_RES_V2_2', 'RSV22' || txid_current()) returning id into c2;
  insert into public.t2_foydalanuvchi(login) values ('_TEST_RES_V2_A1_' || txid_current()) returning id into a1;
  insert into public.t2_foydalanuvchi(login) values ('_TEST_RES_V2_A2_' || txid_current()) returning id into a2;
  insert into public.t2_azolik(foydalanuvchi_id, kompaniya_id, rol) values (a1, c1, 'pto'), (a2, c2, 'pto');
  insert into public.t2_obyekt(nom, kompaniya_id) values ('_TEST_RES_V2_OBJECT', c1) returning id into o1;
  insert into public.t2_obyekt(nom, kompaniya_id) values ('_TEST_RES_V2_OTHER', c2) returning id into o2;
  insert into public.t2_obyekt(nom, kompaniya_id) values ('_TEST_RES_V2_OTHER_SAME_TENANT', c1) returning id into o3;

  insert into public.t2_qator(obyekt_id, kompaniya_id, tur, kod, nom, birlik, hajm, narx, summa, tartib)
    values (o1, c1, 'mat', 'TARGET-A', 'Бетон Ё 25', 'м³', 10, null, null, 1) returning id into q_null;
  insert into public.t2_qator(obyekt_id, kompaniya_id, tur, kod, nom, birlik, hajm, narx, summa, tartib)
    values (o1, c1, 'mat', 'TARGET-B', 'Бетон Ё 25', 'м3', 2, null, null, 2) returning id into q_cross_code;
  insert into public.t2_qator(obyekt_id, kompaniya_id, tur, kod, nom, birlik, hajm, narx, summa, tartib)
    values (o1, c1, 'mat', 'SOURCE-A', 'Бетон Ё 25', 'м3', 10, 0, 0, 3) returning id into q_zero;
  insert into public.t2_qator(obyekt_id, kompaniya_id, tur, kod, nom, birlik, hajm, narx, summa, tartib)
    values (o1, c1, 'mat', 'SOURCE-A', 'Бетон Ё 25', 'м3', 5, 99, 495, 4) returning id into q_price;
  insert into public.t2_qator(obyekt_id, kompaniya_id, tur, kod, nom, birlik, hajm, narx, summa, tartib)
    values (o1, c1, 'ob', 'EQUIPMENT-TARGET', 'Оборудование', 'шт', null, null, null, 5) returning id into q_null_qty;
  insert into public.t2_qator(obyekt_id, kompaniya_id, tur, kod, nom, birlik, hajm, narx, summa, tartib)
    values (o1, c1, 'rs', 'ZERO-TARGET', 'Нулевой тариф', 'чел-ч', 3, null, null, 6) returning id into q_source_zero;
  insert into public.t2_qator(obyekt_id, kompaniya_id, tur, kod, nom, birlik, hajm, narx, summa, tartib)
    values (o1, c1, 'mat', 'CONFLICT-A', 'Щебень', 'м3', 2, null, null, 7) returning id into q_conflict;
  insert into public.t2_qator(obyekt_id, kompaniya_id, tur, kod, nom, birlik, hajm, narx, summa, tartib)
    values (o1, c1, 'mat', 'SOURCE-A', 'Бетон Ё 25', 'т', 1, null, null, 8) returning id into q_wrong_unit;
  insert into public.t2_qator(obyekt_id, kompaniya_id, tur, kod, nom, birlik, hajm, narx, summa, tartib)
    values (o1, c1, 'mat', 'SOURCE-A', 'Бетон B30', 'м3', 1, null, null, 9) returning id into q_wrong_name;
  insert into public.t2_qator(obyekt_id, kompaniya_id, tur, kod, nom, birlik, hajm, narx, summa, tartib)
    values (o2, c2, 'mat', 'TARGET-A', 'Бетон Ё 25', 'м3', 10, null, null, 1) returning id into q_other_tenant;

  v := public.t2_smeta_narxla_res_v2(c1, a1, o1, op, prices);
  first_result := v;
  if v->>'ok' is distinct from 'true' or v->>'takror' is distinct from 'false'
     or (v->>'kiritilgan')::integer is distinct from 6
     or (v->>'yaroqli_manba')::integer is distinct from 3
     or (v->>'ziddiyatli_manba')::integer is distinct from 1
     or (v->>'narxsiz')::integer is distinct from 7
     or (v->>'mos')::integer is distinct from 4
     or (v->>'yozildi')::integer is distinct from 4
     or (v->>'narxsiz_qoldi')::integer is distinct from 3 then
    raise exception 'V2_COUNTERS_FAILED: %', v;
  end if;
  if (select narx from public.t2_qator where id=q_null) is distinct from 123.45
     or (select summa from public.t2_qator where id=q_null) is distinct from 1234.5
     or (select narx_usul from public.t2_qator where id=q_null) is distinct from 'RES'
     or (select narx from public.t2_qator where id=q_cross_code) is distinct from 123.45
     or (select summa from public.t2_qator where id=q_cross_code) is distinct from 246.9 then
    raise exception 'V2_NAME_UNIT_CROSS_CODE_OR_SUM_FAILED';
  end if;
  if (select narx from public.t2_qator where id=q_zero) is distinct from 0
     or (select summa from public.t2_qator where id=q_zero) is distinct from 0
     or (select narx from public.t2_qator where id=q_price) is distinct from 99
     or (select summa from public.t2_qator where id=q_price) is distinct from 495 then
    raise exception 'V2_KNOWN_ZERO_OR_PRICE_OVERWRITTEN';
  end if;
  if (select narx from public.t2_qator where id=q_source_zero) is distinct from 0
     or (select summa from public.t2_qator where id=q_source_zero) is distinct from 0 then
    raise exception 'V2_SOURCE_ZERO_DISCARDED';
  end if;
  if (select narx from public.t2_qator where id=q_null_qty) is distinct from 250
     or (select hajm from public.t2_qator where id=q_null_qty) is not null
     or (select summa from public.t2_qator where id=q_null_qty) is not null then
    raise exception 'V2_UNKNOWN_QUANTITY_INVENTED';
  end if;
  if exists(select 1 from public.t2_qator
      where id in (q_conflict, q_wrong_unit, q_wrong_name, q_other_tenant) and (narx is not null or summa is not null)) then
    raise exception 'V2_CONFLICT_IDENTITY_OR_TENANT_FAILED';
  end if;
  if (select count(*) from public.t2_onboarding_command_log where operation_id=op) is distinct from 1::bigint
     or (select command from public.t2_onboarding_command_log where operation_id=op) is distinct from 't2_smeta_narxla_res_v2'
     or (select actor_id from public.t2_onboarding_command_log where operation_id=op) is distinct from a1 then
    raise exception 'V2_COMMAND_LEDGER_FAILED';
  end if;

  -- Retry with changed payload cannot reprice rows or hide the duplicate operation.
  v := public.t2_smeta_narxla_res_v2(c1, a1, o1, op,
    jsonb_build_array(jsonb_build_object('nom', 'Бетон Ё 25', 'birlik', 'м3', 'narx', 777)));
  if v->>'takror' is distinct from 'true' or (v - 'takror') is distinct from (first_result - 'takror')
     or (select narx from public.t2_qator where id=q_null) is distinct from 123.45
     or (select count(*) from public.t2_onboarding_command_log where operation_id=op) is distinct from 1::bigint then
    raise exception 'V2_OPERATION_ID_NOT_IDEMPOTENT: %', v;
  end if;

  -- Tenant and membership checks must still run before returning an idempotent answer.
  begin
    perform public.t2_smeta_narxla_res_v2(c1, a1, o3, op, prices);
    raise exception 'V2_DIFFERENT_OBJECT_OPERATION_NOT_BLOCKED';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform public.t2_smeta_narxla_res_v2(c1, a1, o1, gen_random_uuid(), null);
    raise exception 'V2_NULL_PAYLOAD_NOT_BLOCKED';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.t2_smeta_narxla_res_v2(c2, a2, o1, op, prices);
    raise exception 'V2_CROSS_TENANT_NOT_BLOCKED';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform public.t2_smeta_narxla_res_v2(c1, a2, o1, op, prices);
    raise exception 'V2_NON_MEMBER_NOT_BLOCKED';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform public.t2_smeta_narxla_res_v2(c1, null, o1, gen_random_uuid(), prices);
    raise exception 'V2_NULL_ACTOR_NOT_BLOCKED';
  exception when sqlstate '22023' then null;
  end;

  -- Explicit source zero also participates in cross-code conflicts.
  v := public.t2_smeta_narxla_res_v2(c1, a1, o1, gen_random_uuid(), jsonb_build_array(
    jsonb_build_object('nom', 'Щебень', 'birlik', 'м3', 'narx', 'NaN')));
  if (v->>'yozildi')::integer is distinct from 0 or (select narx from public.t2_qator where id=q_conflict) is not null then
    raise exception 'V2_NONFINITE_PRICE_WRITTEN';
  end if;
  v := public.t2_smeta_narxla_res_v2(c1, a1, o1, gen_random_uuid(), jsonb_build_array(
    jsonb_build_object('kod', 'CONFLICT-A', 'nom', 'Щебень', 'birlik', 'м3', 'narx', 0),
    jsonb_build_object('kod', 'CONFLICT-B', 'nom', 'Щебень', 'birlik', 'м3', 'narx', 5)));
  if (v->>'yozildi')::integer is distinct from 0 or (v->>'ziddiyatli_manba')::integer is distinct from 1
     or (select narx from public.t2_qator where id=q_conflict) is not null then
    raise exception 'V2_ZERO_CONFLICT_NOT_BLOCKED: %', v;
  end if;
end $test$;

select 'T2_SMETA_PRICE_NAME_UNIT_V2_ACCEPTANCE_PASS' as acceptance;
rollback;
