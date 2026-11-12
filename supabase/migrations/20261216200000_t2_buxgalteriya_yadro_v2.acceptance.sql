-- ACCEPTANCE: 20261216200000 (buxgalteriya yadrosi v2) - migratsiya qo'llangan bazada; BEGIN..ROLLBACK, FAQAT sintetik fixture (haqiqiy summa/INN/nom yo'q).
-- Tekshiradi: ikki yoqlama muvozanat, idempotent qayta provodka, storno (manba bekor + qo'lda), qat'iy davr bloki, ОСВ = jurnal,
-- hisob kartochkasi = ОСВ, xarajat manbasi (o'chirilgan qoida provodka bermaydi), shablonlar (pudratchi / buyurtmachi) va qabul qilingan taqdim,
-- tenant izolyatsiyasi (boshqa kompaniya daftari yozilmaydi/o'qilmaydi), shablon/blok/tasdiq RPC lari.
begin;
set local statement_timeout = '300s';

do $acc$
declare
  k bigint; kb bigint; ub bigint; ubb bigint; uy bigint; o bigint; r jsonb; r2 jsonb; kc bigint; kk bigint; sh_a bigint; sh_b bigint; f3 bigint; tl bigint; pid bigint;
  rep text[] := array[]::text[]; v_state text; v_msg text; op uuid; n bigint; n2 bigint; a numeric; b numeric; v_inn text := 'TST' || (random() * 1e9)::bigint;
begin
  insert into public.t2_kompaniya (nom, kod, faol, inn) values ('_TEST_BUX2_A_', gen_random_uuid()::text, true, v_inn) returning id into k;
  insert into public.t2_kompaniya (nom, kod, faol) values ('_TEST_BUX2_B_', gen_random_uuid()::text, true) returning id into kb;
  insert into public.t2_obyekt (nom, kompaniya_id) values ('_TEST_BUX2_O_', k) returning id into o;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('tb2_bug_' || k, 'bugalter A', 'faol') returning id into ub;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('tb2_bugb_' || k, 'bugalter B', 'faol') returning id into ubb;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('tb2_buy_' || k, 'buyurtmachi', 'faol') returning id into uy;
  insert into public.t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values (ub, k, 'bugalter', 'faol'), (ubb, kb, 'bugalter', 'faol'), (uy, k, 'buyurtmachi', 'faol');

  -- 0. Boshlash (pudratchi shabloni sukut): reja + T belgisi + qoidalar
  r := public.t2_bux_boshlash_v1(ub, k, gen_random_uuid());
  rep := rep || (case when (r->>'ok')::boolean and (r->>'moslik_qoshildi')::int = 17
                       and (select count(*) from public.t2_bux_hisob where kompaniya_id = k and not tekshirilsin) = 16
                       and (select count(*) from public.t2_bux_hisob where kompaniya_id = k and tekshirilsin) >= 9
                      then 'OK   boshlash: reja (16 ishonchli, qolgani T) va 17 qoida' else 'FAIL boshlash: ' || r::text end);

  -- 1. Fixture (A, pudratchi): F3 1120 (QQS bilan), to'lov 500, xarajat ЧЕЛ 300 / МАТ 200 (o'chirilgan qoida) / kategoriyasiz 100
  insert into public.t2_kontragent (kompaniya_id, nom) values (k, 'TEST BUYURTMACHI') returning id into kc;
  set local session_replication_role = replica;
  insert into public.t2_shartnoma (kompaniya_id, raqam, asosiy, turi, taraf) values (k, 'T2-A', true, 'Bosh shartnoma', 'TEST BUYURTMACHI') returning id into sh_a;
  insert into public.t2_shartnoma_tomon (kompaniya_id, shartnoma_id, rol, kontragent_id, nom, tartib) values (k, sh_a, 'Zakazchik', kc, 'TEST BUYURTMACHI', 1);
  insert into public.t2_forma3 (kompaniya_id, shartnoma_id, davr_boshi, davr_oxiri, holat, manba, sotuv_summa, sotuv_sana, nds_foiz, raqam)
    values (k, sh_a, '2026-01-01', '2026-01-31', 'tayyor', 'sotuv', 1120, '2026-01-31', 12, 'F3-1') returning id into f3;
  insert into public.t2_tolov (kompaniya_id, shartnoma_id, sana, summa, tur, manba) values (k, sh_a, '2026-02-05', 500, 'tolov', 'qolda') returning id into tl;
  insert into public.t2_xarajat (kompaniya_id, sana, summa, kat, obyekt_id) values (k, '2026-01-15', 300, 'ЧЕЛ', o), (k, '2026-01-16', 200, 'МАТ', o), (k, '2026-01-17', 100, null, o);
  set local session_replication_role = origin;

  -- 2. Quruq yurgizish: 4 provodka (F3 2 + to'lov 1 + ЧЕЛ 1), kategoriyasiz 1, hech narsa yozilmaydi
  r := public.t2_bux_avto_provodka_v1(ub, k, true, gen_random_uuid());
  select count(*) into n from public.t2_bux_provodka where kompaniya_id = k;
  rep := rep || (case when (r->>'yangi')::int = 4 and (r->>'xarajat_kategoriyasiz')::int = 1 and n = 0 then 'OK   dry: 4 provodka, 1 kategoriyasiz xarajat, yozilmadi' else 'FAIL dry: ' || r::text end);

  -- 3. Haqiqiy; xarajat ЧЕЛ -> Dt 2010 / Kt 6710 obyekt analitikasi bilan; МАТ (o'chirilgan qoida) provodka bermaydi
  op := gen_random_uuid();
  r := public.t2_bux_avto_provodka_v1(ub, k, false, op);
  select count(*) into n from public.t2_bux_provodka where kompaniya_id = k;
  rep := rep || (case when (r->>'yangi')::int = 4 and n = 4
                       and (select summa from public.t2_bux_provodka where kompaniya_id = k and manba_tur = 'xarajat' and dt_kod = '2010' and kt_kod = '6710' and obyekt_id = o) = 300
                       and not exists (select 1 from public.t2_bux_provodka where kompaniya_id = k and manba_tur = 'xarajat' and summa in (200, 100))
                      then 'OK   avto: realizatsiya+QQS+to''lov+xarajat (obyekt bo''yicha), МАТ/kategoriyasiz yozilmadi' else 'FAIL avto: ' || r::text || ' n=' || n end);

  -- 4. Idempotent: qayta yurgizish (yangi operation_id) = 0; bir xil operation_id = bir xil javob
  r := public.t2_bux_avto_provodka_v1(ub, k, false, gen_random_uuid());
  r2 := public.t2_bux_avto_provodka_v1(ub, k, false, op);
  select count(*) into n from public.t2_bux_provodka where kompaniya_id = k;
  rep := rep || (case when (r->>'yangi')::int = 0 and (r->>'storno')::int = 0 and n = 4 and (r2->>'yangi')::int = 4 then 'OK   qayta provodka: no-op (yangi=0), operation_id takrori bir xil javob' else 'FAIL idempotent: ' || r::text end);

  -- 5. Muvozanat: Dt = Kt provodka rad; to'g'ridan-to'g'ri yozuv ham (check); ОСВ jami Dt = jami Kt = jurnal yig'indisi
  r := public.t2_bux_qolda_provodka_v1(ub, k, '2026-03-01', '5110', '5110', 10, null, null, null, 'x', gen_random_uuid());
  rep := rep || (case when r->>'code' = 'HISOB_NOTOGRI' then 'OK   Dt = Kt provodka rad (qo''lda)' else 'FAIL Dt=Kt qo''lda: ' || r::text end);
  begin
    insert into public.t2_bux_provodka(kompaniya_id, sana, dt_kod, kt_kod, summa, manba_tur, qism, tur) values (k, '2026-03-01', '5110', '5110', 10, 'qolda', 'asosiy', 'qolda');
    rep := rep || 'FAIL Dt=Kt to''g''ridan-to''g''ri yozuv o''tib ketdi'::text;
  exception when check_violation then
    rep := rep || 'OK   Dt = Kt to''g''ridan-to''g''ri yozuv bazada rad'::text;
  end;
  r := public.t2_bux_osv_v1(k, ub, '2026-01-01', '2026-12-31', null, null, null, 500);
  select coalesce(sum(summa), 0) into a from public.t2_bux_provodka where kompaniya_id = k;
  rep := rep || (case when (r->>'jami_dt')::numeric = (r->>'jami_kt')::numeric and (r->>'jami_dt')::numeric = a then 'OK   ОСВ: jami Dt = jami Kt = jurnal yig''indisi' else 'FAIL ОСВ: ' || r::text || ' jurnal=' || a end);

  -- 6. Hisob kartochkasi 4010 = ОСВ qatori; yuruvchi saldo; drill-down yorlig'i; hisobsiz so'rov rad
  r2 := public.t2_bux_kartochka_v1(k, ub, '2026-01-01', '2026-12-31', null, null, '4010', 500);
  select (x->>'yopilish')::numeric into a from jsonb_array_elements(r->'qatorlar') x where x->>'kod' = '4010';
  rep := rep || (case when (r2->>'dt')::numeric = 1120 and (r2->>'kt')::numeric = 500 and (r2->>'yopilish')::numeric = a and a = 620
                       and jsonb_array_length(r2->'qatorlar') = 3 and (r2->'qatorlar'->2->>'saldo')::numeric = 620
                       and exists (select 1 from jsonb_array_elements(r2->'qatorlar') x where x->>'manba_tur' = 'forma3' and x->>'hujjat' = 'F3-1')
                      then 'OK   kartochka 4010: oborot 1120/500, saldo 620 = ОСВ, hujjat F3-1' else 'FAIL kartochka: ' || r2::text end);
  r2 := public.t2_bux_kartochka_v1(k, ub, '2026-01-01', '2026-12-31', null, null, null, 500);
  rep := rep || (case when r2->>'code' = 'HISOB_KERAK' then 'OK   kartochka hisobsiz rad' else 'FAIL kartochka hisobsiz: ' || r2::text end);

  -- 7. Storno: manba (to'lov) bekor -> avto storno (minus), 4010 saldo 1120 ga qaytadi; qo'lda provodka -> storno -> sof 0; ikkinchi storno rad
  set local session_replication_role = replica;
  update public.t2_tolov set holat = 'bekor' where id = tl;
  set local session_replication_role = origin;
  r := public.t2_bux_avto_provodka_v1(ub, k, false, gen_random_uuid());
  r2 := public.t2_bux_kartochka_v1(k, ub, '2026-01-01', '2026-12-31', null, null, '4010', 500);
  rep := rep || (case when (r->>'storno')::int = 1 and (r->>'yangi')::int = 0 and (r2->>'yopilish')::numeric = 1120 then 'OK   manba bekor -> storno provodka, saldo 1120' else 'FAIL manba storno: ' || r::text || r2::text end);
  r := public.t2_bux_qolda_provodka_v1(ub, k, '2026-03-01', '5110', '6010', 77, null, null, null, 'test', gen_random_uuid());
  pid := (r->>'id')::bigint;
  r2 := public.t2_bux_storno_v1(ub, k, pid, 'xato', gen_random_uuid());
  select coalesce(sum(summa), 0) into a from public.t2_bux_provodka where kompaniya_id = k and (id = pid or storno_id = pid);
  rep := rep || (case when (r->>'ok')::boolean and (r2->>'ok')::boolean and a = 0
                       and public.t2_bux_storno_v1(ub, k, pid, 'yana', gen_random_uuid())->>'code' = 'ALLAQACHON_STORNO' then 'OK   qo''lda provodka + storno = 0, ikkinchi storno rad' else 'FAIL qo''lda storno' end);

  -- 8. Qat'iy davr bloki: 2026-01 yopiladi; F3 summasi o'zgarsa delta yopiq oyga YOZILMAYDI (otkazildi), qo'lda provodka rad, ochiq oyga yoziladi
  r := public.t2_bux_davr_v1(ub, k, '2026-01-15', 'yop', true, 'tasdiq', gen_random_uuid());
  select count(*) into n from public.t2_bux_provodka where kompaniya_id = k;
  set local session_replication_role = replica;
  update public.t2_forma3 set sotuv_summa = 2240 where id = f3;
  set local session_replication_role = origin;
  r2 := public.t2_bux_avto_provodka_v1(ub, k, false, gen_random_uuid());
  select count(*) into n2 from public.t2_bux_provodka where kompaniya_id = k;
  rep := rep || (case when (r->>'ok')::boolean and (r2->>'yopiq_davr_otkazildi')::int = 2 and (r2->>'yangi')::int = 0 and n = n2 then 'OK   davr bloki: yopiq oyga delta yozilmadi (2 ta o''tkazildi)' else 'FAIL davr bloki: ' || r2::text end);
  begin
    perform public.t2_bux_qolda_provodka_v1(ub, k, '2026-01-20', '5110', '6010', 5, null, null, null, 'yopiq', gen_random_uuid());
    rep := rep || 'FAIL yopiq oyga qo''lda provodka o''tib ketdi'::text;
  exception when others then
    get stacked diagnostics v_msg = message_text;
    rep := rep || (case when v_msg like 'BUX_DAVR_YOPIQ%' then 'OK   yopiq oyga qo''lda provodka rad (BUX_DAVR_YOPIQ)' else 'FAIL davr bloki xabari: ' || v_msg end);
  end;
  r := public.t2_bux_qolda_provodka_v1(ub, k, '2026-03-02', '5110', '6010', 5, null, null, null, 'ochiq', gen_random_uuid());
  rep := rep || (case when (r->>'ok')::boolean then 'OK   ochiq oyga provodka yoziladi' else 'FAIL ochiq oy: ' || r::text end);
  -- ogohlantirish rejimi (davr_blok=false): delta yoziladi, ogohlantirish soni qaytadi
  r := public.t2_bux_davr_blok_v1(ub, k, false, gen_random_uuid());
  r2 := public.t2_bux_avto_provodka_v1(ub, k, false, gen_random_uuid());
  rep := rep || (case when (r->>'ok')::boolean and (r2->>'yopiq_davr_ogohlantirish')::int = 2 and (r2->>'yangi')::int = 2 then 'OK   davr_blok=false: ogohlantirish rejimi (yozildi, 2 ogohlantirish)' else 'FAIL ogohlantirish rejimi: ' || r2::text end);
  rep := rep || (case when public.t2_bux_sozlama_v1(k, ub)->>'davr_blok' = 'false' and (public.t2_bux_sozlama_v1(k, ub)->>'tekshirilsin')::int >= 9 then 'OK   sozlama o''qiladi (blok=false, T hisoblar bor)' else 'FAIL sozlama' end);

  -- 9. Buyurtmachi shabloni (B kompaniya): qabul qilingan F2 taqdimi = kapital qo'yilma + QQS, to'lov = chiqim; o'z daftariga
  r := public.t2_bux_shablon_tanla_v1(ubb, kb, 'yoq_shablon', gen_random_uuid());
  rep := rep || (case when r->>'code' = 'SHABLON_YOQ' then 'OK   noma''lum shablon rad' else 'FAIL shablon_yoq: ' || r::text end);
  r := public.t2_bux_shablon_tanla_v1(ubb, kb, 'buyurtmachi', gen_random_uuid());
  r2 := public.t2_bux_boshlash_v1(ubb, kb, gen_random_uuid());
  rep := rep || (case when (r->>'ok')::boolean and (r2->>'moslik_qoshildi')::int = 5
                       and not exists (select 1 from public.t2_bux_moslik where kompaniya_id = kb and kalit = 'sotuv.realizatsiya')
                       and exists (select 1 from public.t2_bux_moslik where kompaniya_id = kb and kalit = 'taqdim.f2' and dt_kod = '0800')
                      then 'OK   buyurtmachi shabloni: 5 qoida (realizatsiya yo''q, taqdim.f2 bor)' else 'FAIL buyurtmachi shabloni: ' || r::text || r2::text end);
  insert into public.t2_kontragent (kompaniya_id, nom, inn) values (kb, 'TEST PUDRATCHI', v_inn) returning id into kk;
  set local session_replication_role = replica;
  insert into public.t2_shartnoma (kompaniya_id, raqam, asosiy, turi, taraf) values (kb, 'T2-B', true, 'Bosh shartnoma', 'TEST PUDRATCHI') returning id into sh_b;
  insert into public.t2_shartnoma_tomon (kompaniya_id, shartnoma_id, rol, kontragent_id, nom, tartib) values (kb, sh_b, 'Pudratchi', kk, 'TEST PUDRATCHI', 1);
  insert into public.t2_tolov (kompaniya_id, shartnoma_id, sana, summa, tur, manba) values (kb, sh_b, '2026-02-20', 400, 'tolov', 'qolda');
  insert into public.t2_tomon_taqdim (aloqa_id, taqdim_etuvchi_kompaniya_id, qabul_qiluvchi_kompaniya_id, resurs, manba_jadval, manba_id, nom, taqdim_actor_id, summa, holat, qaror_vaqti)
    values (-1, k, kb, 'f2', 't2_akt', -1, 'TEST F2', ub, 1120, 'qabul', '2026-02-10 10:00:00+00');
  set local session_replication_role = origin;
  select count(*) into n from public.t2_bux_provodka where kompaniya_id = k;
  r := public.t2_bux_avto_provodka_v1(ubb, kb, false, gen_random_uuid());
  rep := rep || (case when (r->>'yangi')::int = 3
                       and (select summa from public.t2_bux_provodka where kompaniya_id = kb and manba_tur = 'taqdim' and qism = 'asosiy' and dt_kod = '0800' and kt_kod = '6010' and kontragent_id = kk) = 1000
                       and (select summa from public.t2_bux_provodka where kompaniya_id = kb and manba_tur = 'taqdim' and qism = 'nds_xarid' and dt_kod = '4410' and kt_kod = '6010') = 120
                       and (select summa from public.t2_bux_provodka where kompaniya_id = kb and manba_tur = 'tolov' and dt_kod = '6010' and kt_kod = '5110') = 400
                      then 'OK   buyurtmachi: F2 taqdim 1000 (0800/6010) + QQS 120 (4410/6010) + to''lov chiqim 400' else 'FAIL buyurtmachi provodka: ' || r::text end);

  -- 10. Tenant izolyatsiyasi: B yozuvlari A daftarini o'zgartirmadi; B daftarida A ning shartnoma/obyekt id si yo'q; A taqdim qatorini ko'rmaydi; begona/rol o'qiy olmaydi
  select count(*) into n2 from public.t2_bux_provodka where kompaniya_id = k;
  rep := rep || (case when n = n2
                       and not exists (select 1 from public.t2_bux_provodka where kompaniya_id = kb and (shartnoma_id = sh_a or obyekt_id = o))
                       and not exists (select 1 from public.t2_bux_provodka where kompaniya_id = k and manba_tur = 'taqdim')
                      then 'OK   izolyatsiya: B daftari A ga tegmadi, id lar aralashmadi' else 'FAIL izolyatsiya: n=' || n || ' n2=' || n2 end);
  begin
    perform public.t2_bux_osv_v1(k, ubb, null, null, null, null, null, 10);
    rep := rep || 'FAIL begona kompaniya ОСВ ni o''qidi'::text;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    rep := rep || ('OK   begona kompaniya A ОСВ ini o''qiy olmaydi (' || v_state || ')');
  end;
  begin
    perform public.t2_bux_kartochka_v1(kb, ub, null, null, null, null, '6010', 10);
    rep := rep || 'FAIL A foydalanuvchisi B kartochkasini o''qidi'::text;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    rep := rep || ('OK   A foydalanuvchisi B kartochkasini o''qiy olmaydi (' || v_state || ')');
  end;
  begin
    perform public.t2_bux_osv_v1(k, uy, null, null, null, null, null, 10);
    rep := rep || 'FAIL buyurtmachi roli ОСВ ni o''qidi'::text;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    rep := rep || ('OK   buyurtmachi roli buxgalteriyani o''qiy olmaydi (' || v_state || ')');
  end;
  -- begona kompaniyaga provodka yozish (ruxsatsiz) rad
  begin
    perform public.t2_bux_qolda_provodka_v1(ubb, k, '2026-03-05', '5110', '6010', 1, null, null, null, 'begona', gen_random_uuid());
    rep := rep || 'FAIL begona kompaniyaga provodka yozildi'::text;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    rep := rep || ('OK   begona kompaniyaga provodka yozib bo''lmaydi (' || v_state || ')');
  end;

  -- 11. T tasdig'i
  r := public.t2_bux_hisob_tasdiq_v1(ub, k, array['4310', '4410'], gen_random_uuid());
  rep := rep || (case when (r->>'ok')::boolean and (r->>'tasdiqlandi')::int = 2 then 'OK   hisob tasdig''i (T belgisi olindi)' else 'FAIL tasdiq: ' || r::text end);

  if exists (select 1 from unnest(rep) x where x like 'FAIL%') then
    raise exception 'ACCEPTANCE_BUXGALTERIYA_V2 FAIL:%', E'\n' || array_to_string(rep, E'\n');
  end if;
  raise notice 'ACCEPTANCE_BUXGALTERIYA_V2 % OK:%', cardinality(rep), E'\n' || array_to_string(rep, E'\n');
end $acc$;

rollback;
