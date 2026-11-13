-- Acceptance 20261218100000 (migratsiya QO'LLANGANDAN KEYIN; bitta tranzaksiya, oxirida ROLLBACK -- hech narsa qolmaydi).
-- Yiqilsa: 'ACCEPT[<qadam>] ...' xabari bilan.
begin;
do $$
declare
  v_a record; v_act bigint; v_komp bigint; v1 jsonb; v2 jsonb; v_e jsonb; v_ob bigint; n int;
begin
  -- A1: tuzilma va huquqlar
  if to_regclass('public.t2_obyekt_ustama_kesh') is null then raise exception 'ACCEPT[A1] jadval yo''q'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.t2_obyekt_ustama_kesh'::regclass) then raise exception 'ACCEPT[A1] RLS yoqilmagan'; end if;
  if has_table_privilege('anon', 'public.t2_obyekt_ustama_kesh', 'select') or has_table_privilege('authenticated', 'public.t2_obyekt_ustama_kesh', 'select') then
    raise exception 'ACCEPT[A1] jadval anon/authenticated ga ochiq'; end if;
  if has_function_privilege('anon', 'public.t2_obyekt_ustama_yangila_v1(integer)', 'execute') or has_function_privilege('authenticated', 'public._t2_obyekt_ustama_oqi_v1(bigint)', 'execute') then
    raise exception 'ACCEPT[A1] funksiya anon/authenticated ga ochiq'; end if;

  -- A2: tasdiqlangan F2 li obyekti bor faol aloqa (ma'lumot bo'lmasa qadamlar o'tkaziladi)
  select a.id, a.qabul_kompaniya_id into v_a
    from public.t2_tomon_aloqa a
   where a.holat = 'faol' and exists (select 1 from public.t2_azolik z where z.kompaniya_id = a.qabul_kompaniya_id and z.holat = 'faol')
   limit 1;
  if v_a.id is null then raise notice 'ACCEPT: faol aloqa yo''q - A2..A5 o''tkazildi'; return; end if;
  v_komp := v_a.qabul_kompaniya_id;
  select z.foydalanuvchi_id into v_act from public.t2_azolik z where z.kompaniya_id = v_komp and z.holat = 'faol' order by z.id limit 1;
  v1 := public.t2_zakazchik_obyektlar_v1(v_act, v_komp);
  select (x->>'obyekt_id')::bigint into v_ob from jsonb_array_elements(v1) x where coalesce((x->'f2'->>'soni')::int, 0) > 0 limit 1;
  if v_ob is null then raise notice 'ACCEPT: tasdiqlangan F2 li ko''rinadigan obyekt yo''q - A3..A5 o''tkazildi'; return; end if;

  -- A3: keshni (tranzaksiya ichida) hisoblab, kesh yo'li v1 (jonli) bilan AYNAN bir xil javob berishini tekshirish
  delete from public.t2_obyekt_kesh_iflos where obyekt_id = v_ob;
  perform public._t2_kesh_hisobla_v1(v_ob);
  if not public._t2_obyekt_ustama_hisobla_v1(v_ob) then raise exception 'ACCEPT[A3] ustama keshi yozilmadi'; end if;
  select count(*) into n from public._t2_obyekt_ustama_oqi_v1(v_ob);
  if n <> 1 then raise exception 'ACCEPT[A3] yaroqli kesh o''qilmadi'; end if;
  v2 := public.t2_zakazchik_obyektlar_v2(v_act, v_komp, v_ob, true);
  select x into v_e from jsonb_array_elements(v1) x where (x->>'obyekt_id')::bigint = v_ob limit 1;
  if jsonb_array_length(v2) <> 1 or (v2->0) is distinct from v_e then raise exception 'ACCEPT[A3] kesh javobi jonli (v1) dan farq qiladi'; end if;

  -- A4: iflos belgisi — kesh O'QILMAYDI (jonli hisobga qaytadi), javob baribir bir xil
  insert into public.t2_obyekt_kesh_iflos (obyekt_id, kompaniya_id, sabab) select o.id, o.kompaniya_id, 'acceptance' from public.t2_obyekt o where o.id = v_ob
    on conflict (obyekt_id) do nothing;
  select count(*) into n from public._t2_obyekt_ustama_oqi_v1(v_ob);
  if n <> 0 then raise exception 'ACCEPT[A4] iflos obyektda kesh o''qildi'; end if;
  v2 := public.t2_zakazchik_obyektlar_v2(v_act, v_komp, v_ob, true);
  if (v2->0) is distinct from v_e then raise exception 'ACCEPT[A4] iflos holatda javob farq qiladi'; end if;
  delete from public.t2_obyekt_kesh_iflos where obyekt_id = v_ob;

  -- A5: asosiy kesh versiyasi o'zgarsa — ustama keshi yaroqsiz (eskirgan raqam ko'rsatilmaydi)
  update public.t2_obyekt_kesh set hisoblandi = hisoblandi + interval '1 second' where obyekt_id = v_ob;
  select count(*) into n from public._t2_obyekt_ustama_oqi_v1(v_ob);
  if n <> 0 then raise exception 'ACCEPT[A5] versiyasi farq qilgan kesh o''qildi'; end if;
end $$;
rollback;