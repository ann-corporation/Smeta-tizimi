-- Qabul (BEGIN..ROLLBACK): 20261222300000_t2_natija_kesh_v1 qo'llangandan KEYIN. Hech narsa saqlanmaydi.
-- 1) Grantlar: kesh jadvali va ichki funksiyalar anon/authenticated ga yopiq.
-- 2) Har obyekt uchun: keshdan o'qilgan natija == jonli (iflos) natija (jsonb matni bir xil), ikkala funksiya.
-- 3) Triggerlar: bajarilmadi / o'zgarish yozuvi o'zgarsa obyekt iflos bo'ladi (kesh o'qilmaydi, jonli hisob).
begin;
do $test$
declare
  r record; v_actor bigint; v_kesh text; v_jonli text; v_n int; v_baj record; v_oz record;
begin
  if has_table_privilege('anon', 'public.t2_obyekt_natija_kesh', 'select') or has_table_privilege('authenticated', 'public.t2_obyekt_natija_kesh', 'select')
     or has_function_privilege('anon', 'public._t2_obyekt_natija_kesh_hisobla_v1(bigint)', 'execute')
     or has_function_privilege('authenticated', 'public._t2_smeta_ozgarish_qatlam_hisob_v1(bigint,jsonb,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public._t2_price_control_hisob_v1(bigint)', 'execute') then
    raise exception 'A0: grantlar ochiq';
  end if;

  select a.foydalanuvchi_id into v_actor from public.t2_azolik a join public.t2_foydalanuvchi f on f.id = a.foydalanuvchi_id and f.holat = 'faol'
   where a.kompaniya_id = 123 and a.holat = 'faol' order by a.foydalanuvchi_id limit 1;
  if v_actor is null then raise notice 'A1 o''tkazildi: kompaniya 123 faol a''zosi yo''q'; return; end if;

  for r in select id from public.t2_obyekt where kompaniya_id = 123 order by id loop
    delete from public.t2_obyekt_kesh_iflos where obyekt_id = r.id;
    perform public._t2_obyekt_natija_kesh_hisobla_v1(r.id);
    -- toza: keshdan
    v_kesh := public.t2_smeta_ozgarish_qatlam_v1(r.id, v_actor)::text;
    -- iflos: jonli
    insert into public.t2_obyekt_kesh_iflos(obyekt_id, kompaniya_id, sabab) select id, kompaniya_id, 'qabul' from public.t2_obyekt where id = r.id on conflict (obyekt_id) do nothing;
    v_jonli := public.t2_smeta_ozgarish_qatlam_v1(r.id, v_actor)::text;
    if v_kesh is distinct from v_jonli then raise exception 'A2: qatlam kesh != jonli (obyekt %)', r.id; end if;
    delete from public.t2_obyekt_kesh_iflos where obyekt_id = r.id;
    v_kesh := public.t2_price_control_v1(r.id, v_actor)::text;
    insert into public.t2_obyekt_kesh_iflos(obyekt_id, kompaniya_id, sabab) select id, kompaniya_id, 'qabul' from public.t2_obyekt where id = r.id on conflict (obyekt_id) do nothing;
    v_jonli := public.t2_price_control_v1(r.id, v_actor)::text;
    if v_kesh is distinct from v_jonli then raise exception 'A3: narx nazorati kesh != jonli (obyekt %)', r.id; end if;
    delete from public.t2_obyekt_kesh_iflos where obyekt_id = r.id;
  end loop;

  -- A4: trigger iflos qiladi (bajarilmadi, o'zgarish)
  select b.id, b.obyekt_id into v_baj from public.t2_qator_bajarilmadi b order by b.id limit 1;
  if v_baj.id is not null then
    delete from public.t2_obyekt_kesh_iflos where obyekt_id = v_baj.obyekt_id;
    update public.t2_qator_bajarilmadi set sabab_izoh = sabab_izoh where id = v_baj.id;
    select count(*) into v_n from public.t2_obyekt_kesh_iflos where obyekt_id = v_baj.obyekt_id;
    if v_n <> 1 then raise exception 'A4: bajarilmadi trigger iflos qilmadi'; end if;
  end if;
  select o.id, o.obyekt_id into v_oz from public.t2_smeta_ozgarish o order by o.id limit 1;
  if v_oz.id is not null then
    delete from public.t2_obyekt_kesh_iflos where obyekt_id = v_oz.obyekt_id;
    update public.t2_smeta_ozgarish set sabab = sabab where id = v_oz.id;
    select count(*) into v_n from public.t2_obyekt_kesh_iflos where obyekt_id = v_oz.obyekt_id;
    if v_n <> 1 then raise exception 'A5: smeta_ozgarish trigger iflos qilmadi'; end if;
  end if;
end
$test$;
rollback;
