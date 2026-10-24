-- T2_SUBPUDRAT_DOIRA contract test. Natija: oxirgi exception "TEST_SUBPUDRAT ..." (= rollback, hech narsa saqlanmaydi).
-- Faqat disposable branch / lokal yoki tranzaksiya+rollback bilan. Migratsiya 20261108610000 dan keyin.
do $$
declare
  p bigint; z bigint; x bigint; ub bigint; uk bigint; uz bigint; ux bigint;
  o1 bigint; xo bigint; rz bigint; rr1 bigint; m1 bigint; s3x bigint; rs1 bigint; rs2 bigint; rs3 bigint; xq bigint; al bigint; al2 bigint; sh bigint; s1 bigint; s2 bigint; s3 bigint;
  r jsonb; rep text[] := array[]::text[]; n int; op uuid := gen_random_uuid(); ver int; q jsonb;
begin
  insert into t2_kompaniya (nom, kod, inn, faol) values ('TEST_SUB_P', 'TSP', '920000001', true) returning id into p;
  insert into t2_kompaniya (nom, kod, inn, faol) values ('TEST_SUB_Z', 'TSZ', '920000002', true) returning id into z;
  insert into t2_kompaniya (nom, kod, inn, faol) values ('TEST_SUB_X', 'TSX', '920000003', true) returning id into x;
  insert into t2_foydalanuvchi (login, ism, holat) values ('ts_ub', 'boss', 'faol') returning id into ub;
  insert into t2_foydalanuvchi (login, ism, holat) values ('ts_uk', 'kuz', 'faol') returning id into uk;
  insert into t2_foydalanuvchi (login, ism, holat) values ('ts_uz', 'sub boss', 'faol') returning id into uz;
  insert into t2_foydalanuvchi (login, ism, holat) values ('ts_ux', 'begona', 'faol') returning id into ux;
  insert into t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values (ub, p, 'boss', 'faol'), (uk, p, 'kuzatuvchi', 'faol'), (uz, z, 'boss', 'faol'), (ux, x, 'boss', 'faol');
  insert into t2_obyekt (nom, kompaniya_id) values ('SUB-obyekt', p) returning id into o1;
  insert into t2_obyekt (nom, kompaniya_id) values ('SUB-begona', x) returning id into xo;
  insert into t2_qator (kompaniya_id, obyekt_id, tur, nom, birlik) values (p, o1, 'rz', 'Razdel', null) returning id into rz;
  insert into t2_qator (kompaniya_id, obyekt_id, tur, nom, birlik, hajm, narx, summa, ota_id) values (p, o1, 'bl', 'Devor', 'm3', 100, 50, 5000, rz) returning id into rs1;
  insert into t2_qator (kompaniya_id, obyekt_id, tur, nom, birlik, hajm, narx, summa, ota_id) values (p, o1, 'bl', 'Suvoq', 'm2', 10, null, null, rz) returning id into rs2;
  insert into t2_qator (kompaniya_id, obyekt_id, tur, nom, birlik, hajm, narx, summa, ota_id) values (p, o1, 'bl', 'Chiqarilgan', 'sht', 5, 10, 50, rz) returning id into rs3;
  insert into t2_qator (kompaniya_id, obyekt_id, tur, nom, birlik, hajm, narx, summa, ota_id) values (p, o1, 'rs', 'Mehnat', 'soat', 20, 100, 2000, rs1) returning id into rr1;
  insert into t2_qator (kompaniya_id, obyekt_id, tur, nom, birlik, hajm, narx, summa, ota_id) values (p, o1, 'mat', 'Gisht', 'sht', 500, 6, 3000, rs1) returning id into m1;
  insert into t2_qator (kompaniya_id, obyekt_id, tur, nom, hajm) values (x, xo, 'rs', 'Begona', 1) returning id into xq;
  insert into t2_shartnoma (kompaniya_id, raqam, nom, holat, kim) values (p, 'TEST-ASOSIY', 'asosiy', 'faol', 'test') returning id into sh;
  insert into t2_shartnoma_qator_qamrov (kompaniya_id, shartnoma_id, obyekt_id, qator_id, holat, sabab, operation_id)
    values (p, sh, o1, rs3, 'chiqarilgan', 'test', gen_random_uuid());
  insert into t2_tomon_aloqa (taklif_kompaniya_id, qabul_kompaniya_id, taklif_rol, qabul_rol, turi, holat, taklif_actor_id) values (p, z, 'pudratchi', 'subpudratchi', 'subpudrat', 'faol', ub) returning id into al;
  insert into t2_tomon_aloqa (taklif_kompaniya_id, qabul_kompaniya_id, taklif_rol, qabul_rol, turi, holat, taklif_actor_id) values (p, z, 'pudratchi', 'zakazchik', 'shartnoma', 'faol', ub) returning id into al2;

  -- sarlavha: ruxsat, aloqa turi, takror
  r := t2_subpudrat_saqla_v1(ub, p, op, null, jsonb_build_object('raqam', 'SUB-1', 'sub_kompaniya_id', z, 'aloqa_id', al, 'asosiy_shartnoma_id', sh, 'avans_foiz', 30));
  s1 := (r->>'id')::bigint;
  rep := rep || (case when (r->>'ok')::boolean and s1 is not null then 'OK   boss subpudrat shartnomasini yaratdi' else 'FAIL saqla: ' || r::text end);
  begin perform t2_subpudrat_saqla_v1(uk, p, gen_random_uuid(), null, jsonb_build_object('raqam', 'X', 'sub_kompaniya_id', z, 'aloqa_id', al)); rep := rep || 'FAIL kuzatuvchi yaratdi';
  exception when others then rep := rep || (case when sqlstate = '42501' then 'OK   kuzatuvchi rad 42501' else 'FAIL kuzatuvchi: ' || sqlerrm end); end;
  begin perform t2_subpudrat_saqla_v1(ux, p, gen_random_uuid(), null, jsonb_build_object('raqam', 'X', 'sub_kompaniya_id', z, 'aloqa_id', al)); rep := rep || 'FAIL begona actor yaratdi';
  exception when others then rep := rep || (case when sqlstate = '42501' then 'OK   begona kompaniya actori rad 42501' else 'FAIL begona actor: ' || sqlerrm end); end;
  r := t2_subpudrat_saqla_v1(ub, p, gen_random_uuid(), null, jsonb_build_object('raqam', 'SUB-2', 'sub_kompaniya_id', z, 'aloqa_id', al2));
  rep := rep || (case when r->>'code' = 'ALOQA_YOQ' then 'OK   aloqa turi subpudrat emas - rad' else 'FAIL aloqa turi: ' || r::text end);
  r := t2_subpudrat_saqla_v1(ub, p, gen_random_uuid(), null, jsonb_build_object('raqam', 'SUB-1', 'sub_kompaniya_id', z, 'aloqa_id', al));
  rep := rep || (case when r->>'code' = 'RAQAM_BAND' then 'OK   raqam band' else 'FAIL raqam: ' || r::text end);
  r := t2_subpudrat_saqla_v1(ub, p, op, null, jsonb_build_object('raqam', 'SUB-1', 'sub_kompaniya_id', z, 'aloqa_id', al, 'asosiy_shartnoma_id', sh, 'avans_foiz', 30));
  select count(*) into n from t2_subpudrat_shartnoma where kompaniya_id = p and operation_id = op;
  rep := rep || (case when n = 1 and (r->>'takror')::boolean then 'OK   operation_id takrori - bitta qator' else 'FAIL takror: ' || r::text end);
  r := t2_subpudrat_saqla_v1(ub, p, gen_random_uuid(), null, jsonb_build_object('raqam', 'SUB-3', 'asosiy_shartnoma_id', 0, 'sub_kontragent_id', 1));
  rep := rep || (case when r->>'code' = 'SHARTNOMA_BEGONA' then 'OK   begona asosiy shartnoma rad' else 'FAIL asosiy: ' || r::text end);

  -- qatorlar
  r := t2_subpudrat_qator_saqla_v1(ub, p, gen_random_uuid(), s1, 99, '[]'::jsonb, null);
  rep := rep || (case when r->>'code' = 'VERSIYA_ESKI' then 'OK   eski versiya rad' else 'FAIL versiya: ' || r::text end);
  r := t2_subpudrat_qator_saqla_v1(ub, p, gen_random_uuid(), s1, 1, jsonb_build_array(jsonb_build_object('qator_id', xq)), null);
  rep := rep || (case when r->>'code' = 'QATOR_BEGONA' then 'OK   begona tenant qatori rad' else 'FAIL begona qator: ' || r::text end);
  r := t2_subpudrat_qator_saqla_v1(ub, p, gen_random_uuid(), s1, 1, jsonb_build_array(jsonb_build_object('qator_id', rs3)), null);
  rep := rep || (case when r->>'code' = 'QAMROVDA_EMAS' then 'OK   shartnoma qamrovidan chiqarilgan qator rad' else 'FAIL qamrov: ' || r::text end);
  r := t2_subpudrat_qator_saqla_v1(ub, p, gen_random_uuid(), s1, 1, jsonb_build_array(jsonb_build_object('qator_id', rr1, 'narx', 100)), null);
  rep := rep || (case when r->>'code' = 'QATOR_TURI' then 'OK   rs (resurs) qabul qilinmaydi - QATOR_TURI' else 'FAIL rs turi: ' || r::text end);
  r := t2_subpudrat_qator_saqla_v1(ub, p, gen_random_uuid(), s1, 1, jsonb_build_array(jsonb_build_object('qator_id', rs1, 'narx', -1)), null);
  rep := rep || (case when r->>'code' = 'QIYMAT_MANFIY' then 'OK   manfiy narx rad' else 'FAIL manfiy: ' || r::text end);
  r := t2_subpudrat_qator_saqla_v1(ub, p, gen_random_uuid(), s1, 1, jsonb_build_array(jsonb_build_object('qator_id', rs1, 'hajm', 60, 'narx', 40), jsonb_build_object('qator_id', rs2)), null);
  rep := rep || (case when (r->>'ok')::boolean and (r->>'saqlandi')::int = 2 then 'OK   2 qator subpudrat hajm/narx bilan saqlandi' else 'FAIL qator saqla: ' || r::text end);
  r := t2_subpudrat_qator_saqla_v1(ub, p, gen_random_uuid(), s1, 2, jsonb_build_array(jsonb_build_object('qator_id', m1, 'narx', 6)), null);
  rep := rep || (case when r->>'code' = 'QATOR_ICHKI' then 'OK   bl tanlangan - uning materiali alohida qo''shilmaydi (QATOR_ICHKI)' else 'FAIL ichki: ' || r::text end);
  rep := rep || (case when (select hajm = 10 and narx is null from t2_subpudrat_qator where subpudrat_id = s1 and qator_id = rs2) then 'OK   narx kaliti yo''q = NULL (0 emas), hajm asldan' else 'FAIL rs2 narx/hajm' end);
  rep := rep || (case when (select narx = 50 and hajm = 100 and summa = 5000 from t2_qator where id = rs1) then 'OK   asl smeta qatori o''zgarmadi' else 'FAIL asl smeta o''zgardi' end);
  r := t2_subpudrat_qator_saqla_v1(ub, p, gen_random_uuid(), s1, 2, '[]'::jsonb, rz);
  select count(*) into n from t2_subpudrat_qator where subpudrat_id = s1 and holat = 'faol';
  rep := rep || (case when (r->>'ok')::boolean and n = 2 then 'OK   razdel kengaytmasi: faqat bl, chiqarilgan va resurs qo''shilmadi' else 'FAIL razdel: ' || n || ' ' || r::text end);

  -- egasi ko'rinishi: marja
  r := t2_subpudrat_qamrov_v1(ub, p, s1);
  rep := rep || (case when (r->'jami'->>'subpudrat_summa_ustamasiz')::numeric = 2400 and (r->'jami'->>'asl_summa_ustamasiz')::numeric = 5000
                       and (r->'jami'->>'marja_ustamasiz')::numeric = 2600 and (r->'jami'->>'narxsiz_soni')::int = 1
                  then 'OK   egasi: sub 2400, asl 5000, marja 2600, narxsiz 1' else 'FAIL jami: ' || coalesce(r->>'jami', r::text) end);
  q := (select e from jsonb_array_elements(r->'qatorlar') e where (e->>'qator_id')::bigint = rs2);
  rep := rep || (case when q->'summa_ustamasiz' = 'null'::jsonb and q->'marja_ustamasiz' = 'null'::jsonb then 'OK   narxsiz qator summa/marja NULL (0 emas)' else 'FAIL narxsiz: ' || q::text end);

  -- subpudratchi: qoralamada ko'rinmaydi; faol bo'lgach faqat o'z doirasi
  r := t2_subpudrat_qamrov_v1(uz, z, s1);
  rep := rep || (case when r->>'code' = 'TOPILMADI' then 'OK   qoralama subpudratchiga ko''rinmaydi' else 'FAIL qoralama ko''rindi: ' || r::text end);
  select versiya into ver from t2_subpudrat_shartnoma where id = s1;
  r := t2_subpudrat_saqla_v1(ub, p, gen_random_uuid(), ver, jsonb_build_object('id', s1, 'raqam', 'SUB-1', 'sub_kompaniya_id', z, 'aloqa_id', al, 'asosiy_shartnoma_id', sh, 'avans_foiz', 30, 'holat', 'faol'));
  rep := rep || (case when (r->>'ok')::boolean then 'OK   shartnoma faollashtirildi' else 'FAIL faollashtirish: ' || r::text end);
  r := t2_subpudrat_qamrov_v1(uz, z, s1);
  rep := rep || (case when (r->>'ok')::boolean and (r->>'egasi')::boolean = false and jsonb_array_length(r->'qatorlar') = 2 then 'OK   subpudratchi o''z doirasini ko''radi (2 qator)' else 'FAIL sub qamrov: ' || r::text end);
  rep := rep || (case when r::text !~ 'asl_narx|asl_summa|marja|asl_hajm' then 'OK   subpudratchiga buyurtmachi narxi va marja sizmaydi' else 'FAIL sizish' end);
  r := t2_subpudrat_royxat_v1(uz, z, 'menga');
  rep := rep || (case when jsonb_array_length(r->'shartnomalar') = 1 and (r->'shartnomalar'->0->>'summa_ustamasiz')::numeric = 2400 then 'OK   subpudratchi ro''yxati: 1 shartnoma, 2400' else 'FAIL sub ro''yxat: ' || r::text end);
  r := t2_subpudrat_royxat_v1(ux, x, 'menga');
  rep := rep || (case when jsonb_array_length(r->'shartnomalar') = 0 then 'OK   uchinchi tomon ro''yxati bo''sh' else 'FAIL uchinchi ro''yxat' end);
  r := t2_subpudrat_qamrov_v1(ux, x, s1);
  rep := rep || (case when r->>'code' = 'TOPILMADI' then 'OK   uchinchi tomon TOPILMADI' else 'FAIL uchinchi: ' || r::text end);
  begin perform t2_subpudrat_qamrov_v1(uz, p, s1); rep := rep || 'FAIL sub boshqa kompaniya nomidan o''qidi';
  exception when others then rep := rep || (case when sqlstate = '42501' then 'OK   sub bosh kompaniya nomidan o''qiy olmaydi 42501' else 'FAIL: ' || sqlerrm end); end;
  r := t2_subpudrat_royxat_v1(ub, p, 'meniki');
  rep := rep || (case when jsonb_array_length(r->'shartnomalar') = 1 then 'OK   egasi ro''yxati' else 'FAIL egasi ro''yxat: ' || r::text end);

  -- ikkinchi subpudratchi (platformada yo'q) - ortiqcha hajm to'smaydi, ogohlantiradi
  r := t2_subpudrat_saqla_v1(ub, p, gen_random_uuid(), null, jsonb_build_object('raqam', 'SUB-K', 'sub_kontragent_id', 777));
  s2 := (r->>'id')::bigint;
  rep := rep || (case when (r->>'ok')::boolean then 'OK   platformada yo''q subpudratchi kontragent sifatida' else 'FAIL kontragent sub: ' || r::text end);
  r := t2_subpudrat_qator_saqla_v1(ub, p, gen_random_uuid(), s2, 1, jsonb_build_array(jsonb_build_object('qator_id', rs1, 'hajm', 60, 'narx', 45)), null);
  rep := rep || (case when (r->>'ok')::boolean and jsonb_array_length(r->'ogohlantirish') = 1 then 'OK   yig''indi hajm asldan oshdi - saqlandi, ogohlantirish bor' else 'FAIL ogohlantirish: ' || r::text end);

  r := t2_subpudrat_saqla_v1(ub, p, gen_random_uuid(), null, jsonb_build_object('raqam', 'SUB-M', 'sub_kontragent_id', 888));
  s3x := (r->>'id')::bigint;
  r := t2_subpudrat_qator_saqla_v1(ub, p, gen_random_uuid(), s3x, 1, jsonb_build_array(jsonb_build_object('qator_id', m1, 'narx', 6)), null);
  rep := rep || (case when (r->>'ok')::boolean then 'OK   material yetkazish alohida (bl tanlanmagan) qabul' else 'FAIL alohida mat: ' || r::text end);
  r := t2_subpudrat_qator_saqla_v1(ub, p, gen_random_uuid(), s3x, 2, jsonb_build_array(jsonb_build_object('qator_id', rs1, 'narx', 45)), null);
  rep := rep || (case when r->>'code' = 'QATOR_ICHKI' then 'OK   materiali bor bl qo''shilmaydi (QATOR_ICHKI)' else 'FAIL teskari ichki: ' || r::text end);

  -- yopilish va aloqa
  select versiya into ver from t2_subpudrat_shartnoma where id = s2;
  r := t2_subpudrat_saqla_v1(ub, p, gen_random_uuid(), ver, jsonb_build_object('id', s2, 'raqam', 'SUB-K', 'sub_kontragent_id', 777, 'holat', 'yopilgan'));
  rep := rep || (case when r->>'code' = 'OTISH_MUMKIN_EMAS' then 'OK   qoralamadan yopilganga sakrash rad' else 'FAIL sakrash: ' || r::text end);
  update t2_tomon_aloqa set holat = 'yopilgan' where id = al;
  r := t2_subpudrat_qamrov_v1(uz, z, s1);
  rep := rep || (case when r->>'code' = 'TOPILMADI' then 'OK   aloqa yopilgach subpudratchi ko''rmaydi' else 'FAIL yopiq aloqa: ' || r::text end);

  if to_regclass('public.t2_outbox') is null then rep := rep || 'SKIP outbox jadvali yo''q';
  else begin execute 'select count(*) from public.t2_outbox where mavzu = ''subpudrat.yaratildi'' and kompaniya_id = $1' into n using p;
      rep := rep || (case when n >= 3 then 'OK   outbox subpudrat.yaratildi yozilgan' else 'FAIL outbox: ' || n end);
    exception when others then rep := rep || 'SKIP outbox ustun: ' || sqlerrm; end;
  end if;
  rep := rep || (case when not has_function_privilege('anon', 'public.t2_subpudrat_qamrov_v1(bigint,bigint,bigint)', 'execute')
                   and not has_function_privilege('authenticated', 'public.t2_subpudrat_qator_saqla_v1(bigint,bigint,uuid,bigint,integer,jsonb,bigint)', 'execute')
                   and not has_table_privilege('authenticated', 'public.t2_subpudrat_qator', 'select')
                  then 'OK   anon/authenticated RPC va jadvalga kira olmaydi' else 'FAIL grant' end);
  raise exception 'TEST_SUBPUDRAT %', array_to_string(rep, E'\n');
end $$;