-- Read-only/static acceptance for the additive ledger wrapper.
do $$
declare
  v_def text;
begin
  select pg_get_functiondef(
    to_regprocedure('public.t2_nakopitelniy_ledger_v1(bigint,bigint,date,integer,boolean,integer)')
  ) into v_def;
  if v_def is null then
    raise exception 'T2_NAKOPITELNIY_LEDGER_FUNCTION_MISSING';
  end if;
  if v_def not like '%smeta_qoldiq_hajm%'
     or v_def not like '%smeta_qoldiq_summa%'
     or v_def not like '%f2_mumkin_summa%'
     or v_def not like '%contract_qoldiq_hajm%'
     or v_def not like '%contract_qoldiq_summa%' then
    raise exception 'T2_NAKOPITELNIY_LEDGER_SEMANTICS_MISSING';
  end if;
  if v_def not like '%t2_nakopitelniy_v2%' then
    raise exception 'T2_NAKOPITELNIY_LEDGER_COMPATIBILITY_SOURCE_MISSING';
  end if;
  raise notice 'T2_NAKOPITELNIY_LEDGER_ACCEPTANCE_PASS';
end;
$$;
