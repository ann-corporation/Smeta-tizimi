-- ACCEPTANCE: 20261216400000 (logistika yuk P1) - BEGIN..ROLLBACK, FAQAT sintetik fixture (prodda iz qolmaydi). Avval 20261201000000 qo'llangan bo'lishi shart.
-- Tekshiradi: grant yopiqligi; ikki haydovchi bitta yukni qabul qilsa BITTA yutadi; rejim (qat'iy/taklif); qadamlar faqat tartibda va faqat tayinlangan haydovchi;
-- boshqa kompaniya yuk egasi reysni ko'ra olmaydi; oxirgi joy bitta qator (upsert) va iz chegarasi; ping faqat faol reysda; yetkazishda omborga qabul so'rovi
-- bir marta; baho faqat yetkazilgandan keyin; yaqin yuklar masofa bo'yicha va egasi kontaktisiz.
begin;
do $acc$
declare
  k bigint; k2 bigint; adm bigint; adm2 bigint; drv bigint; drv2 bigint; far bigint;
  tsh bigint; tsh2 bigint; y1 bigint; y2 bigint; y3 bigint; ver int; res jsonb; op uuid; n int; b1 bigint; b2 bigint; al bigint; by1 bigint; t0 timestamptz;
begin
  insert into public.t2_kompaniya (nom, kod, faol) values ('_TEST_P1_', gen_random_uuid()::text, true) returning id into k;
  insert into public.t2_kompaniya (nom, kod, faol) values ('_TEST_P1B_', gen_random_uuid()::text, true) returning id into k2;
  insert into public.t2_foydalanuvchi (ism, login, email) values ('_a', 'p1_a_' || gen_random_uuid(), 'p1_a_' || gen_random_uuid() || '@t.invalid') returning id into adm;
  insert into public.t2_foydalanuvchi (ism, login, email) values ('_a2', 'p1_a2_' || gen_random_uuid(), 'p1_a2_' || gen_random_uuid() || '@t.invalid') returning id into adm2;
  insert into public.t2_foydalanuvchi (ism, login, email) values ('_d1', 'p1_d1_' || gen_random_uuid(), 'p1_d1_' || gen_random_uuid() || '@t.invalid') returning id into drv;
  insert into public.t2_foydalanuvchi (ism, login, email) values ('_d2', 'p1_d2_' || gen_random_uuid(), 'p1_d2_' || gen_random_uuid() || '@t.invalid') returning id into drv2;
  insert into public.t2_foydalanuvchi (ism, login, email) values ('_far', 'p1_f_' || gen_random_uuid(), 'p1_f_' || gen_random_uuid() || '@t.invalid') returning id into far;
  insert into public.t2_azolik (kompaniya_id, foydalanuvchi_id, rol, holat) values (k, adm, 'admin', 'faol'), (k2, adm2, 'admin', 'faol');

  -- 1. Grantlar
  if has_function_privilege('anon', 'public.t2_yb_p1_qabul_v1(bigint,uuid,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.t2_yb_p1_qadam_v1(bigint,uuid,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.t2_yb_p1_joy_v1(bigint,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.t2_yb_p1_ega_kuzat_v1(bigint,bigint,bigint)', 'execute')
     or has_table_privilege('anon', 'public.t2_yb_joy', 'select') or has_table_privilege('authenticated', 'public.t2_yb_joy', 'select')
     or not has_function_privilege('service_role', 'public.t2_yb_p1_yaqin_v1(bigint,jsonb)', 'execute') then
    raise exception 'FAIL grant';
  end if;

  -- 2. Haydovchilar (yakka profil + mashina) — kompaniyasiz
  res := public.t2_yb_tashuvchi_saqla_v1(drv, gen_random_uuid(), '{"ism":"_H1","telefon":"+998900000011","davlat_raqami":"01P1AAA","turi":"yuk","yuk_t":10}');
  tsh := (res ->> 'tashuvchi_id')::bigint;
  res := public.t2_yb_tashuvchi_saqla_v1(drv2, gen_random_uuid(), '{"ism":"_H2","telefon":"+998900000012","davlat_raqami":"01P2BBB","turi":"yuk","yuk_t":10}');
  tsh2 := (res ->> 'tashuvchi_id')::bigint;
  res := public.t2_yb_tashuvchi_saqla_v1(far, gen_random_uuid(), '{"ism":"_H3","davlat_raqami":"01P3CCC","turi":"yuk","yuk_t":10}');

  -- 3. Yuk: qoralama -> yuk_qosh (tenant) -> e'lon
  res := public.t2_yb_yuk_saqla_v1(k, adm, gen_random_uuid(), jsonb_build_object('nom', '_Sement', 'a_nom', 'Toshkent', 'b_nom', 'Navoiy', 'masofa_km', 420, 'tonna', 8,
    'sana_dan', current_date + 1, 'sana_gacha', current_date + 3, 'tolov_shakli', 'otkazma', 'narx_taklif_qqs_siz', 900000));
  if not (res ->> 'ok')::boolean then raise exception 'FAIL yuk_saqla: %', res; end if;
  y1 := (res ->> 'id')::bigint; ver := (res ->> 'versiya')::int;
  update public.t2_yb_yuk set a_lat = 41.311, a_lng = 69.279, b_lat = 40.103, b_lng = 65.372 where id = y1;
  begin perform public.t2_yb_p1_yuk_qosh_v1(k, adm2, gen_random_uuid(), jsonb_build_object('yuk_id', y1, 'narx_rejim', 'taklif')); raise exception 'FAIL begona kompaniya yuk_qosh';
  exception when sqlstate '42501' then null; end;
  res := public.t2_yb_p1_yuk_qosh_v1(k2, adm2, gen_random_uuid(), jsonb_build_object('yuk_id', y1, 'narx_rejim', 'taklif'));
  if (res ->> 'code') is distinct from 'YUK_TOPILMADI' then raise exception 'FAIL boshqa tenant yukiga tegdi: %', res; end if;
  res := public.t2_yb_p1_yuk_qosh_v1(k, adm, gen_random_uuid(), jsonb_build_object('yuk_id', y1, 'buyurtma_id', 999999999));
  if (res ->> 'code') is distinct from 'BUYURTMA_SCOPE_MISMATCH' then raise exception 'FAIL buyurtma scope: %', res; end if;
  res := public.t2_yb_p1_yuk_qosh_v1(k, adm, gen_random_uuid(), jsonb_build_object('yuk_id', y1, 'narx_rejim', 'qat_iy', 'mashina_sinf', 'katta'));
  if not (res ->> 'ok')::boolean then raise exception 'FAIL yuk_qosh: %', res; end if;
  res := public.t2_yb_yuk_elon_v1(k, adm, gen_random_uuid(), jsonb_build_object('id', y1, 'versiya', ver));
  if not (res ->> 'ok')::boolean then raise exception 'FAIL elon: %', res; end if;

  -- 4. Onlayn + yaqin yuklar (masofa bo'yicha; egasi kontaktisiz)
  res := public.t2_yb_p1_holat_v1(drv, gen_random_uuid(), '{"onlayn":true,"lat":41.30,"lng":69.25}');
  if not (res ->> 'ok')::boolean or not (res ->> 'onlayn')::boolean then raise exception 'FAIL holat: %', res; end if;
  res := public.t2_yb_p1_yaqin_v1(drv, '{}');
  if not (res ->> 'ok')::boolean or jsonb_array_length(res -> 'yuklar') < 1 then raise exception 'FAIL yaqin: %', res; end if;
  if jsonb_exists(res -> 'yuklar' -> 0, 'kompaniya_id') or jsonb_exists(res -> 'yuklar' -> 0, 'yaratuvchi_id') then raise exception 'FAIL yaqin egasi maydonini sizdirdi'; end if;
  if ((res -> 'yuklar' -> 0) ->> 'joydan_km')::numeric > 5 then raise exception 'FAIL masofa: %', res; end if;
  res := public.t2_yb_p1_yaqin_v1(drv, '{"lat":39.0,"lng":60.0,"radius_km":50}');
  if jsonb_array_length(res -> 'yuklar') <> 0 then raise exception 'FAIL radius filtri: %', res; end if;

  -- 5. Poyga: ikki haydovchi bitta qat'iy narxli yukni oladi — BITTA yutadi
  res := public.t2_yb_p1_qabul_v1(drv, gen_random_uuid(), jsonb_build_object('yuk_id', y1, 'harakat', 'taklif', 'narx_qqs_siz', 1));
  if (res ->> 'code') is distinct from 'REJIM_QATIY' then raise exception 'FAIL qat''iy yukka taklif: %', res; end if;
  res := public.t2_yb_p1_qabul_v1(drv, gen_random_uuid(), jsonb_build_object('yuk_id', y1, 'harakat', 'bron'));
  if not (res ->> 'ok')::boolean then raise exception 'FAIL birinchi bron: %', res; end if;
  res := public.t2_yb_p1_qabul_v1(drv2, gen_random_uuid(), jsonb_build_object('yuk_id', y1, 'harakat', 'bron'));
  if coalesce((res ->> 'ok')::boolean, false) then raise exception 'FAIL ikkinchi haydovchi ham yutdi: %', res; end if;
  select count(*) into n from public.t2_yb_bron where yuk_id = y1 and holat <> 'bekor';
  if n <> 1 then raise exception 'FAIL faol bron soni %', n; end if;
  select id into b1 from public.t2_yb_bron where yuk_id = y1 and holat <> 'bekor';

  -- 6. Qadamlar: tartib, tayinlangan haydovchi
  res := public.t2_yb_p1_qadam_v1(drv2, gen_random_uuid(), jsonb_build_object('bron_id', b1, 'qadam', 'keldi'));
  if (res ->> 'code') is distinct from 'BRON_TOPILMADI' then raise exception 'FAIL begona haydovchi qadam qildi: %', res; end if;
  res := public.t2_yb_p1_qadam_v1(drv, gen_random_uuid(), jsonb_build_object('bron_id', b1, 'qadam', 'yolda'));
  if (res ->> 'code') is distinct from 'QADAM_TARTIB' then raise exception 'FAIL keldi/yuklandi o''tkazib yuborildi: %', res; end if;
  op := gen_random_uuid();
  res := public.t2_yb_p1_qadam_v1(drv, op, jsonb_build_object('bron_id', b1, 'qadam', 'keldi'));
  if not (res ->> 'ok')::boolean then raise exception 'FAIL keldi: %', res; end if;
  res := public.t2_yb_p1_qadam_v1(drv, op, jsonb_build_object('bron_id', b1, 'qadam', 'keldi'));
  if not coalesce((res ->> 'takror')::boolean, false) then raise exception 'FAIL idempotentlik: %', res; end if;
  res := public.t2_yb_p1_qadam_v1(drv, gen_random_uuid(), jsonb_build_object('bron_id', b1, 'qadam', 'yuklandi'));
  if (res ->> 'code') is distinct from 'DALIL_KERAK' then raise exception 'FAIL yuklash dalilsiz: %', res; end if;
  res := public.t2_yb_dalil_qosh_v1(drv, gen_random_uuid(), jsonb_build_object('bron_id', b1, 'tur', 'yuklash', 'r2_kalit', 'yb/test/yuklash.jpg'));
  if not (res ->> 'ok')::boolean then raise exception 'FAIL dalil yuklash: %', res; end if;
  res := public.t2_yb_p1_qadam_v1(drv, gen_random_uuid(), jsonb_build_object('bron_id', b1, 'qadam', 'yuklandi'));
  if not (res ->> 'ok')::boolean then raise exception 'FAIL yuklandi: %', res; end if;

  -- 7. Oxirgi joy: bitta qator, iz chegaralangan; ping faqat faol reysda
  res := public.t2_yb_p1_joy_v1(drv, jsonb_build_object('bron_id', b1, 'lat', 41.30, 'lng', 69.25, 'aniqlik_m', 20));
  if not (res ->> 'ok')::boolean then raise exception 'FAIL joy 1: %', res; end if;
  res := public.t2_yb_p1_joy_v1(drv, jsonb_build_object('bron_id', b1, 'lat', 41.20, 'lng', 69.00));
  res := public.t2_yb_p1_joy_v1(drv, jsonb_build_object('bron_id', b1, 'lat', 41.20, 'lng', 69.00));
  select count(*) into n from public.t2_yb_joy where bron_id = b1;
  if n <> 1 then raise exception 'FAIL joy bitta qator emas: %', n; end if;
  if (res ->> 'iz_soni')::int <> 2 then raise exception 'FAIL iz (siljimagan nuqta qo''shilmasligi kerak): %', res; end if;
  for n in 1..140 loop
    perform public.t2_yb_p1_joy_v1(drv, jsonb_build_object('bron_id', b1, 'lat', 41.0 + n * 0.002, 'lng', 69.0));
  end loop;
  if (select jsonb_array_length(iz) from public.t2_yb_joy where bron_id = b1) > 120 then raise exception 'FAIL iz 120 dan oshdi'; end if;
  if (select count(*) from public.t2_yb_joy where bron_id = b1) <> 1 then raise exception 'FAIL joy ko''p qator'; end if;
  res := public.t2_yb_p1_joy_v1(drv2, jsonb_build_object('bron_id', b1, 'lat', 41, 'lng', 69));
  if (res ->> 'code') is distinct from 'BRON_TOPILMADI' then raise exception 'FAIL begona haydovchi joy yozdi: %', res; end if;
  res := public.t2_yb_p1_joy_v1(drv, jsonb_build_object('bron_id', b1, 'lat', 200, 'lng', 69));
  if (res ->> 'code') is distinct from 'KOORDINATA_NOTOGRI' then raise exception 'FAIL koordinata: %', res; end if;

  -- 8. Yuk egasi kuzatuvi: tenant izolyatsiyasi + oxirgi ma'lum joy
  begin perform public.t2_yb_p1_ega_kuzat_v1(k, adm2, y1); raise exception 'FAIL begona kompaniya a''zosi kuzatdi';
  exception when sqlstate '42501' then null; end;
  res := public.t2_yb_p1_ega_kuzat_v1(k2, adm2, y1);
  if (res ->> 'code') is distinct from 'YUK_TOPILMADI' then raise exception 'FAIL boshqa tenant yukini ko''rdi: %', res; end if;
  res := public.t2_yb_p1_ega_kuzat_v1(k, adm, y1);
  if not (res ->> 'ok')::boolean or (res #>> '{joy,soniya_oldin}') is null or (res #>> '{bron,qadam}') <> 'yuklandi' then raise exception 'FAIL ega_kuzat: %', res; end if;

  -- 9. Baho faqat yetkazilgandan keyin (reys hali yetkazilmagan)
  res := public.t2_yb_tashuvchi_baho_v1(drv, gen_random_uuid(), jsonb_build_object('bron_id', b1, 'ball', 5));
  if coalesce((res ->> 'ok')::boolean, false) then raise exception 'FAIL yetkazilmasdan baho: %', res; end if;

  -- 10. Yo'lda -> yetkazdi; buyurtmali yuk uchun omborga qabul so'rovi BIR marta
  insert into public.t2_tomon_aloqa (taklif_kompaniya_id, qabul_kompaniya_id, taklif_rol, qabul_rol, turi, holat, taklif_actor_id)
    values (k, k2, 'buyurtmachi', 'yetkazuvchi', 'shartnoma', 'faol', adm) returning id into al;
  insert into public.t2_buyurtma (kompaniya_id, ijrochi_kompaniya_id, aloqa_id, tur, operation_id, yaratdi_actor_id)
    values (k, k2, al, 'material', gen_random_uuid(), adm) returning id into by1;
  res := public.t2_yb_p1_yuk_qosh_v1(k, adm, gen_random_uuid(), jsonb_build_object('yuk_id', y1, 'buyurtma_id', by1));
  if (res ->> 'code') is distinct from 'HOLAT' then raise exception 'FAIL e''londan keyin yuk_qosh: %', res; end if;
  update public.t2_yb_yuk set buyurtma_id = by1 where id = y1;
  res := public.t2_yb_p1_qadam_v1(drv, gen_random_uuid(), jsonb_build_object('bron_id', b1, 'qadam', 'yolda'));
  if not (res ->> 'ok')::boolean then raise exception 'FAIL yolda: %', res; end if;
  res := public.t2_yb_p1_qadam_v1(drv, gen_random_uuid(), jsonb_build_object('bron_id', b1, 'qadam', 'yetkazdi'));
  if (res ->> 'code') is distinct from 'QABUL_NOM_KERAK' then raise exception 'FAIL qabul nomisiz yetkazdi: %', res; end if;
  res := public.t2_yb_dalil_qosh_v1(drv, gen_random_uuid(), jsonb_build_object('bron_id', b1, 'tur', 'yetkazish', 'r2_kalit', 'yb/test/yetkazish.jpg'));
  op := gen_random_uuid();
  res := public.t2_yb_p1_qadam_v1(drv, op, jsonb_build_object('bron_id', b1, 'qadam', 'yetkazdi', 'qabul_nom', '_Qabul qiluvchi'));
  if not (res ->> 'ok')::boolean then raise exception 'FAIL yetkazdi: %', res; end if;
  select qabul_so_rov_vaqt into t0 from public.t2_yb_yuk where id = y1;
  if t0 is null then raise exception 'FAIL qabul so''rovi yo''q'; end if;
  res := public.t2_yb_p1_qadam_v1(drv, op, jsonb_build_object('bron_id', b1, 'qadam', 'yetkazdi', 'qabul_nom', '_Qabul qiluvchi'));
  res := public.t2_yb_p1_qadam_v1(drv, gen_random_uuid(), jsonb_build_object('bron_id', b1, 'qadam', 'yetkazdi', 'qabul_nom', 'X'));
  if (res ->> 'code') is distinct from 'QADAM_TARTIB' then raise exception 'FAIL ikkinchi yetkazdi: %', res; end if;
  if (select qabul_so_rov_vaqt from public.t2_yb_yuk where id = y1) is distinct from t0 then raise exception 'FAIL qabul so''rovi qayta yozildi'; end if;
  if (select holat from public.t2_yb_yuk where id = y1) <> 'yetkazildi' then raise exception 'FAIL yuk holati'; end if;
  res := public.t2_yb_p1_joy_v1(drv, jsonb_build_object('bron_id', b1, 'lat', 41, 'lng', 69));
  if (res ->> 'code') is distinct from 'REYS_FAOL_EMAS' then raise exception 'FAIL yetkazilgandan keyin ping: %', res; end if;
  if not (select yopildi from public.t2_yb_joy where bron_id = b1) then raise exception 'FAIL joy yopilmadi'; end if;

  -- 11. Baho yetkazilgandan keyin ishlaydi
  res := public.t2_yb_tashuvchi_baho_v1(drv, gen_random_uuid(), jsonb_build_object('bron_id', b1, 'ball', 5, 'izoh', '_yaxshi'));
  if not (res ->> 'ok')::boolean then raise exception 'FAIL yetkazilgandan keyin baho: %', res; end if;

  -- 11b. Haydovchi reyslari: faqat o'ziniki, qadam va baholangan bayrog'i
  res := public.t2_yb_p1_reys_v1(drv);
  if jsonb_array_length(res -> 'bronlar') <> 1 or (res #>> '{bronlar,0,qadam}') <> 'yetkazdi' or (res #>> '{bronlar,0,baholangan}') <> 'true' then raise exception 'FAIL reys: %', res; end if;
  res := public.t2_yb_p1_reys_v1(far);
  if jsonb_array_length(res -> 'bronlar') <> 0 then raise exception 'FAIL begona reys ko''rindi: %', res; end if;

  -- 12. Auktsion rejimi: qat'iy «bron» rad, «taklif» qabul
  res := public.t2_yb_yuk_saqla_v1(k, adm, gen_random_uuid(), jsonb_build_object('nom', '_Gisht', 'a_nom', 'Toshkent', 'b_nom', 'Navoiy', 'masofa_km', 420, 'tonna', 5,
    'sana_dan', current_date + 1, 'sana_gacha', current_date + 3, 'tolov_shakli', 'otkazma', 'narx_taklif_qqs_siz', 800000));
  y2 := (res ->> 'id')::bigint; ver := (res ->> 'versiya')::int;
  update public.t2_yb_yuk set a_lat = 41.2, a_lng = 69.2, b_lat = 40.1, b_lng = 65.3 where id = y2;
  perform public.t2_yb_p1_yuk_qosh_v1(k, adm, gen_random_uuid(), jsonb_build_object('yuk_id', y2, 'narx_rejim', 'taklif'));
  res := public.t2_yb_yuk_elon_v1(k, adm, gen_random_uuid(), jsonb_build_object('id', y2, 'versiya', ver));
  if not (res ->> 'ok')::boolean then raise exception 'FAIL elon 2: %', res; end if;
  res := public.t2_yb_p1_qabul_v1(drv2, gen_random_uuid(), jsonb_build_object('yuk_id', y2, 'harakat', 'bron'));
  if (res ->> 'code') is distinct from 'REJIM_TAKLIF' then raise exception 'FAIL auktsionda bron: %', res; end if;
  res := public.t2_yb_p1_qabul_v1(drv2, gen_random_uuid(), jsonb_build_object('yuk_id', y2, 'harakat', 'taklif', 'narx_qqs_siz', 750000));
  if not (res ->> 'ok')::boolean then raise exception 'FAIL auktsion taklifi: %', res; end if;

  raise notice 'ACCEPTANCE OK: 20261216400000';
end $acc$;
rollback;
