-- ACCEPTANCE: 20261216200000 + 20261216210000 (buxgalteriya P2) - migratsiya qo'llangan bazada; BEGIN..ROLLBACK, FAQAT sintetik fixture (haqiqiy summa/INN/nom yo'q).
-- Tekshiradi: pul ko'rinishi jurnaldan (= ОСВ), balans va foyda-zarar (balans muvozanati), tannarx (ko'rik, delta, bekor=storno, keyingi oy tartibi),
-- boshlang'ich qoldiq importi (ko'rik xatolari, muvozanat, bitta partiya, takror rad, bekor), hisobot qatorlari xaritasini o'zgartirish, tenant izolyatsiyasi.
begin;
set local statement_timeout = '300s';

do $acc$
declare
  k bigint; kb bigint; ub bigint; ubb bigint; o bigint; r jsonb; r2 jsonb; kc bigint; kk bigint; sh_a bigint; rep text[] := array[]::text[]; v_state text;
  n bigint; n2 bigint; a numeric; b numeric; op uuid;
begin
  insert into public.t2_kompaniya (nom, kod, faol) values ('_TEST_BUXP2_A_', gen_random_uuid()::text, true) returning id into k;
  insert into public.t2_kompaniya (nom, kod, faol) values ('_TEST_BUXP2_B_', gen_random_uuid()::text, true) returning id into kb;
  insert into public.t2_obyekt (nom, kompaniya_id) values ('_TEST_BUXP2_O_', k) returning id into o;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('tp2_bug_' || k, 'bugalter A', 'faol') returning id into ub;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('tp2_bugb_' || k, 'bugalter B', 'faol') returning id into ubb;
  insert into public.t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values (ub, k, 'bugalter', 'faol'), (ubb, kb, 'bugalter', 'faol');

  r := public.t2_bux_boshlash_v1(ub, k, gen_random_uuid());
  r2 := public.t2_bux_boshlash_v1(ubb, kb, gen_random_uuid());
  rep := rep || (case when (r->>'ok')::boolean and (r2->>'ok')::boolean then 'OK   boshlash (A va B)' else 'FAIL boshlash: ' || r::text end);

  -- Fixture (A): F3 1120 (obyekt o), to'lov 500, xarajat ЧЕЛ 300 + МАШ 200 (obyekt o)
  insert into public.t2_kontragent (kompaniya_id, nom) values (k, 'TEST BUYURTMACHI') returning id into kc;
  set local session_replication_role = replica;
  insert into public.t2_shartnoma (kompaniya_id, raqam, asosiy, turi, taraf) values (k, 'P2-A', true, 'Bosh shartnoma', 'TEST BUYURTMACHI') returning id into sh_a;
  insert into public.t2_shartnoma_tomon (kompaniya_id, shartnoma_id, rol, kontragent_id, nom, tartib) values (k, sh_a, 'Zakazchik', kc, 'TEST BUYURTMACHI', 1);
  insert into public.t2_forma3 (kompaniya_id, shartnoma_id, obyekt_id, davr_boshi, davr_oxiri, holat, manba, sotuv_summa, sotuv_sana, nds_foiz, raqam)
    values (k, sh_a, o, '2026-01-01', '2026-01-31', 'tayyor', 'sotuv', 1120, '2026-01-31', 12, 'P2-F3');
  insert into public.t2_tolov (kompaniya_id, shartnoma_id, obyekt_id, sana, summa, tur, manba) values (k, sh_a, o, '2026-02-05', 500, 'tolov', 'qolda');
  insert into public.t2_xarajat (kompaniya_id, sana, summa, kat, obyekt_id) values (k, '2026-01-15', 300, 'ЧЕЛ', o), (k, '2026-01-16', 200, 'МАШ', o);
  set local session_replication_role = origin;
  r := public.t2_bux_avto_provodka_v1(ub, k, false, gen_random_uuid());
  select count(*) into n from public.t2_bux_provodka where kompaniya_id = k;
  rep := rep || (case when (r->>'yangi')::int = 5 and n = 5 then 'OK   fixture provodkalari: 5' else 'FAIL fixture: ' || r::text end);

  -- 1. Pul ko'rinishi jurnaldan = ОСВ; toifa bo'yicha xarajat; B daftari bo'sh (bor=false); begona o'qiy olmaydi
  r := public.t2_bux_pul_korinish_v1(k, ub, null, null);
  r2 := public.t2_bux_osv_v1(k, ub, '2026-01-01', '2026-12-31', null, null, null, 500);
  select (x->>'yopilish')::numeric into a from jsonb_array_elements(r2->'qatorlar') x where x->>'kod' = '4010';
  select coalesce(sum((x->>'xarajat_chel')::numeric), 0), coalesce(sum((x->>'xarajat_mash')::numeric), 0) into b, n2 from jsonb_array_elements(r->'qatorlar') x where (x->>'obyekt_id')::bigint = o;
  rep := rep || (case when (r->>'bor')::boolean and (r->'jami'->>'daromad')::numeric = 1000 and (r->'jami'->>'xarajat')::numeric = 500
                       and (r->'jami'->>'tushgan')::numeric = 500 and (r->'jami'->>'qarz')::numeric = 620 and (r->'jami'->>'qarz')::numeric = a
                       and (r->'jami'->>'pul')::numeric = 500 and (r->'jami'->>'kreditor')::numeric = 200 and b = 300 and n2 = 200
                      then 'OK   pul ko''rinishi: daromad 1000, xarajat 500 (ЧЕЛ 300 / МАШ 200), tushgan 500, qarz 620 = ОСВ, pul 500' else 'FAIL pul ko''rinishi: ' || r::text end);
  rep := rep || (case when not (public.t2_bux_pul_korinish_v1(kb, ubb, null, null)->>'bor')::boolean then 'OK   B kompaniya: jurnal bo''sh (bor=false, zaxira manba ishlatiladi)' else 'FAIL B bor' end);
  begin
    perform public.t2_bux_pul_korinish_v1(k, ubb, null, null);
    rep := rep || 'FAIL begona kompaniya pul ko''rinishini o''qidi'::text;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    rep := rep || ('OK   begona kompaniya pul ko''rinishini o''qiy olmaydi (' || v_state || ')');
  end;

  -- 2. Hisobotlar (tannarxdan oldin): foyda-zarar R1=1000, R8=1000; balans: aktiv = passiv = 1620, xaritalanmagan hisob yo'q
  r := public.t2_bux_hisobot_v1(k, ub, '2026-01-01', '2026-12-31', 'foyda_zarar');
  r2 := public.t2_bux_hisobot_v1(k, ub, null, '2026-12-31', 'balans');
  rep := rep || (case when (select (x->>'summa')::numeric from jsonb_array_elements(r->'qatorlar') x where x->>'kod' = 'R1') = 1000
                       and (select (x->>'summa')::numeric from jsonb_array_elements(r->'qatorlar') x where x->>'kod' = 'R8') = 1000
                       and (select (x->>'summa')::numeric from jsonb_array_elements(r2->'qatorlar') x where x->>'kod' = 'A_JAMI') = 1620
                       and (select (x->>'summa')::numeric from jsonb_array_elements(r2->'qatorlar') x where x->>'kod' = 'P_JAMI') = 1620
                       and (r2->>'tekshiruv')::numeric = 0 and jsonb_array_length(r2->'xaritalanmagan') = 0 and jsonb_array_length(r->'qatorlar') = 8
                      then 'OK   foyda-zarar R1=R8=1000; balans aktiv = passiv = 1620, tekshiruv 0' else 'FAIL hisobot: ' || r::text || r2::text end);

  -- 3. Tannarx: ko'rik yozmaydi; yopish 500 (Dt 9110 / Kt 2010, obyekt o); takror = 0; keyin hisobot
  select count(*) into n from public.t2_bux_provodka where kompaniya_id = k;
  r := public.t2_bux_tannarx_v1(ub, k, '2026-01-10', 'yop', true, gen_random_uuid());
  select count(*) into n2 from public.t2_bux_provodka where kompaniya_id = k;
  rep := rep || (case when (r->>'ok')::boolean and (r->>'soni')::int = 1 and (r->>'jami')::numeric = 500 and (r->'qatorlar'->0->>'obyekt_id')::bigint = o
                       and (r->'qatorlar'->0->>'daromad')::numeric = 1000 and n = n2 then 'OK   tannarx ko''rigi: 1 obyekt, 500, yozilmadi' else 'FAIL tannarx ko''rik: ' || r::text end);
  op := gen_random_uuid();
  r := public.t2_bux_tannarx_v1(ub, k, '2026-01-10', 'yop', false, op);
  r2 := public.t2_bux_tannarx_v1(ub, k, '2026-01-10', 'yop', false, gen_random_uuid());
  select count(*) into n2 from public.t2_bux_provodka where kompaniya_id = k and manba_tur = 'tannarx';
  rep := rep || (case when (r->>'soni')::int = 1 and (r2->>'soni')::int = 0 and n2 = 1
                       and (select summa from public.t2_bux_provodka where kompaniya_id = k and manba_tur = 'tannarx' and dt_kod = '9110' and kt_kod = '2010' and obyekt_id = o and sana = '2026-01-31') = 500
                       and (public.t2_bux_tannarx_v1(ub, k, '2026-01-10', 'yop', false, op)->>'soni')::int = 1
                      then 'OK   tannarx yozildi (500), takror no-op, operation_id bir xil javob' else 'FAIL tannarx yozish: ' || r::text || r2::text end);
  r := public.t2_bux_hisobot_v1(k, ub, '2026-01-01', '2026-12-31', 'foyda_zarar');
  r2 := public.t2_bux_hisobot_v1(k, ub, null, '2026-12-31', 'balans');
  rep := rep || (case when (select (x->>'summa')::numeric from jsonb_array_elements(r->'qatorlar') x where x->>'kod' = 'R2') = -500
                       and (select (x->>'summa')::numeric from jsonb_array_elements(r->'qatorlar') x where x->>'kod' = 'R8') = 500
                       and (select (x->>'summa')::numeric from jsonb_array_elements(r2->'qatorlar') x where x->>'kod' = 'A4') = 0
                       and (r2->>'tekshiruv')::numeric = 0
                       and (public.t2_bux_pul_korinish_v1(k, ub, null, null)->'jami'->>'tannarx')::numeric = 500
                       and (public.t2_bux_pul_korinish_v1(k, ub, null, null)->'jami'->>'xarajat')::numeric = 500
                      then 'OK   tannarxdan keyin: R2=-500, R8=500, 2010=0, balans muvozanatda' else 'FAIL tannarxdan keyin: ' || r::text || r2::text end);
  r := public.t2_bux_tannarx_v1(ub, k, '2026-01-10', 'bekor', false, gen_random_uuid());
  r2 := public.t2_bux_hisobot_v1(k, ub, '2026-01-01', '2026-12-31', 'foyda_zarar');
  rep := rep || (case when (r->>'soni')::int = 1 and (r->>'jami')::numeric = -500
                       and (select (x->>'summa')::numeric from jsonb_array_elements(r2->'qatorlar') x where x->>'kod' = 'R2') = 0
                      then 'OK   tannarx bekor = storno (-500), R2=0' else 'FAIL tannarx bekor: ' || r::text end);
  r := public.t2_bux_tannarx_v1(ub, k, '2026-01-10', 'yop', false, gen_random_uuid());
  -- keyingi oy: yangi xarajat -> fevral tannarxi; yanvarni bekor qilish rad (oxirgidan boshlab)
  set local session_replication_role = replica;
  insert into public.t2_xarajat (kompaniya_id, sana, summa, kat, obyekt_id) values (k, '2026-02-10', 100, 'ЧЕЛ', o);
  set local session_replication_role = origin;
  perform public.t2_bux_avto_provodka_v1(ub, k, false, gen_random_uuid());
  r := public.t2_bux_tannarx_v1(ub, k, '2026-02-01', 'yop', false, gen_random_uuid());
  r2 := public.t2_bux_tannarx_v1(ub, k, '2026-01-01', 'bekor', false, gen_random_uuid());
  rep := rep || (case when (r->>'soni')::int = 1 and (r->>'jami')::numeric = 100 and r2->>'code' = 'KEYINGI_OY_BOR' then 'OK   fevral tannarxi 100; yanvarni bekor qilish rad (KEYINGI_OY_BOR)' else 'FAIL keyingi oy: ' || r::text || r2::text end);

  -- 4. Boshlang'ich qoldiq (B): ko'rik xatolari, muvozanat, bitta partiya, takror rad, bekor, qayta import
  insert into public.t2_kontragent (kompaniya_id, nom) values (kb, 'TEST KONTRAGENT B') returning id into kk;
  r := public.t2_bux_saldo_import_v1(ubb, kb, '2026-01-01', '8810', jsonb_build_array(
         jsonb_build_object('hisob', '5110', 'dt', 1000), jsonb_build_object('hisob', '4010', 'dt', 500, 'kontragent_id', kk),
         jsonb_build_object('hisob', '6010', 'kt', 900, 'kontragent_id', kk), jsonb_build_object('hisob', '8310', 'kt', 600)), true, gen_random_uuid());
  select count(*) into n from public.t2_bux_provodka where kompaniya_id = kb;
  rep := rep || (case when (r->>'ok')::boolean and (r->>'yozilishi')::int = 4 and (r->>'jami_dt')::numeric = 1500 and (r->>'jami_kt')::numeric = 1500 and n = 0
                      then 'OK   saldo ko''rik: 4 qator, Dt = Kt = 1500, yozilmadi' else 'FAIL saldo ko''rik: ' || r::text end);
  r := public.t2_bux_saldo_import_v1(ubb, kb, '2026-01-01', '8810', jsonb_build_array(jsonb_build_object('hisob', '5110', 'dt', 1000)), true, gen_random_uuid());
  rep := rep || (case when r->>'code' = 'MUVOZANAT_YOQ' and not (r->>'ok')::boolean then 'OK   saldo: Dt <> Kt rad (MUVOZANAT_YOQ)' else 'FAIL saldo muvozanat: ' || r::text end);
  r := public.t2_bux_saldo_import_v1(ubb, kb, '2026-01-01', '8810', jsonb_build_array(jsonb_build_object('hisob', '9999', 'dt', 5), jsonb_build_object('hisob', '8810', 'kt', 5),
         jsonb_build_object('hisob', '5110', 'dt', 'abc')), true, gen_random_uuid());
  rep := rep || (case when r->>'code' = 'TEKSHIRUV_XATO' and jsonb_array_length(r->'xatolar') = 3 then 'OK   saldo: noma''lum hisob, qarshi hisob, noto''g''ri summa - 3 xato' else 'FAIL saldo xatolar: ' || r::text end);
  op := gen_random_uuid();
  r := public.t2_bux_saldo_import_v1(ubb, kb, '2026-01-01', '8810', jsonb_build_array(
         jsonb_build_object('hisob', '5110', 'dt', 1000), jsonb_build_object('hisob', '4010', 'dt', 500, 'kontragent_id', kk),
         jsonb_build_object('hisob', '6010', 'kt', 900, 'kontragent_id', kk), jsonb_build_object('hisob', '8310', 'kt', 600)), false, op);
  select count(*) into n from public.t2_bux_provodka where kompaniya_id = kb and manba_tur = 'boshlangich_saldo' and tur = 'qolda';
  r2 := public.t2_bux_osv_v1(kb, ubb, '2026-01-01', '2026-12-31', null, null, null, 500);
  select (x->>'yopilish')::numeric into a from jsonb_array_elements(r2->'qatorlar') x where x->>'kod' = '8810';
  rep := rep || (case when (r->>'ok')::boolean and (r->>'yozildi')::int = 4 and n = 4 and (r2->>'jami_dt')::numeric = (r2->>'jami_kt')::numeric and coalesce(a, 0) = 0
                       and (select kontragent_id from public.t2_bux_provodka where kompaniya_id = kb and kt_kod = '6010') = kk
                      then 'OK   saldo yozildi: 4 provodka (qolda), ОСВ muvozanatda, qarshi hisob 0, kontragent analitikasi' else 'FAIL saldo yozish: ' || r::text end);
  r2 := public.t2_bux_saldo_import_v1(ubb, kb, '2026-01-01', '8810', jsonb_build_array(jsonb_build_object('hisob', '5110', 'dt', 1), jsonb_build_object('hisob', '8310', 'kt', 1)), false, gen_random_uuid());
  rep := rep || (case when r2->>'code' = 'SALDO_ALLAQACHON' and (public.t2_bux_saldo_import_v1(ubb, kb, '2026-01-01', '8810', '[]'::jsonb, false, op)->>'yozildi')::int = 4
                      then 'OK   ikkinchi partiya rad (SALDO_ALLAQACHON), operation_id takrori bir xil javob' else 'FAIL saldo takror: ' || r2::text end);
  r2 := public.t2_bux_hisobot_v1(kb, ubb, null, '2026-12-31', 'balans');
  rep := rep || (case when (select (x->>'summa')::numeric from jsonb_array_elements(r2->'qatorlar') x where x->>'kod' = 'A_JAMI') = 1500
                       and (select (x->>'summa')::numeric from jsonb_array_elements(r2->'qatorlar') x where x->>'kod' = 'P_JAMI') = 1500 and (r2->>'tekshiruv')::numeric = 0
                      then 'OK   boshlang''ich balans B: aktiv = passiv = 1500' else 'FAIL balans B: ' || r2::text end);
  r := public.t2_bux_saldo_bekor_v1(ubb, kb, gen_random_uuid());
  select coalesce(sum(case when dt_kod = '5110' then summa when kt_kod = '5110' then -summa else 0 end), 0) into a from public.t2_bux_provodka where kompaniya_id = kb;
  r2 := public.t2_bux_saldo_import_v1(ubb, kb, '2026-01-01', '8810', jsonb_build_array(jsonb_build_object('hisob', '5110', 'dt', 7), jsonb_build_object('hisob', '8310', 'kt', 7)), false, gen_random_uuid());
  rep := rep || (case when (r->>'storno')::int = 4 and a = 0 and (r2->>'ok')::boolean then 'OK   saldo bekor = 4 storno (5110 = 0), keyin qayta import mumkin' else 'FAIL saldo bekor: ' || r::text || r2::text end);
  begin
    perform public.t2_bux_saldo_import_v1(ub, kb, '2026-01-01', '8810', '[]'::jsonb, true, gen_random_uuid());
    rep := rep || 'FAIL A foydalanuvchisi B ga saldo import qildi'::text;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    rep := rep || ('OK   begona kompaniyaga saldo import rad (' || v_state || ')');
  end;

  -- 5. Hisobot qatorlari xaritasi: kompaniya o'z qatorlarini yozadi (faqat shu kompaniya), xato kod rad, bo'sh = standart
  r := public.t2_bux_hisobot_saqla_v1(ub, k, 'foyda_zarar', jsonb_build_array(
         jsonb_build_object('kod', 'X1', 'tartib', 10, 'nom_uz', 'Daromad', 'nom_ru', 'Доход', 'tur', 'hisob', 'hisoblar', jsonb_build_array('9010'), 'ishora', -1),
         jsonb_build_object('kod', 'X2', 'tartib', 20, 'nom_uz', 'Jami', 'nom_ru', 'Итого', 'tur', 'jami', 'jami_kodlar', jsonb_build_array('X1'))), gen_random_uuid());
  r2 := public.t2_bux_hisobot_v1(k, ub, '2026-01-01', '2026-12-31', 'foyda_zarar');
  rep := rep || (case when (r->>'ok')::boolean and (r2->>'oz_xarita')::boolean and jsonb_array_length(r2->'qatorlar') = 2
                       and (r2->'qatorlar'->1->>'summa')::numeric = 1000 and jsonb_array_length(public.t2_bux_hisobot_v1(kb, ubb, '2026-01-01', '2026-12-31', 'foyda_zarar')->'qatorlar') = 8
                      then 'OK   hisobot xaritasi: A kompaniya 2 qator, B standart 8 qator' else 'FAIL hisobot xaritasi: ' || r::text || r2::text end);
  r := public.t2_bux_hisobot_saqla_v1(ub, k, 'foyda_zarar', jsonb_build_array(jsonb_build_object('kod', 'x1', 'tur', 'hisob')), gen_random_uuid());
  rep := rep || (case when r->>'code' = 'QATOR_NOTOGRI' then 'OK   noto''g''ri qator kodi rad' else 'FAIL qator kodi: ' || r::text end);
  r := public.t2_bux_hisobot_saqla_v1(ub, k, 'foyda_zarar', '[]'::jsonb, gen_random_uuid());
  rep := rep || (case when jsonb_array_length(public.t2_bux_hisobot_v1(k, ub, '2026-01-01', '2026-12-31', 'foyda_zarar')->'qatorlar') = 8 then 'OK   bo''sh xarita = standartga qaytish' else 'FAIL standartga qaytish' end);

  if exists (select 1 from unnest(rep) x where x like 'FAIL%') then
    raise exception 'ACCEPTANCE_BUXGALTERIYA_P2 FAIL:%', E'\n' || array_to_string(rep, E'\n');
  end if;
  raise notice 'ACCEPTANCE_BUXGALTERIYA_P2 % OK:%', cardinality(rep), E'\n' || array_to_string(rep, E'\n');
end $acc$;

rollback;
