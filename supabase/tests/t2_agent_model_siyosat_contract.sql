-- t2_agent_model_siyosat_contract: kompaniya admini a'zolarning shaxsiy model tanlovini cheklaydi (muhit e'tiborga olmaydi); huquqsiz a'zo o'zgartira olmaydi. Rollback.
do $t$
declare k1 bigint; k2 bigint; ub bigint; up bigint; uo bigint; r jsonb; ok int := 0; bad text := '';
begin
  insert into t2_kompaniya(kod, nom, faol) values ('MSA' || floor(random()*1e9)::text, 'Siyosat A', true) returning id into k1;
  insert into t2_kompaniya(kod, nom, faol) values ('MSB' || floor(random()*1e9)::text, 'Siyosat B', true) returning id into k2;
  insert into t2_foydalanuvchi(login) values ('ms_boss_' || k1) returning id into ub;
  insert into t2_foydalanuvchi(login) values ('ms_prorab_' || k1) returning id into up;
  insert into t2_foydalanuvchi(login) values ('ms_other_' || k1) returning id into uo;
  insert into t2_azolik(kompaniya_id, foydalanuvchi_id, rol, holat) values (k1, ub, 'boss', 'faol'), (k1, up, 'prorab', 'faol'), (k2, uo, 'boss', 'faol');
  insert into t2_agent_model_katalog(id, nom, faol) values ('test/siyosat-a', 'Siyosat A', true), ('test/siyosat-b', 'Siyosat B', true);
  perform t2_agent_model_shaxsiy_tanla_v1(up, 'prorab', 'test/siyosat-a');
  insert into t2_agent_model_tanlov(kompaniya_id, profil_kod, model_id, actor_id) values (k1, 'prorab', 'test/siyosat-b', ub);

  r := t2_agent_model_siyosat_v1(up, k1);
  if (r->>'ok')::boolean and (r->>'model_erkin')::boolean and not (r->>'tahrir_mumkin')::boolean then ok := ok + 1; else bad := bad || ' standart-erkin'; end if;
  r := t2_agent_muhit_v1(up, k1, 'prorab');
  if r->>'model' = 'test/siyosat-a' and r->>'model_manba' = 'foydalanuvchi' then ok := ok + 1; else bad := bad || ' erkin-shaxsiy'; end if;
  r := t2_agent_model_siyosat_saqla_v1(up, k1, false);
  if r->>'code' = 'WRITE_ROLE_REQUIRED' then ok := ok + 1; else bad := bad || ' prorab-ozgartira-olmaydi'; end if;
  r := t2_agent_model_siyosat_saqla_v1(uo, k1, false);
  if r->>'code' = 'COMPANY_ACCESS_DENIED' then ok := ok + 1; else bad := bad || ' begona-rad'; end if;
  r := t2_agent_model_siyosat_saqla_v1(ub, k1, false);
  if (r->>'ok')::boolean then ok := ok + 1; else bad := bad || ' boss-saqlaydi'; end if;
  r := t2_agent_muhit_v1(up, k1, 'prorab');
  if r->>'model' = 'test/siyosat-b' and r->>'model_manba' = 'kompaniya' then ok := ok + 1; else bad := bad || ' cheklangan-kompaniya-modeli'; end if;
  r := t2_agent_model_siyosat_v1(up, k1);
  if not (r->>'model_erkin')::boolean then ok := ok + 1; else bad := bad || ' holat-cheklangan'; end if;
  -- boshqa kompaniya ta'sirlanmaydi (shaxsiy tanlov u yerda ishlaydi)
  perform t2_agent_model_shaxsiy_tanla_v1(uo, 'prorab', 'test/siyosat-a');
  r := t2_agent_muhit_v1(uo, k2, 'prorab');
  if r->>'model' = 'test/siyosat-a' and r->>'model_manba' = 'foydalanuvchi' then ok := ok + 1; else bad := bad || ' boshqa-kompaniya'; end if;
  r := t2_agent_model_siyosat_saqla_v1(ub, k1, true);
  r := t2_agent_muhit_v1(up, k1, 'prorab');
  if r->>'model' = 'test/siyosat-a' then ok := ok + 1; else bad := bad || ' qayta-erkin'; end if;
  -- siyosat qatori AI yoqilgan/token limitiga tegmaydi
  if exists (select 1 from t2_agent_kompaniya_sozlama where kompaniya_id = k1 and ai_yoqilgan and oylik_token_limit is null and kuzatuv_ruxsat) then ok := ok + 1; else bad := bad || ' boshqa-sozlama-buzilmadi'; end if;
  raise exception 'T2_AGENT_MODEL_SIYOSAT_RESULT ok=% bad=[%]', ok, bad;
end $t$;
