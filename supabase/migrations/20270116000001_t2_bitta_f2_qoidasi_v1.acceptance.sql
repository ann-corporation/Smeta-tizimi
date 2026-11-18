-- Acceptance 20270116000001 (sintetik, BEGIN ... ROLLBACK; migratsiyadan KEYIN ishga tushiriladi).
begin;
do $$
declare v_ob bigint; v_k bigint; v_a1 bigint; v_a2 bigint; v_a3 bigint; v_q bigint; v jsonb; f text;
begin
  foreach f in array array['public._t2_f2_oy_takror_v1(bigint[],date,bigint[])', 'public.t2_f2_oy_takror_v1(bigint,bigint,bigint[],date)', 'public._t2_f2_qator_kesish_v1(bigint,date,jsonb,bigint)'] loop
    if to_regprocedure(f) is null then raise exception 'ACC: missing %', f; end if;
    if has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute') then raise exception 'ACC: anon/authenticated ijro eta olmasin %', f; end if;
  end loop;
  if not public._t2_f2_taxminiy_v1('TAXMINIY-DPK-163 (prorab tasdig''i kutilmoqda)', null) then raise exception 'ACC: taxminiy aniqlanmadi'; end if;
  if public._t2_f2_taxminiy_v1('F2-12', 'oddiy izoh') then raise exception 'ACC: oddiy akt taxminiy deb belgilandi'; end if;

  select o.id, o.kompaniya_id into v_ob, v_k from public.t2_obyekt o order by o.id limit 1;
  if v_ob is null then raise notice 'SKIP: obyekt yoq'; return; end if;

  insert into public.t2_akt (kompaniya_id, obyekt_id, tur, oy, holat, raqam) values (v_k, v_ob, 'f2', date '2099-01-01', 'qoralama', 'ACC-ASOSIY') returning id into v_a1;
  insert into public.t2_akt (kompaniya_id, obyekt_id, tur, oy, holat, raqam) values (v_k, v_ob, 'f2', date '2099-01-01', 'qoralama', 'TAXMINIY-ACC (prorab tasdig''i kutilmoqda)') returning id into v_a2;

  v := public._t2_f2_oy_takror_v1(array[v_ob], date '2099-01-01');
  if jsonb_array_length(v) <> 1 or not (v->0->'akt_ids') @> to_jsonb(array[v_a1, v_a2]) then raise exception 'ACC1: takror topilmadi %', v; end if;
  if not (v->0->'taxminiy_ids') @> to_jsonb(array[v_a2]) or (v->0->'taxminiy_ids') @> to_jsonb(array[v_a1]) then raise exception 'ACC2: taxminiy belgisi %', v; end if;
  if jsonb_array_length(public._t2_f2_oy_takror_v1(null, null, array[v_a1])) <> 1 then raise exception 'ACC3: akt_ids filtri'; end if;

  -- bekor qilingan ikkinchi akt takror emas
  update public.t2_akt set holat = 'bekor' where id = v_a2;
  if jsonb_array_length(public._t2_f2_oy_takror_v1(array[v_ob], date '2099-01-01')) <> 0 then raise exception 'ACC4: bekor akt takror deb sanaldi'; end if;
  update public.t2_akt set holat = 'qoralama' where id = v_a2;

  -- korrektirovka (correction_of_akt_id) takror emas
  insert into public.t2_akt (kompaniya_id, obyekt_id, tur, oy, holat, raqam, correction_of_akt_id) values (v_k, v_ob, 'f2', date '2099-01-01', 'qoralama', 'ACC-KOR', v_a1) returning id into v_a3;
  v := public._t2_f2_oy_takror_v1(array[v_ob], date '2099-01-01');
  if (v->0->'akt_ids') @> to_jsonb(array[v_a3]) then raise exception 'ACC5: korrektirovka takrorga kirdi'; end if;

  -- qator_id kesishuvi
  select q.id into v_q from public.t2_qator q where q.obyekt_id = v_ob limit 1;
  if v_q is not null then
    insert into public.t2_akt_qator (akt_id, qator_id, obyekt_id, kompaniya_id) values (v_a1, v_q, v_ob, v_k);
    if public._t2_f2_qator_kesish_v1(v_ob, date '2099-01-01', jsonb_build_array(jsonb_build_object('qator_id', v_q)), v_a2) is null then raise exception 'ACC6: kesishuv topilmadi'; end if;
    if public._t2_f2_qator_kesish_v1(v_ob, date '2099-01-01', jsonb_build_array(jsonb_build_object('qator_id', v_q)), v_a1) is not null then raise exception 'ACC7: o''zi bilan kesishdi'; end if;
    if public._t2_f2_qator_kesish_v1(v_ob, date '2099-01-01', jsonb_build_array(jsonb_build_object('qator_id', v_q, 'raw_snapshot', jsonb_build_object('source', 'storno'))), v_a2) is not null then raise exception 'ACC8: storno kesishdi'; end if;
  end if;
  raise notice 'ACCEPT OK';
end $$;
rollback;
