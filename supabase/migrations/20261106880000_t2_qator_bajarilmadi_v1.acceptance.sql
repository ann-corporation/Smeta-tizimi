-- Acceptance: 20261106880000 — «Bajarilmadi» qoplamasi: belgilash/idempotentlik/takror/scope/bekor/ro'yxat; t2_qator O'ZGARMAYDI. BEGIN … ROLLBACK.
begin;
do $acc$
declare v_k bigint; v_a bigint; v_o bigint; v_q1 bigint; v_q2 bigint; v_boshqa bigint; r jsonb; v_op uuid := gen_random_uuid(); v_h1 text; v_h2 text; v_id bigint;
begin
  select o.kompaniya_id, o.id, z.foydalanuvchi_id into v_k, v_o, v_a from public.t2_obyekt o
    join public.t2_azolik z on z.kompaniya_id = o.kompaniya_id and z.holat = 'faol'
   where exists (select 1 from public.t2_qator q where q.obyekt_id = o.id and q.tur = 'bl') limit 1;
  if v_k is null then raise notice 'obyekt yo''q — tekshiruv o''tkazib yuborildi'; return; end if;
  select min(id), max(id) into v_q1, v_q2 from (select id from public.t2_qator where obyekt_id = v_o and tur = 'bl' order by id limit 2) s;
  select id into v_boshqa from public.t2_qator where obyekt_id <> v_o and kompaniya_id <> v_k limit 1;
  select md5(string_agg(id::text || coalesce(hajm::text, '') || coalesce(kat, ''), ',' order by id)) into v_h1 from public.t2_qator where obyekt_id = v_o;

  r := public.t2_bajarilmadi_belgila_v1(v_k, v_a, v_o, jsonb_build_array(jsonb_build_object('qator_id', v_q1, 'hajm', 1), jsonb_build_object('qator_id', v_q2)), 'texnik_sabab', 'sinov', null, current_date, null, v_op);
  if r->>'ok' <> 'true' or (r->>'yaratildi')::int <> 2 then raise exception 'belgilanmadi: %', r; end if;
  if public.t2_bajarilmadi_belgila_v1(v_k, v_a, v_o, '[]'::jsonb, 'texnik_sabab', null, null, null, null, v_op) <> r then raise exception 'idempotent emas'; end if;
  r := public.t2_bajarilmadi_belgila_v1(v_k, v_a, v_o, jsonb_build_array(jsonb_build_object('qator_id', v_q1)), 'texnik_sabab', null, null, null, null, gen_random_uuid());
  if (r->>'yaratildi')::int <> 0 or (r->>'otkazildi')::int <> 1 then raise exception 'takror belgilandi: %', r; end if;
  r := public.t2_bajarilmadi_belgila_v1(v_k, v_a, v_o, jsonb_build_array(jsonb_build_object('qator_id', v_q1)), 'boshqa', '  ', null, null, null, gen_random_uuid());
  if r->>'code' <> 'SABAB_IZOH_MAJBURIY' then raise exception 'boshqa izohsiz o''tdi: %', r; end if;
  if v_boshqa is not null then
    r := public.t2_bajarilmadi_belgila_v1(v_k, v_a, v_o, jsonb_build_array(jsonb_build_object('qator_id', v_boshqa)), 'texnik_sabab', null, null, null, null, gen_random_uuid());
    if r->>'code' <> 'QATOR_SCOPE_MISMATCH' then raise exception 'begona qator o''tdi: %', r; end if;
  end if;
  r := public.t2_bajarilmadi_royxat_v1(v_k, v_a, v_o);
  if jsonb_array_length(r->'qatorlar') <> 2 then raise exception 'ro''yxat soni: %', r; end if;
  select (x->>'id')::bigint into v_id from jsonb_array_elements(r->'qatorlar') x limit 1;
  r := public.t2_bajarilmadi_bekor_v1(v_k, v_a, v_id, 'xato belgi', gen_random_uuid());
  if r->>'ok' <> 'true' then raise exception 'bekor: %', r; end if;
  if (select count(*) from public.t2_qator_bajarilmadi where obyekt_id = v_o and holat = 'faol') <> 1 then raise exception 'bekordan keyin faol soni'; end if;
  begin
    perform public.t2_bajarilmadi_royxat_v1(v_k, -1, v_o);
    raise exception 'begona actor rad etilmadi';
  exception when others then
    if sqlerrm = 'begona actor rad etilmadi' then raise; end if;
  end;
  select md5(string_agg(id::text || coalesce(hajm::text, '') || coalesce(kat, ''), ',' order by id)) into v_h2 from public.t2_qator where obyekt_id = v_o;
  if v_h1 is distinct from v_h2 then raise exception 'asl smeta qatorlari o''zgardi!'; end if;
end $acc$;
rollback;
