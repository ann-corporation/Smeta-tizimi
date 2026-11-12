-- ACCEPTANCE: 20261216500000 (bozor P1) - BEGIN..ROLLBACK, FAQAT sintetik fixture (prodda iz qolmaydi).
-- Tekshiradi: grant yopiqligi; faqat faol e'lon ochiq o'qiladi (telefon/kompaniya sizmaydi); begona sotuvchi e'lonni tahrirlay olmaydi; bo'sh narx va taqiqlangan so'z rad;
-- Lotin/kirill farqsiz qidiruv; so'rov -> 3 taklif -> o'rtacha narx + bitta g'olib -> aynan bitta buyurtma va bitta narx manbasi (takrorda yangi yozuv yo'q);
-- baho faqat qabuldan keyin va faqat ishtirokchiga; shikoyatdan yashirilgan e'lon qidiruvdan yo'qoladi; moderator amallari oddiy foydalanuvchiga yopiq.
begin;
set local statement_timeout = '300s';
do $acc$
declare
  k bigint; ks bigint; buy bigint; s1 bigint; s2 bigint; s3 bigint; yot bigint; sh1 bigint; sh2 bigint; sh3 bigint;
  res jsonb; e1 bigint; e2 bigint; so bigint; t1 bigint; t2 bigint; t3 bigint; n int; op uuid; b1 bigint; m1 bigint; u numeric;
begin
  insert into public.t2_kompaniya (nom, kod, faol) values ('_TEST_BZ_BUYER', gen_random_uuid()::text, true) returning id into k;
  insert into public.t2_kompaniya (nom, kod, faol) values ('_TEST_BZ_SELLER', gen_random_uuid()::text, true) returning id into ks;
  insert into public.t2_foydalanuvchi (ism, login, email) values ('_b', 'bz_b_' || gen_random_uuid(), 'bz_b_' || gen_random_uuid() || '@t.invalid') returning id into buy;
  insert into public.t2_foydalanuvchi (ism, login, email) values ('_s1', 'bz_s1_' || gen_random_uuid(), 'bz_s1_' || gen_random_uuid() || '@t.invalid') returning id into s1;
  insert into public.t2_foydalanuvchi (ism, login, email) values ('_s2', 'bz_s2_' || gen_random_uuid(), 'bz_s2_' || gen_random_uuid() || '@t.invalid') returning id into s2;
  insert into public.t2_foydalanuvchi (ism, login, email) values ('_s3', 'bz_s3_' || gen_random_uuid(), 'bz_s3_' || gen_random_uuid() || '@t.invalid') returning id into s3;
  insert into public.t2_foydalanuvchi (ism, login, email) values ('_y', 'bz_y_' || gen_random_uuid(), 'bz_y_' || gen_random_uuid() || '@t.invalid') returning id into yot;
  insert into public.t2_azolik (kompaniya_id, foydalanuvchi_id, rol, holat) values (k, buy, 'admin', 'faol'), (ks, s1, 'admin', 'faol');

  -- 1. Grantlar
  if has_function_privilege('anon', 'public.t2_bz_ochiq_qidir_v1(jsonb)', 'execute') or has_function_privilege('authenticated', 'public.t2_bz_golib_tanla_v1(bigint,bigint,uuid,jsonb)', 'execute')
     or has_table_privilege('anon', 'public.t2_bz_elon', 'select') or has_table_privilege('authenticated', 'public.t2_bz_taklif', 'select') or has_table_privilege('authenticated', 'public.t2_reyting_baho', 'select')
     or not has_function_privilege('service_role', 'public.t2_bz_ochiq_qidir_v1(jsonb)', 'execute') then
    raise exception 'FAIL grant';
  end if;
  if (select (qiymat #>> '{}')::boolean from public.t2_bz_sozlama where kalit = 'boost_yoqilgan') or (select (qiymat #>> '{}')::boolean from public.t2_bz_sozlama where kalit = 'komissiya_yoqilgan') then raise exception 'FAIL monetizatsiya default OFF emas'; end if;

  -- 2. Profillar: s1 kompaniyali firma; s2, s3 yakka; begona kompaniyaga bog'lab bo'lmaydi
  res := public.t2_bz_profil_saqla_v1(s1, gen_random_uuid(), jsonb_build_object('nom', '_Firma A', 'tur', 'firma', 'kompaniya_id', ks, 'telefon', '+998900000001', 'hudud', 'Navoiy'));
  if not (res ->> 'ok')::boolean then raise exception 'FAIL profil s1: %', res; end if;
  res := public.t2_bz_profil_saqla_v1(s2, gen_random_uuid(), jsonb_build_object('nom', '_Usta B', 'tur', 'usta', 'hudud', 'Navoiy'));
  if not (res ->> 'ok')::boolean then raise exception 'FAIL profil s2: %', res; end if;
  res := public.t2_bz_profil_saqla_v1(s3, gen_random_uuid(), jsonb_build_object('nom', '_Yakka C', 'tur', 'yakka', 'hudud', 'Navoiy'));
  res := public.t2_bz_profil_saqla_v1(s2, gen_random_uuid(), jsonb_build_object('nom', '_Usta B', 'kompaniya_id', k));
  if (res ->> 'code') is distinct from 'KOMPANIYA_BEGONA' then raise exception 'FAIL begona kompaniyaga profil: %', res; end if;

  -- 3. E'lon: bo'sh narx / taqiqlangan so'z rad; to'g'risi faol; qoralama ochiq ko'rinmaydi
  res := public.t2_bz_elon_saqla_v1(s1, gen_random_uuid(), jsonb_build_object('tur', 'tovar', 'sarlavha', 'Sement M400', 'birlik', 'tonna', 'holat', 'faol'));
  if (res ->> 'code') is distinct from 'NARX_KERAK' then raise exception 'FAIL bo''sh narx faol bo''ldi: %', res; end if;
  update public.t2_bz_sozlama set qiymat = '["firibgar"]'::jsonb where kalit = 'taqiqlangan_sozlar';
  res := public.t2_bz_elon_saqla_v1(s1, gen_random_uuid(), jsonb_build_object('tur', 'tovar', 'sarlavha', 'Firibgar sement', 'birlik', 'tonna', 'narx_qqs_siz', 1000, 'holat', 'faol'));
  if (res ->> 'code') is distinct from 'TAQIQLANGAN_SOZ' then raise exception 'FAIL taqiqlangan so''z o''tdi: %', res; end if;
  update public.t2_bz_sozlama set qiymat = '[]'::jsonb where kalit = 'taqiqlangan_sozlar';
  res := public.t2_bz_elon_saqla_v1(s1, gen_random_uuid(), jsonb_build_object('tur', 'tovar', 'sarlavha', 'Цемент М400', 'birlik', 'tonna', 'narx_qqs_siz', 1000, 'qqs_bor', false, 'hudud', 'Navoiy', 'kategoriya', 'sement', 'holat', 'faol'));
  if not (res ->> 'ok')::boolean then raise exception 'FAIL elon e1: %', res; end if;
  e1 := (res ->> 'id')::bigint;
  res := public.t2_bz_elon_saqla_v1(s2, gen_random_uuid(), jsonb_build_object('tur', 'xizmat', 'sarlavha', 'Gisht terish', 'birlik', 'm2', 'holat', 'qoralama'));
  e2 := (res ->> 'id')::bigint;
  res := public.t2_bz_elon_saqla_v1(s1, gen_random_uuid(), jsonb_build_object('id', e2, 'tur', 'xizmat', 'sarlavha', 'Hack', 'birlik', 'm2', 'narx_qqs_siz', 1, 'holat', 'faol'));
  if (res ->> 'code') is distinct from 'ELON_TOPILMADI' then raise exception 'FAIL begona sotuvchi tahrirladi: %', res; end if;
  res := public.t2_bz_elon_holat_v1(s1, gen_random_uuid(), jsonb_build_object('id', e2, 'holat', 'faol'));
  if (res ->> 'code') is distinct from 'ELON_TOPILMADI' then raise exception 'FAIL begona sotuvchi holatni o''zgartirdi: %', res; end if;
  res := public.t2_bz_elon_saqla_v1(s2, gen_random_uuid(), jsonb_build_object('id', e2, 'tur', 'xizmat', 'sarlavha', 'Gisht terish', 'birlik', 'm2', 'holat', 'faol'));
  if (res ->> 'code') is distinct from 'NARX_KERAK' then raise exception 'FAIL qoralama narxsiz faollashdi: %', res; end if;

  -- 4. Ochiq o'qish: faqat faol; lotin/kirill farqsiz; telefon/kompaniya sizmaydi
  res := public.t2_bz_ochiq_qidir_v1('{"q":["sement"]}');
  if jsonb_array_length(res -> 'elonlar') <> 1 or ((res -> 'elonlar' -> 0) ->> 'id')::bigint <> e1 then raise exception 'FAIL lotin qidiruv: %', res; end if;
  res := public.t2_bz_ochiq_qidir_v1('{"q":["цемент"]}');
  if jsonb_array_length(res -> 'elonlar') <> 1 then raise exception 'FAIL kirill qidiruv: %', res; end if;
  res := public.t2_bz_ochiq_qidir_v1('{}');
  if exists (select 1 from jsonb_array_elements(res -> 'elonlar') x where (x ->> 'id')::bigint = e2) then raise exception 'FAIL qoralama ochiq ko''rindi'; end if;
  if (res -> 'elonlar' -> 0) ? 'telefon' or (res -> 'elonlar' -> 0) ? 'kompaniya_id' or (res -> 'elonlar' -> 0) ? 'qidiruv_kalit' then raise exception 'FAIL ochiq natija ortiqcha maydon sizdirdi'; end if;
  res := public.t2_bz_ochiq_elon_v1(e2);
  if (res ->> 'code') is distinct from 'ELON_TOPILMADI' then raise exception 'FAIL qoralama elon ochiq o''qildi'; end if;
  res := public.t2_bz_ochiq_sotuvchi_v1(s1);
  if (res -> 'sotuvchi') ? 'telefon' or jsonb_array_length(res -> 'elonlar') <> 1 then raise exception 'FAIL sotuvchi sahifasi: %', res; end if;

  -- 5. So'rov (xaridor) -> 3 taklif -> g'olib
  op := gen_random_uuid();
  res := public.t2_bz_sorov_yarat_v1(k, buy, op, jsonb_build_object('nom', 'Sement M400', 'birlik', 'tonna', 'hajm', 20, 'hudud', 'Navoiy'));
  if not (res ->> 'ok')::boolean then raise exception 'FAIL sorov_yarat: %', res; end if;
  so := (res ->> 'id')::bigint;
  res := public.t2_bz_sorov_yarat_v1(k, buy, op, jsonb_build_object('nom', 'Sement M400', 'birlik', 'tonna', 'hajm', 20));
  if not coalesce((res ->> 'takror')::boolean, false) or (res ->> 'id')::bigint <> so then raise exception 'FAIL sorov takror: %', res; end if;
  begin perform public.t2_bz_sorov_yarat_v1(k, yot, gen_random_uuid(), jsonb_build_object('nom', 'X', 'birlik', 't', 'hajm', 1)); raise exception 'FAIL begona sorov yaratdi';
  exception when sqlstate '42501' then null; end;
  begin perform public.t2_bz_taqqos_v1(k, yot, so); raise exception 'FAIL begona taqqosni ko''rdi';
  exception when sqlstate '42501' then null; end;
  res := public.t2_bz_sorov_ochiq_v1(s2, '{}');
  if jsonb_array_length(res -> 'sorovlar') <> 1 or (res -> 'sorovlar' -> 0) ? 'kompaniya_id' then raise exception 'FAIL ochiq sorovlar: %', res; end if;
  res := public.t2_bz_taklif_ber_v1(s1, gen_random_uuid(), jsonb_build_object('sorov_id', so, 'narx_qqs_siz', 900, 'muddat_kun', 3, 'yetkazish', true)); t1 := (res ->> 'id')::bigint;
  res := public.t2_bz_taklif_ber_v1(s2, gen_random_uuid(), jsonb_build_object('sorov_id', so, 'narx_qqs_siz', 1000, 'muddat_kun', 5)); t2 := (res ->> 'id')::bigint;
  res := public.t2_bz_taklif_ber_v1(s3, gen_random_uuid(), jsonb_build_object('sorov_id', so, 'narx_qqs_siz', 1100)); t3 := (res ->> 'id')::bigint;
  if t1 is null or t2 is null or t3 is null then raise exception 'FAIL takliflar'; end if;
  res := public.t2_bz_taklif_ber_v1(buy, gen_random_uuid(), jsonb_build_object('sorov_id', so, 'narx_qqs_siz', 5));
  if (res ->> 'code') is distinct from 'PROFIL_KERAK' then raise exception 'FAIL profilsiz taklif: %', res; end if;
  res := public.t2_bz_taklif_ber_v1(s2, gen_random_uuid(), jsonb_build_object('sorov_id', so, 'narx_qqs_siz', 0));
  if (res ->> 'code') is distinct from 'NARX_KERAK' then raise exception 'FAIL nol narx: %', res; end if;
  res := public.t2_bz_taqqos_v1(k, buy, so);
  if (res ->> 'soni')::int <> 3 or (res ->> 'urtacha')::numeric <> 1000.00 or (res ->> 'ogohlantirish') is distinct from 'urtacha' then raise exception 'FAIL taqqos o''rtacha: %', res; end if;
  if ((res -> 'takliflar' -> 0) ->> 'narx_qqs_siz')::numeric <> 900 then raise exception 'FAIL taqqos tartibi'; end if;

  op := gen_random_uuid();
  res := public.t2_bz_golib_tanla_v1(k, buy, op, jsonb_build_object('sorov_id', so, 'taklif_id', t1));
  if not (res ->> 'ok')::boolean or (res ->> 'buyurtma_id') is null or (res ->> 'narx_manba_id') is null or (res ->> 'urtacha')::numeric <> 1000.00 then raise exception 'FAIL golib: %', res; end if;
  b1 := (res ->> 'buyurtma_id')::bigint; m1 := (res ->> 'narx_manba_id')::bigint;
  res := public.t2_bz_golib_tanla_v1(k, buy, gen_random_uuid(), jsonb_build_object('sorov_id', so, 'taklif_id', t1));
  if not coalesce((res ->> 'takror')::boolean, false) or (res ->> 'buyurtma_id')::bigint <> b1 then raise exception 'FAIL golib takror: %', res; end if;
  res := public.t2_bz_golib_tanla_v1(k, buy, gen_random_uuid(), jsonb_build_object('sorov_id', so, 'taklif_id', t2));
  if (res ->> 'code') is distinct from 'SOROV_YOPIQ' then raise exception 'FAIL ikkinchi golib: %', res; end if;
  select count(*) into n from public.t2_buyurtma where kompaniya_id = k and ijrochi_kompaniya_id = ks and shart ->> 'sorov_id' = so::text;
  if n <> 1 then raise exception 'FAIL buyurtma soni %', n; end if;
  select count(*) into n from public.t2_narx_manba where kompaniya_id = k and raqam = 'bozor #' || so::text;
  if n <> 1 then raise exception 'FAIL narx manbasi soni %', n; end if;
  select narx into u from public.t2_narx_manba_qator where manba_id = m1 limit 1;
  if u is distinct from 1000.00 then raise exception 'FAIL manba narxi o''rtacha emas: %', u; end if;
  if (select count(*) from public.t2_bz_taklif where sorov_id = so and holat = 'tanlandi') <> 1 or (select count(*) from public.t2_bz_taklif where sorov_id = so and holat = 'rad') <> 2 then raise exception 'FAIL taklif holatlari'; end if;

  -- 6. Baho faqat qabuldan keyin: yetkazildi (faqat g'olib sotuvchi) -> qabul (xaridor) -> ikki tomonlama baho (bir marta)
  res := public.t2_bz_baho_v1(buy, gen_random_uuid(), jsonb_build_object('sorov_id', so, 'ball', 5));
  if (res ->> 'code') is distinct from 'QABUL_KERAK' then raise exception 'FAIL baho qabulsiz: %', res; end if;
  res := public.t2_bz_yetkazildi_v1(s2, gen_random_uuid(), jsonb_build_object('sorov_id', so));
  if (res ->> 'code') is distinct from 'SOROV_TOPILMADI' then raise exception 'FAIL yutmagan sotuvchi yetkazdi: %', res; end if;
  res := public.t2_bz_qabul_v1(k, buy, gen_random_uuid(), jsonb_build_object('sorov_id', so));
  if (res ->> 'code') is distinct from 'HOLAT' then raise exception 'FAIL yetkazilmay qabul: %', res; end if;
  res := public.t2_bz_yetkazildi_v1(s1, gen_random_uuid(), jsonb_build_object('sorov_id', so));
  if not (res ->> 'ok')::boolean then raise exception 'FAIL yetkazildi: %', res; end if;
  res := public.t2_bz_qabul_v1(k, buy, gen_random_uuid(), jsonb_build_object('sorov_id', so));
  if not (res ->> 'ok')::boolean then raise exception 'FAIL qabul: %', res; end if;
  res := public.t2_bz_baho_v1(yot, gen_random_uuid(), jsonb_build_object('sorov_id', so, 'ball', 1));
  if (res ->> 'code') is distinct from 'SOROV_TOPILMADI' then raise exception 'FAIL begona baholadi: %', res; end if;
  res := public.t2_bz_baho_v1(buy, gen_random_uuid(), jsonb_build_object('sorov_id', so, 'ball', 5));
  if not (res ->> 'ok')::boolean then raise exception 'FAIL baho xaridor: %', res; end if;
  res := public.t2_bz_baho_v1(buy, gen_random_uuid(), jsonb_build_object('sorov_id', so, 'ball', 1));
  select count(*) into n from public.t2_reyting_baho where tur = 'bozor' and bitim_id = so; if n <> 1 then raise exception 'FAIL baho takror yozildi'; end if;
  res := public.t2_bz_baho_v1(s1, gen_random_uuid(), jsonb_build_object('sorov_id', so, 'ball', 4));
  if not (res ->> 'ok')::boolean then raise exception 'FAIL baho sotuvchi: %', res; end if;
  if ((public._t2_bz_reyting(s1)) ->> 'soni')::int <> 1 or ((public._t2_bz_reyting(s1)) ->> 'ortacha')::numeric <> 5.00 then raise exception 'FAIL reyting'; end if;

  -- 7. Yakka sotuvchi g'olib bo'lsa: buyurtma yo'q, narx manbasi bor, bitim shu so'rovda yuradi
  res := public.t2_bz_sorov_yarat_v1(k, buy, gen_random_uuid(), jsonb_build_object('nom', 'Gisht terish', 'birlik', 'm2', 'hajm', 100, 'tur', 'xizmat'));
  so := (res ->> 'id')::bigint;
  res := public.t2_bz_taklif_ber_v1(s2, gen_random_uuid(), jsonb_build_object('sorov_id', so, 'narx_qqs_siz', 50000)); t2 := (res ->> 'id')::bigint;
  res := public.t2_bz_golib_tanla_v1(k, buy, gen_random_uuid(), jsonb_build_object('sorov_id', so, 'taklif_id', t2));
  if not (res ->> 'ok')::boolean or (res ->> 'buyurtma_id') is not null or (res ->> 'narx_manba_id') is null then raise exception 'FAIL yakka golib: %', res; end if;

  -- 8. Shikoyat: 3 ta alohida shikoyat -> e'lon avtomatik yashirin -> ochiq qidiruvdan yo'qoladi; o'z e'loniga shikoyat yo'q
  res := public.t2_bz_shikoyat_v1(s1, gen_random_uuid(), jsonb_build_object('elon_id', e1, 'sabab', 'o''zim'));
  if (res ->> 'code') is distinct from 'OZ_ELONI' then raise exception 'FAIL oz elon shikoyat: %', res; end if;
  perform public.t2_bz_shikoyat_v1(buy, gen_random_uuid(), jsonb_build_object('elon_id', e1, 'sabab', 'soxta narx'));
  perform public.t2_bz_shikoyat_v1(buy, gen_random_uuid(), jsonb_build_object('elon_id', e1, 'sabab', 'takror'));
  perform public.t2_bz_shikoyat_v1(s2, gen_random_uuid(), jsonb_build_object('elon_id', e1, 'sabab', 'shubhali'));
  if (select holat from public.t2_bz_elon where id = e1) <> 'faol' then raise exception 'FAIL ikki shikoyatdan yashirildi'; end if;
  res := public.t2_bz_shikoyat_v1(s3, gen_random_uuid(), jsonb_build_object('elon_id', e1, 'sabab', 'uchinchi'));
  if (select holat from public.t2_bz_elon where id = e1) <> 'yashirin' then raise exception 'FAIL uch shikoyatdan yashirilmadi'; end if;
  res := public.t2_bz_ochiq_qidir_v1('{"q":["sement"]}');
  if jsonb_array_length(res -> 'elonlar') <> 0 then raise exception 'FAIL yashirin elon qidiruvda: %', res; end if;
  res := public.t2_bz_ochiq_elon_v1(e1);
  if (res ->> 'code') is distinct from 'ELON_TOPILMADI' then raise exception 'FAIL yashirin elon ochiq o''qildi'; end if;
  if public.t2_bz_ochiq_rasm_v1('bz/u0/yoq.jpg') then raise exception 'FAIL rasm tekshiruvi'; end if;
  res := public.t2_bz_elon_holat_v1(s1, gen_random_uuid(), jsonb_build_object('id', e1, 'holat', 'faol'));
  if (res ->> 'code') is distinct from 'YASHIRIN' then raise exception 'FAIL sotuvchi yashirinni qaytardi: %', res; end if;
  if (select count(*) from public.t2_bz_audit where obyekt = 'elon' and obyekt_id = e1) < 3 then raise exception 'FAIL audit'; end if;

  -- 9. Moderator amallari oddiy foydalanuvchiga yopiq
  begin perform public.t2_bz_mod_yashir_v1(buy, gen_random_uuid(), jsonb_build_object('elon_id', e1, 'yashir', false)); raise exception 'FAIL moderator amali ochiq';
  exception when sqlstate '42501' then null; end;
  begin perform public.t2_bz_mod_royxat_v1(s1); raise exception 'FAIL moderator royxati ochiq';
  exception when sqlstate '42501' then null; end;
end $acc$;
rollback;
