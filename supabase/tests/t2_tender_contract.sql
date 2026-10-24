-- T2_TENDER (P2) contract test — E2 §6 shabloni. Natija: oxirgi exception matni "TEST_TENDER ..." ichida (rollback).
-- Ishga tushirish: disposable branch / lokal. Talab: 20261108400000 + 20261108410000 + 20261108420000, F1 t2_outbox_yoz.
do $$
declare
  x bigint; y bigint; w bigint; z bigint;                          -- xaridor(egasi), yetkazuvchi 1, yetkazuvchi 2, begona
  ux bigint; uxk bigint; uxp bigint; uy bigint; uw bigint; uz bigint;
  ox bigint; oz bigint; ay bigint; aw bigint;
  r jsonb; rfq bigint; v integer; q1 bigint; q2 bigint; t1 bigint; t2 bigint; t1v integer; n integer; rep text[] := array[]::text[];
  qs jsonb := jsonb_build_array(jsonb_build_object('nom', 'Sement M400', 'birlik', 'tonna', 'miqdor', 10),
                                jsonb_build_object('nom', 'Armatura d12', 'birlik', 'tonna', 'miqdor', 2));
  opx uuid := gen_random_uuid();
begin
  insert into t2_kompaniya (nom, kod, inn, faol) values ('TEST_T_XARIDOR', 'TST-TX', '920000001', true) returning id into x;
  insert into t2_kompaniya (nom, kod, inn, faol) values ('TEST_T_Y', 'TST-TY', '920000002', true) returning id into y;
  insert into t2_kompaniya (nom, kod, inn, faol) values ('TEST_T_W', 'TST-TW', '920000003', true) returning id into w;
  insert into t2_kompaniya (nom, kod, inn, faol) values ('TEST_T_BEGONA', 'TST-TZ', '920000004', true) returning id into z;
  insert into t2_foydalanuvchi (login, ism, holat) values ('tst_tx', 'X boss', 'faol') returning id into ux;
  insert into t2_foydalanuvchi (login, ism, holat) values ('tst_txk', 'X kuz', 'faol') returning id into uxk;
  insert into t2_foydalanuvchi (login, ism, holat) values ('tst_txp', 'X pto', 'faol') returning id into uxp;
  insert into t2_foydalanuvchi (login, ism, holat) values ('tst_ty', 'Y', 'faol') returning id into uy;
  insert into t2_foydalanuvchi (login, ism, holat) values ('tst_tw', 'W', 'faol') returning id into uw;
  insert into t2_foydalanuvchi (login, ism, holat) values ('tst_tz', 'Z', 'faol') returning id into uz;
  insert into t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values (ux, x, 'boss', 'faol'), (uxk, x, 'kuzatuvchi', 'faol'), (uxp, x, 'pto', 'faol'),
    (uy, y, 'taminotchi', 'faol'), (uw, w, 'taminotchi', 'faol'), (uz, z, 'taminotchi', 'faol');
  insert into t2_obyekt (nom, kompaniya_id) values ('X-obyekt', x) returning id into ox;
  insert into t2_obyekt (nom, kompaniya_id) values ('Z-obyekt', z) returning id into oz;
  insert into t2_tomon_aloqa (taklif_kompaniya_id, qabul_kompaniya_id, taklif_rol, qabul_rol, turi, holat, taklif_actor_id) values (x, y, 'xaridor', 'yetkazuvchi', 'kontakt', 'faol', ux) returning id into ay;
  insert into t2_tomon_aloqa (taklif_kompaniya_id, qabul_kompaniya_id, taklif_rol, qabul_rol, turi, holat, taklif_actor_id) values (x, w, 'xaridor', 'yetkazuvchi', 'kontakt', 'faol', ux) returning id into aw;

  -- 1-2-3-4. e'lon: ruxsat / rol / begona actor / begona obyekt
  r := t2_tender_elon_v1(uxp, x, opx, 'material', 'taklif', array[y, w], ox, now() + interval '3 days', qs, '{"sarlavha":"Navoiy bog material","yetkazish_manzil":"Navoiy"}'::jsonb);
  rfq := (r->>'id')::bigint;
  rep := rep || (case when (r->>'ok')::boolean and (r->>'qator_soni')::int = 2 then 'OK   1 PTO e''lon qildi (2 qator)' else 'FAIL 1: ' || r::text end);
  begin perform t2_tender_elon_v1(uxk, x, gen_random_uuid(), 'material', 'ochiq', null, ox, null, qs, null); rep := rep || 'FAIL 2 kuzatuvchi o''tdi';
  exception when others then rep := rep || (case when sqlstate = '42501' then 'OK   2 kuzatuvchi — 42501' else 'FAIL 2: ' || sqlerrm end); end;
  begin perform t2_tender_elon_v1(uz, x, gen_random_uuid(), 'material', 'ochiq', null, ox, null, qs, null); rep := rep || 'FAIL 3 begona actor o''tdi';
  exception when others then rep := rep || (case when sqlstate = '42501' then 'OK   3 begona actor — 42501' else 'FAIL 3: ' || sqlerrm end); end;
  r := t2_tender_elon_v1(ux, x, gen_random_uuid(), 'material', 'ochiq', null, oz, null, qs, null);
  rep := rep || (case when r->>'code' = 'OBYEKT_BEGONA' then 'OK   4 begona obyekt — rad' else 'FAIL 4: ' || r::text end);
  -- 5. takror
  r := t2_tender_elon_v1(uxp, x, opx, 'material', 'taklif', array[y, w], ox, now() + interval '3 days', qs, null);
  select count(*) into n from t2_birja_rfq where kompaniya_id = x and operation_id = opx;
  rep := rep || (case when (r->>'takror')::boolean and n = 1 then 'OK   5 takror — bitta qator' else 'FAIL 5: ' || r::text end);
  -- chaqirilgan kompaniya aloqasiz bo'lsa rad
  r := t2_tender_elon_v1(ux, x, gen_random_uuid(), 'material', 'taklif', array[z], ox, null, qs, null);
  rep := rep || (case when r->>'code' = 'ALOQA_YOQ' then 'OK   5b aloqasiz oluvchi — ALOQA_YOQ' else 'FAIL 5b: ' || r::text end);
  select id into q1 from t2_birja_rfq_qator where rfq_id = rfq and qator_no = 1;
  select id into q2 from t2_birja_rfq_qator where rfq_id = rfq and qator_no = 2;

  -- 6. ko'rinish: chaqirilgan ko'radi, begona ko'rmaydi/taklif bera olmaydi
  r := t2_tenderlar_v1(uy, y, 'menga', null, 50, null);
  rep := rep || (case when jsonb_array_length(r->'qatorlar') = 1 and (r->'qatorlar'->0->'obyekt_id') = 'null'::jsonb then 'OK   6a chaqirilgan ko''radi, obyekt yashirin' else 'FAIL 6a: ' || r::text end);
  r := t2_tender_tafsilot_v1(uz, z, rfq);
  rep := rep || (case when r->>'code' = 'TOPILMADI' then 'OK   6b begona tafsilot — TOPILMADI' else 'FAIL 6b: ' || r::text end);
  r := t2_tender_taklif_ber_v1(uz, z, gen_random_uuid(), rfq, jsonb_build_array(jsonb_build_object('rfq_qator_id', q1, 'narx', 1)), null);
  rep := rep || (case when r->>'code' = 'TOPILMADI' then 'OK   6c begona taklif bera olmaydi' else 'FAIL 6c: ' || r::text end);

  -- 7. taklif: narxsiz qator rad, begona qator rad, to'g'ri taklif ok, bir xil op takrori
  r := t2_tender_taklif_ber_v1(uy, y, gen_random_uuid(), rfq, jsonb_build_array(jsonb_build_object('rfq_qator_id', q1)), null);
  rep := rep || (case when r->>'code' = 'QATOR_NARX' then 'OK   7a narxsiz qator — rad (NULL != 0)' else 'FAIL 7a: ' || r::text end);
  r := t2_tender_taklif_ber_v1(uy, y, gen_random_uuid(), rfq, jsonb_build_array(jsonb_build_object('rfq_qator_id', 999999999, 'narx', 5)), null);
  rep := rep || (case when r->>'code' = 'QATOR_BEGONA' then 'OK   7b begona qator — rad' else 'FAIL 7b: ' || r::text end);
  begin perform t2_tender_taklif_ber_v1(uxk, x, gen_random_uuid(), rfq, jsonb_build_array(jsonb_build_object('rfq_qator_id', q1, 'narx', 1)), null); rep := rep || 'FAIL 7c kuzatuvchi taklif berdi';
  exception when others then rep := rep || (case when sqlstate = '42501' then 'OK   7c kuzatuvchi taklif — 42501' else 'FAIL 7c: ' || sqlerrm end); end;
  r := t2_tender_taklif_ber_v1(uy, y, gen_random_uuid(), rfq, jsonb_build_array(jsonb_build_object('rfq_qator_id', q1, 'narx', 1300000, 'muddat_kun', 3), jsonb_build_object('rfq_qator_id', q2, 'narx', 9000000, 'muddat_kun', 5)),
        'tez yetkazamiz', '{"yetkazish_narx":150000,"qqs_foiz":12}'::jsonb);
  t1 := (r->>'id')::bigint;
  rep := rep || (case when (r->>'ok')::boolean then 'OK   7d Y taklif berdi' else 'FAIL 7d: ' || r::text end);
  r := t2_tender_taklif_ber_v1(uw, w, gen_random_uuid(), rfq, jsonb_build_array(jsonb_build_object('rfq_qator_id', q1, 'narx', 1250000, 'muddat_kun', 7), jsonb_build_object('rfq_qator_id', q2, 'narx', 9500000, 'muddat_kun', 2)), null);
  t2 := (r->>'id')::bigint;
  rep := rep || (case when (r->>'ok')::boolean then 'OK   7e W taklif berdi' else 'FAIL 7e: ' || r::text end);
  -- qayta taklif: eskisi qaytarib olinadi, faol bitta
  r := t2_tender_taklif_ber_v1(uw, w, gen_random_uuid(), rfq, jsonb_build_array(jsonb_build_object('rfq_qator_id', q1, 'narx', 1240000), jsonb_build_object('rfq_qator_id', q2, 'narx', 9400000)), null);
  select count(*) into n from t2_birja_taklif where rfq_id = rfq and kompaniya_id = w and holat = 'berildi';
  rep := rep || (case when (r->>'ok')::boolean and n = 1 and (select holat from t2_birja_taklif where id = t2) = 'qaytarib_olindi' then 'OK   7f qayta taklif — eskisi qaytarib olindi, faol bitta' else 'FAIL 7f: ' || r::text end);
  t2 := (r->>'id')::bigint;

  -- 8. egasi hamma takliflarni ko'radi; yetkazuvchi faqat o'zinikini
  r := t2_tender_tafsilot_v1(ux, x, rfq);
  rep := rep || (case when jsonb_array_length(r->'takliflar') = 2 and (r->>'egasi')::boolean then 'OK   8a egasi 2 taklifni ko''radi (taqqoslash)' else 'FAIL 8a: ' || r::text end);
  r := t2_tender_tafsilot_v1(uy, y, rfq);
  rep := rep || (case when jsonb_array_length(r->'takliflar') = 1 and (r->'rfq'->'obyekt_id') = 'null'::jsonb and not (r->>'egasi')::boolean then 'OK   8b Y faqat o''z taklifi, obyekt yashirin' else 'FAIL 8b: ' || r::text end);

  -- 9. g'olib (qator darajasida): kuzatuvchi rad; eski versiya; qisman -> buyurtma; qolgani boshqasiga
  select versiya into v from t2_birja_rfq where id = rfq;
  begin perform t2_tender_golib_v1(uxk, x, gen_random_uuid(), rfq, v, t1); rep := rep || 'FAIL 9a kuzatuvchi g''olib belgiladi';
  exception when others then rep := rep || (case when sqlstate = '42501' then 'OK   9a kuzatuvchi g''olib — 42501' else 'FAIL 9a: ' || sqlerrm end); end;
  r := t2_tender_golib_v1(ux, x, gen_random_uuid(), rfq, v + 5, t1);
  rep := rep || (case when r->>'code' = 'VERSIYA_ESKI' then 'OK   9b eski versiya — VERSIYA_ESKI' else 'FAIL 9b: ' || r::text end);
  r := t2_tender_golib_v1(ux, x, gen_random_uuid(), rfq, v, t1, array[q1], '{"tolovchi":"xaridor"}'::jsonb);
  rep := rep || (case when (r->>'ok')::boolean and r->>'rfq_holat' = 'elon' then 'OK   9c Y ga 1-qator (qisman g''olib), RFQ ochiq qoldi' else 'FAIL 9c: ' || r::text end);
  rep := rep || (case when (select yetkazish_narx from t2_buyurtma where id = (r->>'buyurtma_id')::bigint) = 150000
                       and (select summa_nds_siz from t2_buyurtma where id = (r->>'buyurtma_id')::bigint) = 13000000 then 'OK   9d buyurtma: summa 13 000 000 NDS siz + yetkazish 150 000' else 'FAIL 9d buyurtma summalari' end);
  select versiya into v from t2_birja_rfq where id = rfq;
  r := t2_tender_golib_v1(ux, x, gen_random_uuid(), rfq, v, t2, array[q1]);
  rep := rep || (case when r->>'code' = 'QATOR_BAND' then 'OK   9e band qatorni ikki marta bermaydi' else 'FAIL 9e: ' || r::text end);
  r := t2_tender_golib_v1(ux, x, gen_random_uuid(), rfq, v, t2, array[q2]);
  rep := rep || (case when (r->>'ok')::boolean and r->>'rfq_holat' = 'golib_tanlandi' then 'OK   9f W ga 2-qator -> RFQ golib_tanlandi' else 'FAIL 9f: ' || r::text end);
  rep := rep || (case when (select holat from t2_birja_taklif where id = t1) = 'golib' and (select holat from t2_birja_taklif where id = t2) = 'golib' then 'OK   9g ikkala taklif "golib"' else 'FAIL 9g taklif holatlari' end);
  select count(*) into n from t2_buyurtma where rfq_id = rfq;
  rep := rep || (case when n = 2 then 'OK   9h 2 ta buyurtma (har g''olibga)' else 'FAIL 9h: ' || n end);
  r := t2_tender_taklif_ber_v1(uy, y, gen_random_uuid(), rfq, jsonb_build_array(jsonb_build_object('rfq_qator_id', q1, 'narx', 1)), null);
  rep := rep || (case when r->>'code' = 'HOLAT' then 'OK   10 yopilgan RFQ ga taklif yo''q' else 'FAIL 10: ' || r::text end);

  -- 11. ochiq tender (L3): begona ko'radi, minimal maydon; aloqasiz g'olib -> ALOQA_KERAK
  r := t2_tender_elon_v1(ux, x, gen_random_uuid(), 'material', 'ochiq', null, ox, now() + interval '2 days', jsonb_build_array(jsonb_build_object('nom', 'Qum', 'birlik', 'm3', 'miqdor', 100)), null);
  v := 1; rfq := (r->>'id')::bigint; select id into q1 from t2_birja_rfq_qator where rfq_id = rfq;
  r := t2_tenderlar_v1(uz, z, 'ochiq', null, 50, null);
  rep := rep || (case when (select count(*) from jsonb_array_elements(r->'qatorlar') e where (e->>'id')::bigint = rfq and (e->'obyekt_id') = 'null'::jsonb and (e->'takliflar_soni') = 'null'::jsonb) = 1
                      then 'OK   11a ochiq tender begonaga minimal ko''rinadi' else 'FAIL 11a: ' || r::text end);
  r := t2_tender_taklif_ber_v1(uz, z, gen_random_uuid(), rfq, jsonb_build_array(jsonb_build_object('rfq_qator_id', q1, 'narx', 70000)), null);
  t1 := (r->>'id')::bigint;
  rep := rep || (case when (r->>'ok')::boolean and (select narx from t2_birja_taklif where id = t1) = 70000 then 'OK   11b ochiq tenderga taklif; bir qatorli RFQ da eski narx ustuni to''ldi' else 'FAIL 11b: ' || r::text end);
  r := t2_tender_golib_v1(ux, x, gen_random_uuid(), rfq, v, t1);
  rep := rep || (case when r->>'code' = 'ALOQA_KERAK' then 'OK   11c aloqasiz g''olib — ALOQA_KERAK (avval handshake)' else 'FAIL 11c: ' || r::text end);
  r := t2_tender_yop_v1(ux, x, gen_random_uuid(), rfq, v, false);
  rep := rep || (case when (r->>'ok')::boolean and (select holat from t2_birja_taklif where id = t1) = 'yutqazdi' then 'OK   11d yopildi, taklif "yutqazdi"' else 'FAIL 11d: ' || r::text end);

  -- 12. muddat o'tgan va aloqa yopilsa chaqirilganga ko'rinish yo'q
  r := t2_tender_elon_v1(ux, x, gen_random_uuid(), 'material', 'taklif', array[y], ox, now() + interval '1 day', qs, null);
  rfq := (r->>'id')::bigint;
  update t2_tomon_aloqa set holat = 'yopilgan' where id = ay;
  r := t2_tenderlar_v1(uy, y, 'menga', null, 50, null);
  rep := rep || (case when jsonb_array_length(r->'qatorlar') = 0 then 'OK   12a aloqa yopilgach chaqirilgan ko''rmaydi' else 'FAIL 12a: ' || r::text end);
  update t2_birja_rfq set muddat = now() - interval '1 minute' where id = rfq;
  r := t2_tender_taklif_ber_v1(uw, w, gen_random_uuid(), rfq, jsonb_build_array(jsonb_build_object('rfq_qator_id', (select id from t2_birja_rfq_qator where rfq_id = rfq and qator_no = 1), 'narx', 1)), null);
  rep := rep || (case when r->>'code' in ('TOPILMADI', 'MUDDAT_OTGAN') then 'OK   12b muddati o''tgan/ko''rinmas RFQ ga taklif yo''q' else 'FAIL 12b: ' || r::text end);

  -- 13. hodisalar va grantlar
  select count(*) into n from t2_outbox where mavzu = 'tender.elon' and kompaniya_id = x;
  rep := rep || (case when n >= 3 then 'OK   13a outbox tender.elon yozildi' else 'FAIL 13a: ' || n end);
  select count(*) into n from t2_outbox where mavzu = 'tender.golib' and kompaniya_id = x;
  rep := rep || (case when n = 3 then 'OK   13b outbox tender.golib (2 g''olib + 1 yopish)' else 'FAIL 13b: ' || n end);
  rep := rep || (case when not has_function_privilege('anon', 't2_tender_elon_v1(bigint,bigint,uuid,text,text,bigint[],bigint,timestamptz,jsonb,jsonb)', 'execute')
                       and not has_function_privilege('authenticated', 't2_tender_golib_v1(bigint,bigint,uuid,bigint,integer,bigint,bigint[],jsonb)', 'execute')
                       and has_function_privilege('service_role', 't2_tender_golib_v1(bigint,bigint,uuid,bigint,integer,bigint,bigint[],jsonb)', 'execute')
                      then 'OK   14 anon/authenticated yo''q, service_role bor' else 'FAIL 14 grant' end);
  rep := rep || (case when not has_table_privilege('anon', 't2_birja_rfq', 'select') and not has_table_privilege('authenticated', 't2_birja_taklif_qator', 'select')
                      then 'OK   15 birja jadvallariga to''g''ridan GRANT yo''q' else 'FAIL 15 table grant' end);

  raise exception 'TEST_TENDER %', array_to_string(rep, E'\n');
end $$;
