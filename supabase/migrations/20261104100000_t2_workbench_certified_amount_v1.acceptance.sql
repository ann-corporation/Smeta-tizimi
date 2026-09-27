-- Transaction-scoped acceptance for T2-PTO-EXACT-F2-WORKBENCH-001.
-- Run in a disposable/approved environment.  No production data is changed.
begin;

do $$
declare
  v_obj bigint;
  v_actor bigint;
  v_qator bigint;
  v_amount numeric;
  v_result jsonb;
  v_line jsonb;
begin
  if not exists (
    select 1 from pg_proc
    where oid = 'public.t2_workbench_exact_v1(bigint,bigint,date,integer)'::regprocedure
      and pg_get_functiondef(oid) like '%certifiedAmount%'
      and pg_get_functiondef(oid) like '%certified_amount%'
      and pg_get_functiondef(oid) not like '%coalesce(aq.certified_amount%'
  ) then
    raise exception 'FAIL: exact workbench function does not preserve certified_amount';
  end if;

  select a.obyekt_id, aq.qator_id, aq.certified_amount
    into v_obj, v_qator, v_amount
  from public.t2_akt a
  join public.t2_akt_qator aq on aq.akt_id = a.id
  where a.tur = 'f2' and a.holat = 'tasdiqlangan'
    and aq.certified_amount is not null
  order by a.oy, a.id, aq.id
  limit 1;
  if v_obj is null then
    raise exception 'FAIL: no approved F2 certified_amount fixture exists';
  end if;

  select az.foydalanuvchi_id into v_actor
  from public.t2_azolik az
  join public.t2_obyekt o on o.id = v_obj and o.kompaniya_id = az.kompaniya_id
  where az.holat = 'faol'
  order by az.foydalanuvchi_id
  limit 1;
  if v_actor is null then
    raise exception 'FAIL: no active actor for exact workbench fixture';
  end if;

  v_result := public.t2_workbench_exact_v1(v_obj, v_actor, null, 3000);
  if coalesce((v_result->>'ok')::boolean, false) is not true then
    raise exception 'FAIL: exact workbench rejected authorized fixture: %', v_result;
  end if;

  select l into v_line
  from jsonb_array_elements(v_result->'valuation'->'periods') p,
       jsonb_array_elements(p->'lines') l
  where (l->>'lineId')::bigint = v_qator
    and l ? 'certifiedAmount'
    and l->'certifiedAmount' = to_jsonb(v_amount)
  limit 1;
  if v_line is null then
    raise exception 'FAIL: canonical certified_amount missing from workbench JSON';
  end if;

  raise exception 'T2_WORKBENCH_EXACT_CERTIFIED_AMOUNT_ACCEPTANCE_PASS';
end $$;

rollback;
