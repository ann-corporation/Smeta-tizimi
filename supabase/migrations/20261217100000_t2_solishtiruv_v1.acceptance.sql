-- 20261217100000 acceptance (SOLISHTIRUV). Faqat tranzaksiya + ROLLBACK ichida; sintetik ma'lumot.
-- Har tekshiruv uchun bitta buzilish ekiladi: topiladi (bir marta), qayta ishga tushirish takrorlamaydi, tushuntirilgan holat saqlanadi,
-- tuzatilgani yo'qoladi, tenant izolyatsiyasi. Xato: SOLISHTIRUV qadam [<n> <nom>]: <xato>.
set local statement_timeout = '300s';

create or replace function pg_temp.sa_assert(p_cond boolean, p_msg text) returns void language plpgsql as $f$
begin if p_cond is not true then raise exception 'ASSERT: %', p_msg; end if; end $f$;
create or replace function pg_temp.sa_ok(p_r jsonb, p_what text) returns void language plpgsql as $f$
begin if p_r is null or coalesce((p_r->>'ok')::boolean, false) is not true then raise exception 'RPC % returned %', p_what, left(coalesce(p_r::text, 'NULL'), 500); end if; end $f$;

do $sa$
declare
  v_n integer := 0; v_name text := 'init'; v_tag text := substr(md5(random()::text || clock_timestamp()::text), 1, 8);
  v_plat bigint; v_S bigint; v_stranger bigint; v_k1 bigint; v_k2 bigint; v_loy bigint; v_o1 bigint; v_sh bigint; v_sess bigint;
  v_M1 bigint; v_M2 bigint; v_fA bigint; v_fB bigint; v_f2 bigint; v_r jsonb; v_cnt integer; v_cnt2 integer; v_id bigint; v_kod text; v_b boolean;
  v_kodlar text[] := array['forma3_f2_yigindi', 'f2_hajm_smetadan_oshgan', 'f2_fakt_dan_ortiq', 'tolov_forma3', 'xarajat_taqsimlanmagan', 'buxgalteriya_manba', 'smeta_podval_yoq'];
begin
  v_n := 0; v_name := 'tayyorgarlik (kompaniya, obyekt, shartnoma, smeta, fakt, F2, Forma 3, to''lov, xarajat)';
  insert into public.t2_kompaniya(nom, kod, faol) values ('SA PLATFORMA ' || v_tag, 'SAP' || v_tag, true) returning id into v_plat;
  insert into public.t2_foydalanuvchi(login, ism, holat) values ('sa_s_' || v_tag, 'SA Superadmin', 'faol') returning id into v_S;
  insert into public.t2_azolik(foydalanuvchi_id, kompaniya_id, rol, holat) values (v_S, v_plat, 'superadmin', 'faol');
  insert into public.t2_foydalanuvchi(login, ism, holat) values ('sa_x_' || v_tag, 'SA Stranger', 'faol') returning id into v_stranger;
  v_r := public.t2_kompaniya_yarat_v1(v_S, 'SA Bir ' || v_tag, null, null, gen_random_uuid()); perform pg_temp.sa_ok(v_r, 'kompaniya 1'); v_k1 := (v_r->>'kompaniya_id')::bigint;
  v_r := public.t2_kompaniya_yarat_v1(v_S, 'SA Ikki ' || v_tag, null, null, gen_random_uuid()); perform pg_temp.sa_ok(v_r, 'kompaniya 2'); v_k2 := (v_r->>'kompaniya_id')::bigint;
  v_r := public.t2_loyiha_yarat(v_S, v_k1, 'SA Loyiha ' || v_tag); perform pg_temp.sa_ok(v_r, 'loyiha'); v_loy := (v_r->>'id')::bigint;
  v_r := public.t2_obyekt_yarat_v1(v_k1, v_S, v_loy, 'SA Obyekt ' || v_tag, gen_random_uuid()); perform pg_temp.sa_ok(v_r, 'obyekt'); v_o1 := (v_r->>'obyekt_id')::bigint;
  v_r := public.t2_shartnoma_saqla_v2(v_S, v_k1, null, null, jsonb_build_object('raqam', 'SA-' || v_tag, 'loyiha_id', v_loy, 'asosiy', true),
                                      null, jsonb_build_array(v_o1), gen_random_uuid());
  perform pg_temp.sa_ok(v_r, 'shartnoma'); v_sh := (v_r->>'id')::bigint;
  v_r := public.t2_smeta_import_boshla_v1(v_k1, v_S, v_o1, gen_random_uuid(), null); perform pg_temp.sa_ok(v_r, 'import boshla'); v_sess := (v_r->>'sessiya_id')::bigint;
  v_r := public.t2_smeta_import_bolak_v1(v_k1, v_S, v_sess, 0, jsonb_build_array(
    jsonb_build_object('local_id', 'S1', 'tur', 'rz', 'kod', 'SA-S1', 'nom', 'Section'),
    jsonb_build_object('local_id', 'M1', 'parent_local_id', 'S1', 'tur', 'mat', 'kod', 'SA-M1', 'nom', 'Mat one', 'birlik', 'm3', 'hajm', 10, 'narx', 100000, 'summa', 1000000),
    jsonb_build_object('local_id', 'M2', 'parent_local_id', 'S1', 'tur', 'mat', 'kod', 'SA-M2', 'nom', 'Mat two', 'birlik', 'm3', 'hajm', 10, 'narx', 100000, 'summa', 1000000)));
  perform pg_temp.sa_ok(v_r, 'import bolak');
  perform pg_temp.sa_ok(public.t2_smeta_import_yakunla_v1(v_k1, v_S, v_sess), 'import yakunla');
  drop table if exists pg_temp.t2_imp_qator; -- allow running together with the zanjir file in one transaction
  select q.id into v_M1 from public.t2_qator q where q.obyekt_id = v_o1 and q.kod = 'SA-M1';
  select q.id into v_M2 from public.t2_qator q where q.obyekt_id = v_o1 and q.kod = 'SA-M2';
  -- fakt A: M1 12 (smetadan oshgan, ogohlantirish), fakt B: M2 5
  v_r := public.t2_fakt_yoz_v2(v_o1, date '2026-10-10', jsonb_build_array(jsonb_build_object('qator_id', v_M1, 'hajm', 12)), v_S, gen_random_uuid(), null, null, 'actor:' || v_S);
  perform pg_temp.sa_ok(v_r, 'fakt A'); v_fA := (v_r->>'akt_id')::bigint;
  v_r := public.t2_fakt_yoz_v2(v_o1, date '2026-10-11', jsonb_build_array(jsonb_build_object('qator_id', v_M2, 'hajm', 5)), v_S, gen_random_uuid(), null, null, 'actor:' || v_S);
  perform pg_temp.sa_ok(v_r, 'fakt B'); v_fB := (v_r->>'akt_id')::bigint;
  v_r := public.t2_akt_yarat(v_o1, 'f2', date '2026-10-01', jsonb_build_array(jsonb_build_object('qator_id', v_M1, 'hajm', 12), jsonb_build_object('qator_id', v_M2, 'hajm', 5)),
                             'SA-F2-' || v_tag, gen_random_uuid(), 'frontend', 'actor:' || v_S);
  perform pg_temp.sa_ok(v_r, 'F2'); v_f2 := (v_r->>'akt_id')::bigint;
  perform pg_temp.sa_ok(public.t2_akt_tasdiqlash(v_f2, null, 'actor:' || v_S, gen_random_uuid()), 'F2 tasdiq');
  -- fakt B bekor: M2 da F2 (5) > fakt (0)  -> f2_fakt_dan_ortiq
  perform pg_temp.sa_ok(public.t2_akt_bekor(v_fB, 'sa test', null, 'actor:' || v_S), 'fakt B bekor');
  -- Forma 3: summa ataylab noto'g'ri (999), aktga bog'langan -> forma3_f2_yigindi; to'lov juda katta -> tolov_forma3 (ortiqcha)
  insert into public.t2_forma3(kompaniya_id, loyiha_id, shartnoma_id, raqam, davr_boshi, davr_oxiri, holat, bajarilgan_f2_summa, qoida_holat, manba)
    values (v_k1, v_loy, v_sh, 'SA-F3-' || v_tag, date '2026-10-01', date '2026-10-31', 'qoralama', 999, 'FORMA3_RULE_MAPPED', 'f2') returning id into v_id;
  insert into public.t2_forma3_akt(forma3_id, akt_id) values (v_id, v_f2);
  perform pg_temp.sa_ok(public.t2_tolov_yoz(v_sh, 900000000, 'tolov', date '2026-10-25', v_o1, 'SA tolov', gen_random_uuid(), v_k1, 'frontend', 'actor:' || v_S), 'tolov');
  -- xarajat: obyektsiz (taqsimlanmagan) + obyektli (provodkasiz); buxgalteriya boshlangan, provodka yaratilmaydi
  perform pg_temp.sa_ok(public.t2_xarajat_kirit_v1(v_k1, v_S, null, null, date '2026-10-20', U&'\041C\0410\0422', 111000, 'SA-X1', 'sa', gen_random_uuid()), 'xarajat obyektsiz');
  perform pg_temp.sa_ok(public.t2_xarajat_kirit_v1(v_k1, v_S, v_o1, v_sh, date '2026-10-21', U&'\041C\0410\0422', 222000, 'SA-X2', 'sa', gen_random_uuid()), 'xarajat obyektli');
  perform pg_temp.sa_ok(public.t2_bux_boshlash_v1(v_S, v_k1, gen_random_uuid()), 'bux boshlash');
  update public.t2_xarajat set yaratildi = now() - interval '3 days' where kompaniya_id = v_k1;

  v_n := 1; v_name := 'har tekshiruv buzilishi TOPILADI (bir marta), xato yo''q';
  v_r := public._t2_solishtiruv_yangila_ich(v_k1, null);
  perform pg_temp.sa_assert(jsonb_array_length(v_r->'xatolar') = 0, 'qoida xatolari: ' || (v_r->'xatolar')::text);
  foreach v_kod in array v_kodlar loop
    select count(*) into v_cnt from public.t2_solishtiruv_istisno where kompaniya_id = v_k1 and qoida_kod = v_kod and holat = 'ochiq';
    perform pg_temp.sa_assert(v_cnt >= 1, 'tekshiruv ' || v_kod || ' buzilishni topmadi');
  end loop;
  perform pg_temp.sa_assert((select count(*) from public.t2_solishtiruv_istisno where kompaniya_id = v_k1 and qoida_kod = 'xarajat_taqsimlanmagan' and holat = 'ochiq') = 1, 'xarajat_taqsimlanmagan bitta guruh bo''lishi kerak');
  perform pg_temp.sa_assert((select count(*) from public.t2_solishtiruv_istisno where kompaniya_id = v_k1 and qoida_kod = 'tolov_forma3' and kalit = 'ortiqcha:' || v_sh) = 1, 'ortiqcha to''lov kaliti topilmadi');

  v_n := 2; v_name := 'qayta ishga tushirish ALMASHTIRADI (takror yo''q)';
  select count(*) into v_cnt from public.t2_solishtiruv_istisno where kompaniya_id = v_k1;
  perform public._t2_solishtiruv_yangila_ich(v_k1, null);
  select count(*) into v_cnt2 from public.t2_solishtiruv_istisno where kompaniya_id = v_k1;
  perform pg_temp.sa_assert(v_cnt = v_cnt2, 'qayta ishga tushirish qator qo''shdi: ' || v_cnt || ' -> ' || v_cnt2);

  v_n := 3; v_name := 'tushuntirilgan holat qayta ishga tushirishdan keyin SAQLANADI';
  select id into v_id from public.t2_solishtiruv_istisno where kompaniya_id = v_k1 and qoida_kod = 'tolov_forma3' limit 1;
  v_r := public.t2_solishtiruv_tushuntir_v1(v_S, v_k1, v_id, 'tushuntirildi', '', gen_random_uuid());
  perform pg_temp.sa_assert(v_r->>'code' = 'SABAB_REQUIRED', 'sababsiz tushuntirish rad etilishi kerak: ' || v_r::text);
  perform pg_temp.sa_ok(public.t2_solishtiruv_tushuntir_v1(v_S, v_k1, v_id, 'tushuntirildi', 'avans (shartnoma boshlang''ich to''lovi)', gen_random_uuid()), 'tushuntir');
  perform public._t2_solishtiruv_yangila_ich(v_k1, null);
  perform pg_temp.sa_assert((select holat from public.t2_solishtiruv_istisno where id = v_id) = 'tushuntirildi'
                            and (select sabab from public.t2_solishtiruv_istisno where id = v_id) like 'avans%', 'tushuntirilgan holat yo''qoldi');
  perform pg_temp.sa_assert(exists(select 1 from jsonb_array_elements(public.t2_solishtiruv_v1(v_k1, v_S, null)->'royxat') e where (e->>'id')::bigint = v_id and e->>'holat' = 'tushuntirildi'),
    'tushuntirilgan istisno o''qish RPC da ko''rinishi kerak (yashirilmaydi)');

  v_n := 4; v_name := 'tuzatilgan YO''QOLADI';
  update public.t2_xarajat set obyekt_id = v_o1 where kompaniya_id = v_k1 and obyekt_id is null;
  perform public._t2_solishtiruv_yangila_ich(v_k1, null);
  perform pg_temp.sa_assert((select holat from public.t2_solishtiruv_istisno where kompaniya_id = v_k1 and qoida_kod = 'xarajat_taqsimlanmagan' limit 1) = 'tuzatildi', 'tuzatilgan xarajat_taqsimlanmagan tuzatildi bo''lishi kerak');
  perform pg_temp.sa_assert(not exists(select 1 from jsonb_array_elements(public.t2_solishtiruv_v1(v_k1, v_S, null)->'royxat') e where e->>'qoida' = 'xarajat_taqsimlanmagan'), 'tuzatilgan ro''yxatda qolmasligi kerak');

  v_n := 5; v_name := 'o''qish RPC: jiddiylik tartibi + yuqori ochiq soni';
  v_r := public.t2_solishtiruv_v1(v_k1, v_S, null); perform pg_temp.sa_ok(v_r, 't2_solishtiruv_v1');
  perform pg_temp.sa_assert((v_r->'hisob'->>'yuqori_ochiq')::int >= 3, 'yuqori jiddiylikdagi ochiq soni >= 3 (forma3, f2>smeta, buxgalteriya)');
  perform pg_temp.sa_assert(v_r->'royxat'->0->>'jiddiylik' = 'high', 'ro''yxat high dan boshlanishi kerak');

  v_n := 6; v_name := 'tenant izolyatsiyasi';
  perform pg_temp.sa_assert(jsonb_array_length(public.t2_solishtiruv_v1(v_k2, v_S, null)->'royxat') = 0, '2-kompaniya 1-kompaniya istisnolarini ko''rmasligi kerak');
  v_b := false;
  begin perform public.t2_solishtiruv_v1(v_k1, v_stranger, null); exception when others then v_b := true; end;
  perform pg_temp.sa_assert(v_b, 'a''zo bo''lmagan foydalanuvchi o''qiy olmasligi kerak');
  v_b := false;
  begin perform public.t2_solishtiruv_tushuntir_v1(v_stranger, v_k1, v_id, 'ochiq', null, gen_random_uuid()); exception when others then v_b := true; end;
  perform pg_temp.sa_assert(v_b, 'a''zo bo''lmagan foydalanuvchi tushuntira olmasligi kerak');
  perform pg_temp.sa_assert(public.t2_solishtiruv_tushuntir_v1(v_S, v_k2, v_id, 'ochiq', null, gen_random_uuid())->>'code' = 'ISTISNO_NOT_FOUND', 'boshqa kompaniya istisnosiga tegib bo''lmaydi');
  raise notice 'SOLISHTIRUV OK: 7 tekshiruv (1,2,3,4,5,6,10) sinaldi; 7,8,9,11,12 v1 da YO''Q; 4 da «muddati o''tgan to''lanmagan» va 6 da «manbasiz/noto''g''ri provodka» ekilmadi.';
exception when others then
  raise exception 'SOLISHTIRUV qadam [% %]: %', v_n, v_name, sqlerrm;
end
$sa$;
