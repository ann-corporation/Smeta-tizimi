-- ACCEPTANCE: 20261122000000_t2_tender_protsess_v1 (self-seeding, sintetik, oxirida ROLLBACK).
-- Talab: P2/P3 migratsiyalari + shu migratsiya. Natija: har tekshiruv 'OK'/'FAIL' notice; FAIL bo'lsa exception.
begin;
do $$
declare
  x bigint; y bigint; w bigint; z bigint; ux bigint; uxk bigint; uxp bigint; uy bigint; uw bigint; uz bigint;
  ay bigint; aw bigint; r jsonb; rfq bigint; v integer; rep text[] := array[]::text[]; n integer; t1 bigint; t2 bigint; q1 bigint; q2 bigint; sid bigint; sh bigint; sz bigint; b1 bigint; rfq3 bigint; v3 integer; q3 bigint; s0 numeric; ids bigint[];
  qs jsonb := jsonb_build_array(
    jsonb_build_object('nom', 'Sement M400', 'birlik', 'tonna', 'miqdor', 10, 'lot_no', 1, 'lot_nom', 'Material'),
    jsonb_build_object('nom', 'Armatura d12', 'birlik', 'tonna', 'miqdor', 2, 'lot_no', 1, 'lot_nom', 'Material', 'talab_sana', '2027-01-15'));
  mf jsonb := '{"sarlavha":"Sinov tender","byudjet_qqs_bilan":50000000,"baholash_usuli":"ball","meyor":{"narx":60,"muddat":20,"reyting":20},"tolov_sharti":"50% oldindan"}'::jsonb;
  op uuid;
begin
  insert into t2_kompaniya (nom, kod, inn, faol) values ('TST_X', 'TX', '910000001', true) returning id into x;
  insert into t2_kompaniya (nom, kod, inn, faol) values ('TST_Y', 'TY', '910000002', true) returning id into y;
  insert into t2_kompaniya (nom, kod, inn, faol) values ('TST_W', 'TW', '910000003', true) returning id into w;
  insert into t2_kompaniya (nom, kod, inn, faol) values ('TST_Z', 'TZ', '910000004', true) returning id into z;
  insert into t2_foydalanuvchi (login, ism, holat) values ('tt_x', 'boss', 'faol') returning id into ux;
  insert into t2_foydalanuvchi (login, ism, holat) values ('tt_xk', 'kuz', 'faol') returning id into uxk;
  insert into t2_foydalanuvchi (login, ism, holat) values ('tt_xp', 'pto', 'faol') returning id into uxp;
  insert into t2_foydalanuvchi (login, ism, holat) values ('tt_y', 'y', 'faol') returning id into uy;
  insert into t2_foydalanuvchi (login, ism, holat) values ('tt_w', 'w', 'faol') returning id into uw;
  insert into t2_foydalanuvchi (login, ism, holat) values ('tt_z', 'z', 'faol') returning id into uz;
  insert into t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values (ux, x, 'boss', 'faol'), (uxk, x, 'kuzatuvchi', 'faol'), (uxp, x, 'pto', 'faol'),
    (uy, y, 'boss', 'faol'), (uw, w, 'boss', 'faol'), (uz, z, 'boss', 'faol');
  insert into t2_tomon_aloqa (taklif_kompaniya_id, qabul_kompaniya_id, taklif_rol, qabul_rol, turi, holat, taklif_actor_id) values (x, y, 'xaridor', 'yetkazuvchi', 'kontakt', 'faol', ux) returning id into ay;
  insert into t2_tomon_aloqa (taklif_kompaniya_id, qabul_kompaniya_id, taklif_rol, qabul_rol, turi, holat, taklif_actor_id) values (x, w, 'xaridor', 'yetkazuvchi', 'kontakt', 'faol', ux) returning id into aw;
  insert into t2_shartnoma (kompaniya_id, raqam) values (x, 'SH-1') returning id into sh;

  -- 1 qoralama: PTO yozadi (procurement.write)
  r := t2_tender_saqla_v1(uxp, x, gen_random_uuid(), null, null, 'material', 'taklif', array[y, w], null, now() + interval '3 days', mf, qs);
  rfq := (r->>'id')::bigint;
  rep := rep || (case when (r->>'ok')::boolean and r->>'raqam' like 'T-%-0001' then 'OK   1 qoralama yaratildi ' || (r->>'raqam') else 'FAIL 1 ' || r::text end);
  -- 2 kuzatuvchi yoza olmaydi, begona actor ham
  begin perform t2_tender_saqla_v1(uxk, x, gen_random_uuid(), null, null, 'material', 'ochiq', null, null, null, mf, qs); rep := rep || 'FAIL 2 kuzatuvchi o''tdi';
  exception when others then rep := rep || (case when sqlstate = '42501' then 'OK   2 kuzatuvchi 42501' else 'FAIL 2 ' || sqlerrm end); end;
  begin perform t2_tender_saqla_v1(uz, x, gen_random_uuid(), null, null, 'material', 'ochiq', null, null, null, mf, qs); rep := rep || 'FAIL 3 begona o''tdi';
  exception when others then rep := rep || (case when sqlstate = '42501' then 'OK   3 begona actor 42501' else 'FAIL 3 ' || sqlerrm end); end;
  -- 4 meyor yig'indisi 100 emas -> rad
  r := t2_tender_saqla_v1(uxp, x, gen_random_uuid(), null, null, 'material', 'ochiq', null, null, null, mf || '{"meyor":{"narx":50,"muddat":20}}'::jsonb, qs);
  rep := rep || (case when r->>'code' = 'MEYOR_YIGINDI' then 'OK   4 meyor yig''indisi tekshirildi' else 'FAIL 4 ' || r::text end);
  -- 5 qoralama yetkazuvchiga KO'RINMAYDI
  r := t2_tender_royxat_v1(uy, y, 'menga', null, null, 50, null);
  rep := rep || (case when jsonb_array_length(r->'qatorlar') = 0 then 'OK   5 qoralama yetkazuvchiga ko''rinmaydi' else 'FAIL 5 ' || r::text end);
  r := t2_tender_tafsilot_v2(uy, y, rfq);
  rep := rep || (case when r->>'code' = 'TOPILMADI' then 'OK   6 qoralama tafsiloti yopiq' else 'FAIL 6 ' || r::text end);
  -- 7 e'londa tahrir/ idempotent: yangilash
  select versiya into v from t2_birja_rfq where id = rfq;
  r := t2_tender_saqla_v1(uxp, x, gen_random_uuid(), rfq, v, 'material', 'taklif', array[y, w], null, now() + interval '3 days', mf, qs);
  rep := rep || (case when (r->>'ok')::boolean and (r->>'versiya')::int = v + 1 then 'OK   7 qoralama tahrirlandi' else 'FAIL 7 ' || r::text end);
  select versiya into v from t2_birja_rfq where id = rfq;
  -- 8 tasdiqga yuborish (PTO), PTO tasdiqlay olmaydi
  r := t2_tender_otish_v1(uxp, x, gen_random_uuid(), rfq, v, 'tasdiqlashda');
  rep := rep || (case when (r->>'ok')::boolean and r->>'holat' = 'tasdiqlashda' then 'OK   8 tasdiqga yuborildi' else 'FAIL 8 ' || r::text end);
  select versiya into v from t2_birja_rfq where id = rfq;
  begin perform t2_tender_otish_v1(uxp, x, gen_random_uuid(), rfq, v, 'elon'); rep := rep || 'FAIL 9 PTO e''lon qildi';
  exception when others then rep := rep || (case when sqlstate = '42501' then 'OK   9 PTO e''lon qila olmaydi (procurement.approve)' else 'FAIL 9 ' || sqlerrm end); end;
  -- 10 qaytarish izohsiz rad, izoh bilan ok; qayta yuborish
  r := t2_tender_otish_v1(ux, x, gen_random_uuid(), rfq, v, 'qoralama');
  rep := rep || (case when r->>'code' = 'IZOH_KERAK' then 'OK   10 qaytarish izoh talab qiladi' else 'FAIL 10 ' || r::text end);
  r := t2_tender_otish_v1(ux, x, gen_random_uuid(), rfq, v, 'qoralama', 'Narx diapazonini aniqlang');
  select versiya into v from t2_birja_rfq where id = rfq;
  r := t2_tender_otish_v1(uxp, x, gen_random_uuid(), rfq, v, 'tasdiqlashda');
  select versiya into v from t2_birja_rfq where id = rfq;
  -- 11 versiya eskirgan
  r := t2_tender_otish_v1(ux, x, gen_random_uuid(), rfq, v - 1, 'elon');
  rep := rep || (case when r->>'code' = 'VERSIYA_ESKI' then 'OK   11 eski versiya rad' else 'FAIL 11 ' || r::text end);
  -- 12 e'lon (boss), idempotent
  op := gen_random_uuid();
  r := t2_tender_otish_v1(ux, x, op, rfq, v, 'elon');
  rep := rep || (case when (r->>'ok')::boolean and r->>'holat' = 'elon' then 'OK   12 e''lon qilindi' else 'FAIL 12 ' || r::text end);
  r := t2_tender_otish_v1(ux, x, op, rfq, v, 'elon');
  rep := rep || (case when (r->>'takror')::boolean then 'OK   13 takror chaqiruv idempotent' else 'FAIL 13 ' || r::text end);
  select count(*) into n from t2_birja_rfq_oluvchi where rfq_id = rfq;
  rep := rep || (case when n = 2 then 'OK   14 2 ta oluvchi yaratildi' else 'FAIL 14 ' || n end);
  -- 15 yetkazuvchi tafsiloti: byudjet yashirin, qabul ro'yxati yashirin
  r := t2_tender_tafsilot_v2(uy, y, rfq);
  rep := rep || (case when (r->>'ok')::boolean and (r->'rfq'->'byudjet_qqs_bilan') = 'null'::jsonb and (r->'rfq'->'qabul_kompaniya_idlar') = 'null'::jsonb then 'OK   15 byudjet va oluvchilar yetkazuvchidan yashirin' else 'FAIL 15 ' || r::text end);
  select (jsonb_path_query_array(r->'qatorlar', '$[*].id'))->>0, (jsonb_path_query_array(r->'qatorlar', '$[*].id'))->>1 into q1, q2;
  -- 16 begona kompaniya ko'ra olmaydi
  r := t2_tender_tafsilot_v2(uz, z, rfq);
  rep := rep || (case when r->>'code' = 'TOPILMADI' then 'OK   16 begona kompaniya ko''rmaydi' else 'FAIL 16 ' || r::text end);
  -- 17 savol (Y), javob (X), ommaviy: W ham javobni ko'radi, Y ning savol nomi W ga ko'rinmaydi
  r := t2_tender_savol_ber_v1(uy, y, gen_random_uuid(), rfq, 'Yetkazish DAP shartidami?');
  sid := (r->>'id')::bigint;
  rep := rep || (case when (r->>'ok')::boolean then 'OK   17 savol berildi' else 'FAIL 17 ' || r::text end);
  r := t2_tender_tafsilot_v2(uw, w, rfq);
  rep := rep || (case when jsonb_array_length(r->'savollar') = 0 then 'OK   18 javobsiz savol boshqaga ko''rinmaydi' else 'FAIL 18 ' || r::text end);
  r := t2_tender_javob_v1(ux, x, gen_random_uuid(), sid, 'Ha, DAP obyekt.', true);
  rep := rep || (case when (r->>'ok')::boolean then 'OK   19 javob berildi' else 'FAIL 19 ' || r::text end);
  r := t2_tender_tafsilot_v2(uw, w, rfq);
  rep := rep || (case when jsonb_array_length(r->'savollar') = 1 and (r->'savollar'->0->>'meniki')::boolean = false and r->'savollar'->0->'savol_nom' = 'null'::jsonb then 'OK   20 ommaviy javob nomsiz ko''rinadi' else 'FAIL 20 ' || r::text end);
  -- 21 taklif Y va W (muhrlangan). Narx 0 emas: bo'sh narx rad
  r := t2_tender_taklif_v2(uy, y, gen_random_uuid(), rfq, jsonb_build_array(jsonb_build_object('rfq_qator_id', q1, 'narx', 1000000, 'muddat_kun', 10), jsonb_build_object('rfq_qator_id', q2, 'narx', 8000000, 'muddat_kun', 10)),
                           'Y taklifi', '{"tolov_sharti":"30% oldindan","amal_kun":30,"kafolat_oy":12}'::jsonb);
  t1 := (r->>'id')::bigint;
  rep := rep || (case when (r->>'ok')::boolean then 'OK   21 Y taklif berdi' else 'FAIL 21 ' || r::text end);
  r := t2_tender_taklif_v2(uw, w, gen_random_uuid(), rfq, jsonb_build_array(jsonb_build_object('rfq_qator_id', q1, 'narx', 950000, 'muddat_kun', 20), jsonb_build_object('rfq_qator_id', q2, 'narx', 8500000, 'muddat_kun', 7)), 'W', null);
  t2 := (r->>'id')::bigint;
  rep := rep || (case when (r->>'ok')::boolean then 'OK   22 W taklif berdi' else 'FAIL 22 ' || r::text end);
  select qqs_foiz into v from t2_birja_taklif where id = t2;
  rep := rep || (case when v = 12 then 'OK   23 QQS tenderdan olindi (12)' else 'FAIL 23 qqs=' || v end);
  r := t2_tender_taklif_v2(uy, y, gen_random_uuid(), rfq, jsonb_build_array(jsonb_build_object('rfq_qator_id', q1, 'narx', 'x')), null, null);
  rep := rep || (case when r->>'code' = 'QATOR_NARX' then 'OK   24 noto''g''ri narx rad' else 'FAIL 24 ' || r::text end);
  -- 25 MUHR: xaridor takliflarni ko'rmaydi (faqat soni), tafsilot v1 yopilgan
  r := t2_tender_tafsilot_v2(ux, x, rfq);
  rep := rep || (case when jsonb_array_length(r->'takliflar') = 0 and (r->>'takliflar_soni')::int = 2 and not (r->>'ochilgan')::boolean then 'OK   25 muhr: xaridor faqat sonini ko''radi (2)' else 'FAIL 25 ' || r::text end);
  -- 26 yetkazuvchi faqat o'z taklifini ko'radi
  r := t2_tender_tafsilot_v2(uy, y, rfq);
  rep := rep || (case when jsonb_array_length(r->'takliflar') = 1 and (r->'takliflar'->0->>'yetkazuvchi_kompaniya_id')::bigint = y then 'OK   26 yetkazuvchi faqat o''z taklifini ko''radi' else 'FAIL 26 ' || r::text end);
  -- 27 muddatdan oldin ochib bo'lmaydi
  select versiya into v from t2_birja_rfq where id = rfq;
  r := t2_tender_otish_v1(ux, x, gen_random_uuid(), rfq, v, 'baholash');
  rep := rep || (case when r->>'code' = 'MUDDAT_OTMAGAN' then 'OK   27 muddatdan oldin ochib bo''lmaydi' else 'FAIL 27 ' || r::text end);
  -- 28 muddat o'tdi: taklif rad, ochish mumkin
  update t2_birja_rfq set muddat = now() - interval '1 minute' where id = rfq;
  r := t2_tender_taklif_v2(uy, y, gen_random_uuid(), rfq, jsonb_build_array(jsonb_build_object('rfq_qator_id', q1, 'narx', 900000)), null, null);
  rep := rep || (case when r->>'code' = 'MUDDAT_OTGAN' then 'OK   28 muddatdan keyin taklif rad' else 'FAIL 28 ' || r::text end);
  r := t2_tender_taklif_qaytar_v2(uy, y, gen_random_uuid(), t1, 1);
  rep := rep || (case when r->>'code' = 'MUDDAT_OTGAN' then 'OK   29 muddatdan keyin qaytarib bo''lmaydi' else 'FAIL 29 ' || r::text end);
  -- 30 PTO ocha olmaydi (procurement.approve), boss ochadi
  select versiya into v from t2_birja_rfq where id = rfq;
  begin perform t2_tender_otish_v1(uxp, x, gen_random_uuid(), rfq, v, 'baholash'); rep := rep || 'FAIL 30 PTO ochdi';
  exception when others then rep := rep || (case when sqlstate = '42501' then 'OK   30 PTO ocha olmaydi' else 'FAIL 30 ' || sqlerrm end); end;
  r := t2_tender_otish_v1(ux, x, gen_random_uuid(), rfq, v, 'baholash');
  rep := rep || (case when (r->>'ok')::boolean and r->>'holat' = 'baholash' then 'OK   31 takliflar ochildi' else 'FAIL 31 ' || r::text end);
  select versiya into v from t2_birja_rfq where id = rfq;
  r := t2_tender_tafsilot_v2(ux, x, rfq);
  rep := rep || (case when (r->>'ochilgan')::boolean and jsonb_array_length(r->'takliflar') = 2 and r->'takliflar'->0->>'yetkazuvchi_nom' is not null then 'OK   32 ochilgach xaridor 2 taklifni nomlari bilan ko''radi' else 'FAIL 32 ' || r::text end);
  r := t2_tender_tafsilot_v2(uw, w, rfq);
  rep := rep || (case when jsonb_array_length(r->'takliflar') = 1 and r->'jurnal' = '[]'::jsonb then 'OK   33 raqobatchi faqat o''zini ko''radi, jurnal yopiq' else 'FAIL 33 ' || r::text end);
  -- 34 baholash: mezon vazni bo'yicha normallashgan jami
  r := t2_tender_baholash_saqla_v1(ux, x, gen_random_uuid(), rfq, v, jsonb_build_array(jsonb_build_object('taklif_id', t1, 'ballar', '{"narx":90,"muddat":70}'::jsonb), jsonb_build_object('taklif_id', t2, 'ballar', '{"narx":100,"muddat":100}'::jsonb)));
  select jami_ball into s0 from t2_tender_baho where taklif_id = t1;
  rep := rep || (case when (r->>'ok')::boolean and s0 = 85.00 then 'OK   34 baholash saqlandi (jami 85.00)' else 'FAIL 34 ' || r::text || ' ' || coalesce(s0::text, 'null') end);
  select versiya into v from t2_birja_rfq where id = rfq;
  r := t2_tender_baholash_saqla_v1(ux, x, gen_random_uuid(), rfq, v, jsonb_build_array(jsonb_build_object('taklif_id', t1, 'ballar', '{"kafolat":50}'::jsonb)));
  rep := rep || (case when r->>'code' = 'BALLAR_NOTOGRI' then 'OK   35 meyorda yo''q mezon rad' else 'FAIL 35 ' || r::text end);
  -- 36 g'olib: asossiz rad; PTO rad; bo'linma g'olib (q1 -> W, q2 -> Y)
  r := t2_tender_golib_v2(ux, x, gen_random_uuid(), rfq, v, jsonb_build_array(jsonb_build_object('taklif_id', t2)), 'qisqa');
  rep := rep || (case when r->>'code' = 'ASOS_KERAK' then 'OK   36 asossiz g''olib rad' else 'FAIL 36 ' || r::text end);
  begin perform t2_tender_golib_v2(uxp, x, gen_random_uuid(), rfq, v, jsonb_build_array(jsonb_build_object('taklif_id', t2)), 'yetarli uzun asos matni'); rep := rep || 'FAIL 37 PTO g''olib tanladi';
  exception when others then rep := rep || (case when sqlstate = '42501' then 'OK   37 PTO g''olib tanlay olmaydi' else 'FAIL 37 ' || sqlerrm end); end;
  r := t2_tender_golib_v2(ux, x, gen_random_uuid(), rfq, v, jsonb_build_array(jsonb_build_object('taklif_id', t2, 'qator_idlar', jsonb_build_array(q1)), jsonb_build_object('taklif_id', t1, 'qator_idlar', jsonb_build_array(q2))),
                          'W 1-pozitsiyada arzon, Y 2-pozitsiyada arzon va tez');
  rep := rep || (case when (r->>'ok')::boolean and jsonb_array_length(r->'buyurtma_idlar') = 2 and r->>'holat' = 'golib_tanlandi' then 'OK   38 bo''linma g''olib: 2 ta buyurtma, tender golib_tanlandi' else 'FAIL 38 ' || r::text end);
  b1 := (r->'buyurtma_idlar'->>0)::bigint;
  select versiya into v from t2_birja_rfq where id = rfq;
  -- 39 QQS bilan tejam (byudjet 50 000 000; g'olib 25 500 000 * 1.12 = 28 560 000)
  r := t2_tender_tahlil_v1(ux, x, null, null);
  rep := rep || (case when (r->'tenderlar'->0->>'golib_qqs_bilan')::numeric = 28560000 and (r->'tenderlar'->0->>'tejam_qqs_bilan')::numeric = 21440000 then 'OK   39 tahlil: tejam QQS bilan 21 440 000' else 'FAIL 39 ' || r::text end);
  -- 40 v1 xavfli yo'llar yopilgan, v2 ochiq
  rep := rep || (case when not has_function_privilege('service_role', 'public.t2_tender_golib_v1(bigint,bigint,uuid,bigint,integer,bigint,bigint[],jsonb)', 'execute')
                       and not has_function_privilege('service_role', 'public.t2_tender_elon_v1(bigint,bigint,uuid,text,text,bigint[],bigint,timestamptz,jsonb,jsonb)', 'execute')
                       and not has_function_privilege('service_role', 'public.t2_tender_tafsilot_v1(bigint,bigint,bigint)', 'execute')
                       and has_function_privilege('service_role', 'public.t2_tender_golib_v2(bigint,bigint,uuid,bigint,integer,jsonb,text,boolean,jsonb)', 'execute')
                       and not has_function_privilege('authenticated', 'public.t2_tender_golib_v2(bigint,bigint,uuid,bigint,integer,jsonb,text,boolean,jsonb)', 'execute')
                  then 'OK   40 v1 yo''llar yopiq, v2 faqat service_role' else 'FAIL 40 grantlar' end);
  -- 41 shartnomaga bog'lash: begona shartnoma rad, o'zinikini qabul
  insert into t2_shartnoma (kompaniya_id, raqam) values (z, 'SH-Z') returning id into sz;
  r := t2_tender_otish_v1(uxp, x, gen_random_uuid(), rfq, v, 'shartnoma', null, sz);
  rep := rep || (case when r->>'code' = 'SHARTNOMA_BEGONA' then 'OK   41 begona shartnoma rad' else 'FAIL 41 ' || r::text end);
  r := t2_tender_otish_v1(uxp, x, gen_random_uuid(), rfq, v, 'shartnoma', null, sh);
  rep := rep || (case when (r->>'ok')::boolean then 'OK   42 shartnomaga bog''landi' else 'FAIL 42 ' || r::text end);
  select versiya into v from t2_birja_rfq where id = rfq;
  r := t2_tender_otish_v1(ux, x, gen_random_uuid(), rfq, v, 'yopildi');
  rep := rep || (case when r->>'code' = 'HOLAT' then 'OK   43 shartnomadan to''g''ri yopib bo''lmaydi (avval bajarilmoqda)' else 'FAIL 43 ' || r::text end);
  r := t2_tender_otish_v1(uxp, x, gen_random_uuid(), rfq, v, 'bajarilmoqda');
  select versiya into v from t2_birja_rfq where id = rfq;
  -- 44 reyting: yetkazilmagan buyurtmaga ball yo'q; qabul qilingach 1..5
  r := t2_tender_baho_ber_v1(uxp, x, gen_random_uuid(), b1, 5, 'a''lo');
  rep := rep || (case when r->>'code' = 'HOLAT' then 'OK   44 yetkazilmagan buyurtmaga reyting yo''q' else 'FAIL 44 ' || r::text end);
  update t2_buyurtma set holat = 'qabul_qilindi_yakuniy' where id = b1;
  r := t2_tender_baho_ber_v1(uxp, x, gen_random_uuid(), b1, 9, null);
  rep := rep || (case when r->>'code' = 'BALL_NOTOGRI' then 'OK   45 ball 1..5' else 'FAIL 45 ' || r::text end);
  r := t2_tender_baho_ber_v1(uxp, x, gen_random_uuid(), b1, 5, 'a''lo');
  rep := rep || (case when (r->>'ok')::boolean then 'OK   46 reyting berildi' else 'FAIL 46 ' || r::text end);
  r := t2_tender_baho_ber_v1(uxp, x, gen_random_uuid(), b1, 4, null);
  rep := rep || (case when r->>'code' = 'BAHO_BOR' then 'OK   47 ikkinchi reyting rad' else 'FAIL 47 ' || r::text end);
  r := t2_tender_otish_v1(ux, x, gen_random_uuid(), rfq, v, 'yopildi');
  rep := rep || (case when (r->>'ok')::boolean then 'OK   48 tender yopildi' else 'FAIL 48 ' || r::text end);
  -- 49 jurnal to'liq (egasi), taklif voqealari ochilgandan keyin ko'rinadi
  r := t2_tender_tafsilot_v2(ux, x, rfq);
  select count(*) into n from jsonb_array_elements(r->'jurnal') j where j->>'hodisa' in ('yaratildi', 'tahrirlandi', 'holat', 'savol', 'javob', 'taklif', 'baholandi', 'golib', 'reyting');
  rep := rep || (case when n >= 15 then 'OK   49 audit jurnali to''liq (' || n || ' yozuv)' else 'FAIL 49 ' || n end);
  begin update t2_tender_jurnal set hodisa = 'x' where rfq_id = rfq; rep := rep || 'FAIL 50 jurnal o''zgardi';
  exception when others then rep := rep || (case when sqlstate = '42501' then 'OK   50 jurnal o''zgarmas' else 'FAIL 50 ' || sqlerrm end); end;

  -- 51..56 qayta raund (BAFO) va v1 aylanib o'tish qo'riqchisi: ikkinchi tender
  perform set_config('tender.v2_golib', '', true);
  r := t2_tender_saqla_v1(ux, x, gen_random_uuid(), null, null, 'xizmat', 'taklif', array[y], null, now() + interval '2 days', '{"sarlavha":"Raund tenderi"}'::jsonb,
                          jsonb_build_array(jsonb_build_object('nom', 'Beton quyish', 'birlik', 'm3', 'miqdor', 100)));
  rfq3 := (r->>'id')::bigint;
  select id into q3 from t2_birja_rfq_qator where rfq_id = rfq3;
  begin update t2_birja_rfq_qator set golib_taklif_qator_id = (select min(id) from t2_birja_taklif_qator) where rfq_id = rfq3; rep := rep || 'FAIL 51 v1 yo''li ochiq';
  exception when others then rep := rep || (case when sqlstate = '42501' then 'OK   51 v1 aylanib o''tish qo''riqchisi ishladi' else 'FAIL 51 ' || sqlerrm end); end;
  select versiya into v3 from t2_birja_rfq where id = rfq3;
  perform t2_tender_otish_v1(ux, x, gen_random_uuid(), rfq3, v3, 'tasdiqlashda'); v3 := v3 + 1;
  perform t2_tender_otish_v1(ux, x, gen_random_uuid(), rfq3, v3, 'elon'); v3 := v3 + 1;
  r := t2_tender_taklif_v2(uy, y, gen_random_uuid(), rfq3, jsonb_build_array(jsonb_build_object('rfq_qator_id', q3, 'narx', 600000)), null, '{"qqs_foiz":0}'::jsonb);
  t1 := (r->>'id')::bigint;
  select qqs_foiz into s0 from t2_birja_taklif where id = t1;
  rep := rep || (case when (r->>'ok')::boolean and s0 = 0 then 'OK   52 QQS to''lovchi bo''lmagan yetkazuvchi 0% bilan' else 'FAIL 52 ' || r::text end);
  update t2_birja_rfq set muddat = now() - interval '1 minute' where id = rfq3;
  r := t2_tender_otish_v1(ux, x, gen_random_uuid(), rfq3, v3, 'baholash'); v3 := v3 + 1;
  r := t2_tender_raund_v1(ux, x, gen_random_uuid(), rfq3, v3, now() + interval '1 day', 'Narxni pasaytiring');
  rep := rep || (case when (r->>'ok')::boolean and (r->>'raund')::int = 2 then 'OK   53 qayta raund ochildi (2)' else 'FAIL 53 ' || r::text end);
  r := t2_tender_tafsilot_v2(ux, x, rfq3);
  rep := rep || (case when jsonb_array_length(r->'takliflar') = 0 and not (r->>'ochilgan')::boolean then 'OK   54 qayta raundda takliflar yana muhrlangan' else 'FAIL 54 ' || r::text end);
  r := t2_tender_taklif_v2(uy, y, gen_random_uuid(), rfq3, jsonb_build_array(jsonb_build_object('rfq_qator_id', q3, 'narx', 550000)), 'BAFO', '{"qqs_foiz":0}'::jsonb);
  select count(*) into n from t2_birja_taklif where rfq_id = rfq3 and holat = 'berildi' and raund = 2;
  rep := rep || (case when (r->>'ok')::boolean and n = 1 then 'OK   55 BAFO taklifi (2-raund) berildi' else 'FAIL 55 ' || r::text end);
  select versiya into v3 from t2_birja_rfq where id = rfq3;
  r := t2_tender_otish_v1(ux, x, gen_random_uuid(), rfq3, v3, 'bekor');
  rep := rep || (case when r->>'code' = 'IZOH_KERAK' then 'OK   56 bekor sabab talab qiladi' else 'FAIL 56 ' || r::text end);
  r := t2_tender_otish_v1(ux, x, gen_random_uuid(), rfq3, v3, 'bekor', 'Byudjet qayta ko''rilmoqda');
  rep := rep || (case when (r->>'ok')::boolean then 'OK   57 bekor qilindi' else 'FAIL 57 ' || r::text end);
  -- 58 ro'yxat: kuzatuvchi o'qiy oladi; ochiq tender ro'yxatida boshqa kompaniya byudjetsiz
  r := t2_tender_royxat_v1(uxk, x, 'meniki', null, null, 50, null);
  rep := rep || (case when jsonb_array_length(r->'qatorlar') = 2 then 'OK   58 kuzatuvchi ro''yxatni ko''radi (2 tender)' else 'FAIL 58 ' || r::text end);
  r := t2_tender_yetkazuvchilar_v1(ux, x);
  rep := rep || (case when jsonb_array_length(r->'qatorlar') = 2 then 'OK   59 yetkazuvchilar ro''yxati (faol aloqa)' else 'FAIL 59 ' || r::text end);

  -- 60-63 fayllar: faqat metadata (R2 hujjat havolasi); begona kompaniya hujjati rad; e'londan keyin tender fayli bog'lanmaydi
  insert into t2_document_registry (kompaniya_id) values (x) returning id into n;
  insert into t2_document_registry (kompaniya_id) values (z) returning id into q3;
  r := t2_tender_saqla_v1(ux, x, gen_random_uuid(), null, null, 'material', 'ochiq', null, null, now() + interval '2 days', '{"sarlavha":"Fayl tenderi"}'::jsonb,
                          jsonb_build_array(jsonb_build_object('nom', 'Qum', 'birlik', 'm3', 'miqdor', 5)));
  rfq3 := (r->>'id')::bigint;
  r := t2_tender_fayl_bogla_v1(ux, x, gen_random_uuid(), rfq3, array[n::bigint]);
  rep := rep || (case when (r->>'ok')::boolean and (r->>'soni')::int = 1 then 'OK   60 tender fayli havolasi bog''landi (R2 hujjat id)' else 'FAIL 60 ' || r::text end);
  r := t2_tender_fayl_bogla_v1(ux, x, gen_random_uuid(), rfq3, array[q3::bigint]);
  rep := rep || (case when r->>'code' = 'DALIL_BEGONA' then 'OK   61 begona kompaniya hujjati rad' else 'FAIL 61 ' || r::text end);
  r := t2_tender_tafsilot_v2(ux, x, rfq3);
  rep := rep || (case when jsonb_array_length(r->'fayllar') = 1 then 'OK   62 tafsilotda fayl metadata (1)' else 'FAIL 62 ' || r::text end);
  select versiya into v3 from t2_birja_rfq where id = rfq3;
  perform t2_tender_otish_v1(ux, x, gen_random_uuid(), rfq3, v3, 'tasdiqlashda');
  r := t2_tender_fayl_bogla_v1(ux, x, gen_random_uuid(), rfq3, array[n::bigint]);
  rep := rep || (case when r->>'code' = 'HOLAT' then 'OK   63 tasdiqqa yuborilgach fayl qo''shib bo''lmaydi' else 'FAIL 63 ' || r::text end);

  select count(*) into n from unnest(rep) l where l like 'FAIL%';
  if n > 0 then raise exception E'TENDER ACCEPTANCE YIQILDI (% ta):\n%', n, array_to_string(rep, E'\n'); end if;
  raise notice E'TENDER ACCEPTANCE: hammasi OK (% tekshiruv)\n%', array_length(rep, 1), array_to_string(rep, E'\n');
end $$;
rollback;
