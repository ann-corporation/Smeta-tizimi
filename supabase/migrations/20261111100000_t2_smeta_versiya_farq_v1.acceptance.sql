-- Acceptance: 20261111100000 — smeta versiyasi / farq / da'vo. SINTETIK obyekt va qatorlar (real mijoz ma'lumoti yo'q).
-- BEGIN … ROLLBACK: hech narsa saqlanmaydi.
-- Ssenariylar (Codex auditi §14 #1/#2/#9 + egasi qarorlari 2026-10-26):
--   S1 asl 100 → ekspertiza 80, o'lchangan (qisman) 95 → da'vo 15; «qurilgan» → 20; «qurilmagan» → da'vo yo'q.
--   S2 joriy hajm noma'lum (NULL) → da'vo NULL (0 ham, 20 ham to'qilmaydi).
--   S3 ekspertiza butunlay o'chirgan pozitsiya, qurilgan → da'vo = eski hajm (45); birlik farq → NULL.
--   S4 noaniq moslik «rad» → juft ajraladi (eski «o'chirilgan», joriy «yangi»); optimistik versiya ziddiyati rad etiladi.
--   S5 idempotentlik, obyekt/tenant chegarasi, yopiq versiyaga yozish; t2_qator va t2_smeta_revision O'ZGARMAYDI.
begin;
do $acc$
declare
  v_k bigint; v_a bigint; v_o bigint; v_o2 bigint; v_rz bigint; v_q1 bigint; v_q2 bigint; v_q3 bigint; v_q4 bigint; v_qx bigint;
  v_v bigint; r jsonb; v_op uuid := gen_random_uuid(); v_h1 text; v_h2 text; v_rev1 text; v_rev2 text;
  m1 public.t2_smeta_versiya_moslik; m3 public.t2_smeta_versiya_moslik; m4 public.t2_smeta_versiya_moslik; v_d numeric; v_n int;
begin
  select z.kompaniya_id, z.foydalanuvchi_id into v_k, v_a from public.t2_azolik z
   where z.holat = 'faol' and z.rol in ('boss','pto') order by z.kompaniya_id desc limit 1;
  if v_k is null then raise notice 'faol a''zo yo''q — tekshiruv o''tkazib yuborildi'; return; end if;
  select md5(coalesce(string_agg(id::text || ':' || coalesce(hajm::text, '') || ':' || coalesce(narx::text, ''), ',' order by id), '')) into v_h1 from public.t2_qator where kompaniya_id = v_k;
  select md5(coalesce(string_agg(id::text || ':' || seq, ',' order by id), '')) into v_rev1 from public.t2_smeta_revision;

  -- Sintetik obyekt: rz → 3 ish (bl) + 1 mustaqil mat; ikkinchi obyekt — chegara tekshiruvi uchun.
  insert into public.t2_obyekt (nom, kompaniya_id) values ('SINOV versiya-farq', v_k) returning id into v_o;
  insert into public.t2_obyekt (nom, kompaniya_id) values ('SINOV begona obyekt', v_k) returning id into v_o2;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, nom) values (v_o, v_k, 'rz', 'РАЗДЕЛ: СМЕТА № 01-01 НА СИНТЕТИКА') returning id into v_rz;
  insert into public.t2_qator (obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm) values (v_o, v_k, v_rz, 'bl', 'E1-1-1', 'ИШ А', 'М3', 80) returning id into v_q1;
  insert into public.t2_qator (obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm) values (v_o, v_k, v_rz, 'bl', 'E1-1-2', 'ИШ Б', 'М2', null) returning id into v_q2;
  insert into public.t2_qator (obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm) values (v_o, v_k, v_rz, 'bl', 'E9-9-9', 'ИШ В (ЯНГИ НОМ)', 'Т', 7) returning id into v_q3;
  insert into public.t2_qator (obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm) values (v_o, v_k, v_rz, 'mat', 'C1', 'МАТЕРИАЛ', 'Т', 3) returning id into v_q4;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, kod, nom, birlik, hajm) values (v_o2, v_k, 'bl', 'E1-1-1', 'BEGONA', 'М3', 1) returning id into v_qx;
  select md5(coalesce(string_agg(id::text || ':' || coalesce(hajm::text, '') || ':' || coalesce(narx::text, ''), ',' order by id), '')) into v_h1 from public.t2_qator where kompaniya_id = v_k;

  -- Yaratish + idempotentlik + validatsiya.
  r := public.t2_smeta_versiya_yarat_v1(v_k, v_a, v_o, 'Ekspertizagacha (sinov)', 'ekspertizaga_topshirilgan', date '2026-05-15', '[{"nom":"sinov.xls"}]'::jsonb, null, v_op);
  if r->>'ok' <> 'true' then raise exception 'yaratilmadi: %', r; end if;
  v_v := (r->>'versiya_id')::bigint;
  if public.t2_smeta_versiya_yarat_v1(v_k, v_a, v_o, 'boshqa nom', 'ekspertiza', null, null, null, v_op) <> r then raise exception 'yarat idempotent emas'; end if;
  r := public.t2_smeta_versiya_yarat_v1(v_k, v_a, v_o, 'x', 'amalda', null, null, null, gen_random_uuid());
  if r->>'code' <> 'TUR_INVALID' then raise exception 'noto''g''ri tur o''tdi: %', r; end if;

  -- Pozitsiyalar (2 bo'lak; takror tartib o'tkaziladi).
  r := public.t2_smeta_versiya_pozitsiya_yoz_v1(v_k, v_a, v_v, jsonb_build_array(
        jsonb_build_object('tartib', 0, 'ls_kod', '01-01', 'ls_nom', 'СИНТЕТИКА', 'kod', 'E1-1-1', 'nom', 'ИШ А', 'birlik', 'М3', 'hajm', 100,
                           'resurslar', jsonb_build_array(jsonb_build_object('kod', '000001', 'nom', 'ТРУД', 'birlik', 'ЧЕЛ-Ч', 'norma', 2, 'hajm', 200))),
        jsonb_build_object('tartib', 1, 'kod', 'E1-1-2', 'nom', 'ИШ Б', 'birlik', 'М2', 'hajm', 20)), gen_random_uuid());
  if (r->>'yozildi')::int <> 2 then raise exception 'pozitsiya 1-bo''lak: %', r; end if;
  r := public.t2_smeta_versiya_pozitsiya_yoz_v1(v_k, v_a, v_v, jsonb_build_array(
        jsonb_build_object('tartib', 1, 'nom', 'TAKROR', 'hajm', 1),
        jsonb_build_object('tartib', 2, 'kod', 'E5-5-5', 'nom', 'ИШ Д (ЭКСПЕРТИЗА ЧИҚАРГАН)', 'birlik', 'М2', 'hajm', 45),
        jsonb_build_object('tartib', 3, 'kod', 'E9-9-9', 'nom', 'ИШ В', 'birlik', 'М3', 'hajm', 9),
        jsonb_build_object('tartib', 4, 'kod', 'C1', 'nom', 'МАТЕРИАЛ', 'birlik', 'Т', 'hajm', 3)), gen_random_uuid());
  if (r->>'yozildi')::int <> 3 or (r->>'otkazildi')::int <> 1 then raise exception 'pozitsiya 2-bo''lak: %', r; end if;
  if (select pozitsiya_soni from public.t2_smeta_versiya where id = v_v) <> 5 then raise exception 'pozitsiya_soni'; end if;
  if (select hajm from public.t2_smeta_versiya_pozitsiya where versiya_id = v_v and tartib = 1) <> 20 then raise exception 'takror tartib ustidan yozildi'; end if;

  -- Moslik: begona obyekt qatori rad etiladi; to'liq bo'lmasa yakunlanmaydi.
  r := public.t2_smeta_versiya_moslik_yoz_v1(v_k, v_a, v_v, jsonb_build_array(jsonb_build_object('tartib', 0, 'qator_id', v_qx, 'holat', 'kamaygan', 'ishonch', 100)), false, gen_random_uuid());
  if r->>'code' <> 'QATOR_SCOPE_MISMATCH' then raise exception 'begona qator o''tdi: %', r; end if;
  r := public.t2_smeta_versiya_moslik_yoz_v1(v_k, v_a, v_v, jsonb_build_array(
        jsonb_build_object('tartib', 0, 'qator_id', v_q1, 'holat', 'kamaygan', 'ishonch', 100, 'joriy_hajm', 80, 'joriy_birlik', 'М3'),
        jsonb_build_object('tartib', 1, 'qator_id', v_q2, 'holat', 'kamaygan', 'ishonch', 100, 'joriy_hajm', null)), true, gen_random_uuid());
  if r->>'code' <> 'MOSLIK_TOLIQ_EMAS' then raise exception 'chala moslik yakunlandi: %', r; end if;
  if exists (select 1 from public.t2_smeta_versiya_moslik where versiya_id = v_v) then raise exception 'chala yakunlash bo''lagi yozilib qoldi'; end if;
  r := public.t2_smeta_versiya_moslik_yoz_v1(v_k, v_a, v_v, jsonb_build_array(
        jsonb_build_object('tartib', 0, 'qator_id', v_q1, 'holat', 'kamaygan', 'ishonch', 100, 'joriy_hajm', 80, 'joriy_birlik', 'М3'),
        jsonb_build_object('tartib', 1, 'qator_id', v_q2, 'holat', 'kamaygan', 'ishonch', 100, 'joriy_hajm', null),
        jsonb_build_object('tartib', 2, 'holat', 'ochirilgan'),
        jsonb_build_object('tartib', 3, 'qator_id', v_q3, 'holat', 'noaniq', 'ishonch', 60, 'birlik_farq', true, 'joriy_hajm', 7, 'joriy_birlik', 'Т', 'usul', 'shifr bir xil, BIRLIK farq'),
        jsonb_build_object('tartib', 4, 'qator_id', v_q4, 'holat', 'ozgarmagan', 'ishonch', 100, 'joriy_hajm', 3)), true, gen_random_uuid());
  if r->>'ok' <> 'true' or (r->>'yozildi')::int <> 5 then raise exception 'moslik: %', r; end if;
  if (select holat from public.t2_smeta_versiya where id = v_v) <> 'tayyor' then raise exception 'tayyor bo''lmadi'; end if;
  if (select tasdiq from public.t2_smeta_versiya_moslik where versiya_id = v_v and qator_id = v_q3) <> 'kutilmoqda' then raise exception 'noaniq moslik inson tasdig''ini kutmayapti'; end if;
  r := public.t2_smeta_versiya_pozitsiya_yoz_v1(v_k, v_a, v_v, jsonb_build_array(jsonb_build_object('tartib', 9, 'nom', 'KECH')), gen_random_uuid());
  if r->>'code' <> 'VERSIYA_YOPIQ' then raise exception 'tayyor versiyaga pozitsiya yozildi: %', r; end if;

  select * into m1 from public.t2_smeta_versiya_moslik where versiya_id = v_v and qator_id = v_q1;
  select * into m3 from public.t2_smeta_versiya_moslik where versiya_id = v_v and qator_id = v_q3;
  select m.* into m4 from public.t2_smeta_versiya_moslik m join public.t2_smeta_versiya_pozitsiya p on p.id = m.pozitsiya_id where p.versiya_id = v_v and p.tartib = 2;

  -- S1: qisman 95 → da'vo 15 (fakt kesilmaydi: qurilgan hajm 95 saqlanadi).
  r := public.t2_smeta_versiya_qaror_v1(v_k, v_a, v_v, jsonb_build_array(jsonb_build_object('moslik_id', m1.id, 'kutilgan_versiya', m1.versiya, 'qaror', 'qisman', 'qurilgan_hajm', 95, 'izoh', 'o''lchov dalolatnomasi')), gen_random_uuid());
  if r->>'ok' <> 'true' then raise exception 'qaror S1: %', r; end if;
  select dava_hajm into v_d from public.t2_smeta_versiya_dava where moslik_id = m1.id;
  if v_d is distinct from 15 then raise exception 'S1 qisman da''vo 15 emas: %', v_d; end if;
  if (select qurilgan_hajm from public.t2_smeta_versiya_dava where moslik_id = m1.id) <> 95 then raise exception 'S1 qurilgan hajm kesildi'; end if;
  -- Eskirgan versiya bilan yozish → ziddiyat (hech narsa o'zgarmaydi).
  r := public.t2_smeta_versiya_qaror_v1(v_k, v_a, v_v, jsonb_build_array(jsonb_build_object('moslik_id', m1.id, 'kutilgan_versiya', m1.versiya, 'qaror', 'qurilgan')), gen_random_uuid());
  if r->>'code' <> 'VERSIYA_ZIDDIYAT' then raise exception 'eskirgan versiya o''tdi: %', r; end if;
  r := public.t2_smeta_versiya_qaror_v1(v_k, v_a, v_v, jsonb_build_array(jsonb_build_object('moslik_id', m1.id, 'kutilgan_versiya', m1.versiya + 1, 'qaror', 'qurilgan')), gen_random_uuid());
  if (select dava_hajm from public.t2_smeta_versiya_dava where moslik_id = m1.id) is distinct from 20::numeric then raise exception 'S1 qurilgan da''vo 20 emas'; end if;
  if (select qurilgan_hajm from public.t2_smeta_versiya_moslik where id = m1.id) is not null then raise exception 'qurilgan holatida qisman hajm qolib ketdi'; end if;
  r := public.t2_smeta_versiya_qaror_v1(v_k, v_a, v_v, jsonb_build_array(jsonb_build_object('moslik_id', m1.id, 'kutilgan_versiya', m1.versiya + 2, 'qaror', 'qurilmagan')), gen_random_uuid());
  if exists (select 1 from public.t2_smeta_versiya_dava where moslik_id = m1.id) then raise exception 'qurilmagan da''vo ro''yxatida'; end if;
  r := public.t2_smeta_versiya_qaror_v1(v_k, v_a, v_v, jsonb_build_array(jsonb_build_object('moslik_id', m1.id, 'kutilgan_versiya', m1.versiya + 3, 'qaror', 'qisman')), gen_random_uuid());
  if r->>'code' <> 'QARORLAR_INVALID' then raise exception 'qisman hajmsiz o''tdi: %', r; end if;

  -- S2: joriy hajm noma'lum → da'vo NULL (to'qilmaydi).
  select id, versiya into m1.id, m1.versiya from public.t2_smeta_versiya_moslik where versiya_id = v_v and qator_id = v_q2;
  r := public.t2_smeta_versiya_qaror_v1(v_k, v_a, v_v, jsonb_build_array(jsonb_build_object('moslik_id', m1.id, 'kutilgan_versiya', m1.versiya, 'qaror', 'qurilgan')), gen_random_uuid());
  select count(*), max(dava_hajm) into v_n, v_d from public.t2_smeta_versiya_dava where moslik_id = m1.id;
  if v_n <> 1 or v_d is not null then raise exception 'S2 noma''lum joriy hajmda da''vo to''qildi: % %', v_n, v_d; end if;

  -- S3: o'chirilgan + qurilgan → da'vo = 45; birlik farqli noaniq juft → NULL.
  r := public.t2_smeta_versiya_qaror_v1(v_k, v_a, v_v, jsonb_build_array(
        jsonb_build_object('moslik_id', m4.id, 'kutilgan_versiya', m4.versiya, 'qaror', 'qurilgan'),
        jsonb_build_object('moslik_id', m3.id, 'kutilgan_versiya', m3.versiya, 'qaror', 'qurilgan')), gen_random_uuid());
  if r->>'ok' <> 'true' then raise exception 'qaror S3: %', r; end if;
  if (select dava_hajm from public.t2_smeta_versiya_dava where moslik_id = m4.id) is distinct from 45::numeric then raise exception 'S3 o''chirilgan da''vo 45 emas'; end if;
  if (select dava_hajm from public.t2_smeta_versiya_dava where moslik_id = m3.id) is not null then raise exception 'S3 birlik farqida da''vo to''qildi'; end if;

  -- S4: noaniq juftni rad etish → ajraladi; da'vo endi to'liq eski hajm (9).
  r := public.t2_smeta_versiya_qaror_v1(v_k, v_a, v_v, jsonb_build_array(jsonb_build_object('moslik_id', m3.id, 'kutilgan_versiya', m3.versiya + 1, 'tasdiq', 'rad')), gen_random_uuid());
  if r->>'ok' <> 'true' then raise exception 'rad: %', r; end if;
  select * into m3 from public.t2_smeta_versiya_moslik where id = m3.id;
  if m3.holat <> 'ochirilgan' or m3.qator_id is not null or m3.tasdiq <> 'rad' then raise exception 'rad juftni ajratmadi: %', row_to_json(m3); end if;
  if not exists (select 1 from public.t2_smeta_versiya_moslik where versiya_id = v_v and qator_id = v_q3 and holat = 'yangi' and pozitsiya_id is null) then raise exception 'rad — joriy qator «yangi» bo''lmadi'; end if;
  if (select dava_hajm from public.t2_smeta_versiya_dava where moslik_id = m3.id) is distinct from 9::numeric then raise exception 'S4 rad etilgandan keyin da''vo 9 emas'; end if;
  r := public.t2_smeta_versiya_qaror_v1(v_k, v_a, v_v, jsonb_build_array(jsonb_build_object('moslik_id',
        (select id from public.t2_smeta_versiya_moslik where versiya_id = v_v and qator_id = v_q3), 'kutilgan_versiya', 1, 'qaror', 'qurilgan')), gen_random_uuid());
  if r->>'code' <> 'QAROR_MOS_EMAS' then raise exception '«yangi» qatorga qaror o''tdi: %', r; end if;

  -- S5: tenant/actor chegarasi, bekor, asl smeta o'zgarmagan.
  begin
    perform public.t2_smeta_versiya_qaror_v1(v_k, -1, v_v, jsonb_build_array(jsonb_build_object('moslik_id', m4.id, 'kutilgan_versiya', 1, 'qaror', 'qurilgan')), gen_random_uuid());
    raise exception 'begona actor rad etilmadi';
  exception when others then
    if sqlerrm = 'begona actor rad etilmadi' then raise; end if;
  end;
  r := public.t2_smeta_versiya_yarat_v1(v_k, v_a, (select max(id) + 1000 from public.t2_obyekt), 'x', 'boshqa', null, null, null, gen_random_uuid());
  if r->>'code' <> 'OBYEKT_SCOPE_MISMATCH' then raise exception 'begona obyekt o''tdi: %', r; end if;
  r := public.t2_smeta_versiya_bekor_v1(v_k, v_a, v_v, 'sinov', gen_random_uuid());
  if r->>'ok' <> 'true' then raise exception 'bekor: %', r; end if;
  if exists (select 1 from public.t2_smeta_versiya_dava where versiya_id = v_v) then raise exception 'bekor versiya da''vo ro''yxatida'; end if;
  r := public.t2_smeta_versiya_qaror_v1(v_k, v_a, v_v, jsonb_build_array(jsonb_build_object('moslik_id', m4.id, 'kutilgan_versiya', 2, 'qaror', 'qurilmagan')), gen_random_uuid());
  if r->>'code' <> 'VERSIYA_TAYYOR_EMAS' then raise exception 'bekor versiyaga qaror yozildi: %', r; end if;

  select md5(coalesce(string_agg(id::text || ':' || coalesce(hajm::text, '') || ':' || coalesce(narx::text, ''), ',' order by id), '')) into v_h2 from public.t2_qator where kompaniya_id = v_k;
  if v_h1 is distinct from v_h2 then raise exception 'asl smeta (t2_qator) o''zgardi!'; end if;
  select md5(coalesce(string_agg(id::text || ':' || seq, ',' order by id), '')) into v_rev2 from public.t2_smeta_revision;
  if v_rev1 is distinct from v_rev2 then raise exception 't2_smeta_revision o''zgardi!'; end if;
  raise notice 'ACCEPTANCE OK: versiya %, S1–S5 o''tdi', v_v;
end $acc$;
rollback;
