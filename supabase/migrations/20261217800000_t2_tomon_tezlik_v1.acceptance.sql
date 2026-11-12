-- Acceptance 20261217800000 (migratsiya QO'LLANGANDAN KEYIN; bitta tranzaksiya, oxirida ROLLBACK -- hech narsa qolmaydi).
-- Yiqilsa: 'ACCEPT[<qadam>] ...' xabari bilan.
begin;
do $$
declare
  v_a record; v_act bigint; v_komp bigint; v1 jsonb; v2 jsonb; v2f jsonb; v_ob bigint; v_e jsonb; v_x jsonb; v_t0 timestamptz; v_ms numeric;
begin
  -- A1: huquqlar (faqat service_role)
  if has_function_privilege('anon', 'public.t2_zakazchik_obyektlar_v2(bigint,bigint,bigint,boolean)', 'execute')
     or has_function_privilege('authenticated', 'public.t2_zakazchik_obyektlar_v2(bigint,bigint,bigint,boolean)', 'execute') then
    raise exception 'ACCEPT[A1] v2 anon/authenticated ga ochiq'; end if;
  if not has_function_privilege('service_role', 'public.t2_zakazchik_obyektlar_v2(bigint,bigint,bigint,boolean)', 'execute') then
    raise exception 'ACCEPT[A1] v2 service_role ga ochiq emas'; end if;
  if position('_t2_summa_paket_kesh_v1' in pg_get_functiondef('public._t2_zakazchik_paket_v1(bigint,bigint,bigint,text,text)'::regprocedure)) = 0 then
    raise exception 'ACCEPT[A1] _t2_zakazchik_paket_v1 keshdan o''qimayapti'; end if;

  -- A2: faol aloqali kompaniya va uning faol a'zosi (ma'lumot bo'lmasa qadam o'tkaziladi)
  select a.id, a.taklif_kompaniya_id, a.qabul_kompaniya_id into v_a
    from public.t2_tomon_aloqa a
   where a.holat = 'faol' and exists (select 1 from public.t2_azolik z where z.kompaniya_id = a.qabul_kompaniya_id and z.holat = 'faol')
   limit 1;
  if v_a.id is null then raise notice 'ACCEPT: faol aloqa+a''zo yo''q - A2..A4 o''tkazildi'; return; end if;
  v_komp := v_a.qabul_kompaniya_id;
  select z.foydalanuvchi_id into v_act from public.t2_azolik z where z.kompaniya_id = v_komp and z.holat = 'faol' order by z.id limit 1;

  -- A3: ustama=true v2 == v1 (aynan bir xil, butun kompaniya); ustama=false -- umumiy raqamlar bir xil, podval hisobi yo'q
  v1 := public.t2_zakazchik_obyektlar_v1(v_act, v_komp);
  v2 := public.t2_zakazchik_obyektlar_v2(v_act, v_komp, null, true);
  if v1 is distinct from v2 then raise exception 'ACCEPT[A3] v2(ustama=true) v1 dan farq qiladi'; end if;
  v_t0 := clock_timestamp();
  v2f := public.t2_zakazchik_obyektlar_v2(v_act, v_komp);
  v_ms := extract(epoch from clock_timestamp() - v_t0) * 1000;
  if jsonb_array_length(v2f) <> jsonb_array_length(v1) then raise exception 'ACCEPT[A3] qator soni farq: % vs %', jsonb_array_length(v2f), jsonb_array_length(v1); end if;
  for v_e in select * from jsonb_array_elements(v1) loop
    select x into v_x from jsonb_array_elements(v2f) x where (x->>'obyekt_id') = (v_e->>'obyekt_id') and (x->>'aloqa_id') = (v_e->>'aloqa_id');
    if v_x is null then raise exception 'ACCEPT[A3] obyekt % tez ro''yxatda yo''q', v_e->>'obyekt_id'; end if;
    if (v_x->'f2'->>'jami') is distinct from (v_e->'f2'->>'jami') or (v_x->'f2'->>'soni') is distinct from (v_e->'f2'->>'soni')
       or (v_x->'shartnoma') is distinct from (v_e->'shartnoma') or (v_x->>'kutayotgan_taqdim') is distinct from (v_e->>'kutayotgan_taqdim') then
      raise exception 'ACCEPT[A3] obyekt % umumiy raqamlari farq qiladi', v_e->>'obyekt_id'; end if;
    if v_x->'f2' is not null and jsonb_typeof(v_x->'f2') = 'object' and (v_x->'f2') ? 'ustama_jami' then raise exception 'ACCEPT[A3] tez ro''yxatda ustama_jami bo''lmasligi kerak'; end if;
  end loop;
  raise notice 'ACCEPT: tez ro''yxat % ms (% obyekt)', round(v_ms), jsonb_array_length(v2f);

  -- A4: bitta obyekt filtri
  v_ob := (v1->0->>'obyekt_id')::bigint;
  if v_ob is not null then
    v2 := public.t2_zakazchik_obyektlar_v2(v_act, v_komp, v_ob, true);
    if jsonb_array_length(v2) <> 1 or (v2->0->>'obyekt_id')::bigint <> v_ob then raise exception 'ACCEPT[A4] obyekt filtri ishlamadi'; end if;
  end if;

  -- A5: begona kompaniya (a'zo bo'lmagan) rad etiladi
  begin
    perform public.t2_zakazchik_obyektlar_v2(v_act, (select max(id) + 1 from public.t2_kompaniya), null, false);
    raise exception 'ACCEPT[A5] a''zo bo''lmagan kompaniya rad etilmadi';
  exception when sqlstate '42501' then null; when sqlstate '22023' then null;
  end;
end $$;
rollback;
