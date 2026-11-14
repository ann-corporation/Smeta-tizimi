-- ACCEPTANCE: 20261126500000 + 20261126500100 (buxgalteriya) - migratsiya qo'llangan bazada; BEGIN..ROLLBACK, FAQAT sintetik fixture (haqiqiy summa/INN/nom yo'q).
-- Tekshiradi: boshlash (reja+moslik), avto-provodka (F3 realizatsiya+QQS, to'lov, kreditor asoslari), idempotentlik (ikkinchi yurgizish = 0),
-- hujjat o'zgarsa delta, hujjat bekor bo'lsa storno, jurnal o'zgarmasligi (UPDATE/DELETE taqiq), qo'lda provodka + storno, ОСВ (Dt = Kt),
-- kontragent hisob-kitobi, QQS reyestri, davr yopish (ogohlantirish), bank importi (takrorsiz), HR ilgagi, ruxsatlar.
begin;

do $acc$
declare
  k bigint; ub bigint; ur bigint; uy bigint; o bigint; r jsonb; l jsonb; kc bigint; ks bigint; sh_a bigint; sh_s bigint; f3 bigint; tl bigint; pid bigint;
  rep text[] := array[]::text[]; v_state text; op uuid; n bigint; dt numeric; kt numeric; v_row jsonb;
begin
  insert into public.t2_kompaniya (nom, kod, faol) values ('_TEST_BUX_', gen_random_uuid()::text, true) returning id into k;
  insert into public.t2_obyekt (nom, kompaniya_id) values ('_TEST_BUX_O_', k) returning id into o;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('tbx_bug_' || k, 'bugalter', 'faol') returning id into ub;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('tbx_rah_' || k, 'rahbar', 'faol') returning id into ur;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('tbx_buy_' || k, 'buyurtmachi', 'faol') returning id into uy;
  insert into public.t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values (ub, k, 'bugalter', 'faol'), (ur, k, 'rahbar', 'faol'), (uy, k, 'buyurtmachi', 'faol');

  -- 0. Boshlanmagan: avto-provodka rad
  r := public.t2_bux_avto_provodka_v1(ub, k, false, gen_random_uuid());
  rep := rep || (case when r->>'code' = 'BOSHLANMAGAN' then 'OK   boshlanmagan: avto-provodka rad' else 'FAIL boshlanmagan: ' || r::text end);

  -- 1. Boshlash: reja + moslik, takror chaqiruv (boshqa operation_id) hech narsa qo'shmaydi
  r := public.t2_bux_boshlash_v1(ub, k, gen_random_uuid());
  rep := rep || (case when (r->>'ok')::boolean and (r->>'hisob_qoshildi')::int >= 25 and (r->>'moslik_qoshildi')::int >= 11 then 'OK   boshlash: reja va moslik yaratildi' else 'FAIL boshlash: ' || r::text end);
  r := public.t2_bux_boshlash_v1(ub, k, gen_random_uuid());
  rep := rep || (case when (r->>'hisob_qoshildi')::int = 0 and (r->>'moslik_qoshildi')::int = 0 then 'OK   boshlash takror: qo''shilmadi' else 'FAIL boshlash takror: ' || r::text end);

  -- 2. Fixture: buyurtmachi (asosiy shartnoma) + F3 (QQS bilan 1120) + to'lov 500; kreditor (import) + to'lov
  insert into public.t2_kontragent (kompaniya_id, nom) values (k, 'TEST BUYURTMACHI') returning id into kc;
  set local session_replication_role = replica;
  insert into public.t2_shartnoma (kompaniya_id, raqam, asosiy, turi, taraf) values (k, 'TB-A', true, 'Bosh shartnoma', 'TEST BUYURTMACHI') returning id into sh_a;
  insert into public.t2_shartnoma_tomon (kompaniya_id, shartnoma_id, rol, kontragent_id, nom, tartib) values (k, sh_a, 'Zakazchik', kc, 'TEST BUYURTMACHI', 1);
  insert into public.t2_forma3 (kompaniya_id, shartnoma_id, davr_boshi, davr_oxiri, holat, manba, sotuv_summa, sotuv_sana, nds_foiz, raqam)
    values (k, sh_a, '2026-01-01', '2026-01-31', 'tayyor', 'sotuv', 1120, '2026-01-31', 12, 'F3-1') returning id into f3;
  insert into public.t2_tolov (kompaniya_id, shartnoma_id, sana, summa, tur, manba) values (k, sh_a, '2026-02-05', 500, 'tolov', 'qolda') returning id into tl;
  set local session_replication_role = origin;
  r := public.t2_qarzdorlik_import_v1(ub, k, jsonb_build_array(
    jsonb_build_object('kontragent', 'TEST POSTAVSHIK', 'raqam', 'TB-S', 'turi', 'postavshik',
      'qatorlar', jsonb_build_array(
        jsonb_build_object('tur', 'yetkazib_berish', 'hujjat_raqam', 'N-1', 'sana', '2026-01-10', 'summa', 560),
        jsonb_build_object('tur', 'bajarilgan_ish', 'hujjat_raqam', 'A-1', 'sana', '2026-01-20', 'summa', 1120),
        jsonb_build_object('tur', 'tolov', 'hujjat_raqam', 'P-1', 'sana', '2026-02-01', 'summa', 300),
        jsonb_build_object('tur', 'boshlangich_qoldiq', 'sana', '2026-01-01', 'summa', 200)))), o, gen_random_uuid());
  select id into sh_s from public.t2_shartnoma where kompaniya_id = k and raqam = 'TB-S';
  select t.kontragent_id into ks from public.t2_shartnoma_tomon t where t.shartnoma_id = sh_s limit 1;

  -- 3. Quruq yurgizish: hech narsa yozilmaydi
  r := public.t2_bux_avto_provodka_v1(ub, k, true, gen_random_uuid());
  select count(*) into n from public.t2_bux_provodka where kompaniya_id = k;
  rep := rep || (case when (r->>'dry')::boolean and (r->>'yangi')::int = 9 and n = 0 then 'OK   dry: 9 provodka hisoblandi, yozilmadi' else 'FAIL dry: ' || r::text end);

  -- 4. Haqiqiy yurgizish: F3 2 + to'lov 1 + yetkazish 2 + ish 2 + qarz-tolov 1 + boshlangich 1 = 9
  r := public.t2_bux_avto_provodka_v1(ub, k, false, gen_random_uuid());
  select count(*) into n from public.t2_bux_provodka where kompaniya_id = k;
  rep := rep || (case when (r->>'ok')::boolean and (r->>'yangi')::int = n and n = 9 then 'OK   avto: 9 provodka yozildi' else 'FAIL avto: ' || r::text || ' n=' || n end);

  -- 4b. Realizatsiya: Dt 4010 / Kt 9010 = 1000, QQS Dt 4010 / Kt 6410 = 120; kontragent analitikasi
  rep := rep || (case when (select summa from public.t2_bux_provodka where kompaniya_id = k and manba_tur = 'forma3' and qism = 'asosiy' and dt_kod = '4010' and kt_kod = '9010') = 1000
                       and (select summa from public.t2_bux_provodka where kompaniya_id = k and manba_tur = 'forma3' and qism = 'nds_sotuv' and dt_kod = '4010' and kt_kod = '6410') = 120
                       and (select kontragent_id from public.t2_bux_provodka where kompaniya_id = k and manba_tur = 'forma3' and qism = 'asosiy') = kc
                      then 'OK   realizatsiya 1000 + QQS 120, kontragent bog''langan' else 'FAIL realizatsiya' end);
  -- 4c. To'lov: Dt 5110 / Kt 4010 = 500; kreditor: yetkazish 500+60, ish Dt 2010 1000 + QQS 120, to'lov Dt 6010/Kt 5110 300, boshlangich Dt 8810/Kt 6010 200
  rep := rep || (case when (select summa from public.t2_bux_provodka where kompaniya_id = k and manba_tur = 'tolov' and manba_id = tl and dt_kod = '5110' and kt_kod = '4010') = 500
                       and (select sum(summa) from public.t2_bux_provodka where kompaniya_id = k and manba_tur = 'qarz_yetkazish' and dt_kod = '1010' and kt_kod = '6010') = 500
                       and (select sum(summa) from public.t2_bux_provodka where kompaniya_id = k and manba_tur = 'qarz_ish' and dt_kod = '2010' and kt_kod = '6010') = 1000
                       and (select sum(summa) from public.t2_bux_provodka where kompaniya_id = k and qism = 'nds_xarid' and dt_kod = '4410' and kt_kod = '6010') = 180
                       and (select summa from public.t2_bux_provodka where kompaniya_id = k and manba_tur = 'qarz_tolov' and dt_kod = '6010' and kt_kod = '5110') = 300
                       and (select summa from public.t2_bux_provodka where kompaniya_id = k and manba_tur = 'qarz_boshlangich' and dt_kod = '8810' and kt_kod = '6010') = 200
                      then 'OK   to''lov va kreditor provodkalari to''g''ri' else 'FAIL to''lov/kreditor provodkalari' end);

  -- 5. Idempotent: ikkinchi yurgizish hech narsa yozmaydi
  r := public.t2_bux_avto_provodka_v1(ub, k, false, gen_random_uuid());
  select count(*) into n from public.t2_bux_provodka where kompaniya_id = k;
  rep := rep || (case when (r->>'yangi')::int = 0 and (r->>'storno')::int = 0 and n = 9 then 'OK   idempotent: qayta yurgizish 0 ta' else 'FAIL idempotent: ' || r::text end);

  -- 6. Hujjat summasi o'zgarsa - DELTA (F3 1120 -> 2240: asosiy +1000, QQS +120); bekor bo'lsa - storno (minus)
  set local session_replication_role = replica;
  update public.t2_forma3 set sotuv_summa = 2240 where id = f3;
  update public.t2_tolov set holat = 'bekor' where id = tl;
  set local session_replication_role = origin;
  r := public.t2_bux_avto_provodka_v1(ub, k, false, gen_random_uuid());
  rep := rep || (case when (r->>'yangi')::int = 2 and (r->>'storno')::int = 1 then 'OK   delta: F3 o''zgardi (+2), to''lov bekor (storno 1)' else 'FAIL delta: ' || r::text end);
  rep := rep || (case when (select sum(summa) from public.t2_bux_provodka where kompaniya_id = k and manba_tur = 'forma3' and qism = 'asosiy') = 2000
                       and (select sum(summa) from public.t2_bux_provodka where kompaniya_id = k and manba_tur = 'tolov' and manba_id = tl) = 0
                      then 'OK   F3 sof summa 2000, bekor to''lov sof 0 (minus provodka bilan)' else 'FAIL sof summalar' end);

  -- 7. Jurnal o'zgarmas
  begin
    update public.t2_bux_provodka set summa = 1 where kompaniya_id = k;
    rep := rep || 'FAIL jurnal UPDATE o''tdi'::text;
  exception when insufficient_privilege then rep := rep || 'OK   jurnal UPDATE taqiqlangan'::text;
  end;
  begin
    delete from public.t2_bux_provodka where kompaniya_id = k;
    rep := rep || 'FAIL jurnal DELETE o''tdi'::text;
  exception when insufficient_privilege then rep := rep || 'OK   jurnal DELETE taqiqlangan'::text;
  end;

  -- 8. Qo'lda provodka (minus ruxsat) + storno; avto-provodkani storno qilib bo'lmaydi
  r := public.t2_bux_qolda_provodka_v1(ub, k, '2026-02-10', '9420', '5010', 75.5, null, null, o, 'test xarajat', gen_random_uuid());
  pid := (r->>'id')::bigint;
  rep := rep || (case when (r->>'ok')::boolean and pid is not null then 'OK   qo''lda provodka yozildi' else 'FAIL qo''lda: ' || r::text end);
  r := public.t2_bux_qolda_provodka_v1(ub, k, '2026-02-10', '9420', '9420', 10, null, null, null, null, gen_random_uuid());
  rep := rep || (case when r->>'code' = 'HISOB_NOTOGRI' then 'OK   Dt = Kt rad' else 'FAIL Dt=Kt: ' || r::text end);
  r := public.t2_bux_qolda_provodka_v1(ub, k, '2026-02-10', '9420', '5010', -5, null, null, null, 'minus', gen_random_uuid());
  rep := rep || (case when (r->>'ok')::boolean then 'OK   minus summa ruxsat' else 'FAIL minus: ' || r::text end);
  r := public.t2_bux_storno_v1(ub, k, pid, 'xato', gen_random_uuid());
  rep := rep || (case when (r->>'ok')::boolean then 'OK   storno yozildi' else 'FAIL storno: ' || r::text end);
  r := public.t2_bux_storno_v1(ub, k, pid, 'yana', gen_random_uuid());
  rep := rep || (case when r->>'code' = 'ALLAQACHON_STORNO' then 'OK   ikkinchi storno rad' else 'FAIL ikkinchi storno: ' || r::text end);
  r := public.t2_bux_storno_v1(ub, k, (select id from public.t2_bux_provodka where kompaniya_id = k and tur = 'avto' limit 1), null, gen_random_uuid());
  rep := rep || (case when r->>'code' = 'AVTO_STORNO_MUMKIN_EMAS' then 'OK   avto provodka storno qilinmaydi (hujjat orqali)' else 'FAIL avto storno: ' || r::text end);

  -- 9. OSV: jami Dt = jami Kt; 4010 saldo = 2000 + 240 (QQS) - 0 (to'lov bekor) = 2240 Dt
  l := public.t2_bux_osv_v1(k, ub, '2026-01-01', '2026-12-31', null, null, null, 500);
  select e into v_row from jsonb_array_elements(l->'qatorlar') e where e->>'kod' = '4010';
  rep := rep || (case when (l->>'jami_dt')::numeric = (l->>'jami_kt')::numeric and (v_row->>'yopilish')::numeric = 2240 then 'OK   OSV: jami Dt = Kt, 4010 saldo 2240' else 'FAIL OSV: ' || l::text end);

  -- 10. Kontragent hisob-kitobi: buyurtmachi 4010 saldo 2240; yetkazuvchi 6010 saldo = Dt 300 - Kt (500+60+1000+120+200) = -1580
  l := public.t2_bux_kontragent_v1(k, ub, '2026-01-01', '2026-12-31', null, null, null, 500);
  select e into v_row from jsonb_array_elements(l->'qatorlar') e where (e->>'kontragent_id')::bigint = kc and e->>'kod' = '4010';
  rep := rep || (case when (v_row->>'yopilish')::numeric = 2240 then 'OK   kontragent 4010 saldo 2240 (ular bizga qarz)' else 'FAIL kontragent 4010: ' || coalesce(v_row::text, 'yo''q') end);
  select e into v_row from jsonb_array_elements(l->'qatorlar') e where (e->>'kontragent_id')::bigint = ks and e->>'kod' = '6010';
  rep := rep || (case when (v_row->>'yopilish')::numeric = -1580 then 'OK   yetkazuvchi 6010 saldo -1580 (biz qarzmiz)' else 'FAIL yetkazuvchi 6010: ' || coalesce(v_row::text, 'yo''q') end);
  -- drill-down: akt-sverka qatorlari bitta hujjat = bitta qator (asosiy + QQS qo'shilgan)
  l := public.t2_bux_kontragent_v1(k, ub, '2026-01-01', '2026-12-31', kc, null, null, 500);
  rep := rep || (case when jsonb_array_length(l->'hujjatlar') = 1 and (l->'hujjatlar'->0->>'dt')::numeric = 2240 then 'OK   akt-sverka: F3 bitta qator (QQS bilan); nolga tushgan to''lov+storno ko''rinmaydi' else 'FAIL akt-sverka: ' || (l->'hujjatlar')::text end);

  -- 11. QQS reyestri
  l := public.t2_bux_nds_v1(k, ub, '2026-01-01', '2026-12-31', null, null, null, 500);
  rep := rep || (case when jsonb_array_length(l->'sotuv') = 1 and (l->'sotuv'->0->>'nds')::numeric = 240 and (l->'sotuv'->0->>'asos')::numeric = 2000
                           and jsonb_array_length(l->'xarid') = 2 then 'OK   QQS reyestri: sotuv 1 (QQS 240), xarid 2' else 'FAIL QQS reyestri: ' || l::text end);

  -- 12. Davr yopish: ogohlantirish (oldingi... yo'q; bu oyda provodkasiz hujjat yo'q) -> yopiladi; yopiq oyga yangi hujjat -> ogohlantirish soni
  r := public.t2_bux_davr_v1(ub, k, '2026-01-15', 'yop', false, null, gen_random_uuid());
  rep := rep || (case when (r->>'ok')::boolean or r->>'code' = 'OGOHLANTIRISH' then 'OK   davr yopish javobi ogohlantirish asosida' else 'FAIL davr: ' || r::text end);
  if not (r->>'ok')::boolean then
    r := public.t2_bux_davr_v1(ub, k, '2026-01-15', 'yop', true, 'tasdiq bilan', gen_random_uuid());
  end if;
  rep := rep || (case when (r->>'ok')::boolean and exists (select 1 from public.t2_bux_davr where kompaniya_id = k and oy = '2026-01-01' and holat = 'yopiq') then 'OK   2026-01 yopildi' else 'FAIL davr yopilmadi: ' || r::text end);
  perform public.t2_bux_davr_blok_v1(ub, k, false, gen_random_uuid()); -- 20261216200000: V1 ogohlantirish rejimi shu testda\n  set local session_replication_role = replica;
  update public.t2_forma3 set sotuv_summa = 3360 where id = f3;
  set local session_replication_role = origin;
  r := public.t2_bux_avto_provodka_v1(ub, k, false, gen_random_uuid());
  rep := rep || (case when (r->>'yopiq_davr_ogohlantirish')::int = 2 and (r->>'yangi')::int = 2 then 'OK   yopiq oyga provodka bloklanmadi, ogohlantirish 2' else 'FAIL yopiq davr: ' || r::text end);

  -- 13. Bank importi: moslangan qator yoziladi, takrori (xuddi shu kalit) yozilmaydi
  r := public.t2_bux_bank_import_v1(ub, k, jsonb_build_array(
    jsonb_build_object('kalit', 'bank-1', 'sana', '2026-03-01', 'summa', 250, 'yonalish', 'kirim', 'shartnoma_id', sh_a, 'hujjat_raqam', 'BK-1', 'izoh', 'test'),
    jsonb_build_object('kalit', 'bank-2', 'sana', '2026-03-02', 'summa', 100, 'yonalish', 'chiqim', 'shartnoma_id', sh_s, 'hujjat_raqam', 'BK-2'),
    jsonb_build_object('kalit', 'bank-3', 'sana', '2026-03-03', 'summa', 10, 'yonalish', 'kirim', 'shartnoma_id', -1)), gen_random_uuid());
  rep := rep || (case when (r->>'yangi')::int = 2 and (r->>'xato')::int = 1 then 'OK   bank import: 2 yangi, 1 xato (shartnoma yo''q)' else 'FAIL bank import: ' || r::text end);
  r := public.t2_bux_bank_import_v1(ub, k, jsonb_build_array(
    jsonb_build_object('kalit', 'bank-1', 'sana', '2026-03-01', 'summa', 250, 'yonalish', 'kirim', 'shartnoma_id', sh_a, 'hujjat_raqam', 'BK-1')), gen_random_uuid());
  rep := rep || (case when (r->>'yangi')::int = 0 and (r->>'takror')::int = 1 then 'OK   bank import takror yozilmadi' else 'FAIL bank takror: ' || r::text end);
  l := public.t2_bux_tolov_v1(k, ub, null, null, null, null, null, 500);
  rep := rep || (case when (select count(*) from jsonb_array_elements(l->'tolovlar') e where e->>'manba' = 'bank_import') = 2 then 'OK   bank va kassa ro''yxati: 2 import' else 'FAIL tolov royxat: ' || l::text end);

  -- 14. HR/transport ilgagi: faqat hr_* yoki tr_* manba; idempotent; kamaysa storno
  r := public.t2_bux_tashqi_sync_v1(ub, k, 'qolda', '[]'::jsonb, gen_random_uuid());
  rep := rep || (case when r->>'code' = 'MANBA_TUR_HR' then 'OK   hr_*/tr_* dan boshqa manba rad' else 'FAIL manba tur: ' || r::text end);
  r := public.t2_bux_tashqi_sync_v1(ub, k, 'hr_ish_haqi', jsonb_build_array(jsonb_build_object('manba_id', 1, 'sana', '2026-03-31', 'dt_kod', '2010', 'kt_kod', '6710', 'summa', 900)), gen_random_uuid());
  rep := rep || (case when (r->>'yangi')::int = 1 then 'OK   HR ilgagi: 1 provodka' else 'FAIL hr: ' || r::text end);
  r := public.t2_bux_tashqi_sync_v1(ub, k, 'hr_ish_haqi', jsonb_build_array(jsonb_build_object('manba_id', 1, 'sana', '2026-03-31', 'dt_kod', '2010', 'kt_kod', '6710', 'summa', 900)), gen_random_uuid());
  rep := rep || (case when (r->>'yangi')::int = 0 and (r->>'storno')::int = 0 then 'OK   HR ilgagi idempotent' else 'FAIL hr takror: ' || r::text end);
  r := public.t2_bux_tashqi_sync_v1(ub, k, 'tr_mash_xarajat', jsonb_build_array(jsonb_build_object('manba_id', 7, 'sana', '2026-03-15', 'dt_kod', '2010', 'kt_kod', '6010', 'summa', 50)), gen_random_uuid());
  rep := rep || (case when (r->>'yangi')::int = 1 then 'OK   transport ilgagi (tr_*): 1 provodka' else 'FAIL tr: ' || r::text end);
  r := public.t2_bux_tashqi_sync_v1(ub, k, 'hr_ish_haqi', '[]'::jsonb, gen_random_uuid());
  rep := rep || (case when (r->>'storno')::int = 1 then 'OK   HR hujjati yo''qolsa storno' else 'FAIL hr storno: ' || r::text end);

  -- 15. Moslik o'zgarishi (accounting.approve) va ruxsatlar
  r := public.t2_bux_moslik_saqla_v1(ub, k, 'param.nds_foiz', null, null, 12, gen_random_uuid());
  rep := rep || (case when (r->>'ok')::boolean then 'OK   moslik (param) saqlandi' else 'FAIL moslik: ' || r::text end);
  r := public.t2_bux_moslik_saqla_v1(ub, k, 'tolov.kirim', '5110', '9999', null, gen_random_uuid());
  rep := rep || (case when r->>'code' = 'HISOB_NOTOGRI' then 'OK   mavjud bo''lmagan hisob rad' else 'FAIL moslik hisob: ' || r::text end);
  l := public.t2_bux_holat_v1(k, ur, null, null, null, null, null, 10);
  rep := rep || (case when (l->>'ok')::boolean and (l->>'boshlangan')::boolean then 'OK   rahbar o''qiydi' else 'FAIL rahbar o''qish' end);
  begin
    r := public.t2_bux_avto_provodka_v1(ur, k, false, gen_random_uuid());
    rep := rep || ('FAIL rahbar yozdi: ' || r::text);
  exception when insufficient_privilege then rep := rep || 'OK   rahbar yoza olmaydi'::text;
  end;
  begin
    l := public.t2_bux_holat_v1(k, uy, null, null, null, null, null, 10);
    rep := rep || ('FAIL buyurtmachi o''qidi: ' || l::text);
  exception when insufficient_privilege then rep := rep || 'OK   buyurtmachi o''qiy olmaydi'::text;
  end;
  begin
    l := public.t2_bux_holat_v1(k + 999999, ub, null, null, null, null, null, 10);
    rep := rep || ('FAIL begona kompaniya: ' || l::text);
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    rep := rep || ('OK   begona kompaniya rad (' || v_state || ')');
  end;

  if exists (select 1 from unnest(rep) x where x like 'FAIL%') then
    raise exception 'ACCEPTANCE_BUXGALTERIYA FAIL:%', E'\n' || array_to_string(rep, E'\n');
  end if;
  raise notice 'ACCEPTANCE_BUXGALTERIYA % OK:%', cardinality(rep), E'\n' || array_to_string(rep, E'\n');
end $acc$;

rollback;
