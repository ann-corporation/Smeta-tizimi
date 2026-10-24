-- T2_BUYURTMA (P3) contract test — E2 §6 shabloni. Natija: oxirgi exception matni "TEST_BUYURTMA ..." ichida (rollback, hech narsa saqlanmaydi).
-- Ishga tushirish: disposable branch / lokal (prodda emas). Talab: 20261108400000 + 20261108410000 qo'llangan, F1 t2_outbox_yoz bor.
do $$
declare
  x bigint; y bigint; z bigint;                                  -- xaridor, yetkazuvchi, begona
  ux bigint; uxk bigint; uy bigint; uz bigint;                   -- X boss, X kuzatuvchi, Y taminotchi, Z boss
  ox bigint; oz bigint; al bigint;
  r jsonb; b bigint; v integer; qid bigint[]; rep text[] := array[]::text[]; n integer;
  op1 uuid := gen_random_uuid(); op2 uuid := gen_random_uuid(); op3 uuid := gen_random_uuid(); op4 uuid := gen_random_uuid(); op5 uuid := gen_random_uuid();
  q_ok jsonb := jsonb_build_array(jsonb_build_object('nom', 'Sement M400', 'birlik', 'tonna', 'miqdor', 10, 'narx', 1200000),
                                  jsonb_build_object('nom', 'Qum', 'birlik', 'm3', 'miqdor', 5, 'narx', 0));
begin
  insert into t2_kompaniya (nom, kod, inn, faol) values ('TEST_XARIDOR', 'TST-X', '910000001', true) returning id into x;
  insert into t2_kompaniya (nom, kod, inn, faol) values ('TEST_YETKAZUVCHI', 'TST-Y', '910000002', true) returning id into y;
  insert into t2_kompaniya (nom, kod, inn, faol) values ('TEST_BEGONA', 'TST-Z', '910000003', true) returning id into z;
  insert into t2_foydalanuvchi (login, ism, holat) values ('tst_bx', 'X boss', 'faol') returning id into ux;
  insert into t2_foydalanuvchi (login, ism, holat) values ('tst_bxk', 'X kuzatuvchi', 'faol') returning id into uxk;
  insert into t2_foydalanuvchi (login, ism, holat) values ('tst_by', 'Y taminotchi', 'faol') returning id into uy;
  insert into t2_foydalanuvchi (login, ism, holat) values ('tst_bz', 'Z boss', 'faol') returning id into uz;
  insert into t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values (ux, x, 'boss', 'faol'), (uxk, x, 'kuzatuvchi', 'faol'), (uy, y, 'taminotchi', 'faol'), (uz, z, 'boss', 'faol');
  insert into t2_obyekt (nom, kompaniya_id) values ('X-obyekt', x) returning id into ox;
  insert into t2_obyekt (nom, kompaniya_id) values ('Z-obyekt', z) returning id into oz;
  insert into t2_tomon_aloqa (taklif_kompaniya_id, qabul_kompaniya_id, taklif_rol, qabul_rol, turi, holat, taklif_actor_id)
    values (x, y, 'xaridor', 'yetkazuvchi', 'kontakt', 'faol', ux) returning id into al;

  -- 1. ruxsatli rol yaratadi
  r := t2_buyurtma_yarat_v1(ux, x, op1, 'material', y, null, null, ox, q_ok, '{"manzil":"Navoiy","lat":40.1,"lng":65.3,"tolovchi":"xaridor"}'::jsonb);
  b := (r->>'id')::bigint;
  rep := rep || (case when (r->>'ok')::boolean and b is not null then 'OK   1 ruxsatli rol yaratdi' else 'FAIL 1 yaratish: ' || r::text end);
  -- 2. ruxsatsiz rol (kuzatuvchi)
  begin perform t2_buyurtma_yarat_v1(uxk, x, gen_random_uuid(), 'material', y, null, null, ox, q_ok, null); rep := rep || 'FAIL 2 kuzatuvchi o''tdi';
  exception when others then rep := rep || (case when sqlstate = '42501' then 'OK   2 kuzatuvchi — 42501' else 'FAIL 2: ' || sqlerrm end); end;
  -- 3. begona kompaniya actori (a'zo emas)
  begin perform t2_buyurtma_yarat_v1(uz, x, gen_random_uuid(), 'material', y, null, null, ox, q_ok, null); rep := rep || 'FAIL 3 begona actor o''tdi';
  exception when others then rep := rep || (case when sqlstate = '42501' then 'OK   3 begona actor — 42501' else 'FAIL 3: ' || sqlerrm end); end;
  -- 4. begona tenant obyekti
  r := t2_buyurtma_yarat_v1(ux, x, gen_random_uuid(), 'material', y, null, null, oz, q_ok, null);
  rep := rep || (case when r->>'code' = 'OBYEKT_BEGONA' then 'OK   4 begona obyekt — rad' else 'FAIL 4: ' || r::text end);
  -- 5. takror operation_id -> bitta qator
  r := t2_buyurtma_yarat_v1(ux, x, op1, 'material', y, null, null, ox, q_ok, null);
  select count(*) into n from t2_buyurtma where kompaniya_id = x and operation_id = op1;
  rep := rep || (case when (r->>'takror')::boolean and n = 1 and (r->>'id')::bigint = b then 'OK   5 takror — bitta qator' else 'FAIL 5: ' || r::text end);
  -- 6. aloqa yo'q ijrochi
  r := t2_buyurtma_yarat_v1(ux, x, gen_random_uuid(), 'material', z, null, null, ox, q_ok, null);
  rep := rep || (case when r->>'code' = 'ALOQA_KERAK' then 'OK   6 aloqasiz ijrochi — ALOQA_KERAK' else 'FAIL 6: ' || r::text end);
  -- 7. NULL != 0: narx 0 yig'indiga kiradi; narxsiz qator bo'lsa summa NULL
  rep := rep || (case when (select summa_nds_siz from t2_buyurtma where id = b) = 12000000 then 'OK   7a narx 0 = 0, summa 12 000 000' else 'FAIL 7a summa' end);
  r := t2_buyurtma_yarat_v1(ux, x, gen_random_uuid(), 'material', y, null, null, ox,
         jsonb_build_array(jsonb_build_object('nom', 'A', 'birlik', 'kg', 'miqdor', 1, 'narx', 5), jsonb_build_object('nom', 'B', 'birlik', 'kg', 'miqdor', 1)), null);
  rep := rep || (case when (r->>'ok')::boolean and (select summa_nds_siz from t2_buyurtma where id = (r->>'id')::bigint) is null then 'OK   7b narxsiz qator — summa NULL' else 'FAIL 7b: ' || r::text end);
  r := t2_buyurtma_yarat_v1(ux, x, gen_random_uuid(), 'material', y, null, null, ox, jsonb_build_array(jsonb_build_object('nom', 'A', 'birlik', 'kg', 'miqdor', 0)), null);
  rep := rep || (case when r->>'code' = 'QATOR_MIQDOR' then 'OK   7c miqdor 0 — rad' else 'FAIL 7c: ' || r::text end);

  -- 8. o'tish: yetkazuvchi qabul qiladi; xaridor ijrochi bosqichini o'tkaza olmaydi; eski versiya
  select versiya into v from t2_buyurtma where id = b;
  r := t2_buyurtma_otish_v1(ux, x, gen_random_uuid(), b, v, 'bajarilmoqda', null, null, null);
  rep := rep || (case when r->>'code' = 'OTISH_TAQIQ' then 'OK   8a yuborildi->bajarilmoqda (xaridor) — taqiq' else 'FAIL 8a: ' || r::text end);
  r := t2_buyurtma_otish_v1(uy, y, op2, b, v, 'qabul_qilindi', null, null, null);
  rep := rep || (case when (r->>'ok')::boolean and r->>'holat' = 'qabul_qilindi' then 'OK   8b ijrochi qabul qildi (tasdiqlandi)' else 'FAIL 8b: ' || r::text end);
  r := t2_buyurtma_otish_v1(uy, y, gen_random_uuid(), b, v, 'bajarilmoqda', null, null, null);
  rep := rep || (case when r->>'code' = 'VERSIYA_ESKI' then 'OK   8c eski versiya — VERSIYA_ESKI' else 'FAIL 8c: ' || r::text end);
  r := t2_buyurtma_otish_v1(uy, y, op2, b, v, 'qabul_qilindi', null, null, null);
  rep := rep || (case when (r->>'takror')::boolean then 'OK   8d o''tish takrori — idempotent' else 'FAIL 8d: ' || r::text end);
  v := v + 1;
  r := t2_buyurtma_otish_v1(uy, y, gen_random_uuid(), b, v, 'bajarilmoqda', 'tayyorlanmoqda', null, null);
  rep := rep || (case when (r->>'ok')::boolean and r->>'bosqich' = 'tayyorlanmoqda' then 'OK   8e tayyorlanmoqda' else 'FAIL 8e: ' || r::text end);
  v := v + 1;
  -- 9. yuklashga_tayyor: olish nuqtasisiz rad; keyin olish yoz -> o'tadi, hodisa chiqadi
  r := t2_buyurtma_otish_v1(uy, y, gen_random_uuid(), b, v, 'tayyor', 'yuklashga_tayyor', null, null);
  rep := rep || (case when r->>'code' = 'OLISH_KERAK' then 'OK   9a olish nuqtasisiz yuklashga_tayyor — rad' else 'FAIL 9a: ' || r::text end);
  r := t2_buyurtma_olish_yoz_v1(uy, y, gen_random_uuid(), b, v, '{"ombor_nomi":"Y ombor","manzil":"Zarafshon","lat":41.0,"lng":64.0}'::jsonb);
  rep := rep || (case when (r->>'ok')::boolean then 'OK   9b olish yozildi' else 'FAIL 9b: ' || r::text end);
  v := v + 1;
  r := t2_buyurtma_olish_yoz_v1(uy, y, gen_random_uuid(), b, v, '{"lat":123,"lng":64}'::jsonb);
  rep := rep || (case when r->>'code' = 'KOORDINATA' then 'OK   9c noto''g''ri koordinata — rad' else 'FAIL 9c: ' || r::text end);
  r := t2_buyurtma_otish_v1(uy, y, op3, b, v, 'tayyor', 'yuklashga_tayyor', null, null);
  rep := rep || (case when (r->>'ok')::boolean and r->>'bosqich' = 'yuklashga_tayyor' then 'OK   9d yuklashga_tayyor' else 'FAIL 9d: ' || r::text end);
  select count(*) into n from t2_outbox where kompaniya_id = y and mavzu = 'buyurtma.yuklashga_tayyor' and entity_id = b;
  rep := rep || (case when n = 1 then 'OK   10 outbox buyurtma.yuklashga_tayyor — 1 qator' else 'FAIL 10 outbox: ' || n end);
  v := v + 1;

  -- 11. begona tenant ko'ra olmaydi / o'tkaza olmaydi; ijrochi ro'yxatda ko'radi
  r := t2_buyurtma_tafsilot_v1(uz, z, b);
  rep := rep || (case when r->>'code' = 'TOPILMADI' then 'OK   11a begona tafsilot — TOPILMADI' else 'FAIL 11a: ' || r::text end);
  r := t2_buyurtma_otish_v1(uz, z, gen_random_uuid(), b, v, 'topshirildi', null, null, null);
  rep := rep || (case when r->>'code' = 'TOPILMADI' then 'OK   11b begona o''tish — TOPILMADI' else 'FAIL 11b: ' || r::text end);
  r := t2_buyurtmalar_v1(uy, y, 'menga', null, null, 50, null);
  rep := rep || (case when jsonb_array_length(r->'qatorlar') >= 1 and (r->'qatorlar'->0->'obyekt_id') = 'null'::jsonb then 'OK   11c ijrochi o''z buyurtmasini ko''radi, xaridor obyekti yashirin' else 'FAIL 11c: ' || r::text end);
  r := t2_buyurtmalar_v1(uz, z, 'menga', null, null, 50, null);
  rep := rep || (case when jsonb_array_length(r->'qatorlar') = 0 then 'OK   11d begona ro''yxati bo''sh' else 'FAIL 11d: ' || r::text end);

  -- 12. yetkazildi (topshirildi) va qabul: sertifikatsiz -> ogohlantirish; qisman
  r := t2_buyurtma_otish_v1(uy, y, gen_random_uuid(), b, v, 'topshirildi', 'yetkazildi', null, null);
  rep := rep || (case when (r->>'ok')::boolean then 'OK   12a yetkazildi (topshirildi)' else 'FAIL 12a: ' || r::text end);
  v := v + 1;
  select array_agg(id order by qator_no) into qid from t2_buyurtma_qator where buyurtma_id = b;
  r := t2_buyurtma_qabul_v1(ux, x, op4, b, v, jsonb_build_array(jsonb_build_object('buyurtma_qator_id', qid[1], 'qabul_miqdor', 8, 'holat', 'butun'),
                                                                 jsonb_build_object('buyurtma_qator_id', qid[2], 'qabul_miqdor', 5, 'holat', 'butun')), null, 'test');
  rep := rep || (case when (r->>'ok')::boolean and r->>'holat' = 'qisman' and r->'ogohlantirish' ? 'SERTIFIKAT_YOQ' then 'OK   12b kam qabul -> qisman + SERTIFIKAT_YOQ ogohlantirish' else 'FAIL 12b: ' || r::text end);
  rep := rep || (case when (select qabul_holat from t2_buyurtma_qator where id = qid[1]) = 'kam' then 'OK   12c kam qabul qilingan qator "kam"' else 'FAIL 12c' end);
  v := v + 1;
  r := t2_buyurtma_otish_v1(ux, x, gen_random_uuid(), b, v, 'qabul_qilindi_yakuniy', null, 'kelishildi', null);
  rep := rep || (case when (r->>'ok')::boolean and r->>'holat' = 'qabul_qilindi_yakuniy' then 'OK   12d nizoli/qisman -> yakuniy (xaridor)' else 'FAIL 12d: ' || r::text end);
  v := v + 1;
  r := t2_buyurtma_otish_v1(uy, y, gen_random_uuid(), b, v, 'qabul_qilindi_yakuniy', 'hisob_faktura', null, null);
  rep := rep || (case when (r->>'ok')::boolean and r->>'bosqich' = 'hisob_faktura' then 'OK   12e hisob_faktura bosqichi (yetkazuvchi)' else 'FAIL 12e: ' || r::text end);
  select count(*) into n from t2_outbox where mavzu = 'buyurtma.qabul_qilindi' and entity_id = b;
  rep := rep || (case when n >= 1 then 'OK   12f outbox buyurtma.qabul_qilindi' else 'FAIL 12f outbox' end);

  -- 13. aloqa yopilgach ijrochi ko'ra olmaydi
  update t2_tomon_aloqa set holat = 'yopilgan' where id = al;
  r := t2_buyurtma_tafsilot_v1(uy, y, b);
  rep := rep || (case when r->>'code' = 'TOPILMADI' then 'OK   13a aloqa yopiq — ijrochi tafsilot TOPILMADI' else 'FAIL 13a: ' || r::text end);
  r := t2_buyurtmalar_v1(uy, y, 'menga', null, null, 50, null);
  rep := rep || (case when jsonb_array_length(r->'qatorlar') = 0 then 'OK   13b aloqa yopiq — ro''yxat bo''sh' else 'FAIL 13b' end);

  -- 14. anon/authenticated RPC ni chaqira olmaydi, service_role oladi
  rep := rep || (case when not has_function_privilege('anon', 't2_buyurtma_yarat_v1(bigint,bigint,uuid,text,bigint,bigint,bigint,bigint,jsonb,jsonb)', 'execute')
                       and not has_function_privilege('authenticated', 't2_buyurtma_otish_v1(bigint,bigint,uuid,bigint,integer,text,text,text,bigint[])', 'execute')
                       and has_function_privilege('service_role', 't2_buyurtma_otish_v1(bigint,bigint,uuid,bigint,integer,text,text,text,bigint[])', 'execute')
                      then 'OK   14 anon/authenticated yo''q, service_role bor' else 'FAIL 14 grant' end);
  rep := rep || (case when not has_table_privilege('anon', 't2_buyurtma', 'select') and not has_table_privilege('authenticated', 't2_buyurtma_qator', 'select')
                      then 'OK   15 jadvallarga to''g''ridan GRANT yo''q' else 'FAIL 15 table grant' end);

  raise exception 'TEST_BUYURTMA %', array_to_string(rep, E'\n');
end $$;
