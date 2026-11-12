-- OLTIN ZANJIR v1 -- golden workflow acceptance.
-- Run ONLY inside a caller-provided transaction that the caller ROLLS BACK
-- (begin; run this file; rollback;). Synthetic data only. Needs a role that can
-- insert into t2_foydalanuvchi / t2_azolik (service role / postgres).
-- Run after migration 20261217000000 (boss dashboard F2 filter); without it step 11
-- fails on purpose and says which function is wrong.
--
-- Chain: company+members -> object+contract+podval -> smeta import -> fakt ->
--        F2 (draft, approve, freeze, remainder) -> Forma 3 -> payment -> costs ->
--        accounting -> Foyda/zarar source -> storno of the 2nd F2.
-- Every failure raises:  OLTIN_ZANJIR qadam [<n> <name>]: <sqlerrm>
-- Steps that are NOT executed raise NOTICE 'OLTIN_ZANJIR SKIP [n name]: reason'.
--
-- Hand-computed expectations (podval: only PROCHIE 18 %, NDS 12 %, rest 0 %):
--   smeta direct costs P = CHEL 1 000 000 + MASH 900 000 + MAT 36 000 000 = 37 900 000
--   ustamali = P*1.18 = 44 722 000 ; QQS bilan = *1.12 = 50 088 640
--   F2#1 (Oct): M1 5*800 000 + M3 0.5*30 000 000 = 19 000 000 -> ustamali 22 420 000 -> QQS bilan 25 110 400
--   F2#2 (Nov): M1 3*800 000 = 2 400 000 (together 21 400 000 -> 25 252 000 -> 28 282 240)
--   payment 10 000 000 -> receivable on Forma 3 = 25 110 400 - 10 000 000 = 15 110 400
--   costs 3 000 000 (CHEL) + 7 000 000 (MAT) = 10 000 000

set local statement_timeout = '300s';

create or replace function pg_temp.oz_assert(p_cond boolean, p_msg text)
returns void language plpgsql as $f$
begin
  if p_cond is not true then raise exception 'ASSERT: %', p_msg; end if;
end $f$;

create or replace function pg_temp.oz_ok(p_r jsonb, p_what text)
returns void language plpgsql as $f$
begin
  if p_r is null or coalesce((p_r->>'ok')::boolean, false) is not true then
    raise exception 'RPC % returned %', p_what, left(coalesce(p_r::text, 'NULL'), 600);
  end if;
end $f$;

do $oz$
declare
  v_n integer := 0;
  v_name text := 'init';
  v_tag text := substr(md5(random()::text || clock_timestamp()::text), 1, 8);
  v_plat bigint; v_S bigint; v_boss bigint; v_pto bigint; v_prorab bigint; v_bugalter bigint;
  v_komp bigint; v_loy bigint; v_obj bigint; v_obj2 bigint; v_sh bigint; v_podval bigint;
  v_r jsonb; v_p jsonb; v_sess bigint; v_x numeric; v_y numeric; v_i integer; v_b boolean;
  v_M1 bigint; v_M2 bigint; v_M3 bigint;
  v_fakt1 bigint; v_f2a bigint; v_f2b bigint; v_f2x bigint; v_f3 bigint;
  v_tolov bigint; v_xar1 bigint; v_xar2 bigint;
  v_items jsonb; v_h record; v_prov_n integer; v_f3_vsego numeric; v_recv numeric;
  v_rev numeric; v_cost numeric; v_dash numeric; v_exp numeric;
  v_op uuid;
begin
  -- ===================================================================
  v_n := 1; v_name := 'kompaniya + a''zolar (boss, pto, prorab, bugalter)';
  -- superadmin creates the company (the system's own rule: only superadmin opens a company directly)
  insert into public.t2_kompaniya(nom, kod, faol) values ('OZ PLATFORMA ' || v_tag, 'OZP' || v_tag, true) returning id into v_plat;
  insert into public.t2_foydalanuvchi(login, ism, holat) values ('oz_s_' || v_tag, 'OZ Superadmin', 'faol') returning id into v_S;
  insert into public.t2_azolik(foydalanuvchi_id, kompaniya_id, rol, holat) values (v_S, v_plat, 'superadmin', 'faol');
  v_r := public.t2_kompaniya_yarat_v1(v_S, 'OZ Zanjir ' || v_tag, null, null, gen_random_uuid());
  perform pg_temp.oz_ok(v_r, 't2_kompaniya_yarat_v1');
  v_komp := (v_r->>'kompaniya_id')::bigint; v_boss := v_S;
  perform pg_temp.oz_assert(v_r->>'rol' = 'boss', 'creator must be boss of the new company');
  v_r := public.t2_azolik_qosh_v1(v_boss, v_komp, 'oz_pto_' || v_tag, 'pto', null, 'OZ PTO', gen_random_uuid());
  perform pg_temp.oz_ok(v_r, 'azolik_qosh pto');
  v_r := public.t2_azolik_qosh_v1(v_boss, v_komp, 'oz_prorab_' || v_tag, 'prorab', null, 'OZ Prorab', gen_random_uuid());
  perform pg_temp.oz_ok(v_r, 'azolik_qosh prorab');
  v_r := public.t2_azolik_qosh_v1(v_boss, v_komp, 'oz_bug_' || v_tag, 'bugalter', null, 'OZ Bugalter', gen_random_uuid());
  perform pg_temp.oz_ok(v_r, 'azolik_qosh bugalter');
  select u.id into v_pto from public.t2_foydalanuvchi u where u.login = 'oz_pto_' || v_tag;
  select u.id into v_prorab from public.t2_foydalanuvchi u where u.login = 'oz_prorab_' || v_tag;
  select u.id into v_bugalter from public.t2_foydalanuvchi u where u.login = 'oz_bug_' || v_tag;
  perform pg_temp.oz_assert((select count(*) from public.t2_azolik where kompaniya_id = v_komp and holat = 'faol') = 4, 'expected 4 active memberships');
  perform pg_temp.oz_assert((select string_agg(rol, ',' order by rol) from public.t2_azolik where kompaniya_id = v_komp) = 'boss,bugalter,prorab,pto', 'roles must be boss,bugalter,prorab,pto');
  -- retry with the same operation_id returns the same member (no duplicate)
  v_op := gen_random_uuid();
  v_r := public.t2_azolik_qosh_v1(v_boss, v_komp, 'oz_dup_' || v_tag, 'kuzatuvchi', null, 'OZ Dup', v_op);
  v_r := public.t2_azolik_qosh_v1(v_boss, v_komp, 'oz_dup_' || v_tag, 'kuzatuvchi', null, 'OZ Dup', v_op);
  perform pg_temp.oz_assert((select count(*) from public.t2_azolik where kompaniya_id = v_komp) = 5, 'idempotent member add must not duplicate');

  -- ===================================================================
  v_n := 2; v_name := 'obyekt + shartnoma + podval (nakrutka)';
  v_r := public.t2_loyiha_yarat(v_boss, v_komp, 'OZ Loyiha ' || v_tag);
  perform pg_temp.oz_ok(v_r, 't2_loyiha_yarat'); v_loy := (v_r->>'id')::bigint;
  v_r := public.t2_obyekt_yarat_v1(v_komp, v_pto, v_loy, 'OZ Obyekt-1 ' || v_tag, gen_random_uuid());
  perform pg_temp.oz_ok(v_r, 't2_obyekt_yarat_v1 #1'); v_obj := (v_r->>'obyekt_id')::bigint;
  v_r := public.t2_obyekt_yarat_v1(v_komp, v_pto, v_loy, 'OZ Obyekt-2 ' || v_tag, gen_random_uuid());
  perform pg_temp.oz_ok(v_r, 't2_obyekt_yarat_v1 #2'); v_obj2 := (v_r->>'obyekt_id')::bigint;
  v_r := public.t2_shartnoma_saqla_v2(v_boss, v_komp, null, null,
    jsonb_build_object('raqam', 'OZ-SH-' || v_tag, 'nom', 'OZ shartnoma', 'loyiha_id', v_loy, 'asosiy', true, 'taraf', 'OZ buyurtmachi',
                       'summa_bez_nds', 60000000, 'nds', 12, 'jami_nds_bilan', 67200000),
    null, jsonb_build_array(v_obj), gen_random_uuid());
  perform pg_temp.oz_ok(v_r, 't2_shartnoma_saqla_v2'); v_sh := (v_r->>'id')::bigint;
  perform pg_temp.oz_assert(exists(select 1 from public.t2_shartnoma_bog where shartnoma_id = v_sh and obyekt_id = v_obj and holat = 'faol'), 'object must be bound to the contract');
  v_r := public.t2_nakrutka_podval_saqla_v1(v_komp, v_obj, null, 'OZ podval',
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
  perform pg_temp.oz_ok(v_r, 't2_nakrutka_podval_saqla_v1'); v_podval := (v_r->>'id')::bigint;
  perform pg_temp.oz_assert(public._t2_obyekt_nk_v1(v_obj)->>'nk_manba' = 'smeta_podvali', 'object nakrutka must come from the smeta podval');

  -- ===================================================================
  v_n := 3; v_name := 'smeta import (2 bo''lim, 3 ish, resurslar, 100 m3) + yadro jami';
  v_r := public.t2_smeta_import_boshla_v1(v_komp, v_boss, v_obj, gen_random_uuid(), null);
  perform pg_temp.oz_ok(v_r, 't2_smeta_import_boshla_v1'); v_sess := (v_r->>'sessiya_id')::bigint;
  v_r := public.t2_smeta_import_bolak_v1(v_komp, v_boss, v_sess, 0, jsonb_build_array(
    jsonb_build_object('local_id','S1','tur','rz','kod','OZ-S1','nom','Section 1','hajm',1),
    jsonb_build_object('local_id','W1','parent_local_id','S1','tur','bl','kod','OZ-W1','nom','Work 1','birlik','m3','hajm',20),
    jsonb_build_object('local_id','R1','parent_local_id','W1','tur','rs','kod','OZ-R1','nom','Labour','birlik',U&'\0447\0435\043B.-\0447','hajm',100,'narx',10000,'summa',1000000),
    jsonb_build_object('local_id','R2','parent_local_id','W1','tur','rs','kod','OZ-R2','nom','Excavator','birlik',U&'\043C\0430\0448.-\0447','hajm',10,'narx',50000,'summa',500000),
    jsonb_build_object('local_id','M1','parent_local_id','W1','tur','mat','kod','OZ-M1','nom','Concrete','birlik','m3','hajm',20,'narx',800000,'summa',16000000),
    jsonb_build_object('local_id','W2','parent_local_id','S1','tur','bl','kod','OZ-W2','nom','Work 2','birlik','kg','hajm',1000),
    jsonb_build_object('local_id','M2','parent_local_id','W2','tur','mat','kod','OZ-M2','nom','Nails','birlik','kg','hajm',1000,'narx',5000,'summa',5000000),
    jsonb_build_object('local_id','S2','tur','rz','kod','OZ-S2','nom','Section 2','hajm',1),
    jsonb_build_object('local_id','W3','parent_local_id','S2','tur','bl','kod','OZ-W3','nom','Work 3','birlik','100 m3','hajm',0.5),
    -- priced by coefficient unit: 0.5 x (100 m3) at 30 000 000 per 100 m3
    jsonb_build_object('local_id','M3','parent_local_id','W3','tur','mat','kod','OZ-M3','nom','Mortar','birlik','100 m3','hajm',0.5,'narx',30000000,'summa',15000000),
    jsonb_build_object('local_id','R4','parent_local_id','W3','tur','rs','kod','OZ-R4','nom','Mixer','birlik',U&'\043C\0430\0448.-\0447','hajm',8,'narx',50000,'summa',400000)));
  perform pg_temp.oz_ok(v_r, 't2_smeta_import_bolak_v1');
  v_r := public.t2_smeta_import_yakunla_v1(v_komp, v_boss, v_sess);
  perform pg_temp.oz_ok(v_r, 't2_smeta_import_yakunla_v1');
  perform pg_temp.oz_assert((select count(*) from public.t2_qator where obyekt_id = v_obj and versiya_holat = 'faol') = 11, 'expected 11 imported smeta rows');
  select q.id into v_M1 from public.t2_qator q where q.obyekt_id = v_obj and q.kod = 'OZ-M1';
  select q.id into v_M2 from public.t2_qator q where q.obyekt_id = v_obj and q.kod = 'OZ-M2';
  select q.id into v_M3 from public.t2_qator q where q.obyekt_id = v_obj and q.kod = 'OZ-M3';
  select paket into v_p from public._t2_summa_paket_v1(array[v_obj], 'smeta');
  perform pg_temp.oz_assert(v_p is not null, 'smeta paket is NULL (no podval?)');
  perform pg_temp.oz_assert((v_p->>'ustamasiz')::numeric = 37900000, 'smeta ustamasiz expected 37900000 got ' || (v_p->>'ustamasiz'));
  perform pg_temp.oz_assert((v_p->>'ustamali')::numeric = 44722000, 'smeta ustamali expected 44722000 got ' || (v_p->>'ustamali'));
  perform pg_temp.oz_assert((v_p->>'qqs_bilan')::numeric = 50088640, 'smeta qqs_bilan expected 50088640 got ' || (v_p->>'qqs_bilan'));
  perform pg_temp.oz_assert((v_p->'kesim'->>'mat')::numeric = 36000000 and (v_p->'kesim'->>'chel')::numeric = 1000000 and (v_p->'kesim'->>'mash')::numeric = 900000,
    'smeta category split must be MAT 36 000 000 / CHEL 1 000 000 / MASH 900 000, got ' || (v_p->'kesim')::text);

  -- ===================================================================
  v_n := 4; v_name := 'fakt (qisman, to''liq, smetadan oshgan -> ogohlantirish) + qoldiq';
  v_op := gen_random_uuid();
  v_r := public.t2_fakt_yoz_v2(v_obj, date '2026-10-12', jsonb_build_array(
      jsonb_build_object('qator_id', v_M1, 'hajm', 8),
      jsonb_build_object('qator_id', v_M3, 'hajm', 0.5),
      jsonb_build_object('qator_id', v_M2, 'hajm', 1100)),
    v_prorab, v_op, 'OZ fakt', null, 'actor:' || v_prorab);
  perform pg_temp.oz_ok(v_r, 't2_fakt_yoz_v2'); v_fakt1 := (v_r->>'akt_id')::bigint;
  perform pg_temp.oz_assert(coalesce((v_r->>'ogohlantirish_soni')::int, 0) = 1, 'over-smeta fakt must WARN (1 row) not block; got ' || coalesce(v_r->>'ogohlantirish_soni', 'NULL'));
  v_r := public.t2_fakt_yoz_v2(v_obj, date '2026-10-12', jsonb_build_array(jsonb_build_object('qator_id', v_M1, 'hajm', 8)), v_prorab, v_op, 'OZ fakt', null, 'actor:' || v_prorab);
  perform pg_temp.oz_assert((v_r->>'takror')::boolean is true, 'retry with the same operation_id must be takror');
  perform pg_temp.oz_assert((select count(*) from public.t2_akt where obyekt_id = v_obj and tur = 'fakt') = 1, 'retry must not create a second fakt document');
  select * into v_h from public.t2_qator_holat where id = v_M1;
  -- qoldiq_hajm = smeta - TASDIQLANGAN F2 (view definition), not fakt; fakt remainder = smeta_hajm - fakt_hajm; F2 headroom = f2_mumkin_hajm = max(fakt - f2, 0)
  perform pg_temp.oz_assert(v_h.smeta_hajm = 20 and v_h.fakt_hajm = 8 and v_h.smeta_hajm - v_h.fakt_hajm = 12 and v_h.qoldiq_hajm = 20 and v_h.f2_mumkin_hajm = 8, 'M1 partial: smeta 20, fakt 8 (fakt remainder 12), no F2 yet (qoldiq 20, f2_mumkin 8); got ' || v_h.smeta_hajm || '/' || v_h.fakt_hajm || '/' || coalesce(v_h.qoldiq_hajm::text, 'NULL') || '/' || coalesce(v_h.f2_mumkin_hajm::text, 'NULL'));
  select * into v_h from public.t2_qator_holat where id = v_M3;
  perform pg_temp.oz_assert(v_h.fakt_hajm = v_h.smeta_hajm and v_h.f2_mumkin_hajm = v_h.fakt_hajm, 'M3 full: fakt = smeta, whole quantity available for F2');
  select * into v_h from public.t2_qator_holat where id = v_M2;
  perform pg_temp.oz_assert(v_h.fakt_hajm = 1100 and v_h.smeta_hajm = 1000, 'M2 over: fakt 1100 > smeta 1000 is stored (warning, not block)');

  -- ===================================================================
  v_n := 5; v_name := 'F2 qoralama -> tasdiq -> muzlash -> keyingi davr faqat qoldiq';
  v_r := public.t2_akt_yarat(v_obj, 'f2', date '2026-10-01', jsonb_build_array(
      jsonb_build_object('qator_id', v_M1, 'hajm', 5), jsonb_build_object('qator_id', v_M3, 'hajm', 0.5)),
    'OZ-F2-1', gen_random_uuid(), 'frontend', 'actor:' || v_boss);
  perform pg_temp.oz_ok(v_r, 't2_akt_yarat F2#1'); v_f2a := (v_r->>'akt_id')::bigint;
  perform pg_temp.oz_assert(coalesce((v_r->>'ogohlantirish_soni')::int, 0) = 0, 'F2#1 within fakt must carry no warning');
  perform pg_temp.oz_assert((select count(*) from public.t2_akt_qator where akt_id = v_f2a) = 2, 'F2#1 must have exactly the 2 fakt-covered rows');
  perform pg_temp.oz_assert((select hajm from public.t2_akt_qator where akt_id = v_f2a and qator_id = v_M1) = 5, 'F2#1 M1 quantity must be the period fakt share (5)');
  v_r := public.t2_akt_tasdiqlash(v_f2a, null, 'actor:' || v_boss, gen_random_uuid());
  perform pg_temp.oz_ok(v_r, 't2_akt_tasdiqlash F2#1');
  select paket into v_p from public._t2_summa_paket_v1(array[v_obj], 'f2');
  perform pg_temp.oz_assert((v_p->>'ustamasiz')::numeric = 19000000, 'F2#1 ustamasiz expected 19000000 got ' || (v_p->>'ustamasiz'));
  perform pg_temp.oz_assert((v_p->>'ustamali')::numeric = 22420000, 'F2#1 ustamali expected 22420000 got ' || (v_p->>'ustamali'));
  perform pg_temp.oz_assert((v_p->>'qqs_bilan')::numeric = 25110400, 'F2#1 qqs_bilan expected 25110400 got ' || (v_p->>'qqs_bilan'));
  -- approved rows are frozen
  v_b := false;
  begin
    update public.t2_akt_qator set hajm = hajm + 1 where akt_id = v_f2a and qator_id = v_M1;
    v_b := true;
  exception when others then v_b := false;
  end;
  perform pg_temp.oz_assert(v_b is false, 'approved F2 row was updatable (freeze trigger missing)');
  -- no double certification: M3 is already fully certified -> a new draft on M3 warns and cannot be approved
  v_r := public.t2_akt_yarat(v_obj, 'f2', date '2026-11-01', jsonb_build_array(jsonb_build_object('qator_id', v_M3, 'hajm', 0.5)),
    'OZ-F2-DUP', gen_random_uuid(), 'frontend', 'actor:' || v_boss);
  perform pg_temp.oz_ok(v_r, 't2_akt_yarat F2 dup'); v_f2x := (v_r->>'akt_id')::bigint;
  perform pg_temp.oz_assert(coalesce((v_r->>'ogohlantirish_soni')::int, 0) = 1, 'second certification of an already certified row must warn');
  -- FINDING: t2_akt_tasdiqlash re-checks h.f2_hajm, which counts APPROVED F2 only (t2_qator_holat) and not the draft being approved, so this duplicate would be approved (total 1.0 > fakt 0.5). Only the creation-time warning protects it. Not approved here to keep later steps clean.
  raise notice 'OLTIN_ZANJIR OBSERVED [5]: approval re-check excludes the draft itself (t2_akt_tasdiqlash vs t2_qator_holat.f2_hajm = approved only); double certification is warned at creation but NOT refused at approval.';
  perform pg_temp.oz_ok(public.t2_akt_bekor(v_f2x, 'oz dup cleanup', null, 'actor:' || v_boss), 'akt_bekor dup');
  -- next period takes only the remainder of M1 (8 - 5 = 3)
  v_r := public.t2_akt_yarat(v_obj, 'f2', date '2026-11-01', jsonb_build_array(jsonb_build_object('qator_id', v_M1, 'hajm', 3)),
    'OZ-F2-2', gen_random_uuid(), 'frontend', 'actor:' || v_boss);
  perform pg_temp.oz_ok(v_r, 't2_akt_yarat F2#2'); v_f2b := (v_r->>'akt_id')::bigint;
  perform pg_temp.oz_assert(coalesce((v_r->>'ogohlantirish_soni')::int, 0) = 0, 'F2#2 (remainder) must carry no warning');
  perform pg_temp.oz_ok(public.t2_akt_tasdiqlash(v_f2b, null, 'actor:' || v_boss, gen_random_uuid()), 't2_akt_tasdiqlash F2#2');
  select * into v_h from public.t2_qator_holat where id = v_M1;
  perform pg_temp.oz_assert(v_h.f2_hajm = v_h.fakt_hajm, 'after both F2: M1 certified (' || v_h.f2_hajm || ') must equal fakt (' || v_h.fakt_hajm || ')');
  select paket into v_p from public._t2_summa_paket_v1(array[v_obj], 'f2');
  perform pg_temp.oz_assert((v_p->>'ustamasiz')::numeric = 21400000, 'F2 total ustamasiz expected 21400000 got ' || (v_p->>'ustamasiz'));
  perform pg_temp.oz_assert((v_p->>'ustamali')::numeric = 25252000, 'F2 total ustamali expected 25252000 got ' || (v_p->>'ustamali'));

  -- ===================================================================
  v_n := 6; v_name := 'Forma 3 = F2 yig''indisi';
  v_r := public.t2_forma3_yarat_v1(v_bugalter, v_loy, null, v_sh, date '2026-10-01', date '2026-10-31', array[v_f2a], 'OZ-F3-1', gen_random_uuid());
  perform pg_temp.oz_ok(v_r, 't2_forma3_yarat_v1'); v_f3 := (v_r->>'forma3_id')::bigint;
  select paket into v_p from public._t2_summa_paket_v1(array[v_obj], 'aktlar', array[v_f2a]);
  perform pg_temp.oz_assert((select bajarilgan_f2_summa from public.t2_forma3 where id = v_f3) = 19000000, 'Forma 3 sum must be 19000000');
  perform pg_temp.oz_assert((select bajarilgan_f2_summa from public.t2_forma3 where id = v_f3) = (v_p->>'ustamasiz')::numeric, 'Forma 3 sum must equal the core sum of its F2 (aktlar)');
  v_f3_vsego := (v_p->>'qqs_bilan')::numeric;
  perform pg_temp.oz_assert(v_f3_vsego = 25110400, 'Forma 3 QQS bilan expected 25110400 got ' || v_f3_vsego);
  -- F2#2 (November) is outside the period and F2#1 is already used
  v_r := public.t2_forma3_yarat_v1(v_bugalter, v_loy, null, v_sh, date '2026-10-01', date '2026-10-31', array[v_f2b], 'OZ-F3-X', gen_random_uuid());
  perform pg_temp.oz_assert(v_r->>'code' = 'FORMA3_AKT_INVALID', 'F2 outside the period must be refused; got ' || v_r::text);
  v_r := public.t2_forma3_yarat_v1(v_bugalter, v_loy, null, v_sh, date '2026-10-01', date '2026-10-31', array[v_f2a], 'OZ-F3-Y', gen_random_uuid());
  perform pg_temp.oz_assert(v_r->>'code' = 'FORMA3_AKT_BAND', 'one F2 must not enter two Forma 3; got ' || v_r::text);

  -- ===================================================================
  v_n := 7; v_name := 'buyurtmachi to''lovi -> debitor = Forma 3 - to''lov';
  v_op := gen_random_uuid();
  v_r := public.t2_tolov_yoz(v_sh, 10000000, 'tolov', date '2026-10-25', v_obj, 'OZ tolov', v_op, v_komp, 'frontend', 'actor:' || v_boss);
  perform pg_temp.oz_ok(v_r, 't2_tolov_yoz'); v_tolov := (v_r->>'tolov_id')::bigint;
  v_r := public.t2_tolov_yoz(v_sh, 10000000, 'tolov', date '2026-10-25', v_obj, 'OZ tolov', v_op, v_komp, 'frontend', 'actor:' || v_boss);
  perform pg_temp.oz_assert((v_r->>'takror')::boolean is true, 'payment retry with the same operation_id must be takror');
  select coalesce(sum(case when t.tur = 'qaytarim' then -abs(t.summa) else t.summa end), 0) into v_x
    from public.t2_tolov t where t.kompaniya_id = v_komp and t.shartnoma_id = v_sh and t.holat <> 'bekor';
  perform pg_temp.oz_assert(v_x = 10000000, 'payments must total 10000000 (no duplicate)');
  v_recv := v_f3_vsego - v_x;
  perform pg_temp.oz_assert(v_recv = 15110400, 'receivable expected 15110400 got ' || v_recv);

  -- ===================================================================
  v_n := 8; v_name := 'xarajat (CHEL/MAT) + operation_id takrori';
  v_op := gen_random_uuid();
  v_r := public.t2_xarajat_kirit_v1(v_komp, v_boss, v_obj, v_sh, date '2026-10-20', U&'\0427\0415\041B', 3000000, 'OZ-XAR-1', 'OZ chel', v_op);
  perform pg_temp.oz_ok(v_r, 't2_xarajat_kirit_v1 CHEL'); v_xar1 := (v_r->>'xarajat_id')::bigint;
  v_r := public.t2_xarajat_kirit_v1(v_komp, v_boss, v_obj, v_sh, date '2026-10-20', U&'\0427\0415\041B', 3000000, 'OZ-XAR-1', 'OZ chel', v_op);
  perform pg_temp.oz_assert((v_r->>'takror')::boolean is true and (v_r->>'xarajat_id')::bigint = v_xar1, 'cost retry must return the same row');
  v_r := public.t2_xarajat_kirit_v1(v_komp, v_boss, v_obj, v_sh, date '2026-10-21', U&'\041C\0410\0422', 7000000, 'OZ-XAR-2', 'OZ mat', gen_random_uuid());
  perform pg_temp.oz_ok(v_r, 't2_xarajat_kirit_v1 MAT'); v_xar2 := (v_r->>'xarajat_id')::bigint;
  perform pg_temp.oz_assert((select count(*) from public.t2_xarajat where kompaniya_id = v_komp and holat <> 'bekor') = 2, 'exactly 2 cost rows expected');
  perform pg_temp.oz_assert((select sum(summa) from public.t2_xarajat where kompaniya_id = v_komp and holat <> 'bekor') = 10000000, 'cost total expected 10000000');
  raise notice 'OLTIN_ZANJIR SKIP [8 naryad hisob-kitobi]: t2_naryad_yoz_v1 / t2_naryad_usta_bajarildi_v1 need usta + ish topshirig''i fixture; one-cost-row-per-naryad not exercised in v1 (follow-up).';
  raise notice 'OLTIN_ZANJIR SKIP [8 subpudrat akti]: t2_sub_akt_yoz_v1 / t2_sub_akt_qaror_v1 need subpudrat topshiriq + qarshi tomon lifecycle fixture; one-cost-row-per-act not exercised in v1 (follow-up).';

  -- ===================================================================
  v_n := 9; v_name := 'buxgalteriya: avto-provodka bir martadan, balans, davr yopish';
  v_r := public.t2_bux_boshlash_v1(v_boss, v_komp, gen_random_uuid());
  perform pg_temp.oz_ok(v_r, 't2_bux_boshlash_v1');
  v_r := public.t2_bux_avto_provodka_v1(v_boss, v_komp, false, gen_random_uuid());
  perform pg_temp.oz_ok(v_r, 't2_bux_avto_provodka_v1 #1');
  perform pg_temp.oz_assert(coalesce((v_r->>'yangi')::int, 0) >= 1, 'first sync must create postings; got ' || v_r::text);
  perform pg_temp.oz_assert(not exists(
      select 1 from public.t2_bux_provodka p where p.kompaniya_id = v_komp and p.storno_id is null
      group by p.manba_tur, p.manba_id, p.qism having count(*) > 1), 'a source document is posted more than once');
  perform pg_temp.oz_assert((select count(distinct manba_id) from public.t2_bux_provodka where kompaniya_id = v_komp and manba_tur = 'xarajat' and manba_id in (v_xar1, v_xar2)) = 2,
    'both cost rows must have a posting');
  perform pg_temp.oz_assert(not exists(select 1 from public.t2_bux_provodka p where p.kompaniya_id = v_komp and p.tur is distinct from 'storno' and (p.summa <= 0 or p.dt_kod is null or p.kt_kod is null or p.dt_kod = p.kt_kod)),
    'every posting needs distinct dt/kt accounts and a positive amount (balanced by construction)');
  select count(*) into v_prov_n from public.t2_bux_provodka where kompaniya_id = v_komp;
  v_r := public.t2_bux_avto_provodka_v1(v_boss, v_komp, false, gen_random_uuid());
  perform pg_temp.oz_ok(v_r, 't2_bux_avto_provodka_v1 #2');
  perform pg_temp.oz_assert(coalesce((v_r->>'yangi')::int, 0) = 0 and (select count(*) from public.t2_bux_provodka where kompaniya_id = v_komp) = v_prov_n,
    're-run must create nothing new (idempotent per source); got ' || v_r::text);
  perform pg_temp.oz_ok(public.t2_bux_osv_v1(v_komp, v_boss, date '2026-10-01', date '2026-12-31'), 't2_bux_osv_v1 (trial balance)');
  raise notice 'OLTIN_ZANJIR OBSERVED [9]: postings by source = %', (select jsonb_object_agg(manba_tur, n) from (select manba_tur, count(*) n from public.t2_bux_provodka where kompaniya_id = v_komp group by 1) z);
  v_r := public.t2_bux_davr_v1(v_boss, v_komp, date '2026-10-01', 'yop', true, 'OZ close', gen_random_uuid());
  perform pg_temp.oz_ok(v_r, 't2_bux_davr_v1 yop');
  perform pg_temp.oz_assert(v_r->>'holat' = 'yopiq', 'period must be closed');
  v_b := false;
  begin
    v_r := public.t2_bux_qolda_provodka_v1(v_boss, v_komp, date '2026-10-28', null, null, 1000, null, null, v_obj, 'oz closed-period probe', gen_random_uuid());
    v_b := coalesce((v_r->>'ok')::boolean, false);
  exception when others then v_b := false;
  end;
  perform pg_temp.oz_assert(v_b is false, 'a posting into a closed period must be refused');

  -- ===================================================================
  v_n := 10; v_name := 'Foyda / zarar manbasi (t2_moliya_tahlil_v1)';
  v_r := public.t2_moliya_tahlil_v1(v_komp, v_boss, v_obj);
  perform pg_temp.oz_ok(v_r, 't2_moliya_tahlil_v1');
  v_items := v_r->'korsatkichlar';
  v_rev := (select (e->>'ustamali_qqssiz')::numeric from jsonb_array_elements(v_items) e where e->>'kod' = 'f2');
  v_cost := (select (e->>'qiymat')::numeric from jsonb_array_elements(v_items) e where e->>'kod' = 'sarf');
  perform pg_temp.oz_assert(v_rev = 25252000, 'revenue (approved F2 ustamali QQS siz) expected 25252000 got ' || coalesce(v_rev::text, 'NULL'));
  perform pg_temp.oz_assert(v_cost = 10000000, 'cost (sum of cost rows) expected 10000000 got ' || coalesce(v_cost::text, 'NULL'));
  perform pg_temp.oz_assert((select (e->>'qiymat')::numeric from jsonb_array_elements(v_items) e where e->>'kod' = 'tushgan') = 10000000, 'tushgan must equal the payments');
  perform pg_temp.oz_assert((select (e->>'qiymat')::numeric from jsonb_array_elements(v_items) e where e->>'kod' = 'f2_tushgan_farq') = 28282240 - 10000000, 'receivable (F2 qqs bilan - tushgan) expected 18282240');
  perform pg_temp.oz_assert(v_rev - v_cost = 15252000, 'profit = revenue - cost expected 15252000');
  raise notice 'OLTIN_ZANJIR OBSERVED [10]: t2_moliya_tahlil_v1 has no profit field; profit is revenue(f2.ustamali_qqssiz) - sarf computed by the caller.';
  -- second object: no costs -> NULL, never 0
  v_r := public.t2_moliya_tahlil_v1(v_komp, v_boss, v_obj2);
  perform pg_temp.oz_ok(v_r, 't2_moliya_tahlil_v1 obj2');
  perform pg_temp.oz_assert((select e->'qiymat' from jsonb_array_elements(v_r->'korsatkichlar') e where e->>'kod' = 'sarf') is null
                            or (select jsonb_typeof(e->'qiymat') from jsonb_array_elements(v_r->'korsatkichlar') e where e->>'kod' = 'sarf') = 'null',
    'object without costs must report cost NULL (not 0)');

  -- ===================================================================
  v_n := 11; v_name := 'storno (bekor) 2-F2 -> hamma son izchil orqaga';
  perform pg_temp.oz_ok(public.t2_akt_bekor(v_f2b, 'oz storno', null, 'actor:' || v_boss), 't2_akt_bekor F2#2');
  select paket into v_p from public._t2_summa_paket_v1(array[v_obj], 'f2');
  perform pg_temp.oz_assert((v_p->>'ustamasiz')::numeric = 19000000, 'core F2 sum after storno expected 19000000 got ' || (v_p->>'ustamasiz'));
  perform pg_temp.oz_assert((select bajarilgan_f2_summa from public.t2_forma3 where id = v_f3) = 19000000 and (select holat from public.t2_forma3 where id = v_f3) = 'qoralama',
    'Forma 3 (did not reference F2#2) must be untouched');
  select * into v_h from public.t2_qator_holat where id = v_M1;
  perform pg_temp.oz_assert(v_h.f2_hajm = 5, 'cancelled F2 must release the quantity: M1 f2_hajm expected 5 got ' || v_h.f2_hajm);
  v_r := public.t2_moliya_tahlil_v1(v_komp, v_boss, v_obj);
  v_rev := (select (e->>'ustamali_qqssiz')::numeric from jsonb_array_elements(v_r->'korsatkichlar') e where e->>'kod' = 'f2');
  perform pg_temp.oz_assert(v_rev = 22420000, 'Foyda/zarar revenue after storno expected 22420000 got ' || coalesce(v_rev::text, 'NULL'));
  perform pg_temp.oz_assert((select (e->>'qiymat')::numeric from jsonb_array_elements(v_r->'korsatkichlar') e where e->>'kod' = 'f2_tushgan_farq') = 15110400, 'receivable after storno expected 15110400');
  perform pg_temp.oz_assert(v_rev - v_cost = 12420000, 'profit after storno expected 12420000');
  v_r := public.t2_bux_avto_provodka_v1(v_boss, v_komp, false, gen_random_uuid());
  perform pg_temp.oz_ok(v_r, 't2_bux_avto_provodka_v1 after storno');
  perform pg_temp.oz_assert((select count(*) from public.t2_bux_provodka where kompaniya_id = v_komp) = v_prov_n,
    'F2 acts are not posted (Forma 3 / payments / costs are) -> postings count must not change after an F2 storno');
  -- AUDIT CLAIM: cancelled F2 counted in a "certified" company total?
  select coalesce(sum(a.hujjat_jami), 0) into v_exp from public.t2_akt a where a.kompaniya_id = v_komp and a.tur = 'f2' and a.holat <> 'bekor';
  v_dash := (public.t2_boss_dashboard_v1(v_komp, v_boss)->'f2'->>'jami')::numeric;
  perform pg_temp.oz_assert(v_dash = v_exp,
    'BUG t2_boss_dashboard_v1: f2.jami = ' || v_dash || ' but live F2 total = ' || v_exp ||
    ' (function sums ALL t2_akt incl. tur=fakt and holat=bekor; fix = migration 20261217000000)');
  raise notice 'OLTIN_ZANJIR OK: all 11 steps passed (naryad / sub-akt SKIPPED, see notices)';
exception when others then
  raise exception 'OLTIN_ZANJIR qadam [% %]: %', v_n, v_name, sqlerrm;
end
$oz$;
