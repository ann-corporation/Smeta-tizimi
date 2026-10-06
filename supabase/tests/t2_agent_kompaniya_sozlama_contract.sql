-- t2_agent_kompaniya_sozlama_contract: admin AI ni o'chiradi / token limiti qo'yadi; oddiy a'zo o'zgartira olmaydi; begona kompaniya ko'rmaydi. Rollback.
do $t$
declare k1 bigint; k2 bigint; ks bigint; ub bigint; up bigint; uo bigint; us bigint; r jsonb; ok int := 0; bad text := '';
begin
  delete from t2_agent_byudjet where kompaniya_id is null;
  insert into t2_kompaniya(kod, nom, faol) values ('KSA' || floor(random()*1e9)::text, 'Soz A', true) returning id into k1;
  insert into t2_kompaniya(kod, nom, faol) values ('KSB' || floor(random()*1e9)::text, 'Soz B', true) returning id into k2;
  insert into t2_kompaniya(kod, nom, faol) values ('KSS' || floor(random()*1e9)::text, 'Soz S', true) returning id into ks;
  insert into t2_foydalanuvchi(login) values ('ks_b_' || k1) returning id into ub;
  insert into t2_foydalanuvchi(login) values ('ks_p_' || k1) returning id into up;
  insert into t2_foydalanuvchi(login) values ('ks_o_' || k1) returning id into uo;
  insert into t2_foydalanuvchi(login) values ('ks_s_' || k1) returning id into us;
  insert into t2_azolik(kompaniya_id, foydalanuvchi_id, rol, holat) values (k1, ub, 'boss', 'faol'), (k1, up, 'pto', 'faol'), (k2, uo, 'boss', 'faol'), (ks, us, 'superadmin', 'faol');
  insert into t2_token_harakat(kompaniya_id, miqdor, tur, operation_id) values (k1, 1000000, 'toldirish', gen_random_uuid());
  perform t2_agent_byudjet_belgila_v1(us, null, 1000, 80, true);
  update t2_token_sozlama set ai_ustama_foiz = 40, usd_kurs = 12700, token_som = 100 where id = 1;

  r := t2_agent_kompaniya_sozlama_v1(up, k1);
  if (r->>'ok')::boolean and (r->>'ai_yoqilgan')::boolean and (r->>'kuzatuv_ruxsat')::boolean and not (r->>'tahrir_mumkin')::boolean and r->'oylik_token_limit' = 'null'::jsonb then ok := ok + 1; else bad := bad || ' standart'; end if;
  r := t2_agent_kompaniya_sozlama_v1(uo, k1);
  if r->>'code' = 'COMPANY_ACCESS_DENIED' then ok := ok + 1; else bad := bad || ' begona-oqish'; end if;
  r := t2_agent_kompaniya_sozlama_saqla_v1(up, k1, false, null, true);
  if r->>'code' = 'WRITE_ROLE_REQUIRED' then ok := ok + 1; else bad := bad || ' pto-ozgartira-olmaydi'; end if;
  r := t2_agent_kompaniya_sozlama_saqla_v1(uo, k1, false, null, true);
  if r->>'code' = 'COMPANY_ACCESS_DENIED' then ok := ok + 1; else bad := bad || ' begona-yoza-olmaydi'; end if;
  r := t2_agent_kompaniya_sozlama_saqla_v1(ub, k1, true, -5, true);
  if r->>'code' = 'LIMIT_INVALID' then ok := ok + 1; else bad := bad || ' manfiy-limit'; end if;

  -- AI o'chiriladi → sarf tekshiruvi rad; boshqa kompaniya ta'sirlanmaydi
  r := t2_agent_kompaniya_sozlama_saqla_v1(ub, k1, false, null, true);
  if (r->>'ok')::boolean then ok := ok + 1; else bad := bad || ' boss-ochirdi'; end if;
  r := t2_agent_sarf_tekshir_v1(up, k1);
  if r->>'code' = 'KOMPANIYA_AI_OCHIQ' then ok := ok + 1; else bad := bad || ' ochiq-rad'; end if;
  insert into t2_token_harakat(kompaniya_id, miqdor, tur, operation_id) values (k2, 1000, 'toldirish', gen_random_uuid());
  r := t2_agent_sarf_tekshir_v1(uo, k2);
  if (r->>'ok')::boolean then ok := ok + 1; else bad := bad || ' boshqa-kompaniya-ochiq'; end if;

  -- qayta yoqish + oylik token limiti: sarf limitga yetsa to'xtaydi
  perform t2_agent_kompaniya_sozlama_saqla_v1(ub, k1, true, 500, false);
  r := t2_agent_sarf_tekshir_v1(up, k1);
  if (r->>'ok')::boolean then ok := ok + 1; else bad := bad || ' qayta-yoqildi'; end if;
  perform t2_agent_sarf_yoz_v1(up, k1, 'pto_smeta', 'savol', 'vendor/m', 1, 1, 5, true);   -- 889 token
  r := t2_agent_sarf_tekshir_v1(up, k1);
  if r->>'code' = 'TOKEN_LIMIT_TUGADI' then ok := ok + 1; else bad := bad || ' token-limit'; end if;
  r := t2_agent_kompaniya_sozlama_v1(ub, k1);
  if (r->>'oy_token')::numeric = 889 and (r->>'oylik_token_limit')::numeric = 500 and not (r->>'kuzatuv_ruxsat')::boolean and (r->>'tahrir_mumkin')::boolean then ok := ok + 1; else bad := bad || ' korinish'; end if;
  perform t2_agent_kompaniya_sozlama_saqla_v1(ub, k1, true, null, true);
  r := t2_agent_sarf_tekshir_v1(up, k1);
  if (r->>'ok')::boolean then ok := ok + 1; else bad := bad || ' limit-olib-tashlandi'; end if;
  if exists (select 1 from t2_audit_log where kompaniya_id = k1 and amal_turi = 'ai_sozlama_ozgardi') then ok := ok + 1; else bad := bad || ' audit'; end if;

  raise exception 'KOMPANIYA_SOZLAMA_TEST ok=% / 13 bad=[%]', ok, bad;
end $t$;
