-- ACCEPTANCE: 20261216230000 (buxgalteriya P4) - 200000..220000 qo'llangan bazada; BEGIN..ROLLBACK, FAQAT sintetik fixture (haqiqiy summa/INN/nom yo'q).
-- Tekshiradi: bank navbati + takliflar (ball, sabab, aniqlanmagan), bir bosishda qabul (bir marta yoziladi, yo'nalish tekshiruvi, oylikka bog'lash),
-- kassa (tur bo'yicha raqamlash, provodka, kitob = jurnal, bekor = storno), ish beruvchi badali (stavka yoqilguncha yo'q), ish haqini obyektlarga taqsimlash, izolyatsiya.
begin;
set local statement_timeout = '300s';

do $acc$
declare
  ka bigint; kb bigint; ua bigint; ub bigint; kc bigint; ks bigint; sh_a bigint; sh_s bigint; o bigint; ob bigint; km bigint; r jsonb; r2 jsonb; rep text[] := array[]::text[]; v_state text;
  n bigint; a numeric; b numeric; q1 bigint; q2 bigint; q3 bigint; q4 bigint; q6 bigint; op uuid; v_o1 bigint; v_o2 bigint; v_inn text := 'TSTC' || (random() * 1e8)::bigint;
begin
  insert into public.t2_kompaniya (nom, kod, faol) values ('_TEST_BUXP4_A_', gen_random_uuid()::text, true) returning id into ka;
  insert into public.t2_kompaniya (nom, kod, faol) values ('_TEST_BUXP4_B_', gen_random_uuid()::text, true) returning id into kb;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('tp4_a_' || ka, 'bugalter A', 'faol') returning id into ua;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('tp4_b_' || ka, 'bugalter B', 'faol') returning id into ub;
  insert into public.t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values (ua, ka, 'bugalter', 'faol'), (ub, kb, 'bugalter', 'faol');
  insert into public.t2_obyekt (nom, kompaniya_id) values ('_TEST_BUXP4_O_', ka) returning id into o;
  insert into public.t2_obyekt (nom, kompaniya_id) values ('_TEST_BUXP4_OB_', kb) returning id into ob;
  perform public.t2_bux_boshlash_v1(ua, ka, gen_random_uuid());
  perform public.t2_bux_boshlash_v1(ub, kb, gen_random_uuid());

  -- Fixture: buyurtmachi shartnomasi (F3 1120 -> ochiq qarz), yetkazuvchi shartnomasi (ochiq kreditor 300), xodim + tasdiqlangan oylik (mart)
  insert into public.t2_kontragent (kompaniya_id, nom, inn) values (ka, 'TEST BUYURTMACHI', v_inn) returning id into kc;
  insert into public.t2_kontragent (kompaniya_id, nom) values (ka, 'TEST YETKAZUVCHI') returning id into ks;
  set local session_replication_role = replica;
  insert into public.t2_shartnoma (kompaniya_id, raqam, asosiy, turi, taraf) values (ka, 'SH-77/26', true, 'Bosh shartnoma', 'TEST BUYURTMACHI') returning id into sh_a;
  insert into public.t2_shartnoma_tomon (kompaniya_id, shartnoma_id, rol, kontragent_id, nom, tartib) values (ka, sh_a, 'Zakazchik', kc, 'TEST BUYURTMACHI', 1);
  insert into public.t2_shartnoma (kompaniya_id, raqam, asosiy, turi, taraf) values (ka, 'PZ-5', false, 'Yetkazib berish', 'TEST YETKAZUVCHI') returning id into sh_s;
  insert into public.t2_shartnoma_tomon (kompaniya_id, shartnoma_id, rol, kontragent_id, nom, tartib) values (ka, sh_s, 'Yetkazuvchi', ks, 'TEST YETKAZUVCHI', 1);
  insert into public.t2_forma3 (kompaniya_id, shartnoma_id, davr_boshi, davr_oxiri, holat, manba, sotuv_summa, sotuv_sana, nds_foiz, raqam)
    values (ka, sh_a, '2026-01-01', '2026-01-31', 'tayyor', 'sotuv', 1120, '2026-01-31', 12, 'P4-F3');
  insert into public.t2_kadr_mustaqil (kompaniya_id, ism_sharif, lavozim) values (ka, 'TEST XODIM', 'usta') returning id into km;
  insert into public.t2_hr_xodim (kadr_id, kompaniya_id) values (km, ka);
  insert into public.t2_hr_oylik (kompaniya_id, kadr_id, oy, holat, hisoblangan, ndfl, inps, sof) values (ka, km, '2026-03-01', 'tasdiqlangan', 600, 99, 1, 500) returning id into v_o1;
  set local session_replication_role = origin;
  perform public.t2_bux_qolda_provodka_v1(ua, ka, '2026-02-01', '1010', '6010', 300, ks, sh_s, null, 'ochiq kreditor', gen_random_uuid());
  perform public.t2_bux_avto_provodka_v1(ua, ka, false, gen_random_uuid());

  -- 1. BANK: yuklash (6 qator + 1 takror), takliflar
  r := public.t2_bux_bank_yuklash_v1(ua, ka, jsonb_build_array(
    jsonb_build_object('kalit', 'k1', 'sana', '2026-02-10', 'summa', 1120, 'yonalish', 'kirim', 'izoh', 'Oplata po dogovoru SH-77/26', 'inn', v_inn),
    jsonb_build_object('kalit', 'k2', 'sana', '2026-02-11', 'summa', 300, 'yonalish', 'chiqim', 'izoh', 'za materialy PZ-5'),
    jsonb_build_object('kalit', 'k3', 'sana', '2026-04-05', 'summa', 500, 'yonalish', 'chiqim', 'izoh', 'ish haqi mart'),
    jsonb_build_object('kalit', 'k4', 'sana', '2026-02-12', 'summa', 77, 'yonalish', 'kirim', 'izoh', 'noma''lum'),
    jsonb_build_object('kalit', 'k6', 'sana', '2026-04-06', 'summa', 500, 'yonalish', 'chiqim', 'izoh', 'ish haqi mart (takror)'),
    jsonb_build_object('kalit', 'k1', 'sana', '2026-02-10', 'summa', 1120, 'yonalish', 'kirim', 'izoh', 'takror')), gen_random_uuid());
  select id into q1 from public.t2_bux_bank_qator where kompaniya_id = ka and kalit = 'k1'; select id into q2 from public.t2_bux_bank_qator where kompaniya_id = ka and kalit = 'k2';
  select id into q3 from public.t2_bux_bank_qator where kompaniya_id = ka and kalit = 'k3'; select id into q4 from public.t2_bux_bank_qator where kompaniya_id = ka and kalit = 'k4';
  select id into q6 from public.t2_bux_bank_qator where kompaniya_id = ka and kalit = 'k6';
  rep := rep || (case when (r->>'yangi')::int = 5 and (r->>'takror')::int = 1 and (r->>'xato')::int = 0 then 'OK   bank yuklash: 5 yangi, 1 takror' else 'FAIL bank yuklash: ' || r::text end);
  r := public.t2_bux_bank_taklif_v1(ka, ua, 200);
  rep := rep || (case when jsonb_array_length(r->'qatorlar') = 5
                       and (select (x->'takliflar'->0->>'shartnoma_id')::bigint = sh_a and (x->'takliflar'->0->>'ball')::int = 95 from jsonb_array_elements(r->'qatorlar') x where (x->>'id')::bigint = q1)
                       and (select (x->'takliflar'->0->>'shartnoma_id')::bigint = sh_s and (x->'takliflar'->0->>'ball')::int = 70 from jsonb_array_elements(r->'qatorlar') x where (x->>'id')::bigint = q2)
                       and (select jsonb_array_length(x->'oylik') = 1 and (x->'oylik'->0->>'oylik_id')::bigint = v_o1 from jsonb_array_elements(r->'qatorlar') x where (x->>'id')::bigint = q3)
                       and (select (x->>'aniqlanmagan')::boolean from jsonb_array_elements(r->'qatorlar') x where (x->>'id')::bigint = q4)
                      then 'OK   takliflar: raqam+STIR+summa = 95, yetkazuvchi 70, oylik nomzodi, aniqlanmagan navbati' else 'FAIL takliflar: ' || r::text end);

  -- 2. Qabul: bir marta yoziladi; yo'nalish tekshiruvi; takror; oylikka bog'lash va ikki marta rad
  op := gen_random_uuid();
  r := public.t2_bux_bank_qabul_v1(ua, ka, q1, sh_a, null, op);
  r2 := public.t2_bux_bank_qabul_v1(ua, ka, q1, sh_a, null, gen_random_uuid());
  select count(*) into n from public.t2_bux_provodka where kompaniya_id = ka and manba_tur = 'tolov' and dt_kod = '5110' and kt_kod = '4010' and summa = 1120 and kontragent_id = kc;
  rep := rep || (case when (r->>'ok')::boolean and (r2->>'ok')::boolean and (r2->>'takror')::boolean and n = 1
                       and (select count(*) from public.t2_tolov where kompaniya_id = ka and shartnoma_id = sh_a and summa = 1120 and manba = 'bank_import') = 1
                       and (public.t2_bux_bank_qabul_v1(ua, ka, q1, sh_a, null, op)->>'tolov_id')::bigint = (r->>'tolov_id')::bigint
                      then 'OK   qabul: to''lov + provodka BIR marta (takror/operation_id bir xil)' else 'FAIL qabul: ' || r::text || r2::text end);
  r := public.t2_bux_bank_qabul_v1(ua, ka, q2, sh_a, null, gen_random_uuid());
  rep := rep || (case when r->>'code' = 'YONALISH_MOS_EMAS' then 'OK   chiqim qatori asosiy shartnomaga rad (YONALISH_MOS_EMAS)' else 'FAIL yo''nalish: ' || r::text end);
  r := public.t2_bux_bank_qabul_v1(ua, ka, q2, sh_s, null, gen_random_uuid());
  select count(*) into n from public.t2_bux_provodka where kompaniya_id = ka and manba_tur = 'tolov' and dt_kod = '6010' and kt_kod = '5110' and summa = 300;
  rep := rep || (case when (r->>'ok')::boolean and n = 1 then 'OK   yetkazuvchiga to''lov: Dt 6010 / Kt 5110 300' else 'FAIL chiqim qabul: ' || r::text end);
  r := public.t2_bux_bank_qabul_v1(ua, ka, q3, null, v_o1, gen_random_uuid());
  r2 := public.t2_bux_bank_qabul_v1(ua, ka, q6, null, v_o1, gen_random_uuid());
  rep := rep || (case when (r->>'ok')::boolean and r2->>'code' = 'OYLIK_TOLANGAN'
                       and (select count(*) from public.t2_bux_provodka where kompaniya_id = ka and manba_tur = 'bank_ish_haqi' and dt_kod = '6710' and kt_kod = '5110' and summa = 500) = 1
                      then 'OK   ish haqi to''lovi oylikka bog''landi (Dt 6710 / Kt 5110 500); ikkinchi qator rad (OYLIK_TOLANGAN)' else 'FAIL oylik: ' || r::text || r2::text end);
  r := public.t2_bux_osv_v1(ka, ua, '2026-01-01', '2026-12-31', null, null, null, 500);
  select (x->>'yopilish')::numeric into a from jsonb_array_elements(r->'qatorlar') x where x->>'kod' = '5110';
  rep := rep || (case when a = 320 and (r->>'jami_dt')::numeric = (r->>'jami_kt')::numeric then 'OK   5110 saldo 1120 - 300 - 500 = 320, ОСВ muvozanatda' else 'FAIL 5110: ' || coalesce(a::text, 'null') end);

  -- 3. KASSA: raqamlash (tur bo'yicha, yil bo'yicha), provodka, kitob = jurnal, bekor = storno
  r := public.t2_bux_kassa_yoz_v1(ua, ka, 'kirim', '2026-03-01', 100, '4010', kc, sh_a, null, 'kassaga kirim', gen_random_uuid());
  r2 := public.t2_bux_kassa_yoz_v1(ua, ka, 'kirim', '2026-03-01', 100, '4010', kc, sh_a, null, 'kassaga kirim 2', gen_random_uuid());
  rep := rep || (case when (r->>'raqam')::int = 1 and (r2->>'raqam')::int = 2 and (r->>'yil')::int = 2026 and not (r2->>'manfiy_qoldiq')::boolean then 'OK   kassa kirim №1, №2 (2026)' else 'FAIL kassa kirim: ' || r::text || r2::text end);
  r := public.t2_bux_kassa_yoz_v1(ua, ka, 'chiqim', '2026-03-02', 30, '6010', ks, null, null, 'kassadan chiqim', gen_random_uuid());
  r2 := public.t2_bux_kassa_yoz_v1(ua, ka, 'chiqim', '2026-03-02', 1000, '6010', ks, null, null, 'katta chiqim', gen_random_uuid());
  rep := rep || (case when (r->>'raqam')::int = 1 and (r2->>'raqam')::int = 2 and (r2->>'manfiy_qoldiq')::boolean and (r->>'tur') = 'chiqim' then 'OK   kassa chiqim №1 (alohida raqamlash), manfiy qoldiq ogohlantirishi' else 'FAIL kassa chiqim: ' || r::text || r2::text end);
  r := public.t2_bux_kassa_kitob_v1(ka, ua, '2026-03-01', '2026-03-31');
  r2 := public.t2_bux_osv_v1(ka, ua, '2026-03-01', '2026-03-31', null, null, null, 500);
  select (x->>'yopilish')::numeric into a from jsonb_array_elements(r2->'qatorlar') x where x->>'kod' = '5010';
  rep := rep || (case when (r->>'yopilish')::numeric = a and a = -830 and (r->>'ochilish')::numeric = 0 and jsonb_array_length(r->'kunlar') = 2 and jsonb_array_length(r->'orderlar') = 4
                      then 'OK   kassa kitobi = jurnal 5010 (yopilish -830), 2 kun, 4 order' else 'FAIL kassa kitobi: ' || r::text end);
  select o2.id into n from public.t2_bux_kassa_order o2 where o2.kompaniya_id = ka and o2.tur = 'chiqim' and o2.raqam = 2;
  r := public.t2_bux_kassa_bekor_v1(ua, ka, n, gen_random_uuid());
  r2 := public.t2_bux_kassa_bekor_v1(ua, ka, n, gen_random_uuid());
  r := public.t2_bux_kassa_kitob_v1(ka, ua, '2026-03-01', '2026-03-31');
  rep := rep || (case when r2->>'code' = 'ALLAQACHON_BEKOR' and (r->>'yopilish')::numeric = 170
                       and (public.t2_bux_kassa_yoz_v1(ua, ka, 'chiqim', '2026-03-03', 10, '6010', ks, null, null, 'yana', gen_random_uuid())->>'raqam')::int = 3
                      then 'OK   order bekor = storno (qoldiq 170); raqamlash davom etadi (№3)' else 'FAIL kassa bekor: ' || r::text || r2::text end);

  -- 4. Ish beruvchi badali: stavka NULL = hisoblanmaydi; stavka kiritilgach hisoblanadi
  select coalesce(sum(summa), 0) into a from public.t2_bux_provodka where kompaniya_id = ka and manba_tur = 'ish_haqi' and dt_kod = '2010' and kt_kod = '6410';
  r := public.t2_bux_moslik_saqla_v1(ua, ka, 'param.ish_beruvchi_foiz', null, null, 12, gen_random_uuid());
  perform public.t2_bux_avto_provodka_v1(ua, ka, false, gen_random_uuid());
  select coalesce(sum(summa), 0) into b from public.t2_bux_provodka where kompaniya_id = ka and manba_tur = 'ish_haqi' and dt_kod = '2010' and kt_kod = '6410';
  rep := rep || (case when a = 0 and (r->>'ok')::boolean and b = 72 then 'OK   ish beruvchi badali: stavkasiz 0, 12 % -> 72 (600 dan)' else 'FAIL ish beruvchi: a=' || a || ' b=' || b || ' ' || r::text end);

  -- 5. Taqsimlash: 40 % obyektga (240), qolgani obyektsiz (360); 100 % dan ko'p / begona obyekt rad; bo'sh = taqsimlanmagan
  r := public.t2_bux_taqsim_saqla_v1(ua, ka, km, jsonb_build_array(jsonb_build_object('obyekt_id', o, 'ulush', 40)), gen_random_uuid());
  perform public.t2_bux_avto_provodka_v1(ua, ka, false, gen_random_uuid());
  select coalesce(sum(summa), 0) into a from public.t2_bux_provodka where kompaniya_id = ka and manba_tur = 'ish_haqi' and dt_kod = '2010' and kt_kod = '6710' and obyekt_id = o;
  select coalesce(sum(summa), 0) into b from public.t2_bux_provodka where kompaniya_id = ka and manba_tur = 'ish_haqi' and dt_kod = '2010' and kt_kod = '6710' and obyekt_id is null;
  rep := rep || (case when (r->>'ok')::boolean and a = 240 and b = 360 then 'OK   taqsimlash: obyekt 240 + taqsimlanmagan 360 = 600' else 'FAIL taqsim: a=' || a || ' b=' || b || ' ' || r::text end);
  r := public.t2_bux_taqsim_saqla_v1(ua, ka, km, jsonb_build_array(jsonb_build_object('obyekt_id', o, 'ulush', 70), jsonb_build_object('obyekt_id', o, 'ulush', 40)), gen_random_uuid());
  r2 := public.t2_bux_taqsim_saqla_v1(ua, ka, km, jsonb_build_array(jsonb_build_object('obyekt_id', ob, 'ulush', 10)), gen_random_uuid());
  rep := rep || (case when r->>'code' = 'ULUSH_100_DAN_KO_P' and r2->>'code' = 'QATOR_NOTOGRI' then 'OK   100 % dan ko''p va begona obyekt rad' else 'FAIL taqsim validatsiya: ' || r::text || r2::text end);
  perform public.t2_bux_taqsim_saqla_v1(ua, ka, km, '[]'::jsonb, gen_random_uuid());
  perform public.t2_bux_avto_provodka_v1(ua, ka, false, gen_random_uuid());
  select coalesce(sum(summa), 0) into a from public.t2_bux_provodka where kompaniya_id = ka and manba_tur = 'ish_haqi' and dt_kod = '2010' and kt_kod = '6710' and obyekt_id = o;
  select coalesce(sum(summa), 0) into b from public.t2_bux_provodka where kompaniya_id = ka and manba_tur = 'ish_haqi' and dt_kod = '2010' and kt_kod = '6710' and obyekt_id is null;
  rep := rep || (case when a = 0 and b = 600 then 'OK   taqsim bekor: hammasi taqsimlanmagan (600), obyekt 0 (delta storno)' else 'FAIL taqsim bekor: a=' || a || ' b=' || b end);

  -- 6. Izolyatsiya
  begin
    perform public.t2_bux_bank_taklif_v1(ka, ub, 10);
    rep := rep || 'FAIL begona kompaniya bank navbatini o''qidi'::text;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    rep := rep || ('OK   begona kompaniya bank navbatini o''qiy olmaydi (' || v_state || ')');
  end;
  begin
    perform public.t2_bux_kassa_yoz_v1(ub, ka, 'kirim', '2026-03-05', 1, '4010', null, null, null, 'begona', gen_random_uuid());
    rep := rep || 'FAIL begona kompaniyaga kassa order yozildi'::text;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    rep := rep || ('OK   begona kompaniyaga kassa order yozib bo''lmaydi (' || v_state || ')');
  end;

  if exists (select 1 from unnest(rep) x where x like 'FAIL%') then
    raise exception 'ACCEPTANCE_BUXGALTERIYA_P4 FAIL:%', E'\n' || array_to_string(rep, E'\n');
  end if;
  raise notice 'ACCEPTANCE_BUXGALTERIYA_P4 % OK:%', cardinality(rep), E'\n' || array_to_string(rep, E'\n');
end $acc$;

rollback;
