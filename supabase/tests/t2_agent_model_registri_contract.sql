-- t2_agent_model_registri_contract: katalog faqat superadmin; tanlov rol bo'yicha; kompaniya > platforma > standart; tenant izolyatsiya. Rollback (raise exception).
do $t$
declare k1 bigint; k2 bigint; ks bigint; ub bigint; up bigint; uo bigint; us bigint; r jsonb; ok int := 0; bad text := '';
begin
  insert into t2_kompaniya(kod, nom, faol) values ('MRA' || floor(random()*1e9)::text, 'Model A', true) returning id into k1;
  insert into t2_kompaniya(kod, nom, faol) values ('MRB' || floor(random()*1e9)::text, 'Model B', true) returning id into k2;
  insert into t2_kompaniya(kod, nom, faol) values ('MRS' || floor(random()*1e9)::text, 'Model S', true) returning id into ks;
  insert into t2_foydalanuvchi(login) values ('mr_b_' || k1) returning id into ub;
  insert into t2_foydalanuvchi(login) values ('mr_p_' || k1) returning id into up;
  insert into t2_foydalanuvchi(login) values ('mr_o_' || k1) returning id into uo;
  insert into t2_foydalanuvchi(login) values ('mr_s_' || k1) returning id into us;
  insert into t2_azolik(kompaniya_id, foydalanuvchi_id, rol, holat) values (k1, ub, 'boss', 'faol'), (k1, up, 'pto', 'faol'), (k2, uo, 'boss', 'faol'), (ks, us, 'superadmin', 'faol');

  r := t2_agent_model_katalog_yoz_v1(ub, 'vendor/model-a', 'Model A', 'tavsif', 'arzon', false, true);
  if r->>'code' = 'GLOBAL_SCOPE_DENIED' then ok := ok + 1; else bad := bad || ' katalog-oddiy'; end if;
  r := t2_agent_model_katalog_yoz_v1(us, 'vendor/model-a', 'Model A', 'tavsif', 'arzon', false, true);
  if (r->>'ok')::boolean then ok := ok + 1; else bad := bad || ' katalog-super'; end if;
  r := t2_agent_model_katalog_yoz_v1(us, 'Bad Model;drop', 'X', null, null, false, true);
  if r->>'code' = 'MODEL_INVALID' then ok := ok + 1; else bad := bad || ' katalog-invalid'; end if;
  perform t2_agent_model_katalog_yoz_v1(us, 'vendor/model-b', 'Model B', null, null, true, true);
  perform t2_agent_model_katalog_yoz_v1(us, 'vendor/off', 'Off', null, null, false, false);

  r := t2_agent_modellar_v1(up, k1);
  if (r->>'ok')::boolean and not (r->>'tanlash_mumkin')::boolean and position('platform_orchestrator' in r::text) = 0 and position('"standart"' in r::text) > 0 then ok := ok + 1; else bad := bad || ' royxat-kompaniya'; end if;
  r := t2_agent_modellar_v1(uo, k1);
  if r->>'code' = 'COMPANY_ACCESS_DENIED' then ok := ok + 1; else bad := bad || ' royxat-begona'; end if;
  r := t2_agent_modellar_v1(us, null);
  if (r->>'ok')::boolean and position('platform_orchestrator' in r::text) > 0 then ok := ok + 1; else bad := bad || ' royxat-global'; end if;

  r := t2_agent_model_tanla_v1(up, k1, 'document_control', 'vendor/model-a');
  if r->>'code' = 'WRITE_ROLE_REQUIRED' then ok := ok + 1; else bad := bad || ' pto-tanlash'; end if;
  r := t2_agent_model_tanla_v1(ub, k1, 'document_control', 'vendor/off');
  if r->>'code' = 'MODEL_KATALOGDA_YOQ' then ok := ok + 1; else bad := bad || ' nofaol'; end if;
  r := t2_agent_model_tanla_v1(ub, k1, 'document_control', 'evil/yoq-model');
  if r->>'code' = 'MODEL_KATALOGDA_YOQ' then ok := ok + 1; else bad := bad || ' katalogda-yoq'; end if;
  r := t2_agent_model_tanla_v1(ub, k1, 'platform_orchestrator', 'vendor/model-a');
  if r->>'code' = 'TIZIM_AGENTI' then ok := ok + 1; else bad := bad || ' tizim-agenti'; end if;
  r := t2_agent_model_tanla_v1(ub, k1, 'document_control', 'vendor/model-a');
  if (r->>'ok')::boolean then ok := ok + 1; else bad := bad || ' boss-tanlash'; end if;
  r := t2_agent_muhit_v1(up, k1, 'document_control');
  if r->>'model' = 'vendor/model-a' then ok := ok + 1; else bad := bad || ' muhit-model'; end if;
  r := t2_agent_muhit_v1(uo, k2, 'document_control');
  if r->>'model' is null then ok := ok + 1; else bad := bad || ' model-begonaga-oqdi'; end if;

  r := t2_agent_model_tanla_v1(us, null, 'document_control', 'vendor/model-b');
  if (r->>'ok')::boolean then ok := ok + 1; else bad := bad || ' platforma-tanlash'; end if;
  r := t2_agent_muhit_v1(up, k1, 'document_control');
  if r->>'model' = 'vendor/model-a' then ok := ok + 1; else bad := bad || ' kompaniya-ustun'; end if;
  r := t2_agent_muhit_v1(uo, k2, 'document_control');
  if r->>'model' = 'vendor/model-b' then ok := ok + 1; else bad := bad || ' platforma-meros'; end if;
  perform t2_agent_model_tanla_v1(ub, k1, 'document_control', null);
  r := t2_agent_muhit_v1(up, k1, 'document_control');
  if r->>'model' = 'vendor/model-b' then ok := ok + 1; else bad := bad || ' tozalash'; end if;
  r := t2_agent_modellar_v1(up, k1);
  if position('"platforma"' in r::text) > 0 then ok := ok + 1; else bad := bad || ' manba-platforma'; end if;

  raise exception 'MODEL_REGISTR_TEST ok=% / 18 bad=[%]', ok, bad;
end $t$;
