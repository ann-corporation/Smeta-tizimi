-- t2_agent_hisob_ustama_contract: provayder sarfi $5 → mijoz $7 (ustama 40%) → token yechiladi; ustama kompaniyaga alohida; kompaniya tannarxni ko'rmaydi. Rollback.
do $t$
declare k1 bigint; k2 bigint; ks bigint; ub bigint; uo bigint; us bigint; r jsonb; ok int := 0; bad text := ''; s public.t2_token_sozlama%rowtype; kutil numeric; bal0 numeric; bal1 numeric;
begin
  select * into s from t2_token_sozlama where id = 1;
  delete from t2_agent_byudjet where kompaniya_id is null;
  insert into t2_kompaniya(kod, nom, faol) values ('HUA' || floor(random()*1e9)::text, 'Hisob A', true) returning id into k1;
  insert into t2_kompaniya(kod, nom, faol) values ('HUB' || floor(random()*1e9)::text, 'Hisob B', true) returning id into k2;
  insert into t2_kompaniya(kod, nom, faol) values ('HUS' || floor(random()*1e9)::text, 'Hisob S', true) returning id into ks;
  insert into t2_foydalanuvchi(login) values ('hu_b_' || k1) returning id into ub;
  insert into t2_foydalanuvchi(login) values ('hu_o_' || k1) returning id into uo;
  insert into t2_foydalanuvchi(login) values ('hu_s_' || k1) returning id into us;
  insert into t2_azolik(kompaniya_id, foydalanuvchi_id, rol, holat) values (k1, ub, 'boss', 'faol'), (k2, uo, 'boss', 'faol'), (ks, us, 'superadmin', 'faol');
  perform t2_agent_byudjet_belgila_v1(us, null, 1000, 80, true);
  update t2_token_sozlama set ai_ustama_foiz = 40, usd_kurs = 12700, token_som = 100 where id = 1;

  -- hamyon bo'sh → AI yo'q
  r := t2_agent_sarf_tekshir_v1(ub, k1);
  if r->>'code' = 'TOKEN_YETMAYDI' then ok := ok + 1; else bad := bad || ' bosh-hamyon'; end if;
  insert into t2_token_harakat(kompaniya_id, miqdor, tur, amal, operation_id) values (k1, 100000, 'toldirish', null, gen_random_uuid());
  r := t2_agent_sarf_tekshir_v1(ub, k1);
  if (r->>'ok')::boolean then ok := ok + 1; else bad := bad || ' hamyon-bor'; end if;

  -- ASOSIY: provayder $5 → mijoz $7.00; 7 * 12700 / 100 = 889 token
  bal0 := t2_token_balans(k1);
  r := t2_agent_sarf_yoz_v1(ub, k1, 'pto_smeta', 'savol', 'vendor/m', 1000, 500, 5, true);
  if (r->>'mijoz_usd')::numeric = 7 then ok := ok + 1; else bad := bad || ' 5-dan-7'; end if;
  if (r->>'token')::numeric = 889 then ok := ok + 1; else bad := bad || ' token-889'; end if;
  bal1 := t2_token_balans(k1);
  if bal0 - bal1 = 889 then ok := ok + 1; else bad := bad || ' hamyondan-yechildi'; end if;
  if exists (select 1 from t2_token_harakat where kompaniya_id = k1 and tur = 'sarf' and amal = 'ai_sarf' and miqdor = -889 and (meta->>'tannarx_usd')::numeric = 5 and (meta->>'ustama_foiz')::numeric = 40) then ok := ok + 1; else bad := bad || ' harakat-meta'; end if;

  -- kompaniyaga alohida ustama (25%): $4 → $5.00
  r := t2_agent_ustama_belgila_v1(ub, k1, 25);
  if r->>'code' = 'GLOBAL_SCOPE_DENIED' then ok := ok + 1; else bad := bad || ' ustama-oddiy'; end if;
  r := t2_agent_ustama_belgila_v1(us, k1, 25);
  if (r->>'ok')::boolean then ok := ok + 1; else bad := bad || ' ustama-kompaniya'; end if;
  r := t2_agent_sarf_yoz_v1(ub, k1, 'pto_smeta', 'savol', 'vendor/m', 1, 1, 4, true);
  if (r->>'mijoz_usd')::numeric = 5 then ok := ok + 1; else bad := bad || ' 4-dan-5'; end if;
  -- boshqa kompaniya platforma standarti (40%) bo'yicha
  insert into t2_token_harakat(kompaniya_id, miqdor, tur, amal, operation_id) values (k2, 100000, 'toldirish', null, gen_random_uuid());
  r := t2_agent_sarf_yoz_v1(uo, k2, 'pto_smeta', 'savol', 'vendor/m', 1, 1, 5, true);
  if (r->>'mijoz_usd')::numeric = 7 then ok := ok + 1; else bad := bad || ' standart-ustama'; end if;
  -- platforma standartini o'zgartirish va kompaniya ustamasini olib tashlash
  perform t2_agent_ustama_belgila_v1(us, null, 100);
  perform t2_agent_ustama_belgila_v1(us, k1, null);
  r := t2_agent_sarf_yoz_v1(ub, k1, 'pto_smeta', 'savol', 'vendor/m', 1, 1, 5, true);
  if (r->>'mijoz_usd')::numeric = 10 then ok := ok + 1; else bad := bad || ' standart-100'; end if;
  r := t2_agent_ustama_belgila_v1(us, null, -1);
  if r->>'code' = 'USTAMA_INVALID' then ok := ok + 1; else bad := bad || ' manfiy-ustama'; end if;

  -- narxi noma'lum chaqiruv: token yechilmaydi (narxsiz)
  bal0 := t2_token_balans(k2);
  r := t2_agent_sarf_yoz_v1(uo, k2, 'pto_smeta', 'savol', 'vendor/yoq', 10, 10, null, true);
  if r->'token' = 'null'::jsonb and t2_token_balans(k2) = bal0 then ok := ok + 1; else bad := bad || ' narxsiz-yechilmaydi'; end if;
  -- tizim chaqiruvi (kompaniyasiz): token yechilmaydi, platforma sarfiga yoziladi
  r := t2_agent_sarf_yoz_v1(us, null, 'platform_orchestrator', 'rivojlanish', 'vendor/m', 10, 10, 2, true);
  if r->'token' = 'null'::jsonb and (r->>'narx_usd')::numeric = 2 then ok := ok + 1; else bad := bad || ' tizim-sarfi'; end if;

  -- kompaniya hisoboti: faqat TOKEN; tannarx/ustama/mijoz USD ko'rinmaydi
  r := t2_agent_sarf_hisobot_v1(ub, k1);
  if (r->>'ok')::boolean and (r->>'oy_token')::numeric = 889 + 635 + 1270 and position('tannarx' in r::text) = 0 and position('ustama' in r::text) = 0 and position('mijoz_usd' in r::text) = 0 and position('narx_usd' in r::text) = 0 then ok := ok + 1; else bad := bad || ' hisobot-yopiq ' || coalesce(r->>'oy_token', '?'); end if;
  r := t2_agent_sarf_hisobot_v1(uo, k1);
  if r->>'code' = 'COMPANY_ACCESS_DENIED' then ok := ok + 1; else bad := bad || ' hisobot-begona'; end if;

  -- markaz: tannarx, mijoz narxi va FOYDA (superadmin)
  r := t2_agent_markaz_v1(us);
  if (r->>'ok')::boolean and (r->>'mijoz_oy_usd')::numeric = 7 + 5 + 7 + 10 and (r->>'foyda_oy_usd')::numeric = (7 + 5 + 7 + 10) - (5 + 4 + 5 + 5) and (r->>'ustama_foiz')::numeric = 100 then ok := ok + 1; else bad := bad || ' markaz-foyda ' || coalesce(r->>'foyda_oy_usd', '?'); end if;
  r := t2_agent_markaz_v1(ub);
  if r->>'code' = 'GLOBAL_SCOPE_DENIED' then ok := ok + 1; else bad := bad || ' markaz-oddiy'; end if;

  raise exception 'HISOB_USTAMA_TEST ok=% / 18 bad=[%]', ok, bad;
end $t$;
