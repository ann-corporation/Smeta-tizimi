-- Acceptance: 20261107030000 — t2_xarajat_kirit_v1 / bekor / royxat / t2_pul_tahlil_v2: idempotentlik, NULL != 0, scope, farq. BEGIN … ROLLBACK.
begin;
do $acc$
declare v_k bigint; v_o bigint; v_o2 bigint; v_a bigint; r jsonb; r2 jsonb; v_op uuid := gen_random_uuid(); v_id bigint; v_chel numeric; e jsonb; v_n0 int;
begin
  select id into v_a from public.t2_foydalanuvchi where holat = 'faol' and public.t2_platforma_superadmin(id) limit 1;
  select o.kompaniya_id, o.id into v_k, v_o from public.t2_obyekt o
   where exists (select 1 from public.t2_akt a where a.obyekt_id = o.id and a.tur = 'f2' and a.holat = 'tasdiqlangan') limit 1;
  if v_k is null or v_a is null then raise notice 'F2 yo''q — o''tkazib yuborildi'; return; end if;
  select o.id into v_o2 from public.t2_obyekt o where o.kompaniya_id = v_k and o.id <> v_o limit 1;
  select count(*) into v_n0 from public.t2_xarajat where kompaniya_id = v_k and coalesce(holat,'faol') <> 'bekor' and obyekt_id = v_o;

  -- 1) xarajat yo'q (shu obyektda): noma'lum, nol emas
  if v_n0 = 0 then
    r := public.t2_pul_tahlil_v2(v_k, v_a, v_o);
    if r->'jami'->'xarajat' <> 'null'::jsonb or r->'jami'->'farq' <> 'null'::jsonb then raise exception 'xarajatsiz jami null emas'; end if;
    if exists (select 1 from jsonb_array_elements(r->'kesimlar') x where x->>'kat' in ('ЧЕЛ','МАШ','МАТ','ОБ') and x->'xarajat' <> 'null'::jsonb) then raise exception 'xarajatsiz kesim 0 bo''lib qoldi'; end if;
  end if;
  r2 := public.t2_pul_tahlil_v1(v_k, v_a, v_o);

  -- 2) kiritish + idempotentlik
  r := public.t2_xarajat_kirit_v1(v_k, v_a, v_o, null, current_date, 'ЧЕЛ', 1234.50, 'naryad №1', 'sinov', v_op);
  if r->>'ok' <> 'true' or (r->>'takror')::boolean then raise exception 'kiritilmadi: %', r; end if;
  v_id := (r->>'xarajat_id')::bigint;
  r := public.t2_xarajat_kirit_v1(v_k, v_a, v_o, null, current_date, 'ЧЕЛ', 1234.50, 'naryad №1', 'sinov', v_op);
  if not (r->>'takror')::boolean or (r->>'xarajat_id')::bigint <> v_id then raise exception 'idempotent emas: %', r; end if;
  if (select count(*) from public.t2_xarajat where operation_id = v_op) <> 1 then raise exception 'takror qator yaratildi'; end if;

  -- 3) tahlil: ЧЕЛ ma'lum, farq = xarajat − F2 (ustamasiz), МАТ noma'lum, jami farq null (to'liq emas) yoki to'liq bo'lsa hisoblangan
  r := public.t2_pul_tahlil_v2(v_k, v_a, v_o);
  select x into e from jsonb_array_elements(r->'kesimlar') x where x->>'kat' = 'ЧЕЛ';
  if (e->>'xarajat')::numeric <> coalesce(v_n0, 0) * 0 + 1234.50 + coalesce((select sum(summa) from public.t2_xarajat where kompaniya_id = v_k and obyekt_id = v_o and kat = 'ЧЕЛ' and coalesce(holat,'faol') <> 'bekor' and operation_id is distinct from v_op), 0) then raise exception 'ЧЕЛ xarajat: %', e; end if;
  if (e->>'farq')::numeric <> round((e->>'xarajat')::numeric - (e->>'f2_yopilgan')::numeric, 2) then raise exception 'farq noto''g''ri: %', e; end if;
  if (e->>'f2_yopilgan')::numeric <> (select (x->>'f2_yopilgan')::numeric from jsonb_array_elements(r2->'kesimlar') x where x->>'kat' = 'ЧЕЛ') then raise exception 'v2 F2 v1 dan farq qiladi'; end if;
  select x into e from jsonb_array_elements(r->'kesimlar') x where x->>'kat' = 'ОБ';
  if e->'xarajat' <> 'null'::jsonb and not exists (select 1 from public.t2_xarajat where kompaniya_id = v_k and obyekt_id = v_o and kat = 'ОБ' and coalesce(holat,'faol') <> 'bekor') then raise exception 'ОБ xarajat 0 bo''lib qoldi'; end if;
  if (r->'jami'->>'xarajat_qator_soni')::int < 1 then raise exception 'qator soni'; end if;

  -- 4) boshqa obyekt ta'sirlanmaydi; kompaniya jamida ko'rinadi
  if v_o2 is not null and not exists (select 1 from public.t2_xarajat where obyekt_id = v_o2 and kat = 'ЧЕЛ' and coalesce(holat,'faol') <> 'bekor') then
    r2 := public.t2_pul_tahlil_v2(v_k, v_a, v_o2);
    select x into e from jsonb_array_elements(r2->'kesimlar') x where x->>'kat' = 'ЧЕЛ';
    if e->'xarajat' <> 'null'::jsonb then raise exception 'boshqa obyektga xarajat o''tdi'; end if;
  end if;
  r2 := public.t2_pul_tahlil_v2(v_k, v_a);
  if (r2->'jami'->>'xarajat')::numeric < 1234.50 then raise exception 'kompaniya jamida ko''rinmadi'; end if;

  -- 5) dalil ro'yxati
  r := public.t2_pul_tahlil_v2(v_k, v_a, v_o, null, null, null, 'ЧЕЛ', 'xarajat');
  if not exists (select 1 from jsonb_array_elements(r->'dalil') x where (x->>'id')::bigint = v_id and x->>'hujjat_ref' = 'naryad №1') then raise exception 'dalil yo''q'; end if;

  -- 6) bekor
  r := public.t2_xarajat_bekor_v1(v_k, v_a, v_id);
  if r->>'ok' <> 'true' then raise exception 'bekor: %', r; end if;
  if (select holat from public.t2_xarajat where id = v_id) <> 'bekor' then raise exception 'holat bekor emas'; end if;

  -- 7) validatsiya
  if public.t2_xarajat_kirit_v1(v_k, v_a, v_o, null, current_date, 'XXX', 5, null, null, gen_random_uuid())->>'code' <> 'KAT_INVALID' then raise exception 'KAT_INVALID'; end if;
  if public.t2_xarajat_kirit_v1(v_k, v_a, v_o, null, current_date, 'ЧЕЛ', 0, null, null, gen_random_uuid())->>'code' <> 'SUMMA_INVALID' then raise exception 'SUMMA_INVALID'; end if;
  if public.t2_xarajat_kirit_v1(v_k, v_a, -1, null, current_date, 'ЧЕЛ', 5, null, null, gen_random_uuid())->>'code' <> 'OBYEKT_SCOPE_MISMATCH' then raise exception 'OBYEKT_SCOPE'; end if;
  if public.t2_xarajat_kirit_v1(v_k, v_a, null, -1, current_date, 'ЧЕЛ', 5, null, null, gen_random_uuid())->>'code' <> 'SHARTNOMA_SCOPE_MISMATCH' then raise exception 'SHARTNOMA_SCOPE'; end if;
  begin
    perform public.t2_xarajat_kirit_v1(v_k, -1, v_o, null, current_date, 'ЧЕЛ', 5, null, null, gen_random_uuid());
    raise exception 'begona actor rad etilmadi';
  exception when others then
    if sqlerrm = 'begona actor rad etilmadi' then raise; end if;
  end;
end $acc$;
rollback;