-- t2_agent_uslub_model_contract: foydalanuvchi uslubi (chegaralash, o'chirish, tozalash) va shaxsiy model tanlovi
-- (katalog FK, tizim agenti taqiqi, muhit hal qilish tartibi: foydalanuvchi -> kompaniya -> platforma). Rollback.
do $t$
declare
  k1 bigint; u1 bigint; u2 bigint; r jsonb; ok int := 0; bad text := '';
begin
  insert into t2_kompaniya(kod, nom, faol) values ('USM' || floor(random()*1e9)::text, 'Uslub Test', true) returning id into k1;
  insert into t2_foydalanuvchi(login) values ('us_a_' || k1) returning id into u1;
  insert into t2_foydalanuvchi(login) values ('us_b_' || k1) returning id into u2;
  insert into t2_azolik(kompaniya_id, foydalanuvchi_id, rol, holat) values (k1, u1, 'prorab', 'faol'), (k1, u2, 'prorab', 'faol');
  insert into t2_agent_model_katalog(id, nom, faol) values ('test/model-a', 'Test A', true), ('test/model-b', 'Test B', true), ('test/model-off', 'Test Off', false);

  -- 1) uslub: bo'sh holat, yangilash chegaralari
  r := t2_agent_uslub_v1(u1);
  if (r->>'ok')::boolean and r->'xususiyat' = '{}'::jsonb and (r->>'yoqilgan')::boolean then ok := ok + 1; else bad := bad || ' uslub-bosh'; end if;
  r := t2_agent_uslub_yangila_v1(u1, '{"n": 5, "ru": 7.5, "uzunlik": 99999, "batafsil": -3, "xavfli": 1, "qisqa": "x"}'::jsonb);
  r := t2_agent_uslub_v1(u1);
  if (r->'xususiyat'->>'ru')::numeric = 1 and (r->'xususiyat'->>'uzunlik')::numeric = 2000 and (r->'xususiyat'->>'batafsil')::numeric = 0
     and not (r->'xususiyat' ? 'xavfli') and not (r->'xususiyat' ? 'qisqa') and (r->'xususiyat'->>'n')::numeric = 5 then ok := ok + 1; else bad := bad || ' uslub-chegara'; end if;
  r := t2_agent_uslub_yangila_v1(u1, '[1]'::jsonb);
  if r->>'code' = 'USLUB_INVALID' then ok := ok + 1; else bad := bad || ' uslub-invalid'; end if;
  r := t2_agent_uslub_yangila_v1(0, '{}'::jsonb);
  if r->>'code' = 'AUTH_REQUIRED' then ok := ok + 1; else bad := bad || ' uslub-auth'; end if;

  -- 2) ko'rsatma va o'chirish: o'chirilganda o'rganilgan tozalanadi va yangilanmaydi
  r := t2_agent_uslub_saqla_v1(u1, 'Qisqa yoz', true);
  if (r->>'ok')::boolean and t2_agent_uslub_v1(u1)->>'korsatma' = 'Qisqa yoz' then ok := ok + 1; else bad := bad || ' korsatma'; end if;
  r := t2_agent_uslub_saqla_v1(u1, repeat('x', 601), true);
  if r->>'code' = 'KORSATMA_UZUN' then ok := ok + 1; else bad := bad || ' korsatma-uzun'; end if;
  r := t2_agent_uslub_saqla_v1(u1, 'Qisqa yoz', false);
  if t2_agent_uslub_v1(u1)->'xususiyat' = '{}'::jsonb and not (t2_agent_uslub_v1(u1)->>'yoqilgan')::boolean then ok := ok + 1; else bad := bad || ' ochirish-tozalaydi'; end if;
  perform t2_agent_uslub_yangila_v1(u1, '{"n": 9}'::jsonb);
  if t2_agent_uslub_v1(u1)->'xususiyat' = '{}'::jsonb then ok := ok + 1; else bad := bad || ' ochiq-emas-saqlamaydi'; end if;
  -- boshqa foydalanuvchiga ta'sir yo'q
  if t2_agent_uslub_v1(u2)->'xususiyat' = '{}'::jsonb and (t2_agent_uslub_v1(u2)->>'yoqilgan')::boolean then ok := ok + 1; else bad := bad || ' izolyatsiya'; end if;
  perform t2_agent_uslub_saqla_v1(u1, null, true); perform t2_agent_uslub_yangila_v1(u1, '{"n": 3, "ru": 0.5}'::jsonb);
  r := t2_agent_uslub_tozala_v1(u1);
  if (r->>'ok')::boolean and t2_agent_uslub_v1(u1)->'xususiyat' = '{}'::jsonb then ok := ok + 1; else bad := bad || ' tozala'; end if;

  -- 3) shaxsiy model tanlovi
  r := t2_agent_model_shaxsiy_tanla_v1(u1, 'prorab', 'test/model-a');
  if (r->>'ok')::boolean then ok := ok + 1; else bad := bad || ' tanla'; end if;
  r := t2_agent_model_shaxsiy_tanla_v1(u1, 'prorab', 'test/model-off');
  if r->>'code' = 'MODEL_KATALOGDA_YOQ' then ok := ok + 1; else bad := bad || ' nofaol-model'; end if;
  r := t2_agent_model_shaxsiy_tanla_v1(u1, 'prorab', 'test/yoq-model');
  if r->>'code' = 'MODEL_KATALOGDA_YOQ' then ok := ok + 1; else bad := bad || ' notanish-model'; end if;
  r := t2_agent_model_shaxsiy_tanla_v1(u1, 'yoq_profil', 'test/model-a');
  if r->>'code' = 'PROFIL_YOQ' then ok := ok + 1; else bad := bad || ' profil-yoq'; end if;
  r := t2_agent_model_shaxsiy_tanla_v1(u1, 'platform_orchestrator', 'test/model-a');
  if r->>'code' = 'TIZIM_AGENTI' then ok := ok + 1; else bad := bad || ' tizim-agenti'; end if;
  r := t2_agent_muhit_v1(u1, k1, 'prorab');
  if r->>'model' = 'test/model-a' and r->>'model_manba' = 'foydalanuvchi' then ok := ok + 1; else bad := bad || ' muhit-foydalanuvchi'; end if;
  r := t2_agent_muhit_v1(u2, k1, 'prorab');
  if r->>'model' is distinct from 'test/model-a' then ok := ok + 1; else bad := bad || ' muhit-boshqaga-tegmaydi'; end if;

  -- 4) hal qilish tartibi: foydalanuvchi > kompaniya > platforma
  insert into t2_agent_model_tanlov(kompaniya_id, profil_kod, model_id, actor_id) values (null, 'prorab', 'test/model-b', u1), (k1, 'prorab', 'test/model-b', u1)
  on conflict do nothing;
  r := t2_agent_muhit_v1(u2, k1, 'prorab');
  if r->>'model' = 'test/model-b' and r->>'model_manba' = 'kompaniya' then ok := ok + 1; else bad := bad || ' muhit-kompaniya'; end if;
  r := t2_agent_muhit_v1(u1, k1, 'prorab');
  if r->>'model' = 'test/model-a' then ok := ok + 1; else bad := bad || ' muhit-shaxsiy-ustun'; end if;
  r := t2_agent_model_shaxsiy_tanla_v1(u1, 'prorab', null);
  r := t2_agent_muhit_v1(u1, k1, 'prorab');
  if r->>'model' = 'test/model-b' and r->>'model_manba' = 'kompaniya' then ok := ok + 1; else bad := bad || ' tozalangach-kompaniya'; end if;
  -- shaxsiy tanlov nofaol qilingan katalogda hisobga olinmaydi
  perform t2_agent_model_shaxsiy_tanla_v1(u1, 'prorab', 'test/model-a');
  update t2_agent_model_katalog set faol = false where id = 'test/model-a';
  r := t2_agent_muhit_v1(u1, k1, 'prorab');
  if r->>'model' = 'test/model-b' then ok := ok + 1; else bad := bad || ' nofaol-katalog-otkazib'; end if;
  r := t2_agent_model_shaxsiy_v1(u1);
  if jsonb_array_length(r->'tanlovlar') = 1 then ok := ok + 1; else bad := bad || ' royxat'; end if;

  raise exception 'T2_AGENT_USLUB_MODEL_RESULT ok=% bad=[%]', ok, bad;
end $t$;
