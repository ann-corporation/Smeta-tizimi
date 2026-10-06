-- t2_agent_kasb_contract: har lavozim faqat o'z toifalarini ko'radi; harakat takliflari (rol, qiymat, obyekt egaligi, xavf, ishonch darajasi); jurnal. Rollback.
do $t$
declare
  k1 bigint; k2 bigint; ob1 bigint; ob2 bigint; gq bigint;
  ub bigint; up bigint; usk bigint; ubu bigint; uo bigint; uus bigint;
  r jsonb; ok int := 0; bad text := ''; hid bigint; jid bigint; txt text;
begin
  insert into t2_kompaniya(kod, nom, faol) values ('KSB' || floor(random()*1e9)::text, 'Kasb Test A', true) returning id into k1;
  insert into t2_kompaniya(kod, nom, faol) values ('KSC' || floor(random()*1e9)::text, 'Kasb Test B', true) returning id into k2;
  insert into t2_foydalanuvchi(login) values ('kb_boss_' || k1) returning id into ub;
  insert into t2_foydalanuvchi(login) values ('kb_prorab_' || k1) returning id into up;
  insert into t2_foydalanuvchi(login) values ('kb_sklad_' || k1) returning id into usk;
  insert into t2_foydalanuvchi(login) values ('kb_bugalter_' || k1) returning id into ubu;
  insert into t2_foydalanuvchi(login) values ('kb_begona_' || k1) returning id into uo;
  insert into t2_foydalanuvchi(login) values ('kb_usta_' || k1) returning id into uus;
  insert into t2_azolik(kompaniya_id, foydalanuvchi_id, rol, holat) values (k1, ub, 'boss', 'faol'), (k1, up, 'prorab', 'faol'), (k1, usk, 'skladchi', 'faol'), (k1, ubu, 'bugalter', 'faol'), (k1, uus, 'usta', 'faol'), (k2, uo, 'boss', 'faol');
  insert into t2_obyekt(kompaniya_id, nom) values (k1, 'Test obyekt A') returning id into ob1;
  insert into t2_obyekt(kompaniya_id, nom) values (k2, 'Test obyekt B') returning id into ob2;
  insert into t2_sklad_harakat(kompaniya_id, obyekt_id, operatsiya, turi, sana, nomi, birligi, obyomi) values (k1, ob1, 'prixod', 'material', current_date, 'Sement M400', 'tonna', 10);
  insert into t2_grafik_qator(kompaniya_id, obyekt_id, nom, boshlanish_sana, tugash_sana, foiz) values (k1, ob1, 'Poydevor', current_date - 20, current_date - 2, 40) returning id into gq;
  insert into t2_xarajat(kompaniya_id, sana, toifa, summa) values (k1, current_date, 'material', 5000000);

  -- 1) kasb xaritasi
  r := t2_agent_kasb_v1(up, k1);
  if r->>'profil' = 'prorab' and r->>'nom' = 'Prorab yordamchisi' and jsonb_array_length(r->'boshqalar') >= 5 then ok := ok + 1; else bad := bad || ' kasb-prorab'; end if;
  r := t2_agent_kasb_v1(usk, k1);
  if r->>'profil' = 'warehouse' then ok := ok + 1; else bad := bad || ' kasb-skladchi'; end if;
  r := t2_agent_kasb_v1(uo, k1);
  if r->>'code' = 'COMPANY_ACCESS_DENIED' then ok := ok + 1; else bad := bad || ' kasb-begona'; end if;

  -- 2) FAKT izolyatsiyasi: ruxsatsiz toifada ma'lumot YO'Q (kalit ham yo'q)
  r := t2_agent_fakt_v1(up, k1, array['obyektlar','hajm','grafik','ombor','moliya','kadr','smeta_pul','f2_fakt_pul'], null);
  txt := r::text;
  if (r->'taqiqlangan') @> '["moliya","kadr","smeta_pul","f2_fakt_pul"]'::jsonb and position('_som' in txt) = 0 and position('tolov' in txt) = 0 and position('xarajat' in txt) = 0 then ok := ok + 1; else bad := bad || ' prorab-pul-yopiq'; end if;
  if position('Sement M400' in txt) > 0 and position('Poydevor' in txt) > 0 then ok := ok + 1; else bad := bad || ' prorab-ombor-grafik'; end if;
  r := t2_agent_fakt_v1(usk, k1, array['obyektlar','ombor','grafik','moliya','smeta_pul'], null);
  txt := r::text;
  if position('Sement M400' in txt) > 0 and position('Poydevor' in txt) = 0 and position('_som' in txt) = 0 then ok := ok + 1; else bad := bad || ' skladchi-chegara'; end if;
  r := t2_agent_fakt_v1(ubu, k1, array['obyektlar','moliya','ombor','grafik','smeta_pul'], null);
  txt := r::text;
  if position('xarajat_jami_som' in txt) > 0 and position('5000000' in txt) > 0 and position('Sement M400' in txt) = 0 and position('Poydevor' in txt) = 0 then ok := ok + 1; else bad := bad || ' bugalter-chegara'; end if;
  r := t2_agent_fakt_v1(ub, k1, array['moliya','ombor','grafik'], null);
  txt := r::text;
  if position('5000000' in txt) > 0 and position('Sement M400' in txt) > 0 and position('"kechikkan": true' in txt) > 0 then ok := ok + 1; else bad := bad || ' boss-hammasi'; end if;
  r := t2_agent_fakt_v1(ub, k1, array['obyektlar'], ob2);
  if r->>'code' = 'OBYEKT_BEGONA' then ok := ok + 1; else bad := bad || ' begona-obyekt'; end if;
  r := t2_agent_fakt_v1(uo, k1, array['obyektlar'], null);
  if r->>'code' = 'COMPANY_ACCESS_DENIED' then ok := ok + 1; else bad := bad || ' begona-kompaniya'; end if;

  -- 3) jurnal: o'zi ko'radi; boshqa a'zo ko'rmaydi; boss hamma ko'radi
  r := t2_agent_jurnal_yoz_v1(up, k1, gen_random_uuid(), 'prorab', 'prorab', 'savol', 'Omborda nima bor?', 'Sement 10 t', '[{"matn":"qadam"}]'::jsonb, array['obyektlar','ombor'], 'm/x', 100, 20, 900, false);
  jid := (r->>'id')::bigint;
  if (r->>'ok')::boolean then ok := ok + 1; else bad := bad || ' jurnal-yoz'; end if;
  r := t2_agent_jurnal_royxat_v1(up, k1, false, 30);
  if jsonb_array_length(r->'natija') = 1 then ok := ok + 1; else bad := bad || ' jurnal-oz'; end if;
  r := t2_agent_jurnal_royxat_v1(usk, k1, true, 30);
  if jsonb_array_length(r->'natija') = 0 and not (r->>'hamma')::boolean then ok := ok + 1; else bad := bad || ' jurnal-boshqa-korolmaydi'; end if;
  r := t2_agent_jurnal_royxat_v1(ub, k1, true, 30);
  if jsonb_array_length(r->'natija') = 1 and (r->>'hamma')::boolean and position('kb_prorab_' in r::text) > 0 then ok := ok + 1; else bad := bad || ' jurnal-boss-hamma'; end if;

  -- 4) harakat: rol cheklovi
  r := t2_agent_harakat_taklif_v1(ubu, k1, null, 'ombor_kirim', jsonb_build_object('obyekt_id', ob1, 'nomi', 'Sement', 'birligi', 'tonna', 'obyomi', 5), 'x', true);
  if r->>'code' = 'HARAKAT_RUXSATSIZ' then ok := ok + 1; else bad := bad || ' bugalter-ombor-rad'; end if;
  r := t2_agent_harakat_taklif_v1(uus, k1, null, 'ombor_kirim', jsonb_build_object('obyekt_id', ob1, 'nomi', 'Sement', 'birligi', 'tonna', 'obyomi', 5), 'x', true);
  if r->>'code' = 'HARAKAT_RUXSATSIZ' then ok := ok + 1; else bad := bad || ' usta-kirim-rad'; end if;
  -- begona obyekt va noto'g'ri qiymatlar
  r := t2_agent_harakat_taklif_v1(up, k1, null, 'ombor_kirim', jsonb_build_object('obyekt_id', ob2, 'nomi', 'Sement', 'birligi', 'tonna', 'obyomi', 5), 'x', true);
  if r->>'code' = 'OBYEKT_BEGONA' then ok := ok + 1; else bad := bad || ' begona-obyekt-harakat'; end if;
  r := t2_agent_harakat_taklif_v1(up, k1, null, 'ombor_kirim', jsonb_build_object('obyekt_id', ob1, 'nomi', 'Sement', 'birligi', 'tonna', 'obyomi', -5), 'x', true);
  if r->>'code' = 'PARAM_INVALID' then ok := ok + 1; else bad := bad || ' manfiy-miqdor'; end if;
  r := t2_agent_harakat_taklif_v1(up, k1, null, 'ombor_kirim', jsonb_build_object('obyekt_id', ob1, 'nomi', 'Sement', 'birligi', 'tonna', 'obyomi', 5, 'sana', (current_date - 400)::text), 'x', true);
  if r->>'code' = 'PARAM_INVALID' then ok := ok + 1; else bad := bad || ' eski-sana'; end if;
  r := t2_agent_harakat_taklif_v1(up, k1, 999999999, 'eslatma', jsonb_build_object('kalit', 'abc', 'mazmun', 'x'), 'x', true);
  if r->>'code' = 'JURNAL_BEGONA' then ok := ok + 1; else bad := bad || ' jurnal-begona'; end if;

  -- 5) xavf va ishonch: standart 'jiddiy' — omborga yozish tasdiq so'raydi; eslatma avto
  r := t2_agent_harakat_taklif_v1(up, k1, jid, 'ombor_kirim', jsonb_build_object('obyekt_id', ob1, 'nomi', 'Sement M400', 'birligi', 'tonna', 'obyomi', 5), 'Sement keldi', true);
  hid := (r->>'id')::bigint;
  if (r->>'ok')::boolean and r->>'xavf' = 'orta' and not (r->>'avto')::boolean then ok := ok + 1; else bad := bad || ' orta-tasdiq-sorash'; end if;
  r := t2_agent_harakat_taklif_v1(up, k1, jid, 'eslatma', jsonb_build_object('kalit', 'ombor.eslatma', 'mazmun', 'Sement kam qoladi'), 'Eslab qolaman', true);
  if r->>'xavf' = 'past' and (r->>'avto')::boolean then ok := ok + 1; else bad := bad || ' past-avto'; end if;
  -- chiqim qoldiqdan ko'p → YUQORI xavf, hech qachon avto (ishonch=avto bo'lsa ham)
  perform t2_agent_shaxsiy_saqla_v1(up, 'auto', 'qisqa', 'avto');
  r := t2_agent_harakat_taklif_v1(up, k1, jid, 'ombor_chiqim', jsonb_build_object('obyekt_id', ob1, 'nomi', 'Sement M400', 'birligi', 'tonna', 'obyomi', 50), 'Chiqim', true);
  if r->>'xavf' = 'yuqori' and not (r->>'avto')::boolean and position('manfiy' in coalesce(r->>'ogohlantirish', '')) > 0 then ok := ok + 1; else bad := bad || ' yuqori-hech-qachon-avto'; end if;
  -- ishonch=avto: o'rta xavf + aniq so'rov → avto; aniq emas → avto emas
  r := t2_agent_harakat_taklif_v1(up, k1, jid, 'ombor_chiqim', jsonb_build_object('obyekt_id', ob1, 'nomi', 'Sement M400', 'birligi', 'tonna', 'obyomi', 2), 'Chiqim', true);
  if r->>'xavf' = 'orta' and (r->>'avto')::boolean then ok := ok + 1; else bad := bad || ' avto-orta'; end if;
  r := t2_agent_harakat_taklif_v1(up, k1, jid, 'ombor_chiqim', jsonb_build_object('obyekt_id', ob1, 'nomi', 'Sement M400', 'birligi', 'tonna', 'obyomi', 2), 'Chiqim', false);
  if not (r->>'avto')::boolean then ok := ok + 1; else bad := bad || ' noaniq-avto-emas'; end if;
  -- ishonch=sora: hech narsa avto emas (eslatma ham)
  perform t2_agent_shaxsiy_saqla_v1(up, 'auto', 'qisqa', 'sora');
  r := t2_agent_harakat_taklif_v1(up, k1, jid, 'eslatma', jsonb_build_object('kalit', 'ombor.eslatma2', 'mazmun', 'x'), 'x', true);
  if not (r->>'avto')::boolean then ok := ok + 1; else bad := bad || ' sora-avto-yoq'; end if;
  r := t2_agent_shaxsiy_saqla_v1(up, 'xx', 'qisqa', 'sora');
  if r->>'code' = 'SOZLAMA_INVALID' then ok := ok + 1; else bad := bad || ' sozlama-invalid'; end if;

  -- 6) grafik: versiya/eski foiz serverdan (modelga ishonilmaydi); foizni kamaytirish ogohlantiradi
  r := t2_agent_harakat_taklif_v1(up, k1, jid, 'grafik_foiz', jsonb_build_object('grafik_id', gq, 'foiz', 70, 'kutilgan_versiya', 999), 'Foiz', true);
  if (r->'parametrlar'->>'eski_foiz')::numeric = 40 and (r->'parametrlar'->>'kutilgan_versiya')::int = (select versiya from t2_grafik_qator where id = gq) then ok := ok + 1; else bad := bad || ' grafik-serverdan'; end if;
  r := t2_agent_harakat_taklif_v1(up, k1, jid, 'grafik_foiz', jsonb_build_object('grafik_id', gq, 'foiz', 20), 'Foiz', true);
  if r->>'ogohlantirish' is not null and not (r->>'avto')::boolean then ok := ok + 1; else bad := bad || ' grafik-kamaytirish'; end if;
  r := t2_agent_harakat_taklif_v1(up, k1, jid, 'grafik_foiz', jsonb_build_object('grafik_id', gq, 'foiz', 150), 'Foiz', true);
  if r->>'code' = 'PARAM_INVALID' then ok := ok + 1; else bad := bad || ' grafik-150'; end if;

  -- 7) qaror/natija oqimi: faqat egasi; ikki marta qaror yo'q; tasdiqsiz natija yo'q
  r := t2_agent_harakat_qaror_v1(usk, hid, 'tasdiqlash');
  if r->>'code' = 'TOPILMADI' then ok := ok + 1; else bad := bad || ' boshqa-qaror-rad'; end if;
  r := t2_agent_harakat_natija_v1(up, hid, true, '{}');
  if r->>'code' = 'TASDIQSIZ' then ok := ok + 1; else bad := bad || ' tasdiqsiz-natija'; end if;
  r := t2_agent_harakat_qaror_v1(up, hid, 'tasdiqlash');
  if (r->>'ok')::boolean and r->>'holat' = 'tasdiqlandi' then ok := ok + 1; else bad := bad || ' tasdiq'; end if;
  r := t2_agent_harakat_qaror_v1(up, hid, 'rad');
  if r->>'code' = 'ALLAQACHON_KORIB_CHIQILGAN' then ok := ok + 1; else bad := bad || ' ikki-qaror'; end if;
  r := t2_agent_harakat_natija_v1(up, hid, true, '{"id": 1}');
  if (r->>'ok')::boolean then ok := ok + 1; else bad := bad || ' natija'; end if;
  r := t2_agent_harakat_royxat_v1(up, k1, 30);
  if exists (select 1 from jsonb_array_elements(r->'natija') e where (e->>'id')::bigint = hid and e->>'holat' = 'bajarildi') then ok := ok + 1; else bad := bad || ' royxat'; end if;
  r := t2_agent_harakat_royxat_v1(usk, k1, 30);
  if jsonb_array_length(r->'natija') = 0 then ok := ok + 1; else bad := bad || ' royxat-boshqa'; end if;

  raise exception 'KASB_TEST ok=% / 38 bad=[%]', ok, bad;
end $t$;
