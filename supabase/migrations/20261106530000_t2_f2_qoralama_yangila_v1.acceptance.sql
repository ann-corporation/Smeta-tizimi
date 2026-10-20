-- Acceptance (prod BEGIN…ROLLBACK, 2026-10-20): F2_QORALAMA_YANGILA_ACCEPTANCE_PASS n=171 sum=7903839053.04 (akt 279). Yakunda RAISE — hammasi orqaga qaytadi.
begin;
do $t$
declare v_q jsonb; r jsonb; op uuid := gen_random_uuid(); v_sum_old numeric; v_sum_new numeric; v_n int;
begin
  select sum(summa), count(*) into v_sum_old, v_n from t2_akt_qator where akt_id = 279;
  select jsonb_agg(jsonb_build_object('qator_id', qator_id, 'certified_quantity', certified_quantity,
    'certified_unit_price', certified_unit_price, 'certified_amount', certified_amount,
    'price_intentionally_absent', provenance_status = 'price_intentionally_absent', 'raw_snapshot', raw_snapshot, 'izoh', izoh))
    into v_q from t2_akt_qator where akt_id = 279;
  r := t2_f2_qoralama_yangila_v1(4, 17, 279, 3, v_q, op);
  if r->>'code' <> 'STALE_VERSION' then raise exception 'FAIL stale %', r; end if;
  r := t2_f2_qoralama_yangila_v1(4, 17, 264, 7, v_q, op);
  if r->>'code' <> 'AKT_QORALAMA_EMAS' then raise exception 'FAIL approved %', r; end if;
  r := t2_f2_qoralama_yangila_v1(4, 99999, 279, 4, v_q, op);
  if coalesce(r->>'ok','') = 'true' then raise exception 'FAIL tenant %', r; end if;
  r := t2_f2_qoralama_yangila_v1(4, 17, 279, 4, v_q, op);
  if (r->>'ok')::boolean is not true then raise exception 'FAIL main %', r; end if;
  select sum(summa) into v_sum_new from t2_akt_qator where akt_id = 279;
  if (r->>'qator_soni')::int <> v_n or v_sum_new is distinct from v_sum_old then raise exception 'FAIL sum % % % %', v_n, r->>'qator_soni', v_sum_old, v_sum_new; end if;
  r := t2_f2_qoralama_yangila_v1(4, 17, 279, 4, v_q, op);
  if (r->>'takror')::boolean is not true then raise exception 'FAIL idem %', r; end if;
  r := t2_f2_qoralama_yangila_v1(4, 17, 279, 5, v_q - 0, op);
  if r->>'code' <> 'OPERATION_SCOPE_MISMATCH' then raise exception 'FAIL scope %', r; end if;
  r := t2_f2_qoralama_yangila_v1(4, 17, 279, (select versiya from t2_akt where id=279), v_q - 0, gen_random_uuid());
  if (r->>'qator_soni')::int <> v_n - 1 then raise exception 'FAIL shrink %', r; end if;
  raise exception 'F2_QORALAMA_YANGILA_ACCEPTANCE_PASS n=% sum=% ver=%', v_n, v_sum_new, r->>'versiya';
end $t$;
rollback;
