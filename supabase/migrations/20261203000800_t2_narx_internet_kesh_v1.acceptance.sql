-- Qabul: 20261203000800 — t2_narx_internet_kesh_v1. Migratsiya qo'llangandan KEYIN ishga tushiriladi.
-- Sintetik yozuvlar; oxirida ROLLBACK — hech narsa saqlanmaydi. Muvaffaqiyat: NOTICE 'NARX_INTERNET_KESH_ACCEPTANCE_PASS'.
begin;
do $test$
declare c bigint; a bigint; boshqa bigint; oy text := to_char(now() at time zone 'Asia/Tashkent', 'YYYY-MM'); v jsonb;
begin
  select kompaniya_id, foydalanuvchi_id into c, a from public.t2_azolik where holat = 'faol' and rol <> 'kuzatuvchi' order by id limit 1;
  if a is null then raise exception 'ACCEPTANCE_ACTOR_REQUIRED'; end if;
  select id into boshqa from public.t2_kompaniya where id <> c
     and not exists (select 1 from public.t2_azolik z where z.kompaniya_id = t2_kompaniya.id and z.foydalanuvchi_id = a and z.holat = 'faol') order by id limit 1;

  -- 0) Tuzilma: RLS yoqilgan, anon/authenticated ga funksiya va jadval yopiq.
  if not (select relrowsecurity from pg_class where oid = 'public.t2_narx_internet_kesh'::regclass) then raise exception '0: kesh RLS yo''q'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.t2_narx_internet_sozlama'::regclass) then raise exception '0: sozlama RLS yo''q'; end if;
  if has_function_privilege('anon', 'public.t2_narx_internet_kesh_yoz_v1(bigint,bigint,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.t2_narx_internet_kesh_ol_v1(bigint,bigint,text[])', 'execute')
     or has_table_privilege('authenticated', 'public.t2_narx_internet_kesh', 'select') then raise exception '0: ochiq huquq'; end if;

  -- 1) Yozish → o'qish (joriy oy); o'tgan oy kaliti yozilmaydi.
  v := public.t2_narx_internet_kesh_yoz_v1(a, c, jsonb_build_array(
    jsonb_build_object('kalit', '_TEST_SEMENT|Т|UZ|' || oy, 'natija', jsonb_build_object('id', 'r0', 'narx', 100, 'manbalar', '[]'::jsonb, 'izoh', '')),
    jsonb_build_object('kalit', '_TEST_SEMENT|Т|UZ|2000-01', 'natija', jsonb_build_object('id', 'r0', 'narx', 1, 'manbalar', '[]'::jsonb, 'izoh', ''))));
  if not (v->>'ok')::boolean or (v->>'yozildi')::int <> 1 then raise exception '1: yozish %', v; end if;
  v := public.t2_narx_internet_kesh_ol_v1(a, c, array['_TEST_SEMENT|Т|UZ|' || oy, '_TEST_SEMENT|Т|UZ|2000-01']);
  if (v->'natijalar'->('_TEST_SEMENT|Т|UZ|' || oy)->>'narx')::numeric <> 100 or v->'natijalar' ? '_TEST_SEMENT|Т|UZ|2000-01' then raise exception '1: o''qish %', v; end if;

  -- 2) Takror yozish — yangilanadi (bitta qator).
  perform public.t2_narx_internet_kesh_yoz_v1(a, c, jsonb_build_array(
    jsonb_build_object('kalit', '_TEST_SEMENT|Т|UZ|' || oy, 'natija', jsonb_build_object('id', 'r0', 'narx', 120, 'manbalar', '[]'::jsonb, 'izoh', ''))));
  if (select count(*) from public.t2_narx_internet_kesh where kompaniya_id = c and kalit like '\_TEST\_SEMENT%') <> 1 then raise exception '2: takror'; end if;

  -- 3) Tenant: boshqa kompaniya keshini o'qib/yozib bo'lmaydi.
  if boshqa is not null then
    v := public.t2_narx_internet_kesh_ol_v1(a, boshqa, array['_TEST_SEMENT|Т|UZ|' || oy]);
    if coalesce((v->>'ok')::boolean, false) then raise exception '3: begona kompaniya o''qildi'; end if;
  end if;

  -- 4) Domenlar: yozish/o'qish, noto'g'ri domen rad, bo'sh ro'yxat — standartga qaytish (null).
  v := public.t2_narx_internet_domen_yoz_v1(a, c, array['uzex.uz', 'prom.uz']);
  if not (v->>'ok')::boolean then raise exception '4: domen yoz %', v; end if;
  if public.t2_narx_internet_domen_ol_v1(a, c)->'domenlar' <> '["uzex.uz", "prom.uz"]'::jsonb then raise exception '4: domen o''qish'; end if;
  if (public.t2_narx_internet_domen_yoz_v1(a, c, array['https://bad.uz/x'])->>'ok')::boolean then raise exception '4: yomon domen o''tdi'; end if;
  perform public.t2_narx_internet_domen_yoz_v1(a, c, array[]::text[]);
  if public.t2_narx_internet_domen_ol_v1(a, c)->'domenlar' <> 'null'::jsonb then raise exception '4: standartga qaytmadi'; end if;

  raise notice 'NARX_INTERNET_KESH_ACCEPTANCE_PASS';
end $test$;
rollback;
