-- Acceptance: 20261106100000_t2_smeta_studio_qoralama_v1. Run INSIDE a transaction and ROLLBACK
-- (BEGIN; <migration body>; <this file>; ROLLBACK;) — leaves no rows behind.
do $$
declare v_komp bigint; v_actor bigint; v_obj bigint; v_other_obj bigint; v_outsider bigint;
  v_uid uuid := gen_random_uuid(); v_op1 uuid := gen_random_uuid(); v_op2 uuid := gen_random_uuid();
  v_doc jsonb; r jsonb; r2 jsonb; v_cnt int;
begin
  select a.kompaniya_id, a.foydalanuvchi_id into v_komp, v_actor from public.t2_azolik a
   where a.holat = 'faol' and a.rol <> 'rahbar' order by a.id limit 1;
  select id into v_obj from public.t2_obyekt where kompaniya_id = v_komp order by id limit 1;
  select id into v_other_obj from public.t2_obyekt where kompaniya_id <> v_komp order by id limit 1;
  select f.id into v_outsider from public.t2_foydalanuvchi f
   where not exists (select 1 from public.t2_azolik a where a.foydalanuvchi_id = f.id and a.kompaniya_id = v_komp and a.holat = 'faol')
     and not public.t2_platforma_superadmin(f.id) order by f.id limit 1;
  if v_komp is null or v_obj is null then raise exception 'ACCEPTANCE_SETUP: company/object not found'; end if;

  v_doc := jsonb_build_object('schema', 'smeta-studio-v1', 'draftId', v_uid::text, 'currency', 'UZS',
    'context', jsonb_build_object('title', 'Acceptance FM-1', 'objectLabel', ''), 'rootOrder', jsonb_build_array('s1'),
    'sections', jsonb_build_object('s1', jsonb_build_object('id', 's1', 'name', 'FM-1', 'parentId', null, 'children', '[]'::jsonb, 'items', jsonb_build_array('o1'))),
    'occurrences', jsonb_build_object('o1', jsonb_build_object('id', 'o1', 'sectionId', 's1', 'quantity', null,
      'source', jsonb_build_object('catalogRevision', '567137e5ebdf076c', 'workId', '10', 'code', 'E6-1-1'), 'recipe', '[]'::jsonb, 'overrides', '{}'::jsonb)),
    'edits', 3);

  -- 1) new draft (expected 0) → versiya 1; NULL quantity preserved verbatim.
  r := public.t2_smeta_studio_saqla_v1(v_actor, v_komp, v_obj, v_uid, 0, v_doc, v_op1);
  if (r->>'ok')::boolean is not true or (r->>'versiya')::int <> 1 then raise exception 'A1 create failed: %', r; end if;
  if (select hujjat->'occurrences'->'o1'->'quantity' from public.t2_smeta_studio_qoralama where draft_uid = v_uid) <> 'null'::jsonb then raise exception 'A1 NULL not preserved'; end if;
  -- 2) retry with same operation_id → same result, no second write.
  r2 := public.t2_smeta_studio_saqla_v1(v_actor, v_komp, v_obj, v_uid, 0, v_doc, v_op1);
  if r2 <> r then raise exception 'A2 idempotency failed: % vs %', r2, r; end if;
  select count(*) into v_cnt from public.t2_smeta_studio_qoralama where draft_uid = v_uid;
  if v_cnt <> 1 then raise exception 'A2 duplicate rows'; end if;
  -- 3) stale version → conflict, nothing changed.
  r := public.t2_smeta_studio_saqla_v1(v_actor, v_komp, v_obj, v_uid, 0, v_doc, gen_random_uuid());
  if r->>'code' <> 'VERSION_CONFLICT' or (r->>'versiya')::int <> 1 then raise exception 'A3 stale write accepted: %', r; end if;
  -- 4) correct version → 2.
  r := public.t2_smeta_studio_saqla_v1(v_actor, v_komp, v_obj, v_uid, 1, jsonb_set(v_doc, '{edits}', '4'), v_op2);
  if (r->>'versiya')::int <> 2 then raise exception 'A4 update failed: %', r; end if;
  -- 5) object of another company rejected.
  if v_other_obj is not null then
    r := public.t2_smeta_studio_saqla_v1(v_actor, v_komp, v_other_obj, v_uid, 2, v_doc, gen_random_uuid());
    if r->>'code' <> 'OBJECT_NOT_IN_COMPANY' then raise exception 'A5 cross-tenant object accepted: %', r; end if;
  end if;
  -- 6) malformed document / draftId mismatch rejected.
  r := public.t2_smeta_studio_saqla_v1(v_actor, v_komp, v_obj, gen_random_uuid(), 0, v_doc, gen_random_uuid());
  if r->>'code' <> 'DOCUMENT_INVALID' then raise exception 'A6 draftId mismatch accepted: %', r; end if;
  -- 7) operation_id reuse by another command/actor is refused, not replayed.
  if v_outsider is not null then
    r := public.t2_smeta_studio_saqla_v1(v_outsider, v_komp, v_obj, v_uid, 2, v_doc, v_op2);
    if r->>'code' <> 'OPERATION_ID_REUSED' then raise exception 'A7 op reuse leaked: %', r; end if;
    -- 8) non-member actor cannot write or read.
    begin
      perform public.t2_smeta_studio_saqla_v1(v_outsider, v_komp, v_obj, v_uid, 2, v_doc, gen_random_uuid());
      raise exception 'A8 outsider write accepted';
    exception when sqlstate '42501' then null; end;
    begin
      perform public.t2_smeta_studio_ol_v1(v_outsider, v_komp, v_uid);
      raise exception 'A8 outsider read accepted';
    exception when sqlstate '42501' then null; end;
  end if;
  -- 9) list and get return the saved draft.
  r := public.t2_smeta_studio_royxat_v1(v_actor, v_komp);
  if not exists (select 1 from jsonb_array_elements(r->'qoralamalar') x where x->>'draft_uid' = v_uid::text and (x->>'versiya')::int = 2 and (x->>'ish_soni')::int = 1) then raise exception 'A9 list failed: %', r; end if;
  r := public.t2_smeta_studio_ol_v1(v_actor, v_komp, v_uid);
  if (r->'hujjat'->>'edits')::int <> 4 then raise exception 'A9 get failed: %', r; end if;
  -- 10) audit written for both saves.
  select count(*) into v_cnt from public.t2_audit_log where amal_turi = 'smeta_studio_saqla' and kompaniya_id = v_komp and tafsilot like 'qoralama %';
  if v_cnt < 2 then raise exception 'A10 audit missing'; end if;
  -- 11) direct table access closed for API roles.
  if has_table_privilege('anon', 'public.t2_smeta_studio_qoralama', 'select') or has_table_privilege('authenticated', 'public.t2_smeta_studio_qoralama', 'select')
     or has_function_privilege('anon', 'public.t2_smeta_studio_saqla_v1(bigint,bigint,bigint,uuid,integer,jsonb,uuid)', 'execute') then
    raise exception 'A11 privileges open';
  end if;
  raise notice 'ACCEPTANCE PASS: smeta studio draft v1 (outsider checks: %)', v_outsider is not null;
end $$;
