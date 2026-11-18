-- MINUS juft + fakt ergashishi + backfill + F2 qoralama: kontrakt testi.
-- ISHLATISH: faqat chaqiruvchi ROLLBACK qiladigan tranzaksiyada (chaqiruvchi o'raydi; bu fayl o'zida tranzaksiya buyruqlarini saqlamaydi). Sun'iy ma'lumot, real summa/nom yo'q.
-- Talab: migratsiyalar 20270104000000 (f2_mumkin ishorali), 20270108000000, 20270108000100, 20270108000200 qo'llangan.
-- Zanjir qurilishi t2_f2_minus_qator_contract.sql bilan bir xil (kompaniya -> obyekt -> podval -> smeta import -> fakt).
-- Smeta: S1 bo'limida W1 (asos, 20 m3, kod E15-2-19-7, MAT M1 20 x 800 000) va W2 (MINUS -4 m3, nomida "К НОРМЕ 15-02-19-07", MAT bola M2 -4 x 800 000).
-- Tekshiriladi:
--   1) juftlash: W2 -> W1 ('aniq', qoida 'havola'); ikkinchi asossiz MINUS W4 'juftsiz' (hisobotda);
--   2) asos W1 ga fakt 10 yozilsa W2 -2 va M2 -2 ulush bo'yicha avtomatik (izoh 'minus juft'), bitta aktda; bir operation_id takrori hech narsa qo'shmaydi;
--   3) asos W1 to'liq (+10) -> W2 -4, M2 -4 (smetadan oshmaydi); storno (-20) -> W2 0;
--   4) 'minus_juft:false' ergashishni o'chiradi; ko'rish (t2_fakt_minus_korik_v1) yetishmayotganni ko'rsatadi va yozmaydi; qollash dry_run yozmaydi,
--      real qollash W2/M2 ni to'ldiradi, takrori 0 qator;
--   5) F2 qoralama: f2_mumkin ishorali -> M1 (+20) va M2 (-4) qoralamaga tushadi, jami 12 800 000.
-- Har xato: MINUS_FAKT qadam [<n> <nom>]: <sqlerrm>.

set local statement_timeout = '300s';

create or replace function pg_temp.mf_assert(p_cond boolean, p_msg text)
returns void language plpgsql as $f$
begin
  if p_cond is not true then raise exception 'ASSERT: %', p_msg; end if;
end $f$;

create or replace function pg_temp.mf_ok(p_r jsonb, p_what text)
returns void language plpgsql as $f$
begin
  if p_r is null or coalesce((p_r->>'ok')::boolean, false) is not true then
    raise exception 'RPC % returned %', p_what, left(coalesce(p_r::text, 'NULL'), 600);
  end if;
end $f$;

create or replace function pg_temp.mf_fakt(p_qator bigint)
returns numeric language sql as $f$
  select coalesce(sum(aq.hajm), 0) from public.t2_akt_qator aq join public.t2_akt a on a.id = aq.akt_id and a.tur = 'fakt' and a.holat <> 'bekor' where aq.qator_id = p_qator
$f$;

do $mf$
declare
  v_n integer := 0;
  v_name text := 'init';
  v_tag text := substr(md5(random()::text || clock_timestamp()::text), 1, 8);
  v_plat bigint; v_S bigint; v_boss bigint; v_pto bigint; v_prorab bigint;
  v_komp bigint; v_loy bigint; v_obj bigint; v_sess bigint;
  v_r jsonb; v_W1 bigint; v_W2 bigint; v_W4 bigint; v_M1 bigint; v_M2 bigint; v_op uuid; v_f2 bigint; v_ver integer;
  v_cnt integer; v_sum numeric; v_j record; v_rows jsonb;
begin
  -- ===================================================================
  v_n := 1; v_name := 'kompaniya + obyekt + podval + smeta (asos W1, MINUS W2 + bola M2, juftsiz MINUS W4)';
  insert into public.t2_kompaniya(nom, kod, faol) values ('MF PLATFORMA ' || v_tag, 'MFP' || v_tag, true) returning id into v_plat;
  insert into public.t2_foydalanuvchi(login, ism, holat) values ('mf_s_' || v_tag, 'MF Superadmin', 'faol') returning id into v_S;
  insert into public.t2_azolik(foydalanuvchi_id, kompaniya_id, rol, holat) values (v_S, v_plat, 'superadmin', 'faol');
  v_r := public.t2_kompaniya_yarat_v1(v_S, 'MF Zanjir ' || v_tag, null, null, gen_random_uuid());
  perform pg_temp.mf_ok(v_r, 't2_kompaniya_yarat_v1');
  v_komp := (v_r->>'kompaniya_id')::bigint; v_boss := v_S;
  v_r := public.t2_azolik_qosh_v1(v_boss, v_komp, 'mf_pto_' || v_tag, 'pto', null, 'MF PTO', gen_random_uuid());
  perform pg_temp.mf_ok(v_r, 'azolik_qosh pto');
  v_r := public.t2_azolik_qosh_v1(v_boss, v_komp, 'mf_prorab_' || v_tag, 'prorab', null, 'MF Prorab', gen_random_uuid());
  perform pg_temp.mf_ok(v_r, 'azolik_qosh prorab');
  select u.id into v_pto from public.t2_foydalanuvchi u where u.login = 'mf_pto_' || v_tag;
  select u.id into v_prorab from public.t2_foydalanuvchi u where u.login = 'mf_prorab_' || v_tag;
  v_r := public.t2_loyiha_yarat(v_boss, v_komp, 'MF Loyiha ' || v_tag);
  perform pg_temp.mf_ok(v_r, 't2_loyiha_yarat'); v_loy := (v_r->>'id')::bigint;
  v_r := public.t2_obyekt_yarat_v1(v_komp, v_pto, v_loy, 'MF Obyekt ' || v_tag, gen_random_uuid());
  perform pg_temp.mf_ok(v_r, 't2_obyekt_yarat_v1'); v_obj := (v_r->>'obyekt_id')::bigint;
  v_r := public.t2_nakrutka_podval_saqla_v1(v_komp, v_obj, null, 'MF podval',
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
  perform pg_temp.mf_ok(v_r, 't2_nakrutka_podval_saqla_v1');
  v_r := public.t2_smeta_import_boshla_v1(v_komp, v_boss, v_obj, gen_random_uuid(), null);
  perform pg_temp.mf_ok(v_r, 't2_smeta_import_boshla_v1'); v_sess := (v_r->>'sessiya_id')::bigint;
  v_r := public.t2_smeta_import_bolak_v1(v_komp, v_boss, v_sess, 0, jsonb_build_array(
    jsonb_build_object('local_id','S1','tur','rz','kod','MF-S1','nom','Section 1','hajm',1),
    jsonb_build_object('local_id','W1','parent_local_id','S1','tur','bl','kod','E15-2-19-7','nom','Work 1','birlik','m3','hajm',20),
    jsonb_build_object('local_id','M1','parent_local_id','W1','tur','mat','kod','MF-M1','nom','Concrete','birlik','m3','hajm',20,'narx',800000,'summa',16000000),
    -- MINUS («normaga keltirish»): nomida asos normasiga havola; hajm farqli (-4), MAT bolasi bor.
    jsonb_build_object('local_id','W2','parent_local_id','S1','tur','bl','kod','E15-2-19-11','nom','Exclude K NORME 15-02-19-07 x7','birlik','m3','hajm',-4),
    jsonb_build_object('local_id','M2','parent_local_id','W2','tur','mat','kod','MF-M2','nom','Concrete exclude','birlik','m3','hajm',-4,'narx',800000,'summa',-3200000),
    -- Juftsiz MINUS: boshqa birlik, mos asos yo'q.
    jsonb_build_object('local_id','W4','parent_local_id','S1','tur','bl','kod','MF-W4','nom','Lone minus','birlik','kg','hajm',-7)));
  perform pg_temp.mf_ok(v_r, 't2_smeta_import_bolak_v1');
  v_r := public.t2_smeta_import_yakunla_v1(v_komp, v_boss, v_sess);
  perform pg_temp.mf_ok(v_r, 't2_smeta_import_yakunla_v1');
  select q.id into v_W1 from public.t2_qator q where q.obyekt_id = v_obj and q.kod = 'E15-2-19-7';
  select q.id into v_W2 from public.t2_qator q where q.obyekt_id = v_obj and q.kod = 'E15-2-19-11';
  select q.id into v_W4 from public.t2_qator q where q.obyekt_id = v_obj and q.kod = 'MF-W4';
  select q.id into v_M1 from public.t2_qator q where q.obyekt_id = v_obj and q.kod = 'MF-M1';
  select q.id into v_M2 from public.t2_qator q where q.obyekt_id = v_obj and q.kod = 'MF-M2';

  -- ===================================================================
  v_n := 2; v_name := 'juftlash: W2 -> W1 (havola), W4 juftsiz';
  select * into v_j from public.t2_fakt_minus_juft_v1(v_obj) where minus_id = v_W2;
  perform pg_temp.mf_assert(v_j.baza_id = v_W1 and v_j.holat = 'aniq' and v_j.qoida = 'havola',
    'W2 jufti W1 (aniq, havola); got ' || coalesce(v_j.baza_id::text, 'NULL') || '/' || coalesce(v_j.holat, 'NULL') || '/' || coalesce(v_j.qoida, 'NULL'));
  select * into v_j from public.t2_fakt_minus_juft_v1(v_obj) where minus_id = v_W4;
  perform pg_temp.mf_assert(v_j.holat = 'juftsiz' and v_j.baza_id is null, 'W4 juftsiz; got ' || coalesce(v_j.holat, 'NULL'));
  perform pg_temp.mf_assert((select count(*) from public.t2_fakt_minus_juft_hisobot_v1(v_obj) where minus_id = v_W4) = 1, 'hisobotda W4 bor');
  perform pg_temp.mf_assert((select count(*) from public.t2_fakt_minus_juft_hisobot_v1(v_obj) where minus_id = v_W2) = 0, 'hisobotda W2 yo''q (aniq)');

  -- ===================================================================
  v_n := 3; v_name := 'asos faktining yarmi -> MINUS va MAT bola ulush bo''yicha avtomatik, bir aktda, idempotent';
  v_op := gen_random_uuid();
  v_r := public.t2_fakt_yoz_v2(v_obj, date '2026-10-12', jsonb_build_array(jsonb_build_object('qator_id', v_W1, 'hajm', 10)),
    v_prorab, v_op, 'MF fakt 1', null, 'actor:' || v_prorab);
  perform pg_temp.mf_ok(v_r, 't2_fakt_yoz_v2 (W1 10)');
  perform pg_temp.mf_assert(pg_temp.mf_fakt(v_W1) = 10, 'W1 fakt 10; got ' || pg_temp.mf_fakt(v_W1));
  perform pg_temp.mf_assert(pg_temp.mf_fakt(v_W2) = -2, 'W2 fakt -2 (yarim); got ' || pg_temp.mf_fakt(v_W2));
  perform pg_temp.mf_assert(pg_temp.mf_fakt(v_M2) = -2, 'M2 fakt -2 (bola, shu ulush); got ' || pg_temp.mf_fakt(v_M2));
  perform pg_temp.mf_assert((v_r->>'minus_juft_soni')::int = 2, 'javobda minus_juft_soni = 2; got ' || coalesce(v_r->>'minus_juft_soni', 'NULL'));
  select count(*) into v_cnt from public.t2_akt_qator where akt_id = (v_r->>'akt_id')::bigint;
  perform pg_temp.mf_assert(v_cnt = 3, 'bitta aktda 3 qator (W1 + W2 + M2); got ' || v_cnt);
  perform pg_temp.mf_assert((select count(*) from public.t2_akt_qator where akt_id = (v_r->>'akt_id')::bigint and izoh = 'minus juft') = 2, 'avto qatorlar izohi minus juft');
  v_r := public.t2_fakt_yoz_v2(v_obj, date '2026-10-12', jsonb_build_array(jsonb_build_object('qator_id', v_W1, 'hajm', 10)),
    v_prorab, v_op, 'MF fakt 1', null, 'actor:' || v_prorab);
  perform pg_temp.mf_assert(pg_temp.mf_fakt(v_W1) = 10 and pg_temp.mf_fakt(v_W2) = -2 and pg_temp.mf_fakt(v_M2) = -2, 'bir operation_id takrori hech narsa qo''shmaydi');

  -- ===================================================================
  v_n := 4; v_name := 'asos to''liq -> MINUS to''liq (smetadan oshmaydi); storno -> orqaga';
  v_r := public.t2_fakt_yoz_v2(v_obj, date '2026-10-13', jsonb_build_array(jsonb_build_object('qator_id', v_W1, 'hajm', 10), jsonb_build_object('qator_id', v_M1, 'hajm', 20)),
    v_prorab, gen_random_uuid(), 'MF fakt 2', null, 'actor:' || v_prorab);
  perform pg_temp.mf_ok(v_r, 't2_fakt_yoz_v2 (W1 +10, M1 20)');
  perform pg_temp.mf_assert(pg_temp.mf_fakt(v_W2) = -4 and pg_temp.mf_fakt(v_M2) = -4, 'W2 -4, M2 -4 (to''liq); got ' || pg_temp.mf_fakt(v_W2) || '/' || pg_temp.mf_fakt(v_M2));
  v_r := public.t2_fakt_yoz_v2(v_obj, date '2026-10-14', jsonb_build_array(jsonb_build_object('qator_id', v_W1, 'hajm', 5)),
    v_prorab, gen_random_uuid(), 'MF fakt 3 (oshgan)', null, 'actor:' || v_prorab);
  perform pg_temp.mf_assert(pg_temp.mf_fakt(v_W2) = -4, 'asos smetadan oshsa ham MINUS smeta hajmidan oshmaydi; got ' || pg_temp.mf_fakt(v_W2));
  v_r := public.t2_fakt_yoz_v2(v_obj, date '2026-10-15', jsonb_build_array(jsonb_build_object('qator_id', v_W1, 'hajm', -25)),
    v_prorab, gen_random_uuid(), 'MF storno', null, 'actor:' || v_prorab);
  perform pg_temp.mf_assert(pg_temp.mf_fakt(v_W1) = 0 and pg_temp.mf_fakt(v_W2) = 0 and pg_temp.mf_fakt(v_M2) = 0, 'storno: asos 0 -> MINUS va bola 0; got ' || pg_temp.mf_fakt(v_W2) || '/' || pg_temp.mf_fakt(v_M2));

  -- ===================================================================
  v_n := 5; v_name := 'minus_juft:false o''chiradi; ko''rish yozmaydi; qollash dry_run yozmaydi, real to''ldiradi, takrori 0';
  v_r := public.t2_fakt_yoz_v2(v_obj, date '2026-10-16', jsonb_build_array(jsonb_build_object('qator_id', v_W1, 'hajm', 20, 'minus_juft', false)),
    v_prorab, gen_random_uuid(), 'MF fakt (juftsiz)', null, 'actor:' || v_prorab);
  perform pg_temp.mf_ok(v_r, 't2_fakt_yoz_v2 (minus_juft:false)');
  perform pg_temp.mf_assert(pg_temp.mf_fakt(v_W2) = 0, 'minus_juft:false: W2 fakt 0; got ' || pg_temp.mf_fakt(v_W2));
  select count(*), coalesce(sum(farq), 0) into v_cnt, v_sum from public.t2_fakt_minus_korik_v1(v_obj) where qator_id in (v_W2, v_M2);
  perform pg_temp.mf_assert(v_cnt = 2 and v_sum = -8, 'ko''rish: W2 -4 va M2 -4 yetishmaydi; got ' || v_cnt || '/' || v_sum);
  perform pg_temp.mf_assert(pg_temp.mf_fakt(v_W2) = 0, 'ko''rish hech narsa yozmaydi');
  v_r := public.t2_fakt_minus_qollash_v1(v_boss, v_komp, v_obj, date '2026-10-17', true, null);
  perform pg_temp.mf_ok(v_r, 'qollash dry_run');
  perform pg_temp.mf_assert((v_r->>'dry_run')::boolean and (v_r->>'qator_soni')::int = 2 and pg_temp.mf_fakt(v_W2) = 0, 'dry_run: ro''yxat, yozuv yo''q');
  v_r := public.t2_fakt_minus_qollash_v1(v_boss, v_komp, v_obj, date '2026-10-17', false, gen_random_uuid());
  perform pg_temp.mf_ok(v_r, 'qollash real');
  perform pg_temp.mf_assert(pg_temp.mf_fakt(v_W2) = -4 and pg_temp.mf_fakt(v_M2) = -4, 'real qollash: W2 -4, M2 -4; got ' || pg_temp.mf_fakt(v_W2) || '/' || pg_temp.mf_fakt(v_M2));
  v_r := public.t2_fakt_minus_qollash_v1(v_boss, v_komp, v_obj, date '2026-10-17', false, gen_random_uuid());
  perform pg_temp.mf_ok(v_r, 'qollash takror');
  perform pg_temp.mf_assert((v_r->>'qator_soni')::int = 0, 'takroriy qollash 0 qator; got ' || coalesce(v_r->>'qator_soni', 'NULL'));

  -- ===================================================================
  v_n := 6; v_name := 'F2 qoralama: fakt qoldig''i (f2_mumkin ishorali) M1 (+20) va MINUS bola M2 (-4) ni oladi';
  perform pg_temp.mf_assert((select f2_mumkin_hajm from public.t2_qator_holat where qator_id = v_M2) = -4, 'M2 f2_mumkin -4 (migratsiya 20270104000000 qo''llanganmi?)');
  select jsonb_agg(jsonb_build_object('qator_id', h.qator_id, 'certified_quantity', h.f2_mumkin_hajm, 'certified_unit_price', 800000,
                                      'certified_amount', h.f2_mumkin_hajm * 800000, 'certified_source_hash', null) order by h.qator_id)
    into v_rows from public.t2_qator_holat h where h.obyekt_id = v_obj and h.tur = 'mat' and h.f2_mumkin_hajm <> 0;
  perform pg_temp.mf_assert(jsonb_array_length(v_rows) = 2, 'mumkin qatorlar: M1 va M2; got ' || coalesce(jsonb_array_length(v_rows)::text, 'NULL'));
  v_r := public.t2_akt_yarat(v_obj, 'f2', date '2026-10-01', jsonb_build_array(jsonb_build_object('qator_id', v_M1, 'hajm', 20)),
    'MF-F2-1', gen_random_uuid(), 'frontend', 'actor:' || v_boss);
  perform pg_temp.mf_ok(v_r, 't2_akt_yarat F2'); v_f2 := (v_r->>'akt_id')::bigint;
  select versiya into v_ver from public.t2_akt where id = v_f2;
  v_r := public.t2_f2_qoralama_yangila_v1(v_pto, v_komp, v_f2, v_ver, v_rows, gen_random_uuid(), 'frontend_v2');
  perform pg_temp.mf_ok(v_r, 't2_f2_qoralama_yangila_v1');
  select count(*), coalesce(sum(summa), 0) into v_cnt, v_sum from public.t2_akt_qator where akt_id = v_f2;
  perform pg_temp.mf_assert(v_cnt = 2 and v_sum = 12800000, 'qoralamada 2 qator, jami 12 800 000; got ' || v_cnt || '/' || v_sum);
  perform pg_temp.mf_assert((select hajm from public.t2_akt_qator where akt_id = v_f2 and qator_id = v_M2) = -4, 'MINUS bola hajmi -4 saqlanadi');

  raise notice 'MINUS_FAKT_PASS';
exception when others then
  raise exception 'MINUS_FAKT qadam [% %]: %', v_n, v_name, sqlerrm;
end
$mf$;
