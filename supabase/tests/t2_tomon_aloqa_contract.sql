-- T2_TOMON_ALOQA — adversarial acceptance (rollback bilan). Natija: oxirgi exception matni "TOMON_TEST ..." ichida.
-- Ishga tushirish: Supabase SQL (execute_sql) — hech narsa saqlanmaydi.
do $$
declare
  p bigint; z bigint; x bigint;                       -- pudratchi, zakazchik, begona kompaniya
  up bigint; upto bigint; uz bigint; uzk bigint; ux bigint;
  o1 bigint; o2 bigint; xo bigint;                    -- pudratchi obyektlari (o1 — ochiladi, o2 — yopiq), begona obyekt
  akt bigint; akt2 bigint; al bigint; al2 bigint; tq bigint; tq2 bigint; gid bigint;
  r jsonb; v_kod text := repeat('a', 64); v_kod2 text := repeat('b', 64);
  rep text[] := array[]::text[]; xato text;
  procedure_dummy int;
begin
  -- ── tayyorgarlik ──
  insert into t2_kompaniya (nom, kod, inn, faol) values ('TEST_PUD', 'TST-P', '900000001', true) returning id into p;
  insert into t2_kompaniya (nom, kod, inn, faol) values ('TEST_ZAK', 'TST-Z', '900000002', true) returning id into z;
  insert into t2_kompaniya (nom, kod, inn, faol) values ('TEST_BEGONA', 'TST-X', '900000003', true) returning id into x;
  insert into t2_foydalanuvchi (login, ism, holat) values ('tst_up', 'P boss', 'faol') returning id into up;
  insert into t2_foydalanuvchi (login, ism, holat) values ('tst_upto', 'P pto', 'faol') returning id into upto;
  insert into t2_foydalanuvchi (login, ism, holat) values ('tst_uz', 'Z boss', 'faol') returning id into uz;
  insert into t2_foydalanuvchi (login, ism, holat) values ('tst_uzk', 'Z kuzatuvchi', 'faol') returning id into uzk;
  insert into t2_foydalanuvchi (login, ism, holat) values ('tst_ux', 'X boss', 'faol') returning id into ux;
  insert into t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values (up, p, 'boss', 'faol'), (upto, p, 'pto', 'faol'), (uz, z, 'boss', 'faol'), (uzk, z, 'kuzatuvchi', 'faol'), (ux, x, 'boss', 'faol');
  insert into t2_obyekt (nom, kompaniya_id) values ('P-obyekt-1', p) returning id into o1;
  insert into t2_obyekt (nom, kompaniya_id) values ('P-obyekt-2', p) returning id into o2;
  insert into t2_obyekt (nom, kompaniya_id) values ('X-obyekt', x) returning id into xo;
  insert into t2_akt (obyekt_id, kompaniya_id, tur, raqam, oy, hujjat_jami, holat, lifecycle_status) values (o1, p, 'f2', '1', date '2026-09-01', 1000, 'tasdiqlangan', 'approved') returning id into akt;
  insert into t2_akt (obyekt_id, kompaniya_id, tur, raqam, oy, hujjat_jami, holat, lifecycle_status) values (o1, p, 'f2', '2', date '2026-10-01', 500, 'qoralama', 'draft') returning id into akt2;

  -- ── 1. Handshake ──
  r := t2_tomon_kompaniya_qidir_v1(uz, z, '900000001');
  rep := rep || (case when (r->>'topildi')::boolean and (r->'kompaniya'->>'id')::bigint = p then 'OK   INN qidiruv topdi' else 'FAIL INN qidiruv' end);
  r := t2_tomon_taklif_v1(up, p, z, '900000002', null, 'pudratchi', 'zakazchik', 'shartnoma', 'Test aloqa', null, null, gen_random_uuid());
  al := (r->>'id')::bigint;
  rep := rep || (case when (r->>'ok')::boolean and r->>'holat' = 'taklif' then 'OK   taklif yuborildi' else 'FAIL taklif: ' || r::text end);
  -- taxminan ID bilan (INN mos emas) taklif yuborib bo'lmaydi
  r := t2_tomon_taklif_v1(up, p, x, '900000002', null, 'pudratchi', 'zakazchik', 'shartnoma', null, null, null, gen_random_uuid());
  rep := rep || (case when r->>'code' = 'INN_MOS_EMAS' then 'OK   ID taxmin qilib taklif — rad' else 'FAIL ID taxmin: ' || r::text end);
  -- Faol bo'lmagan aloqada grant/taqdim yo'q
  r := t2_tomon_grant_saqla_v1(up, p, al, jsonb_build_array(jsonb_build_object('resurs', 'obyekt_holat', 'amallar', jsonb_build_array('korish'), 'obyekt_id', o1)));
  rep := rep || (case when r->>'code' = 'HOLAT' then 'OK   javobsiz aloqada grant yo''q' else 'FAIL grant taklifda: ' || r::text end);
  -- Begona kompaniya taklifga javob bera olmaydi; kuzatuvchi (rol) ham
  r := t2_tomon_javob_v1(ux, x, al, 'qabul', null);
  rep := rep || (case when r->>'code' = 'TOPILMADI' then 'OK   begona javob bera olmaydi' else 'FAIL begona javob: ' || r::text end);
  begin perform t2_tomon_javob_v1(uzk, z, al, 'qabul', null); rep := rep || 'FAIL kuzatuvchi javob berdi';
  exception when others then rep := rep || (case when sqlstate = '42501' then 'OK   kuzatuvchi rol bilan javob — 42501' else 'FAIL kuzatuvchi: ' || sqlerrm end); end;
  -- a'zo bo'lmagan actor
  begin perform t2_tomon_javob_v1(ux, z, al, 'qabul', null); rep := rep || 'FAIL a''zo emas actor o''tdi';
  exception when others then rep := rep || (case when sqlstate = '42501' then 'OK   a''zo emas actor — 42501' else 'FAIL a''zo emas: ' || sqlerrm end); end;
  r := t2_tomon_javob_v1(uz, z, al, 'qabul', null);
  rep := rep || (case when r->>'holat' = 'faol' then 'OK   zakazchik qabul qildi -> faol' else 'FAIL qabul: ' || r::text end);
  r := t2_tomon_taklif_v1(up, p, z, '900000002', null, 'pudratchi', 'zakazchik', 'shartnoma', null, null, null, gen_random_uuid());
  rep := rep || (case when r->>'code' = 'ALLAQACHON' then 'OK   dublikat aloqa — rad' else 'FAIL dublikat: ' || r::text end);

  -- ── 2. DENY-BY-DEFAULT ──
  r := t2_zakazchik_obyektlar_v1(uz, z);
  rep := rep || (case when jsonb_array_length(r) = 0 then 'OK   grantsiz zakazchik hech narsa ko''rmaydi' else 'FAIL grantsiz ko''rinish: ' || r::text end);
  rep := rep || (case when not t2_tomon_ruxsat_bor(z, p, 'obyekt_holat', 'korish', o1) then 'OK   ruxsat_bor=false (grantsiz)' else 'FAIL ruxsat_bor grantsiz' end);

  -- ── 3. Grant: doira beruvchiniki bo'lishi shart ──
  r := t2_tomon_grant_saqla_v1(up, p, al, jsonb_build_array(jsonb_build_object('resurs', 'obyekt_holat', 'amallar', jsonb_build_array('korish'), 'obyekt_id', xo)));
  rep := rep || (case when r->>'code' = 'DOIRA_BEGONA' then 'OK   begona obyektga grant — rad' else 'FAIL begona obyekt grant: ' || r::text end);
  r := t2_tomon_grant_saqla_v1(up, p, al, jsonb_build_array(jsonb_build_object('resurs', 'f2', 'amallar', jsonb_build_array('qaror'), 'obyekt_id', o1)));
  rep := rep || (case when r->>'code' = 'AMAL_NOTOGRI' then 'OK   resursga mos bo''lmagan amal — rad' else 'FAIL amal: ' || r::text end);
  r := t2_tomon_grant_saqla_v1(up, p, al, jsonb_build_array(jsonb_build_object('resurs', 'aosr', 'amallar', jsonb_build_array('korish'), 'obyekt_id', o1)));
  rep := rep || (case when r->>'code' = 'RESURS_YOQ' then 'OK   hali ochilmagan resurs (aosr) — rad' else 'FAIL aosr: ' || r::text end);
  -- Zakazchik P ning obyektini o'z nomidan ocha olmaydi (doira — beruvchiniki)
  r := t2_tomon_grant_saqla_v1(uz, z, al, jsonb_build_array(jsonb_build_object('resurs', 'obyekt_holat', 'amallar', jsonb_build_array('korish'), 'obyekt_id', o1)));
  rep := rep || (case when r->>'code' = 'DOIRA_BEGONA' then 'OK   zakazchik pudratchi obyektini o''zi ocha olmaydi' else 'FAIL zakazchik grant: ' || r::text end);

  r := t2_tomon_grant_saqla_v1(up, p, al, jsonb_build_array(
        jsonb_build_object('resurs', 'obyekt_holat', 'amallar', jsonb_build_array('korish'), 'obyekt_id', o1),
        jsonb_build_object('resurs', 'f2', 'amallar', jsonb_build_array('korish'), 'obyekt_id', o1)));
  rep := rep || (case when (r->>'saqlandi')::int = 2 then 'OK   pudratchi 2 ta grant berdi' else 'FAIL grant: ' || r::text end);
  r := t2_zakazchik_obyektlar_v1(uz, z);
  rep := rep || (case when jsonb_array_length(r) = 1 and (r->0->>'obyekt_id')::bigint = o1 then 'OK   faqat granted obyekt ko''rinadi (o2 yopiq)' else 'FAIL monitoring: ' || r::text end);
  rep := rep || (case when (r->0->'f2'->>'soni')::int = 1 and (r->0->'f2'->>'jami')::numeric = 1000 then 'OK   faqat tasdiqlangan F2 (qoralama hisobda yo''q)' else 'FAIL f2 jami: ' || coalesce(r->0->>'f2', 'null') end);
  rep := rep || (case when r->0->>'shartnoma' is null then 'OK   shartnoma xulosasi grantsiz yashirin' else 'FAIL shartnoma sizdi' end);
  rep := rep || (case when t2_tomon_ruxsat_bor(z, p, 'f2', 'tafsilot', o1) = false then 'OK   f2 tafsilot (berilmagan amal) yo''q' else 'FAIL tafsilot' end);
  rep := rep || (case when t2_tomon_ruxsat_bor(x, p, 'obyekt_holat', 'korish', o1) = false then 'OK   begona kompaniya ruxsat_bor=false' else 'FAIL begona ruxsat' end);
  begin perform t2_zakazchik_obyektlar_v1(ux, z); rep := rep || 'FAIL boshqa kompaniya nomidan o''qish';
  exception when others then rep := rep || (case when sqlstate = '42501' then 'OK   boshqa kompaniya nomidan o''qish — 42501' else 'FAIL: ' || sqlerrm end); end;

  -- ── 4. Taqdim ──
  r := t2_tomon_taqdim_yarat_v1(up, p, al, 'f2', akt2, null, gen_random_uuid());
  rep := rep || (case when r->>'code' = 'TASDIQLANMAGAN' then 'OK   qoralama F2 yuborilmaydi' else 'FAIL qoralama taqdim: ' || r::text end);
  r := t2_tomon_taqdim_yarat_v1(uz, z, al, 'f2', akt, null, gen_random_uuid());
  rep := rep || (case when r->>'code' = 'HUJJAT_YOQ' then 'OK   zakazchik pudratchi hujjatini "yubora" olmaydi' else 'FAIL zakazchik taqdim: ' || r::text end);
  r := t2_tomon_taqdim_yarat_v1(up, p, al, 'f2', akt, 'Sentabr F2', gen_random_uuid());
  tq := (r->>'id')::bigint;
  rep := rep || (case when (r->>'ok')::boolean and r->>'holat' = 'yuborilgan' then 'OK   tasdiqlangan F2 yuborildi' else 'FAIL taqdim: ' || r::text end);
  r := t2_tomon_taqdim_yarat_v1(up, p, al, 'f2', akt, null, gen_random_uuid());
  rep := rep || (case when r->>'code' = 'ALLAQACHON' then 'OK   ochiq taqdim ikki marta yuborilmaydi' else 'FAIL takror taqdim: ' || r::text end);
  r := t2_tomon_taqdim_tafsilot_v1(ux, x, tq);
  rep := rep || (case when r->>'code' = 'TOPILMADI' then 'OK   uchinchi kompaniya taqdimni ko''rmaydi' else 'FAIL uchinchi tafsilot: ' || r::text end);
  r := t2_tomon_taqdim_tafsilot_v1(uz, z, tq);
  rep := rep || (case when (r->>'ok')::boolean and (r->>'butunlik_ok')::boolean then 'OK   zakazchik taqdimni ko''rdi, butunlik OK' else 'FAIL zakazchik tafsilot: ' || r::text end);
  r := t2_tomon_qaror_v1(up, p, tq, 'qabul', null);
  rep := rep || (case when r->>'code' = 'TOPILMADI' then 'OK   pudratchi o''z taqdimiga qaror chiqara olmaydi' else 'FAIL o''z qarori: ' || r::text end);
  begin perform t2_tomon_qaror_v1(uzk, z, tq, 'qabul', null); rep := rep || 'FAIL kuzatuvchi qaror chiqardi';
  exception when others then rep := rep || (case when sqlstate = '42501' then 'OK   kuzatuvchi qaror chiqara olmaydi' else 'FAIL kuzatuvchi qaror: ' || sqlerrm end); end;
  r := t2_tomon_qaror_v1(uz, z, tq, 'rad', null);
  rep := rep || (case when r->>'code' = 'IZOH_KERAK' then 'OK   izohsiz rad etib bo''lmaydi' else 'FAIL izohsiz rad: ' || r::text end);
  r := t2_tomon_qaror_v1(uz, z, tq, 'tuzatish', 'Qator 12 narxi noto''g''ri');
  rep := rep || (case when r->>'holat' = 'tuzatish' then 'OK   tuzatish so''raldi' else 'FAIL tuzatish: ' || r::text end);
  r := t2_tomon_qaror_v1(uz, z, tq, 'qabul', null);
  rep := rep || (case when r->>'code' = 'HOLAT' then 'OK   qaror chiqarilgach o''zgarmaydi' else 'FAIL qayta qaror: ' || r::text end);
  r := t2_tomon_taqdim_yarat_v1(up, p, al, 'f2', akt, 'Tuzatilgan', gen_random_uuid());
  tq2 := (r->>'id')::bigint;
  rep := rep || (case when (r->>'ok')::boolean and exists (select 1 from t2_tomon_taqdim where id = tq2 and oldingi_taqdim_id = tq) then 'OK   qayta yuborish oldingi taqdimga bog''landi' else 'FAIL qayta yuborish: ' || r::text end);
  r := t2_tomon_qaror_v1(uz, z, tq2, 'qabul', 'Rahmat');
  rep := rep || (case when r->>'holat' = 'qabul' then 'OK   zakazchik qabul qildi' else 'FAIL qabul: ' || r::text end);

  -- ── 5. O'zgarmas jurnal ──
  begin update t2_tomon_hodisa set matn = 'x' where taqdim_id = tq2; rep := rep || 'FAIL hodisa o''zgartirildi';
  exception when others then rep := rep || (case when sqlstate = '42501' then 'OK   hodisalar jurnali o''zgarmas' else 'FAIL jurnal: ' || sqlerrm end); end;
  begin delete from t2_tomon_hodisa where taqdim_id = tq2; rep := rep || 'FAIL hodisa o''chirildi';
  exception when others then rep := rep || (case when sqlstate = '42501' then 'OK   hodisalarni o''chirib bo''lmaydi' else 'FAIL jurnal del: ' || sqlerrm end); end;

  -- ── 6. Izoh ──
  r := t2_tomon_izoh_v1(uz, z, null, tq2, 'Hammasi joyida');
  rep := rep || (case when (r->>'ok')::boolean then 'OK   izoh yozildi' else 'FAIL izoh: ' || r::text end);
  r := t2_tomon_izoh_v1(ux, x, null, tq2, 'Men begonaman');
  rep := rep || (case when r->>'code' = 'TOPILMADI' then 'OK   begona izoh yoza olmaydi' else 'FAIL begona izoh: ' || r::text end);

  -- ── 7. Taklif kodi oqimi (tizimda yo'q tomon) ──
  r := t2_tomon_taklif_v1(up, p, null, null, 'Yangi MCHJ', 'pudratchi', 'texnadzor', 'nazorat', null, null, v_kod, gen_random_uuid());
  al2 := (r->>'id')::bigint;
  rep := rep || (case when (r->>'ok')::boolean and (r->>'kod_kerak')::boolean then 'OK   kodli taklif yaratildi' else 'FAIL kodli taklif: ' || r::text end);
  r := t2_tomon_kod_qabul_v1(ux, x, v_kod2);
  rep := rep || (case when r->>'code' = 'KOD_NOTOGRI' then 'OK   noto''g''ri kod — rad' else 'FAIL noto''g''ri kod: ' || r::text end);
  r := t2_tomon_kod_qabul_v1(up, p, v_kod);
  rep := rep || (case when r->>'code' = 'KOD_NOTOGRI' then 'OK   taklif qilgan o''z kodini qabul qila olmaydi' else 'FAIL o''z kodi: ' || r::text end);
  r := t2_tomon_kod_qabul_v1(ux, x, v_kod);
  rep := rep || (case when r->>'holat' = 'faol' then 'OK   to''g''ri kod — faol' else 'FAIL to''g''ri kod: ' || r::text end);
  r := t2_tomon_kod_qabul_v1(uz, z, v_kod);
  rep := rep || (case when r->>'code' = 'KOD_NOTOGRI' then 'OK   kod bir martalik' else 'FAIL kod qayta: ' || r::text end);

  -- ── 8. Yopish — grantlar qaytariladi ──
  r := t2_tomon_holat_v1(uz, z, al, 'yopish', null);
  rep := rep || (case when r->>'code' = 'SABAB_KERAK' then 'OK   sababsiz yopib bo''lmaydi' else 'FAIL sababsiz yopish: ' || r::text end);
  r := t2_tomon_holat_v1(uz, z, al, 'toxtatish', null);
  rep := rep || (case when r->>'holat' = 'toxtatilgan' then 'OK   to''xtatildi' else 'FAIL toxtatish: ' || r::text end);
  r := t2_zakazchik_obyektlar_v1(uz, z);
  rep := rep || (case when jsonb_array_length(r) = 0 then 'OK   to''xtatilgan aloqada ko''rinish yo''q' else 'FAIL to''xtatilgan ko''rinish' end);
  r := t2_tomon_holat_v1(up, p, al, 'davom', null);
  rep := rep || (case when r->>'holat' = 'faol' then 'OK   davom ettirildi' else 'FAIL davom: ' || r::text end);
  r := t2_zakazchik_obyektlar_v1(uz, z);
  rep := rep || (case when jsonb_array_length(r) = 1 then 'OK   davomdan keyin granted obyekt qaytdi' else 'FAIL davom ko''rinish' end);
  r := t2_tomon_holat_v1(uz, z, al, 'yopish', 'Shartnoma tugadi');
  rep := rep || (case when r->>'holat' = 'yopilgan' then 'OK   yopildi' else 'FAIL yopish: ' || r::text end);
  r := t2_zakazchik_obyektlar_v1(uz, z);
  rep := rep || (case when jsonb_array_length(r) = 0 and not exists (select 1 from t2_tomon_grant where aloqa_id = al and holat = 'faol') then 'OK   yopilgach barcha grantlar bekor' else 'FAIL yopilgach grant qoldi' end);
  rep := rep || (case when not has_table_privilege('anon', 't2_tomon_taqdim', 'select') and not has_table_privilege('authenticated', 't2_tomon_grant', 'select') then 'OK   anon/authenticated jadvallarga kira olmaydi' else 'FAIL jadval privilegiyalari' end);
  rep := rep || (case when not has_function_privilege('anon', 't2_zakazchik_obyektlar_v1(bigint,bigint)', 'execute') then 'OK   anon RPC chaqira olmaydi' else 'FAIL anon RPC' end);

  raise exception 'TOMON_TEST % FAIL / % jami:%', (select count(*) from unnest(rep) s where s like 'FAIL%'), array_length(rep, 1), E'\n' || array_to_string(rep, E'\n');
end $$;
