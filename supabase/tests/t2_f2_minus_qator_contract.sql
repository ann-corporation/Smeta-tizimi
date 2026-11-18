-- MINUS qatorlar («normaga keltirish») F2 zanjirida: kontrakt testi.
-- ISHLATISH: faqat chaqiruvchi ROLLBACK qiladigan tranzaksiyada (begin; <shu fayl>; rollback;). Sun'iy ma'lumot, real summa/nom yo'q.
-- Talab: migratsiya 20270104000000_t2_f2_mumkin_ishorali_v1 qo'llangan (aks holda 1-qadam ataylab yiqiladi va sababini aytadi).
-- Zanjir qurilishi supabase/tests/oltin_zanjir_v1.acceptance.sql 1-4 qadamlari bilan bir xil (kompaniya -> obyekt -> podval -> smeta import -> fakt).
-- Tekshiriladi:
--   1) MINUS qator faktli bo'lsa f2_mumkin_hajm/summa = fakt (manfiy), plyus qator avvalgidek;
--   2) F2 qoralama yangilash (qosh_mumkindan/yangila yo'li = t2_f2_qoralama_yangila_v1) MINUS qatorni manfiy hajm/summa bilan qabul qiladi,
--      qoralama jami (qator summalari + hujjat_jami) MINUS qatorga kamayadi;
--   3) tasdiqdan keyin: f2_hajm manfiy, f2_mumkin = 0 (ishora o'zgarmaydi), qoldiq = 0, jami F2 summasi kamaygan, nakopitelniy jami_hajm manfiy.
-- Kutilgan (qo'lda): M1 plyus 20 m3 x 800 000 = 16 000 000; M2 MINUS -4 m3 x 800 000 = -3 200 000; qoralama/F2 jami = 12 800 000.
-- Har xato: MINUS_QATOR qadam [<n> <nom>]: <sqlerrm>.

set local statement_timeout = '300s';

create or replace function pg_temp.mq_assert(p_cond boolean, p_msg text)
returns void language plpgsql as $f$
begin
  if p_cond is not true then raise exception 'ASSERT: %', p_msg; end if;
end $f$;

create or replace function pg_temp.mq_ok(p_r jsonb, p_what text)
returns void language plpgsql as $f$
begin
  if p_r is null or coalesce((p_r->>'ok')::boolean, false) is not true then
    raise exception 'RPC % returned %', p_what, left(coalesce(p_r::text, 'NULL'), 600);
  end if;
end $f$;

do $mq$
declare
  v_n integer := 0;
  v_name text := 'init';
  v_tag text := substr(md5(random()::text || clock_timestamp()::text), 1, 8);
  v_plat bigint; v_S bigint; v_boss bigint; v_pto bigint; v_prorab bigint;
  v_komp bigint; v_loy bigint; v_obj bigint; v_sess bigint;
  v_r jsonb; v_h record; v_M1 bigint; v_M2 bigint; v_f2 bigint; v_ver integer; v_sum numeric; v_jami numeric; v_cnt integer;
begin
  -- ===================================================================
  v_n := 1; v_name := 'kompaniya + obyekt + podval + smeta (plyus M1, MINUS M2) + fakt';
  insert into public.t2_kompaniya(nom, kod, faol) values ('MQ PLATFORMA ' || v_tag, 'MQP' || v_tag, true) returning id into v_plat;
  insert into public.t2_foydalanuvchi(login, ism, holat) values ('mq_s_' || v_tag, 'MQ Superadmin', 'faol') returning id into v_S;
  insert into public.t2_azolik(foydalanuvchi_id, kompaniya_id, rol, holat) values (v_S, v_plat, 'superadmin', 'faol');
  v_r := public.t2_kompaniya_yarat_v1(v_S, 'MQ Zanjir ' || v_tag, null, null, gen_random_uuid());
  perform pg_temp.mq_ok(v_r, 't2_kompaniya_yarat_v1');
  v_komp := (v_r->>'kompaniya_id')::bigint; v_boss := v_S;
  v_r := public.t2_azolik_qosh_v1(v_boss, v_komp, 'mq_pto_' || v_tag, 'pto', null, 'MQ PTO', gen_random_uuid());
  perform pg_temp.mq_ok(v_r, 'azolik_qosh pto');
  v_r := public.t2_azolik_qosh_v1(v_boss, v_komp, 'mq_prorab_' || v_tag, 'prorab', null, 'MQ Prorab', gen_random_uuid());
  perform pg_temp.mq_ok(v_r, 'azolik_qosh prorab');
  select u.id into v_pto from public.t2_foydalanuvchi u where u.login = 'mq_pto_' || v_tag;
  select u.id into v_prorab from public.t2_foydalanuvchi u where u.login = 'mq_prorab_' || v_tag;
  v_r := public.t2_loyiha_yarat(v_boss, v_komp, 'MQ Loyiha ' || v_tag);
  perform pg_temp.mq_ok(v_r, 't2_loyiha_yarat'); v_loy := (v_r->>'id')::bigint;
  v_r := public.t2_obyekt_yarat_v1(v_komp, v_pto, v_loy, 'MQ Obyekt ' || v_tag, gen_random_uuid());
  perform pg_temp.mq_ok(v_r, 't2_obyekt_yarat_v1'); v_obj := (v_r->>'obyekt_id')::bigint;
  v_r := public.t2_nakrutka_podval_saqla_v1(v_komp, v_obj, null, 'MQ podval',
    (select jsonb_agg(jsonb_build_object('kod', x.kod, 'nom', x.kod, 'tur', 'foiz', 'foiz', x.f, 'manba', 'smeta', 'koefKod', x.k) order by x.kod)
       from (values ('tr_mat', 0, U&'\0422\0420\0410\041D\0421\041F\041E\0420\0422_\041C\0410\0422\0415\0420\0418\0410\041B'),
                    ('skl_mat', 0, U&'\0421\041A\041B\0410\0414\0421\041A\0418\0415_\041C\0410\0422\0415\0420\0418\0410\041B'),
                    ('skl_mk', 0, U&'\0421\041A\041B\0410\0414\0421\041A\0418\0415_\041C\041A'),
                    ('tr_kab', 0, U&'\0422\0420\0410\041D\0421\041F\041E\0420\0422_\041A\0410\0411\0415\041B\042C'),
                    ('prochie', 18, U&'\041F\0420\041E\0427\0418\0415_\041F\041E\0414\0420\042F\0414\0427\0418\041A'),
                    ('tr_ob', 0, U&'\0422\0420\0410\041D\0421\041F\041E\0420\0422_\041E\0411\041E\0420\0423\0414'),
                    ('zag_ob', 0, U&'\0417\0410\0413\041E\0422_\0421\041A\041B\0410\0414_\041E\0411\041E\0420\0423\0414'),
                    ('strax', 0, U&'\0421\0422\0420\0410\0425\041E\0412\0410\041D\0418\0415'),
                    ('risk', 0, U&'\0420\0418\0421\041A'),
                    ('ztr', 0, U&'\0417\0422\0420_\0421\041E\0426\0421\0422\0420\0410\0425'),
                    ('nds', 12, U&'\041D\0414\0421')) x(kod, f, k)),
    null, null, gen_random_uuid(), 'actor:' || v_boss);
  perform pg_temp.mq_ok(v_r, 't2_nakrutka_podval_saqla_v1');
  v_r := public.t2_smeta_import_boshla_v1(v_komp, v_boss, v_obj, gen_random_uuid(), null);
  perform pg_temp.mq_ok(v_r, 't2_smeta_import_boshla_v1'); v_sess := (v_r->>'sessiya_id')::bigint;
  v_r := public.t2_smeta_import_bolak_v1(v_komp, v_boss, v_sess, 0, jsonb_build_array(
    jsonb_build_object('local_id','S1','tur','rz','kod','MQ-S1','nom','Section 1','hajm',1),
    jsonb_build_object('local_id','W1','parent_local_id','S1','tur','bl','kod','MQ-W1','nom','Work 1','birlik','m3','hajm',20),
    jsonb_build_object('local_id','M1','parent_local_id','W1','tur','mat','kod','MQ-M1','nom','Concrete','birlik','m3','hajm',20,'narx',800000,'summa',16000000),
    -- MINUS («normaga keltirish») qator: manfiy hajm va manfiy summa, narx musbat.
    jsonb_build_object('local_id','W2','parent_local_id','S1','tur','bl','kod','MQ-W2','nom','Exclude 1','birlik','m3','hajm',-4),
    jsonb_build_object('local_id','M2','parent_local_id','W2','tur','mat','kod','MQ-M2','nom','Concrete exclude','birlik','m3','hajm',-4,'narx',800000,'summa',-3200000)));
  perform pg_temp.mq_ok(v_r, 't2_smeta_import_bolak_v1');
  v_r := public.t2_smeta_import_yakunla_v1(v_komp, v_boss, v_sess);
  perform pg_temp.mq_ok(v_r, 't2_smeta_import_yakunla_v1');
  select q.id into v_M1 from public.t2_qator q where q.obyekt_id = v_obj and q.kod = 'MQ-M1';
  select q.id into v_M2 from public.t2_qator q where q.obyekt_id = v_obj and q.kod = 'MQ-M2';
  perform pg_temp.mq_assert((select hajm from public.t2_qator where id = v_M2) = -4, 'MINUS qator manfiy hajm bilan import bo''lishi kerak');
  -- fakt: plyus to'liq, MINUS to'liq (manfiy)
  v_r := public.t2_fakt_yoz_v2(v_obj, date '2026-10-12', jsonb_build_array(
      jsonb_build_object('qator_id', v_M1, 'hajm', 20), jsonb_build_object('qator_id', v_M2, 'hajm', -4)),
    v_prorab, gen_random_uuid(), 'MQ fakt', null, 'actor:' || v_prorab);
  perform pg_temp.mq_ok(v_r, 't2_fakt_yoz_v2');

  -- ===================================================================
  v_n := 2; v_name := 'f2_mumkin ishorali: MINUS qator = fakt (manfiy), plyus avvalgidek';
  select * into v_h from public.t2_qator_holat where qator_id = v_M1;
  perform pg_temp.mq_assert(v_h.fakt_hajm = 20 and v_h.f2_mumkin_hajm = 20, 'M1 plyus: fakt 20 -> mumkin 20; got ' || coalesce(v_h.f2_mumkin_hajm::text, 'NULL'));
  select * into v_h from public.t2_qator_holat where qator_id = v_M2;
  perform pg_temp.mq_assert(v_h.fakt_hajm = -4, 'M2 fakt -4; got ' || coalesce(v_h.fakt_hajm::text, 'NULL'));
  perform pg_temp.mq_assert(v_h.f2_mumkin_hajm = -4, 'M2 MINUS: mumkin = fakt = -4 (migratsiya 20270104000000 qo''llanganmi?); got ' || coalesce(v_h.f2_mumkin_hajm::text, 'NULL'));
  perform pg_temp.mq_assert(v_h.f2_mumkin_summa is not null and v_h.f2_mumkin_summa < 0, 'M2 MINUS: mumkin summa manfiy; got ' || coalesce(v_h.f2_mumkin_summa::text, 'NULL'));
  -- tezlik funksiyasi (obyekt paketi yo'li) view bilan bir xil bo'lishi shart
  select * into v_h from public._t2_qator_holat_v2(array[v_obj]) where qator_id = v_M2;
  perform pg_temp.mq_assert(v_h.f2_mumkin_hajm = -4, '_t2_qator_holat_v2: M2 mumkin -4; got ' || coalesce(v_h.f2_mumkin_hajm::text, 'NULL'));

  -- ===================================================================
  v_n := 3; v_name := 'F2 qoralama: avval faqat plyus, keyin MINUS qator qo''shiladi (t2_f2_qoralama_yangila_v1)';
  v_r := public.t2_akt_yarat(v_obj, 'f2', date '2026-10-01', jsonb_build_array(jsonb_build_object('qator_id', v_M1, 'hajm', 20)),
    'MQ-F2-1', gen_random_uuid(), 'frontend', 'actor:' || v_boss);
  perform pg_temp.mq_ok(v_r, 't2_akt_yarat F2'); v_f2 := (v_r->>'akt_id')::bigint;
  select versiya into v_ver from public.t2_akt where id = v_f2;
  v_r := public.t2_f2_qoralama_yangila_v1(v_pto, v_komp, v_f2, v_ver, jsonb_build_array(
      jsonb_build_object('qator_id', v_M1, 'certified_quantity', 20, 'certified_unit_price', 800000, 'certified_amount', 16000000, 'certified_source_hash', null),
      jsonb_build_object('qator_id', v_M2, 'certified_quantity', -4, 'certified_unit_price', 800000, 'certified_amount', -3200000, 'certified_source_hash', null)),
    gen_random_uuid(), 'frontend_v2');
  perform pg_temp.mq_ok(v_r, 't2_f2_qoralama_yangila_v1 (MINUS qator bilan)');
  select count(*), coalesce(sum(summa), 0) into v_cnt, v_sum from public.t2_akt_qator where akt_id = v_f2;
  perform pg_temp.mq_assert(v_cnt = 2, 'qoralamada 2 qator (plyus + MINUS); got ' || v_cnt);
  perform pg_temp.mq_assert(v_sum = 12800000, 'qoralama qator summalari jami 12 800 000 (16 000 000 - 3 200 000); got ' || v_sum);
  select hujjat_jami into v_jami from public.t2_akt where id = v_f2;
  perform pg_temp.mq_assert(v_jami = 12800000, 'hujjat_jami 12 800 000; got ' || coalesce(v_jami::text, 'NULL'));
  perform pg_temp.mq_assert((select hajm from public.t2_akt_qator where akt_id = v_f2 and qator_id = v_M2) = -4, 'MINUS qator hajmi -4 saqlanishi kerak (ishora yo''qolmasin)');
  perform pg_temp.mq_assert(coalesce((v_r->>'ogohlantirish_soni')::int, 0) = 0, 'fakt doirasidagi MINUS qator ogohlantirish bermasligi kerak; got ' || coalesce(v_r->>'ogohlantirish_soni', 'NULL'));

  -- ===================================================================
  v_n := 4; v_name := 'tasdiqdan keyin: F2 manfiy, mumkin 0 (ishora o''zgarmaydi), qoldiq 0, jami kamaygan';
  v_r := public.t2_akt_tasdiqlash(v_f2, null, 'actor:' || v_boss, gen_random_uuid());
  perform pg_temp.mq_ok(v_r, 't2_akt_tasdiqlash');
  select * into v_h from public.t2_qator_holat where qator_id = v_M2;
  perform pg_temp.mq_assert(v_h.f2_hajm = -4, 'M2 tasdiqlangan F2 hajmi -4; got ' || coalesce(v_h.f2_hajm::text, 'NULL'));
  perform pg_temp.mq_assert(v_h.f2_mumkin_hajm = 0, 'M2: F2 to''liq olingach mumkin 0 (musbatga o''tmaydi); got ' || coalesce(v_h.f2_mumkin_hajm::text, 'NULL'));
  perform pg_temp.mq_assert(v_h.qoldiq_hajm = 0, 'M2: qoldiq = smeta - F2 = -4 - (-4) = 0; got ' || coalesce(v_h.qoldiq_hajm::text, 'NULL'));
  select * into v_h from public.t2_qator_holat where qator_id = v_M1;
  perform pg_temp.mq_assert(v_h.f2_mumkin_hajm = 0, 'M1: mumkin 0 tasdiqdan keyin; got ' || coalesce(v_h.f2_mumkin_hajm::text, 'NULL'));
  select coalesce(sum(f2_summa), 0) into v_sum from public.t2_qator_holat where obyekt_id = v_obj and tur in ('mat', 'rs', 'ob');
  perform pg_temp.mq_assert(v_sum = 12800000, 'obyekt F2 summasi 12 800 000 (MINUS bilan kamaygan); got ' || v_sum);
  select coalesce(sum((x->>'jami_hajm')::numeric), 0) into v_sum
    from jsonb_array_elements(public.t2_nakopitelniy_v2(v_obj, v_pto, null, 1000, false, 0)->'qatorlar') x where (x->>'qator_id')::bigint = v_M2;
  perform pg_temp.mq_assert(v_sum = -4, 'nakopitelniy: M2 jami_hajm = -4 (ishora bilan); got ' || v_sum);

  raise notice 'MINUS_QATOR_PASS';
exception when others then
  raise exception 'MINUS_QATOR qadam [% %]: %', v_n, v_name, sqlerrm;
end
$mq$;
