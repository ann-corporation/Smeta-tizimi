-- ACCEPTANCE: 20261201000000 (yuk birjasi v1) - BEGIN..ROLLBACK, FAQAT sintetik fixture (o'zi yaratadi, prodda iz qolmaydi).
-- Tekshiradi: grant yopiqligi; tenant izolyatsiyasi; e'lon qoidalari; taklif -> qarshi taklif -> bron; escrow holat mashinasi (hold -> yuklash -> yetkazish ->
-- tasdiq -> chiqarish -> release) va komissiya hisobi; kod xatosi; qat'iy narxda bron; nizo (to'lov muzlaydi, moderator faqat superadmin); tashuvchi bekori;
-- idempotentlik; yakka haydovchi va firma xodimi ruxsati; sig'im; baho/reyting; muddat; hodisa jurnali o'zgarmasligi; outbox.
begin;
do $acc$
declare
  k bigint; k2 bigint; adm bigint; adm2 bigint; drv bigint; drv2 bigint; fx bigint; sup bigint;
  o1 bigint; o_boshqa bigint; y1 bigint; y2 bigint; y3 bigint; y4 bigint; ver int; res jsonb; op uuid; n int; tsh bigint; tsh2 bigint; ftsh bigint;
  tk1 bigint; tk2 bigint; bron1 bigint; bron2 bigint; tolov1 bigint; tolov2 bigint; kod text; nizo1 bigint; doc bigint; rep numeric;
begin
  -- Fixture
  insert into public.t2_kompaniya (nom, kod, faol) values ('_TEST_YB_', gen_random_uuid()::text, true) returning id into k;
  insert into public.t2_kompaniya (nom, kod, faol) values ('_TEST_YB2_', gen_random_uuid()::text, true) returning id into k2;
  insert into public.t2_foydalanuvchi (ism, login, email) values ('_adm', 'yb_adm_' || gen_random_uuid(), 'yb_adm_' || gen_random_uuid() || '@t.invalid') returning id into adm;
  insert into public.t2_foydalanuvchi (ism, login, email) values ('_adm2', 'yb_adm2_' || gen_random_uuid(), 'yb_adm2_' || gen_random_uuid() || '@t.invalid') returning id into adm2;
  insert into public.t2_foydalanuvchi (ism, login, email) values ('_drv', 'yb_drv_' || gen_random_uuid(), 'yb_drv_' || gen_random_uuid() || '@t.invalid') returning id into drv;
  insert into public.t2_foydalanuvchi (ism, login, email) values ('_drv2', 'yb_drv2_' || gen_random_uuid(), 'yb_drv2_' || gen_random_uuid() || '@t.invalid') returning id into drv2;
  insert into public.t2_foydalanuvchi (ism, login, email) values ('_fx', 'yb_fx_' || gen_random_uuid(), 'yb_fx_' || gen_random_uuid() || '@t.invalid') returning id into fx;
  insert into public.t2_azolik (kompaniya_id, foydalanuvchi_id, rol, holat) values (k, adm, 'admin', 'faol'), (k2, adm2, 'admin', 'faol'), (k2, fx, 'taminotchi', 'faol');
  insert into public.t2_obyekt (nom, kompaniya_id, lat, lng) values ('_O1', k, 41.30, 69.24) returning id into o1;
  insert into public.t2_obyekt (nom, kompaniya_id) values ('_OB', k2) returning id into o_boshqa;
  update public.t2_yb_sozlama set qiymat = '3'::jsonb where kalit = 'komissiya_foiz';

  -- 1. Grantlar
  if has_function_privilege('anon', 'public.t2_yb_yuk_saqla_v1(bigint,bigint,uuid,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.t2_yb_taklif_ber_v1(bigint,uuid,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.t2_yb_tolov_hodisa_v1(uuid,jsonb)', 'execute')
     or has_table_privilege('anon', 'public.t2_yb_yuk', 'select') or has_table_privilege('authenticated', 'public.t2_yb_bron', 'select')
     or not has_function_privilege('service_role', 'public.t2_yb_ol_v1(bigint,bigint,text,jsonb)', 'execute') then
    raise exception 'FAIL grant';
  end if;

  -- 2. Yuk saqlash: tenant, obyekt scope, escrow faqat otkazma
  begin perform public.t2_yb_yuk_saqla_v1(k, adm2, gen_random_uuid(), '{"nom":"X"}'); raise exception 'FAIL begona kompaniya yozdi';
  exception when sqlstate '42501' then null; end;
  res := public.t2_yb_yuk_saqla_v1(k, adm, gen_random_uuid(), jsonb_build_object('nom', '_Sement', 'b_obyekt_id', o_boshqa));
  if (res ->> 'code') is distinct from 'OBYEKT_SCOPE_MISMATCH' then raise exception 'FAIL obyekt scope: %', res; end if;
  res := public.t2_yb_yuk_saqla_v1(k, adm, gen_random_uuid(), '{"nom":"_Sement","tolov_shakli":"naqd","escrow":true}');
  if (res ->> 'code') is distinct from 'ESCROW_FAQAT_OTKAZMA' then raise exception 'FAIL escrow naqd: %', res; end if;
  op := gen_random_uuid();
  res := public.t2_yb_yuk_saqla_v1(k, adm, op, jsonb_build_object('nom', '_Sement', 'a_nom', 'Toshkent', 'b_nom', 'Navoiy', 'b_obyekt_id', o1, 'masofa_km', 420, 'tonna', 20,
    'sana_dan', current_date + 1, 'sana_gacha', current_date + 3, 'tolov_shakli', 'otkazma', 'escrow', true));
  if not (res ->> 'ok')::boolean then raise exception 'FAIL yuk_saqla: %', res; end if;
  y1 := (res ->> 'id')::bigint; ver := (res ->> 'versiya')::int;
  if (public.t2_yb_yuk_saqla_v1(k, adm, op, '{}') ->> 'id')::bigint is distinct from y1 then raise exception 'FAIL idempotent yuk'; end if;
  select count(*) into n from public.t2_yb_yuk where kompaniya_id = k; if n <> 1 then raise exception 'FAIL takror yuk yaratdi'; end if;
  -- e'lon qoidasi: sana majburiy (bo'sh qoralama e'lon qilinmaydi)
  res := public.t2_yb_yuk_saqla_v1(k, adm, gen_random_uuid(), '{"nom":"_Bosh"}');
  y4 := (res ->> 'id')::bigint;
  res := public.t2_yb_yuk_elon_v1(k, adm, gen_random_uuid(), jsonb_build_object('id', y4, 'versiya', 1));
  if (res ->> 'code') is distinct from 'MARSHRUT_KERAK' then raise exception 'FAIL elon marshrut: %', res; end if;
  res := public.t2_yb_yuk_elon_v1(k, adm, gen_random_uuid(), jsonb_build_object('id', y1, 'versiya', ver + 5));
  if (res ->> 'code') is distinct from 'VERSION_CONFLICT' then raise exception 'FAIL versiya: %', res; end if;
  res := public.t2_yb_yuk_elon_v1(k, adm, gen_random_uuid(), jsonb_build_object('id', y1, 'versiya', ver));
  if not (res ->> 'ok')::boolean or (res ->> 'holat') <> 'elon' then raise exception 'FAIL elon: %', res; end if;
  if not exists (select 1 from public.t2_outbox where kompaniya_id = k and mavzu = 'yuk.elon' and entity_id = y1) then raise exception 'FAIL outbox elon'; end if;
  -- E'londan keyin tahrir yo'q
  res := public.t2_yb_yuk_saqla_v1(k, adm, gen_random_uuid(), jsonb_build_object('id', y1, 'versiya', ver + 1, 'nom', '_Boshqa'));
  if (res ->> 'code') is distinct from 'HOLAT' then raise exception 'FAIL elondan keyin tahrir: %', res; end if;

  -- 3. Yakka haydovchi onboarding (kompaniyasiz) va sig'im
  res := public.t2_yb_tashuvchi_saqla_v1(drv, gen_random_uuid(), '{"ism":"_Haydovchi","telefon":"+998900000001","davlat_raqami":"01A111AA","turi":"yuk","yuk_t":10}');
  if not (res ->> 'ok')::boolean or (res ->> 'tur') <> 'yakka' or (res ->> 'daraja')::int <> 1 then raise exception 'FAIL onboarding: %', res; end if;
  tsh := (res ->> 'tashuvchi_id')::bigint;
  res := public.t2_yb_taklif_ber_v1(drv, gen_random_uuid(), jsonb_build_object('yuk_id', y1, 'narx_qqs_siz', 900000));
  -- 10 t mashina 20 t yukni tashiy olmaydi: taklif beriladi, lekin bron (qabul) SIGIM_YETMAYDI beradi
  if not (res ->> 'ok')::boolean then raise exception 'FAIL taklif: %', res; end if;
  tk1 := (res ->> 'taklif_id')::bigint;
  res := public.t2_yb_yuk_javob_v1(k, adm, gen_random_uuid(), jsonb_build_object('yuk_id', y1, 'taklif_id', tk1, 'harakat', 'qabul'));
  if (res ->> 'code') is distinct from 'SIGIM_YETMAYDI' then raise exception 'FAIL sigim: %', res; end if;
  -- Kattaroq mashina qo'shiladi
  res := public.t2_yb_tashuvchi_saqla_v1(drv, gen_random_uuid(), '{"ism":"_Haydovchi","davlat_raqami":"01B222BB","turi":"tent","yuk_t":25}');
  if not (res ->> 'ok')::boolean then raise exception 'FAIL 2-mashina: %', res; end if;
  -- Boshqa foydalanuvchi (haydovchi emas) boshqa profil nomidan ish qila olmaydi
  begin perform public.t2_yb_taklif_ber_v1(drv2, gen_random_uuid(), jsonb_build_object('yuk_id', y1, 'tashuvchi_id', tsh, 'narx_qqs_siz', 1)); raise exception 'FAIL begona tashuvchi';
  exception when sqlstate '42501' then null; end;

  -- 4. Qarshi taklif -> haydovchi qabul -> bron (escrow qatori)
  res := public.t2_yb_taklif_ber_v1(drv, gen_random_uuid(), jsonb_build_object('yuk_id', y1, 'narx_qqs_siz', 900000, 'mashina_id', (select id from public.t2_yb_mashina where tashuvchi_id = tsh and davlat_raqami = '01B222BB')));
  if not (res ->> 'ok')::boolean then raise exception 'FAIL taklif2: %', res; end if;
  tk1 := (res ->> 'taklif_id')::bigint;
  res := public.t2_yb_yuk_javob_v1(k, adm, gen_random_uuid(), jsonb_build_object('yuk_id', y1, 'taklif_id', tk1, 'harakat', 'qarshi', 'narx_qqs_siz', 800000));
  if not (res ->> 'ok')::boolean then raise exception 'FAIL qarshi: %', res; end if;
  tk2 := (res ->> 'taklif_id')::bigint;
  if (select holat from public.t2_yb_taklif where id = tk1) <> 'eskirdi' then raise exception 'FAIL eski taklif'; end if;
  res := public.t2_yb_taklif_ber_v1(drv, gen_random_uuid(), jsonb_build_object('yuk_id', y1, 'harakat', 'qabul', 'taklif_id', tk2));
  if not (res ->> 'ok')::boolean or (res ->> 'holat') <> 'bron' then raise exception 'FAIL qabul: %', res; end if;
  bron1 := (res ->> 'bron_id')::bigint;
  select id into tolov1 from public.t2_yb_tolov where bron_id = bron1;
  if (select holat from public.t2_yb_tolov where id = tolov1) <> 'kutilmoqda' then raise exception 'FAIL tolov kutilmoqda'; end if;
  if (select narx_qqs_siz from public.t2_yb_bron where id = bron1) <> 800000 then raise exception 'FAIL bron narx'; end if;
  -- Ikkinchi bron bo'lmaydi
  res := public.t2_yb_taklif_ber_v1(drv, gen_random_uuid(), jsonb_build_object('yuk_id', y1, 'narx_qqs_siz', 700000));
  if (res ->> 'code') is distinct from 'HOLAT' then raise exception 'FAIL ikkinchi taklif: %', res; end if;

  -- 5. Escrow: pul ushlanmaguncha yo'lga chiqib bo'lmaydi; dalil majburiy
  res := public.t2_yb_yuritish_v1(drv, gen_random_uuid(), jsonb_build_object('bron_id', bron1, 'harakat', 'yukladim'));
  if (res ->> 'code') is distinct from 'TOLOV_USHLANMAGAN' then raise exception 'FAIL tolov ushlanmagan: %', res; end if;
  res := public.t2_yb_tolov_hodisa_v1(gen_random_uuid(), jsonb_build_object('tolov_id', tolov1, 'hodisa', 'release_ok'));
  if (res ->> 'code') is distinct from 'HOLAT_O_TISH_NOTOGRI' then raise exception 'FAIL notogri otish: %', res; end if;
  op := gen_random_uuid();
  res := public.t2_yb_tolov_hodisa_v1(op, jsonb_build_object('tolov_id', tolov1, 'hodisa', 'hold_ok', 'provider', 'stub', 'provider_ref', 'H-1'));
  if not (res ->> 'ok')::boolean or (res ->> 'natija') <> 'ushlab_turibdi' then raise exception 'FAIL hold: %', res; end if;
  if not coalesce((public.t2_yb_tolov_hodisa_v1(op, jsonb_build_object('tolov_id', tolov1, 'hodisa', 'hold_ok')) ->> 'takror')::boolean, false) then raise exception 'FAIL callback idempotent'; end if;
  res := public.t2_yb_yuritish_v1(drv, gen_random_uuid(), jsonb_build_object('bron_id', bron1, 'harakat', 'yukladim'));
  if (res ->> 'code') is distinct from 'DALIL_KERAK' then raise exception 'FAIL dalil kerak: %', res; end if;
  insert into public.t2_document_registry (kompaniya_id, document_type, status) values (k, 'yuk_dalil', 'active') returning id into doc;
  res := public.t2_yb_dalil_qosh_v1(drv, gen_random_uuid(), jsonb_build_object('bron_id', bron1, 'tur', 'yuklash', 'document_id', doc));
  if not (res ->> 'ok')::boolean then raise exception 'FAIL dalil: %', res; end if;
  res := public.t2_yb_dalil_qosh_v1(drv, gen_random_uuid(), jsonb_build_object('bron_id', bron1, 'tur', 'yuklash', 'r2_kalit', 'yuk/1/yuklash.jpg', 'sha256', repeat('a', 64)));
  if not (res ->> 'ok')::boolean then raise exception 'FAIL dalil r2: %', res; end if;
  res := public.t2_yb_dalil_qosh_v1(drv, gen_random_uuid(), jsonb_build_object('bron_id', bron1, 'tur', 'yuklash'));
  if (res ->> 'code') is distinct from 'FAYL_KERAK' then raise exception 'FAIL fayl kerak: %', res; end if;
  res := public.t2_yb_yuritish_v1(drv, gen_random_uuid(), jsonb_build_object('bron_id', bron1, 'harakat', 'yukladim'));
  if not (res ->> 'ok')::boolean or (res ->> 'holat') <> 'yolda' then raise exception 'FAIL yolda: %', res; end if;
  -- Kod xato / to'g'ri
  res := public.t2_yb_yuritish_v1(drv, gen_random_uuid(), jsonb_build_object('bron_id', bron1, 'harakat', 'yetkazdim', 'kod', 'abcd'));
  if (res ->> 'code') is distinct from 'KOD_NOTOGRI' then raise exception 'FAIL kod: %', res; end if;
  -- Kodni yuk egasi o'qiy oladi, tashuvchi lentasida/profilida yo'q
  kod := public.t2_yb_ol_v1(k, adm, 'yuk', jsonb_build_object('id', y1)) -> 'bron' ->> 'qabul_kod';
  if kod is null or kod !~ '^[0-9]{4}$' then raise exception 'FAIL qabul kodi'; end if;
  if (public.t2_yb_tashuvchi_ol_v1(drv, 'meniki', '{}')::text) like '%qabul_kod%' then raise exception 'FAIL kod tashuvchiga ochiq'; end if;
  res := public.t2_yb_yuritish_v1(drv, gen_random_uuid(), jsonb_build_object('bron_id', bron1, 'harakat', 'yetkazdim', 'kod', kod));
  if not (res ->> 'ok')::boolean or (res ->> 'holat') <> 'yetkazildi' then raise exception 'FAIL yetkazildi: %', res; end if;
  -- Tasdiq: begona kompaniya yopa olmaydi; ega yopadi; komissiya 3% (QQS siz 800000 -> 24000), tashuvchiga 896000 - 24000
  res := public.t2_yb_yuk_tasdiq_v1(k2, adm2, gen_random_uuid(), jsonb_build_object('yuk_id', y1));
  if (res ->> 'code') is distinct from 'NOT_FOUND' then raise exception 'FAIL begona tasdiq: %', res; end if;
  res := public.t2_yb_yuk_tasdiq_v1(k, adm, gen_random_uuid(), jsonb_build_object('yuk_id', y1));
  if not (res ->> 'ok')::boolean or (res ->> 'holat') <> 'yopildi' then raise exception 'FAIL tasdiq: %', res; end if;
  if (select holat from public.t2_yb_tolov where id = tolov1) <> 'chiqarish_sorovi'
     or (select komissiya_summa from public.t2_yb_tolov where id = tolov1) <> 24000
     or (select tashuvchiga_summa from public.t2_yb_tolov where id = tolov1) <> 872000 then
    raise exception 'FAIL komissiya: %', (select to_jsonb(t) from public.t2_yb_tolov t where id = tolov1);
  end if;
  res := public.t2_yb_tolov_hodisa_v1(gen_random_uuid(), jsonb_build_object('tolov_id', tolov1, 'hodisa', 'release_ok', 'provider_ref', 'R-1'));
  if (res ->> 'natija') <> 'chiqarildi' then raise exception 'FAIL release: %', res; end if;
  -- Baho (ikki tomonlama, bir marta)
  res := public.t2_yb_yuk_baho_v1(k, adm, gen_random_uuid(), jsonb_build_object('bron_id', bron1, 'ball', 5));
  if not (res ->> 'ok')::boolean then raise exception 'FAIL baho: %', res; end if;
  res := public.t2_yb_yuk_baho_v1(k, adm, gen_random_uuid(), jsonb_build_object('bron_id', bron1, 'ball', 4));
  if (res ->> 'code') is distinct from 'BAHO_BERILGAN' then raise exception 'FAIL qayta baho: %', res; end if;
  res := public.t2_yb_tashuvchi_baho_v1(drv, gen_random_uuid(), jsonb_build_object('bron_id', bron1, 'ball', 4));
  if not (res ->> 'ok')::boolean then raise exception 'FAIL tashuvchi baho: %', res; end if;
  select reyting_ortacha into rep from public.t2_yb_tashuvchi where id = tsh;
  if rep is distinct from 5.00 then raise exception 'FAIL reyting: %', rep; end if;

  -- 6. Qat'iy narxda bron + nizo: pul muzlaydi, moderator faqat superadmin
  res := public.t2_yb_yuk_saqla_v1(k, adm, gen_random_uuid(), jsonb_build_object('nom', '_Qum', 'a_nom', 'Toshkent', 'b_nom', 'Navoiy', 'tonna', 8, 'sana_dan', current_date, 'sana_gacha', current_date + 2,
    'narx_taklif_qqs_siz', 500000, 'tolov_shakli', 'otkazma', 'escrow', true));
  y2 := (res ->> 'id')::bigint;
  perform public.t2_yb_yuk_elon_v1(k, adm, gen_random_uuid(), jsonb_build_object('id', y2, 'versiya', 1));
  res := public.t2_yb_taklif_ber_v1(drv, gen_random_uuid(), jsonb_build_object('yuk_id', y2, 'harakat', 'bron', 'qqs_foiz', 0));
  if not (res ->> 'ok')::boolean or (res ->> 'holat') <> 'bron' then raise exception 'FAIL qat''iy bron: %', res; end if;
  bron2 := (res ->> 'bron_id')::bigint;
  select id into tolov2 from public.t2_yb_tolov where bron_id = bron2;
  if (select summa_jami from public.t2_yb_tolov where id = tolov2) <> 500000 then raise exception 'FAIL QQS siz tolovchi 0%% jami'; end if;
  perform public.t2_yb_tolov_hodisa_v1(gen_random_uuid(), jsonb_build_object('tolov_id', tolov2, 'hodisa', 'hold_ok'));
  perform public.t2_yb_dalil_qosh_v1(drv, gen_random_uuid(), jsonb_build_object('bron_id', bron2, 'tur', 'yuklash', 'r2_kalit', 'yuk/2/yuklash.jpg'));
  perform public.t2_yb_yuritish_v1(drv, gen_random_uuid(), jsonb_build_object('bron_id', bron2, 'harakat', 'yukladim'));
  res := public.t2_yb_yuk_nizo_v1(k, adm, gen_random_uuid(), jsonb_build_object('bron_id', bron2, 'sabab', 'Yuk kam keldi'));
  if not (res ->> 'ok')::boolean then raise exception 'FAIL nizo: %', res; end if;
  nizo1 := (res ->> 'nizo_id')::bigint;
  if (select holat from public.t2_yb_tolov where id = tolov2) <> 'muzlatilgan' or (select holat from public.t2_yb_yuk where id = y2) <> 'nizo' then raise exception 'FAIL nizo holatlari'; end if;
  begin perform public.t2_yb_nizo_hal_v1(adm, gen_random_uuid(), jsonb_build_object('nizo_id', nizo1, 'qaror', 'egaga')); raise exception 'FAIL moderator emas hal qildi';
  exception when sqlstate '42501' then null; end;
  select a.foydalanuvchi_id into sup from public.t2_azolik a where a.rol = 'superadmin' and a.holat = 'faol' order by a.id limit 1;
  if sup is null then
    raise notice 'superadmin topilmadi - nizo_hal funksional qismi o''tkazib yuborildi';
  else
    res := public.t2_yb_nizo_hal_v1(sup, gen_random_uuid(), jsonb_build_object('nizo_id', nizo1, 'qaror', 'egaga'));
    if not (res ->> 'ok')::boolean then raise exception 'FAIL nizo hal: %', res; end if;
    if (select holat from public.t2_yb_tolov where id = tolov2) <> 'qaytarish_sorovi' or (select holat from public.t2_yb_yuk where id = y2) <> 'bekor' then raise exception 'FAIL nizo egaga'; end if;
    res := public.t2_yb_tolov_hodisa_v1(gen_random_uuid(), jsonb_build_object('tolov_id', tolov2, 'hodisa', 'refund_ok'));
    if (res ->> 'natija') <> 'qaytarildi' then raise exception 'FAIL refund: %', res; end if;
  end if;

  -- 7. Tashuvchi bronni bekor qiladi: yuk qayta e'longa, bekor_soni oshadi, yuk egasi bekor qiladi
  res := public.t2_yb_yuk_saqla_v1(k, adm, gen_random_uuid(), jsonb_build_object('nom', '_Shag''al', 'a_nom', 'Toshkent', 'b_nom', 'Navoiy', 'tonna', 5, 'sana_dan', current_date, 'narx_taklif_qqs_siz', 300000));
  y3 := (res ->> 'id')::bigint;
  perform public.t2_yb_yuk_elon_v1(k, adm, gen_random_uuid(), jsonb_build_object('id', y3, 'versiya', 1));
  res := public.t2_yb_taklif_ber_v1(drv, gen_random_uuid(), jsonb_build_object('yuk_id', y3, 'harakat', 'bron'));
  bron2 := (res ->> 'bron_id')::bigint;
  res := public.t2_yb_bron_bekor_v1(drv, gen_random_uuid(), jsonb_build_object('bron_id', bron2));
  if (res ->> 'code') is distinct from 'SABAB_KERAK' then raise exception 'FAIL sabab: %', res; end if;
  res := public.t2_yb_bron_bekor_v1(drv, gen_random_uuid(), jsonb_build_object('bron_id', bron2, 'sabab', 'Mashina buzildi'));
  if not (res ->> 'ok')::boolean or (res ->> 'holat') <> 'elon' then raise exception 'FAIL bron bekor: %', res; end if;
  if (select bekor_soni from public.t2_yb_tashuvchi where id = tsh) <> 1 then raise exception 'FAIL bekor_soni'; end if;
  res := public.t2_yb_yuk_bekor_v1(k, adm, gen_random_uuid(), jsonb_build_object('yuk_id', y3));
  if not (res ->> 'ok')::boolean or (res ->> 'holat') <> 'bekor' then raise exception 'FAIL yuk bekor: %', res; end if;

  -- 8. Firma xodimi: tashuvchi profili firma uchun; kompaniya a'zosi (logistics.dispatch) nomidan ishlaydi, begona emas
  res := public.t2_yb_tashuvchi_saqla_v1(fx, gen_random_uuid(), jsonb_build_object('ism', '_Firma', 'kompaniya_id', k2, 'davlat_raqami', '01C333CC', 'yuk_t', 30));
  if not (res ->> 'ok')::boolean or (res ->> 'tur') <> 'firma' then raise exception 'FAIL firma: %', res; end if;
  ftsh := (res ->> 'tashuvchi_id')::bigint;
  begin perform public.t2_yb_tashuvchi_saqla_v1(drv2, gen_random_uuid(), jsonb_build_object('ism', '_X', 'kompaniya_id', k2)); raise exception 'FAIL begona firma profili';
  exception when sqlstate '42501' then null; end;
  res := public.t2_yb_yuk_saqla_v1(k, adm, gen_random_uuid(), jsonb_build_object('nom', '_Armatura', 'a_nom', 'Toshkent', 'b_nom', 'Navoiy', 'tonna', 12, 'sana_dan', current_date));
  y3 := (res ->> 'id')::bigint;
  perform public.t2_yb_yuk_elon_v1(k, adm, gen_random_uuid(), jsonb_build_object('id', y3, 'versiya', 1));
  res := public.t2_yb_taklif_ber_v1(adm2, gen_random_uuid(), jsonb_build_object('tashuvchi_id', ftsh, 'yuk_id', y3, 'narx_qqs_siz', 600000));
  if not (res ->> 'ok')::boolean then raise exception 'FAIL firma dispetcher taklifi: %', res; end if;
  begin perform public.t2_yb_taklif_ber_v1(drv, gen_random_uuid(), jsonb_build_object('tashuvchi_id', ftsh, 'yuk_id', y3, 'narx_qqs_siz', 1)); raise exception 'FAIL begona firma nomidan';
  exception when sqlstate '42501' then null; end;

  -- 9. Lenta egasi kontaktini ochmaydi; faqat ochiq yuklar
  if (public.t2_yb_tashuvchi_ol_v1(drv, 'lenta', '{}')::text) like '%kompaniya_id%' or (public.t2_yb_tashuvchi_ol_v1(drv, 'lenta', '{}')::text) like '%qabul_kod%' then raise exception 'FAIL lenta maxfiylik'; end if;
  if (select jsonb_array_length(public.t2_yb_tashuvchi_ol_v1(drv, 'lenta', '{}') -> 'yuklar')) < 1 then raise exception 'FAIL lenta bosh'; end if;
  -- Egasi faqat o'z kompaniyasini ko'radi
  begin perform public.t2_yb_ol_v1(k, adm2, 'yuklarim', '{}'); raise exception 'FAIL begona ol';
  exception when sqlstate '42501' then null; end;
  if (public.t2_yb_ol_v1(k, adm, 'yuk', jsonb_build_object('id', y3)) ->> 'ok') <> 'true' then raise exception 'FAIL yuk ol'; end if;

  -- 10. Muddat o'tgan e'lon
  res := public.t2_yb_yuk_saqla_v1(k, adm, gen_random_uuid(), jsonb_build_object('nom', '_Eski', 'a_nom', 'A', 'b_nom', 'B', 'tonna', 1, 'sana_dan', current_date - 5, 'sana_gacha', current_date - 1));
  y4 := (res ->> 'id')::bigint;
  perform public.t2_yb_yuk_elon_v1(k, adm, gen_random_uuid(), jsonb_build_object('id', y4, 'versiya', 1));
  res := public.t2_yb_muddat_v1();
  if (select holat from public.t2_yb_yuk where id = y4) <> 'muddat_tugadi' then raise exception 'FAIL muddat: %', res; end if;

  -- 11. Hodisa jurnali o'zgarmas
  begin update public.t2_yb_hodisa set tur = 'x' where yuk_id = y1; raise exception 'FAIL hodisa yangilandi';
  exception when sqlstate '42501' then null; end;
  begin delete from public.t2_yb_hodisa where yuk_id = y1; raise exception 'FAIL hodisa ochirildi';
  exception when sqlstate '42501' then null; end;
  if (select count(*) from public.t2_yb_hodisa where yuk_id = y1) < 6 then raise exception 'FAIL hodisalar kam'; end if;

  raise notice 'ACCEPT OK: yuk birjasi v1';
end $acc$;
rollback;
