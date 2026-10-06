-- t2_agent_sarf_byudjet_contract: limit yo'q = AI yo'q (default-deny); platforma/kompaniya limiti; narx manbalari; izolyatsiya. Rollback (raise exception).
do $t$
declare k1 bigint; k2 bigint; ks bigint; ub bigint; uo bigint; us bigint; r jsonb; ok int := 0; bad text := ''; eski_pl public.t2_agent_byudjet%rowtype; bor boolean; n int;
begin
  -- mavjud platforma limitini saqlab, sinov uchun almashtiramiz (rollback hammasini qaytaradi)
  delete from t2_agent_byudjet where kompaniya_id is null;
  insert into t2_kompaniya(kod, nom, faol) values ('SBA' || floor(random()*1e9)::text, 'Sarf A', true) returning id into k1;
  insert into t2_kompaniya(kod, nom, faol) values ('SBB' || floor(random()*1e9)::text, 'Sarf B', true) returning id into k2;
  insert into t2_kompaniya(kod, nom, faol) values ('SBS' || floor(random()*1e9)::text, 'Sarf S', true) returning id into ks;
  insert into t2_foydalanuvchi(login) values ('sb_b_' || k1) returning id into ub;
  insert into t2_foydalanuvchi(login) values ('sb_o_' || k1) returning id into uo;
  insert into t2_foydalanuvchi(login) values ('sb_s_' || k1) returning id into us;
  insert into t2_azolik(kompaniya_id, foydalanuvchi_id, rol, holat) values (k1, ub, 'boss', 'faol'), (k2, uo, 'boss', 'faol'), (ks, us, 'superadmin', 'faol');
  -- kompaniya AI ishlatishi uchun hamyonida token bo'lishi shart (alohida: t2_agent_hisob_ustama_contract)
  insert into t2_token_harakat(kompaniya_id, miqdor, tur, operation_id) values (k1, 1000000, 'toldirish', gen_random_uuid()), (k2, 1000000, 'toldirish', gen_random_uuid());

  r := t2_agent_sarf_tekshir_v1(ub, k1);
  if r->>'code' = 'BYUDJET_YOQ' then ok := ok + 1; else bad := bad || ' default-deny'; end if;
  r := t2_agent_byudjet_belgila_v1(ub, null, 10, 80, true);
  if r->>'code' = 'GLOBAL_SCOPE_DENIED' then ok := ok + 1; else bad := bad || ' belgila-oddiy'; end if;
  r := t2_agent_byudjet_belgila_v1(us, null, -5, 80, true);
  if r->>'code' = 'BYUDJET_INVALID' then ok := ok + 1; else bad := bad || ' manfiy'; end if;
  r := t2_agent_byudjet_belgila_v1(us, null, 10, 80, true);
  if (r->>'ok')::boolean then ok := ok + 1; else bad := bad || ' platforma-belgila'; end if;
  r := t2_agent_sarf_tekshir_v1(ub, k1);
  if (r->>'ok')::boolean then ok := ok + 1; else bad := bad || ' limit-bor'; end if;
  r := t2_agent_sarf_tekshir_v1(uo, k1);
  if r->>'code' = 'COMPANY_ACCESS_DENIED' then ok := ok + 1; else bad := bad || ' begona-tekshir'; end if;

  -- narx manbalari: provayder > katalog > noma'lum
  perform t2_agent_model_katalog_yoz_v1(us, 'vendor/narxli', 'Narxli', null, null, false, true, 3, 15);
  perform t2_agent_model_katalog_yoz_v1(us, 'vendor/narxsiz', 'Narxsiz', null, null, false, true);
  r := t2_agent_sarf_yoz_v1(ub, k1, 'document_control', 'savol', 'vendor/narxli', 1000000, 1000000, 0.5, true);
  if r->>'manba' = 'provayder' and (r->>'narx_usd')::numeric = 0.5 then ok := ok + 1; else bad := bad || ' provayder-narx'; end if;
  r := t2_agent_sarf_yoz_v1(ub, k1, 'document_control', 'savol', 'vendor/narxli', 1000000, 1000000, null, true);
  if r->>'manba' = 'katalog' and (r->>'narx_usd')::numeric = 18 then ok := ok + 1; else bad := bad || ' katalog-narx'; end if;
  r := t2_agent_sarf_yoz_v1(ub, k1, 'document_control', 'savol', 'vendor/narxsiz', 500, 500, null, true);
  if r->>'manba' = 'hisob' and r->'narx_usd' = 'null'::jsonb then ok := ok + 1; else bad := bad || ' narxsiz'; end if;
  r := t2_agent_sarf_yoz_v1(uo, k1, 'x', 'savol', null, 1, 1, 1, true);
  if r->>'code' = 'COMPANY_ACCESS_DENIED' then ok := ok + 1; else bad := bad || ' begona-yoz'; end if;
  r := t2_agent_sarf_yoz_v1(ub, k1, 'x', 'BAD AMAL!', null, 1, 1, 1, true);
  if r->>'code' = 'AMAL_INVALID' then ok := ok + 1; else bad := bad || ' amal-invalid'; end if;

  -- sarf 18.5 > limit 10 → platforma limiti tugadi
  r := t2_agent_sarf_tekshir_v1(ub, k1);
  if r->>'code' = 'BYUDJET_TUGADI' and r->>'doira' = 'platforma' then ok := ok + 1; else bad := bad || ' platforma-tugadi'; end if;
  r := t2_agent_sarf_tekshir_v1(uo, k2);
  if r->>'code' = 'BYUDJET_TUGADI' then ok := ok + 1; else bad := bad || ' platforma-hammaga'; end if;

  -- limit oshirilsa qayta ochiladi; kompaniya limiti alohida
  perform t2_agent_byudjet_belgila_v1(us, null, 1000, 80, true);
  r := t2_agent_sarf_tekshir_v1(ub, k1);
  if (r->>'ok')::boolean then ok := ok + 1; else bad := bad || ' qayta-ochildi'; end if;
  perform t2_agent_byudjet_belgila_v1(us, k1, 5, 80, true);
  r := t2_agent_sarf_tekshir_v1(ub, k1);
  if r->>'code' = 'BYUDJET_TUGADI' and r->>'doira' = 'kompaniya' then ok := ok + 1; else bad := bad || ' kompaniya-tugadi'; end if;
  r := t2_agent_sarf_tekshir_v1(uo, k2);
  if (r->>'ok')::boolean then ok := ok + 1; else bad := bad || ' boshqa-kompaniya-ochiq'; end if;
  perform t2_agent_byudjet_belgila_v1(us, null, 1000, 80, false);
  r := t2_agent_sarf_tekshir_v1(uo, k2);
  if r->>'code' = 'BYUDJET_YOQ' then ok := ok + 1; else bad := bad || ' nofaol-limit'; end if;
  perform t2_agent_byudjet_belgila_v1(us, null, 1000, 80, true);

  -- hisobot: kompaniya faqat o'zinikini; markaz — faqat superadmin
  r := t2_agent_sarf_hisobot_v1(ub, k1);
  if (r->>'ok')::boolean and (r->>'oy_token')::numeric > 0 and position('limit_usd' in r::text) = 0 then ok := ok + 1; else bad := bad || ' hisobot'; end if;
  r := t2_agent_sarf_hisobot_v1(uo, k1);
  if r->>'code' = 'COMPANY_ACCESS_DENIED' then ok := ok + 1; else bad := bad || ' hisobot-begona'; end if;
  r := t2_agent_markaz_v1(ub);
  if r->>'code' = 'GLOBAL_SCOPE_DENIED' then ok := ok + 1; else bad := bad || ' markaz-oddiy'; end if;
  r := t2_agent_markaz_v1(us);
  if (r->>'ok')::boolean and (r->>'oy_sarfi_usd')::numeric = 18.5 and (r->'sonlar'->>'agent_soni')::int >= 1 and (r->>'limit_faol')::boolean and jsonb_array_length(r->'kompaniyalar') >= 1 then ok := ok + 1; else bad := bad || ' markaz'; end if;

  -- manba holati: faqat superadmin
  insert into t2_agent_manba(domen, nom) values ('sinov-manba.uz', 'Sinov');
  r := t2_agent_manba_holat_v1(ub, 'sinov-manba.uz', false);
  if r->>'code' = 'GLOBAL_SCOPE_DENIED' then ok := ok + 1; else bad := bad || ' manba-oddiy'; end if;
  r := t2_agent_manba_holat_v1(us, 'sinov-manba.uz', false);
  if (r->>'ok')::boolean and not (select faol from t2_agent_manba where domen = 'sinov-manba.uz') then ok := ok + 1; else bad := bad || ' manba-ochirish'; end if;

  raise exception 'SARF_BYUDJET_TEST ok=% / 23 bad=[%]', ok, bad;
end $t$;
