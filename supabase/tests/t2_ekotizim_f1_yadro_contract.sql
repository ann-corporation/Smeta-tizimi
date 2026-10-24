-- T2 EKOTIZIM F1 YADRO — adversarial contract test (rollback bilan; natija oxirgi exception matnida "TEST_F1 ...").
-- Talab: 20261108000000_t2_ekotizim_f1_yadro_v1.sql qo'llangan baza (disposable branch / lokal). PRODDA ISHLATILMAYDI.
-- Hech narsa saqlanmaydi: oxirida raise exception → butun DO bloki bekor.
do $$
declare
  ka bigint; kb bigint; kx bigint; ks bigint;                  -- A (bosh pudratchi), B (buyurtmachi), X (begona), S (ustaning shaxsiy ish joyi)
  ua bigint; uak bigint; uausta bigint; ub bigint; ux bigint; us bigint; uyopiq bigint;
  oa1 bigint; oa2 bigint; ox bigint;
  al bigint; kg bigint; kg2 bigint; ob1 bigint; ob2 bigint; hd bigint; bid bigint;
  r jsonb; v_soni integer; v_b boolean; v_txt text;
  rep text[] := array[]::text[];
begin
  -- ── tayyorgarlik ──
  insert into t2_kompaniya (nom, kod, inn, faol, ochiq_profil) values ('TEST_F1_A', 'TF1-A', '910000001', true, true)  returning id into ka;
  insert into t2_kompaniya (nom, kod, inn, faol) values ('TEST_F1_B', 'TF1-B', '910000002', true) returning id into kb;
  insert into t2_kompaniya (nom, kod, inn, faol) values ('TEST_F1_X', 'TF1-X', '910000003', true) returning id into kx;
  insert into t2_kompaniya (nom, kod, faol, turi) values ('TEST_F1_S', 'TF1-S', true, 'shaxsiy') returning id into ks;
  insert into t2_foydalanuvchi (login, ism, holat) values ('tf1_a_boss', 'A boss', 'faol') returning id into ua;
  insert into t2_foydalanuvchi (login, ism, holat) values ('tf1_a_kuz', 'A kuzatuvchi', 'faol') returning id into uak;
  insert into t2_foydalanuvchi (login, ism, holat) values ('tf1_a_usta', 'Test Usta Ali', 'faol') returning id into uausta;
  insert into t2_foydalanuvchi (login, ism, holat) values ('tf1_b_boss', 'B boss', 'faol') returning id into ub;
  insert into t2_foydalanuvchi (login, ism, holat) values ('tf1_x_boss', 'X boss', 'faol') returning id into ux;
  insert into t2_foydalanuvchi (login, ism, holat, telefon) values ('tf1_ochiq', 'Test Ochiq Haydovchi', 'faol', '+998901112233') returning id into us;
  insert into t2_foydalanuvchi (login, ism, holat) values ('tf1_yopiq', 'Test Yopiq Haydovchi', 'faol') returning id into uyopiq;
  insert into t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values
    (ua, ka, 'boss', 'faol'), (uak, ka, 'kuzatuvchi', 'faol'), (uausta, ka, 'usta', 'faol'),
    (ub, kb, 'boss', 'faol'), (ux, kx, 'boss', 'faol'), (us, ks, 'boss', 'faol');
  insert into t2_obyekt (nom, kompaniya_id) values ('TF1-A-1', ka) returning id into oa1;
  insert into t2_obyekt (nom, kompaniya_id) values ('TF1-A-2', ka) returning id into oa2;
  insert into t2_obyekt (nom, kompaniya_id) values ('TF1-X-1', kx) returning id into ox;

  -- ── 1. Xavfsizlik: RLS, jadval va funksiya huquqlari ──
  select count(*) into v_soni from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
     and c.relname in ('t2_yonalish','t2_kompaniya_faoliyat','t2_shaxs_yonalish','t2_tomon_grant_shablon','t2_outbox',
                       't2_outbox_kursor','t2_bildirishnoma','t2_primitiv_tur','t2_bosqich_katalog','t2_primitiv_dalil','t2_baho');
  rep := rep || (case when v_soni = 0 then 'OK   RLS hamma yangi jadvalda' else 'FAIL RLS yoqilmagan: ' || v_soni end);
  v_b := has_table_privilege('anon', 'public.t2_outbox', 'select') or has_table_privilege('authenticated', 'public.t2_bildirishnoma', 'select')
      or has_table_privilege('authenticated', 'public.t2_shaxs_yonalish', 'insert');
  rep := rep || (case when not v_b then 'OK   anon/authenticated jadvalga kira olmaydi' else 'FAIL jadval huquqi ochiq' end);
  v_b := has_function_privilege('anon', 'public.t2_katalog_qidir_v1(bigint,text,text,text,text,integer,text)', 'execute')
      or has_function_privilege('authenticated', 'public.t2_bildirishnomalar_v1(bigint,boolean,integer,bigint)', 'execute')
      or has_function_privilege('authenticated', 'public.t2_outbox_yoz(bigint,text,text,bigint,jsonb,bigint,uuid,bigint,bigint,bigint[],bigint[])', 'execute')
      or has_function_privilege('anon', 'public._t2_obyekt_doira_ok(bigint,bigint,bigint)', 'execute');
  rep := rep || (case when not v_b then 'OK   anon/authenticated RPC chaqira olmaydi' else 'FAIL RPC huquqi ochiq' end);
  v_b := has_function_privilege('service_role', 'public.t2_katalog_qidir_v1(bigint,text,text,text,text,integer,text)', 'execute');
  rep := rep || (case when v_b then 'OK   service_role RPC chaqira oladi' else 'FAIL service_role huquqi yo''q' end);
  select count(*) into v_soni from t2_yonalish where faol;
  rep := rep || (case when v_soni >= 30 then 'OK   yo''nalish katalogi to''ldirilgan (' || v_soni || ')' else 'FAIL katalog: ' || v_soni end);

  -- ── 2. Shaxs yo'nalishi ──
  r := t2_shaxs_yonalish_saqla_v1(us, '[{"yonalish":"haydovchi","hudud":"Toshkent","ochiq":true},{"yonalish":"haydovchi"}]'::jsonb, gen_random_uuid());
  rep := rep || (case when (r->>'ok')::boolean and (r->>'soni')::int = 1 then 'OK   yo''nalish saqlandi, takror element bitta' else 'FAIL yo''nalish: ' || r::text end);
  r := t2_shaxs_yonalish_saqla_v1(us, '[{"yonalish":"tashuvchi"}]'::jsonb, gen_random_uuid());
  rep := rep || (case when r->>'code' = 'YONALISH_NOTOGRI' then 'OK   faqat-tashkilot yo''nalishi shaxsga berilmaydi' else 'FAIL tashkilot yo''nalishi shaxsga: ' || r::text end);
  r := t2_shaxs_yonalish_saqla_v1(us, '[{"hudud":"x"}]'::jsonb, gen_random_uuid());
  rep := rep || (case when r->>'code' = 'YONALISH_NOTOGRI' then 'OK   bo''sh yo''nalish rad' else 'FAIL bo''sh yo''nalish: ' || r::text end);
  r := t2_shaxs_yonalish_saqla_v1(us, '[]'::jsonb, null);
  rep := rep || (case when r->>'code' = 'OPERATION_ID_KERAK' then 'OK   operation_id majburiy' else 'FAIL operation_id: ' || r::text end);
  perform t2_shaxs_yonalish_saqla_v1(uyopiq, '[{"yonalish":"haydovchi","ochiq":false}]'::jsonb, gen_random_uuid());
  insert into t2_mutaxassis_profil (foydalanuvchi_id, ochiq) values (us, true), (uyopiq, true);

  -- ── 3. Tashkilot faoliyati: ruxsat ──
  r := t2_kompaniya_faoliyat_saqla_v1(ua, ka, '[{"yonalish":"bosh_pudratchi","hudud":"Navoiy"}]'::jsonb, gen_random_uuid());
  rep := rep || (case when (r->>'ok')::boolean then 'OK   boss faoliyat saqladi' else 'FAIL faoliyat: ' || r::text end);
  begin
    r := t2_kompaniya_faoliyat_saqla_v1(uak, ka, '[{"yonalish":"subpudratchi"}]'::jsonb, gen_random_uuid());
    rep := rep || ('FAIL kuzatuvchi faoliyat o''zgartirdi: ' || r::text);
  exception when others then rep := rep || ('OK   kuzatuvchi — ' || sqlerrm); end;
  begin
    r := t2_kompaniya_faoliyat_saqla_v1(ux, ka, '[{"yonalish":"subpudratchi"}]'::jsonb, gen_random_uuid());
    rep := rep || ('FAIL begona kompaniya faoliyatini o''zgartirdi: ' || r::text);
  exception when others then rep := rep || ('OK   begona actor — ' || sqlerrm); end;

  -- ── 4. Katalog qidiruvi ──
  r := t2_katalog_qidir_v1(ub, 'haydovchi', null, 'Test', 'shaxs', 50, null);
  v_txt := r::text;
  rep := rep || (case when v_txt like '%Test Ochiq Haydovchi%' and v_txt not like '%Test Yopiq Haydovchi%'
                      then 'OK   katalog: faqat ochiq yo''nalish ko''rinadi' else 'FAIL katalog ochiq/yopiq: ' || v_txt end);
  rep := rep || (case when v_txt not like '%998901112233%' and v_txt not like '%tf1_ochiq%'
                      then 'OK   katalog telefon/login oshkor qilmaydi' else 'FAIL katalog shaxsiy ma''lumot: ' || v_txt end);
  rep := rep || (case when (r->'qatorlar'->0->>'kompaniya_id')::bigint = ks then 'OK   katalog shaxsiy ish joyini qaytaradi (kontakt uchun)' else 'FAIL shaxsiy kompaniya: ' || v_txt end);
  r := t2_katalog_qidir_v1(ub, 'bosh_pudratchi', 'Navoiy', 'TEST_F1', 'tashkilot', 50, null);
  rep := rep || (case when r::text like '%TEST_F1_A%' and r::text not like '%910000001%' then 'OK   katalog ochiq tashkilotni topadi, INN siz' else 'FAIL katalog tashkilot: ' || r::text end);
  r := t2_katalog_qidir_v1(ub, null, null, 'TEST_F1_B', 'tashkilot', 50, null);
  rep := rep || (case when jsonb_array_length(r->'qatorlar') = 0 then 'OK   yopiq profil katalogda yo''q' else 'FAIL yopiq profil ko''rindi' end);

  -- ── 5. Obyekt doirasi ──
  rep := rep || (case when not _t2_obyekt_doira_ok(uausta, ka, oa1) then 'OK   usta biriktirilmagan obyektni ko''rmaydi' else 'FAIL usta doirasi' end);
  insert into t2_obyekt_foydalanuvchi_ruxsat (obyekt_id, foydalanuvchi_id, ruxsat, holat) values (oa1, uausta, 'write', 'faol');
  rep := rep || (case when _t2_obyekt_doira_ok(uausta, ka, oa1) and not _t2_obyekt_doira_ok(uausta, ka, oa2)
                      then 'OK   usta faqat biriktirilgan obyekt' else 'FAIL usta biriktirilgan obyekt' end);
  rep := rep || (case when not _t2_obyekt_doira_ok(uausta, ka, null) then 'OK   usta obyektsiz amal qila olmaydi' else 'FAIL usta obyektsiz' end);
  rep := rep || (case when _t2_obyekt_doira_ok(uak, ka, oa2) then 'OK   ofis roli cheklovsiz — hamma obyekt' else 'FAIL ofis roli' end);
  insert into t2_obyekt_foydalanuvchi_ruxsat (obyekt_id, foydalanuvchi_id, ruxsat, holat) values (oa1, uak, 'read', 'faol');
  rep := rep || (case when not _t2_obyekt_doira_ok(uak, ka, oa2) then 'OK   ofis roli cheklangan bo''lsa — faqat o''shalar' else 'FAIL ofis cheklovi' end);
  rep := rep || (case when not _t2_obyekt_doira_ok(ua, ka, ox) and not _t2_obyekt_doira_ok(ux, ka, oa1)
                      then 'OK   begona obyekt / begona actor — yo''q' else 'FAIL begona doira' end);

  -- ── 6. Outbox idempotentligi ──
  r := jsonb_build_object('a', 1);
  perform t2_outbox_yoz(ka, 'test.takror', 't2_obyekt', oa1, r, ua, '00000000-0000-0000-0000-0000000000f1'::uuid);
  perform t2_outbox_yoz(ka, 'test.takror', 't2_obyekt', oa1, r, ua, '00000000-0000-0000-0000-0000000000f1'::uuid);
  select count(*) into v_soni from t2_outbox where kompaniya_id = ka and mavzu = 'test.takror';
  rep := rep || (case when v_soni = 1 then 'OK   outbox: bir xil operation_id — bitta hodisa' else 'FAIL outbox takror: ' || v_soni end);
  begin
    perform t2_outbox_yoz(ka, 'Notogri Mavzu', 't2_obyekt', oa1, r, ua, gen_random_uuid());
    rep := rep || 'FAIL noto''g''ri mavzu qabul qilindi';
  exception when check_violation then rep := rep || 'OK   noto''g''ri mavzu nomi rad'; end;

  -- ── 7. Tomon hodisasi → outbox (trigger) ──
  insert into t2_tomon_aloqa (taklif_kompaniya_id, qabul_kompaniya_id, taklif_rol, qabul_rol, turi, holat, taklif_actor_id)
    values (ka, kb, 'bosh_pudratchi', 'buyurtmachi', 'shartnoma', 'faol', ua) returning id into al;
  insert into t2_tomon_hodisa (aloqa_id, kompaniya_id, actor_id, tur, matn) values (al, ka, ua, 'izoh', 'test') returning id into hd;
  select count(*) into v_soni from t2_outbox where entity_jadval = 't2_tomon_hodisa' and entity_id = hd and mavzu = 'tomon.izoh' and qabul_kompaniya_idlar = array[kb];
  rep := rep || (case when v_soni = 1 then 'OK   tomon hodisasi outbox ga qarshi tomon bilan tushdi' else 'FAIL hodisa→outbox: ' || v_soni end);
  insert into t2_tomon_hodisa (aloqa_id, kompaniya_id, actor_id, tur) values (al, ka, ua, 'qidiruv') returning id into hd;
  select count(*) into v_soni from t2_outbox where entity_jadval = 't2_tomon_hodisa' and entity_id = hd;
  rep := rep || (case when v_soni = 0 then 'OK   qidiruv hodisasi outbox ga tushmaydi' else 'FAIL qidiruv outbox ga tushdi' end);

  -- ── 8. Bildirishnoma ishlovi ──
  insert into t2_outbox (kompaniya_id, mavzu, entity_jadval, entity_id, qabul_kompaniya_idlar, foydalanuvchi_idlar, actor_id, yaratildi)
    values (ka, 'test.bildir', 't2_obyekt', oa1, array[kb], array[uausta, ua], ua, now() - interval '5 minutes');
  -- Bu tranzaksiyada avval yozilgan hodisalar (now() = tranzaksiya boshi) ham «eski» qilinadi — aks holda ishlov
  -- birinchi yangi hodisada to'xtaydi (teshiksiz kursor qoidasi).
  update t2_outbox set yaratildi = now() - interval '5 minutes' where kompaniya_id = ka;
  insert into t2_outbox (kompaniya_id, mavzu, entity_jadval, entity_id, qabul_kompaniya_idlar, actor_id, yaratildi)
    values (ka, 'test.yangi', 't2_obyekt', oa1, array[kb], ua, now());
  r := t2_outbox_ishlov_v1('bildirishnoma', 2000);
  select count(*) into v_soni from t2_bildirishnoma where mavzu = 'test.bildir' and foydalanuvchi_id in (ub, uausta);
  rep := rep || (case when (r->>'ok')::boolean and v_soni = 2 then 'OK   bildirishnoma: qabul kompaniya boss + aniq odam' else 'FAIL bildirishnoma: ' || v_soni || ' ' || r::text end);
  select count(*) into v_soni from t2_bildirishnoma where mavzu = 'test.bildir' and foydalanuvchi_id = ua;
  rep := rep || (case when v_soni = 0 then 'OK   actor o''ziga bildirishnoma olmaydi' else 'FAIL actor o''ziga oldi' end);
  select count(*) into v_soni from t2_bildirishnoma where mavzu = 'test.yangi';
  rep := rep || (case when v_soni = 0 then 'OK   60 s dan yangi hodisa kutadi' else 'FAIL yangi hodisa darhol ishlandi' end);
  perform t2_outbox_ishlov_v1('bildirishnoma', 2000);
  select count(*) into v_soni from t2_bildirishnoma where mavzu = 'test.bildir';
  rep := rep || (case when v_soni = 2 then 'OK   qayta ishlov takror yaratmaydi' else 'FAIL takror bildirishnoma: ' || v_soni end);
  r := t2_outbox_ishlov_v1('telegram', 10);
  rep := rep || (case when r->>'code' = 'ISTE_MOLCHI_NOMALUM' then 'OK   noma''lum iste''molchi rad' else 'FAIL iste''molchi: ' || r::text end);

  r := t2_bildirishnomalar_v1(ub, true, 50, null);
  select id into bid from t2_bildirishnoma where foydalanuvchi_id = ub and mavzu = 'test.bildir';
  rep := rep || (case when (r->>'oqilmagan')::int >= 1 and r::text like '%test.bildir%' then 'OK   bildirishnomalar ro''yxati' else 'FAIL ro''yxat: ' || r::text end);
  r := t2_bildirishnoma_oqildi_v1(ux, array[bid]);
  rep := rep || (case when (r->>'belgilandi')::int = 0 then 'OK   begona bildirishnomani belgilab bo''lmaydi' else 'FAIL begona belgiladi' end);
  r := t2_bildirishnoma_oqildi_v1(ub, array[bid]);
  rep := rep || (case when (r->>'belgilandi')::int = 1 then 'OK   o''qildi belgisi' else 'FAIL o''qildi: ' || r::text end);
  update t2_azolik set holat = 'bekor' where foydalanuvchi_id = ub and kompaniya_id = kb;
  r := t2_bildirishnomalar_v1(ub, false, 50, null);
  rep := rep || (case when r::text not like '%test.bildir%' then 'OK   kompaniyadan chiqqan odam uning bildirishnomasini ko''rmaydi' else 'FAIL chiqqan odam ko''rdi' end);
  update t2_azolik set holat = 'faol' where foydalanuvchi_id = ub and kompaniya_id = kb;

  -- ── 9. Kontragent ↔ platforma tomoni ──
  insert into t2_kontragent (kompaniya_id, inn, nom) values (ka, '910000002', 'B kontragent') returning id into kg;
  insert into t2_kontragent (kompaniya_id, inn, nom) values (ka, '999999999', 'Boshqa INN') returning id into kg2;
  r := t2_kontragent_tomon_bog_v1(ua, ka, kg2, al, 1, gen_random_uuid());
  rep := rep || (case when r->>'code' = 'INN_MOS_EMAS' then 'OK   INN mos bo''lmasa bog''lanmaydi' else 'FAIL INN: ' || r::text end);
  r := t2_kontragent_tomon_bog_v1(ua, ka, kg, al, 7, gen_random_uuid());
  rep := rep || (case when r->>'code' = 'VERSIYA_ESKI' then 'OK   eski versiya rad' else 'FAIL versiya: ' || r::text end);
  begin
    r := t2_kontragent_tomon_bog_v1(uak, ka, kg, al, 1, gen_random_uuid());
    rep := rep || ('FAIL kuzatuvchi bog''ladi: ' || r::text);
  exception when others then rep := rep || ('OK   kuzatuvchi bog''lay olmaydi — ' || sqlerrm); end;
  r := t2_kontragent_tomon_bog_v1(ua, ka, kg, al, 1, gen_random_uuid());
  rep := rep || (case when (r->>'ok')::boolean and (select tomon_kompaniya_id from t2_kontragent where id = kg) = kb then 'OK   kontragent tomon kompaniyaga bog''landi' else 'FAIL bog''lash: ' || r::text end);
  r := t2_kontragent_tomon_bog_v1(ua, ka, kg, al, 1, gen_random_uuid());
  rep := rep || (case when (r->>'takror')::boolean then 'OK   takror bog''lash idempotent' else 'FAIL takror: ' || r::text end);
  update t2_tomon_aloqa set holat = 'yopilgan' where id = al;
  r := t2_kontragent_tomon_bog_v1(ua, ka, kg2, al, 1, gen_random_uuid());
  rep := rep || (case when r->>'code' = 'ALOQA_FAOL_EMAS' then 'OK   yopilgan aloqa bilan bog''lanmaydi' else 'FAIL yopiq aloqa: ' || r::text end);
  r := t2_kontragent_tomon_bog_v1(ux, kx, kg, al, 2, gen_random_uuid());
  rep := rep || (case when r->>'code' = 'KONTRAGENT_YOQ' then 'OK   begona tenant kontragentiga tegolmaydi' else 'FAIL begona kontragent: ' || r::text end);

  -- ── 10. Grant shablon: faqat faol resurslar ──
  r := t2_tomon_grant_shablon_v1(ua, ka, 'nazorat', 'texnadzor');
  rep := rep || (case when r::text like '%obyekt_holat%' and ((select faol from t2_tomon_resurs where kalit = 'aosr') or r::text not like '%aosr%')
                      then 'OK   shablon faqat faol resurslarni beradi' else 'FAIL shablon: ' || r::text end);

  -- ── 11. Obyekt joylashuvi cheklovlari ──
  begin
    update t2_obyekt set chegara_geojson = '[1,2]'::jsonb where id = oa1;
    rep := rep || 'FAIL massiv geojson qabul qilindi';
  exception when check_violation then rep := rep || 'OK   chegara_geojson faqat obyekt'; end;
  begin
    update t2_obyekt set geozona_radius_m = 5 where id = oa1;
    rep := rep || 'FAIL 5 m geozona qabul qilindi';
  exception when check_violation then rep := rep || 'OK   geozona radiusi chegarasi'; end;
  begin
    update t2_foydalanuvchi set telefon = '901112233' where id = ua;
    rep := rep || 'FAIL + siz telefon qabul qilindi';
  exception when check_violation then rep := rep || 'OK   telefon formati (+998...)'; end;

  raise exception 'TEST_F1 % / % OK%', (select count(*) from unnest(rep) x where x like 'OK%'), cardinality(rep), E'\n' || array_to_string(rep, E'\n');
end $$;
