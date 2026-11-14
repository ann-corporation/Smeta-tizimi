-- ACCEPTANCE: 20261216410000 (logistika yuk P2) - BEGIN..ROLLBACK, FAQAT sintetik fixture. Avval 20261201000000 va 20261216400000 qo'llangan bo'lishi shart.
-- Tekshiradi: grantlar; firma haydovchisi qo'shish; tayinlash — faqat shu haydovchi qadam/joy/isbot qiladi, boshqa haydovchi va dispetcher rad; firma hamma reysni ko'radi;
-- o'z yukini qabul qilish taqiqi; auktsion (2 taklif -> bittasi tanlanadi -> bitta bron); buyurtmaga bog'langan yetkazish -> bitta qabul so'rovi (idempotent);
-- iz arxivi (iz bo'shaydi, R2 kalit/masofa qoladi); bekor yozuvi + hisoblagich; narx defaultlari; yakka foydalanuvchi (kompaniyasiz) profil yarata oladi, kompaniya ma'lumotini o'qiy olmaydi.
-- JSON tekshiruvlari tuzilma bo'yicha (kalit/qiymat), matn regex emas.
begin;
do $acc$
declare
  k bigint; kf bigint; ks bigint; adm bigint; fx bigint; d1 bigint; d2 bigint; ext bigint; ind bigint; ext2 bigint; l1 text; l2 text;
  tf bigint; te bigint; te2 bigint; ta bigint; y1 bigint; y2 bigint; y3 bigint; ver int; res jsonb; op uuid; n int; b1 bigint; b2 bigint; al bigint; by1 bigint; t0 timestamptz;
  m2 bigint; tk1 bigint; tk2 bigint; ys bigint; ok boolean;
begin
  insert into public.t2_kompaniya (nom, kod, faol) values ('_P2_SHIPPER_', gen_random_uuid()::text, true) returning id into k;
  insert into public.t2_kompaniya (nom, kod, faol) values ('_P2_FIRMA_', gen_random_uuid()::text, true) returning id into kf;
  insert into public.t2_kompaniya (nom, kod, faol, turi) values ('_P2_SHAXSIY_', gen_random_uuid()::text, true, 'shaxsiy') returning id into ks;
  l1 := 'p2_d1_' || gen_random_uuid(); l2 := 'p2_d2_' || gen_random_uuid();
  insert into public.t2_foydalanuvchi (ism, login, email) values ('_adm', 'p2_a_' || gen_random_uuid(), 'p2_a_' || gen_random_uuid() || '@t.invalid') returning id into adm;
  insert into public.t2_foydalanuvchi (ism, login, email) values ('_fx', 'p2_f_' || gen_random_uuid(), 'p2_f_' || gen_random_uuid() || '@t.invalid') returning id into fx;
  insert into public.t2_foydalanuvchi (ism, login, email) values ('_d1', l1, 'p2_d1_' || gen_random_uuid() || '@t.invalid') returning id into d1;
  insert into public.t2_foydalanuvchi (ism, login, email) values ('_d2', l2, 'p2_d2_' || gen_random_uuid() || '@t.invalid') returning id into d2;
  insert into public.t2_foydalanuvchi (ism, login, email) values ('_ext', 'p2_e_' || gen_random_uuid(), 'p2_e_' || gen_random_uuid() || '@t.invalid') returning id into ext;
  insert into public.t2_foydalanuvchi (ism, login, email) values ('_ext2', 'p2_e2_' || gen_random_uuid(), 'p2_e2_' || gen_random_uuid() || '@t.invalid') returning id into ext2;
  insert into public.t2_foydalanuvchi (ism, login, email) values ('_ind', 'p2_i_' || gen_random_uuid(), 'p2_i_' || gen_random_uuid() || '@t.invalid') returning id into ind;
  insert into public.t2_azolik (kompaniya_id, foydalanuvchi_id, rol, holat) values (k, adm, 'admin', 'faol'), (kf, fx, 'taminotchi', 'faol'), (kf, d1, 'usta', 'faol'), (kf, d2, 'usta', 'faol'), (ks, ind, 'admin', 'faol');

  -- 1. Grantlar
  if has_function_privilege('anon', 'public.t2_yb_p2_qadam_v1(bigint,uuid,jsonb)', 'execute') or has_function_privilege('authenticated', 'public.t2_yb_p2_tayinla_v1(bigint,uuid,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.t2_yb_p2_iz_arxivla_v1(bigint,bigint,text)', 'execute') or has_function_privilege('authenticated', 'public.t2_yb_p2_sozlama_saqla_v1(bigint,uuid,jsonb)', 'execute')
     or has_table_privilege('anon', 'public.t2_yb_haydovchi', 'select') or has_table_privilege('authenticated', 'public.t2_yb_bekor', 'select')
     or not has_function_privilege('service_role', 'public.t2_yb_p2_reys_v1(bigint)', 'execute') then raise exception 'FAIL grant'; end if;

  -- 2. Narx defaultlari (tuzilma)
  select qiymat into res from public.t2_yb_sozlama where kalit = 'narx_km_sinf';
  if jsonb_typeof(res) <> 'object' or jsonb_typeof(res -> 'katta') <> 'number' or jsonb_typeof((select qiymat from public.t2_yb_sozlama where kalit = 'narx_baza')) <> 'number' then raise exception 'FAIL narx default'; end if;
  begin perform public.t2_yb_p2_sozlama_saqla_v1(adm, gen_random_uuid(), '{"kalit":"narx_baza","qiymat":1}'); raise exception 'FAIL oddiy foydalanuvchi sozlama yozdi';
  exception when sqlstate '42501' then null; end;

  -- 3. Firma profili, mashinalar, haydovchilar
  res := public.t2_yb_tashuvchi_saqla_v1(fx, gen_random_uuid(), jsonb_build_object('ism', '_Firma', 'kompaniya_id', kf, 'davlat_raqami', '01F1AAA', 'yuk_t', 10));
  tf := (res ->> 'tashuvchi_id')::bigint;
  res := public.t2_yb_tashuvchi_saqla_v1(fx, gen_random_uuid(), jsonb_build_object('ism', '_Firma', 'kompaniya_id', kf, 'davlat_raqami', '01F2BBB', 'yuk_t', 20));
  m2 := (res ->> 'mashina_id')::bigint;
  res := public.t2_yb_p2_haydovchi_qosh_v1(fx, gen_random_uuid(), jsonb_build_object('login', l1));
  if not (res ->> 'ok')::boolean then raise exception 'FAIL haydovchi qosh: %', res; end if;
  res := public.t2_yb_p2_haydovchi_qosh_v1(fx, gen_random_uuid(), jsonb_build_object('login', (select login from public.t2_foydalanuvchi where id = ext)));
  if (res ->> 'code') is distinct from 'FIRMA_AZOSI_EMAS' then raise exception 'FAIL begona haydovchi qo''shildi: %', res; end if;
  res := public.t2_yb_p2_park_ol_v1(fx, '{}');
  if jsonb_array_length(res -> 'haydovchilar') <> 1 or jsonb_array_length(res -> 'mashinalar') <> 2 then raise exception 'FAIL park: %', res; end if;
  -- yakka haydovchi (kompaniyasiz) — profil yarata oladi
  res := public.t2_yb_tashuvchi_saqla_v1(ext, gen_random_uuid(), '{"ism":"_Ext","davlat_raqami":"01E1AAA","yuk_t":10}');
  te := (res ->> 'tashuvchi_id')::bigint;
  res := public.t2_yb_tashuvchi_saqla_v1(ext2, gen_random_uuid(), '{"ism":"_Ext2","davlat_raqami":"01E2BBB","yuk_t":10}');
  te2 := (res ->> 'tashuvchi_id')::bigint;
  res := public.t2_yb_p2_haydovchi_qosh_v1(ext, gen_random_uuid(), jsonb_build_object('login', l2));
  if (res ->> 'code') is distinct from 'FAQAT_FIRMA' then raise exception 'FAIL yakka haydovchi park qo''shdi: %', res; end if;
  -- yuk egasining o'z tashuvchi profili (o'z yukini qabul qilish sinovi uchun)
  res := public.t2_yb_tashuvchi_saqla_v1(adm, gen_random_uuid(), '{"ism":"_Adm","davlat_raqami":"01A1AAA","yuk_t":10}');
  ta := (res ->> 'tashuvchi_id')::bigint;

  -- 4. Yuk (qat'iy narx) + e'lon
  res := public.t2_yb_yuk_saqla_v1(k, adm, gen_random_uuid(), jsonb_build_object('nom', '_Sement', 'a_nom', 'A', 'b_nom', 'B', 'masofa_km', 420, 'tonna', 8, 'sana_dan', current_date + 1, 'sana_gacha', current_date + 3, 'tolov_shakli', 'otkazma', 'narx_taklif_qqs_siz', 900000));
  y1 := (res ->> 'id')::bigint; ver := (res ->> 'versiya')::int;
  update public.t2_yb_yuk set a_lat = 41.311, a_lng = 69.279, b_lat = 40.103, b_lng = 65.372 where id = y1;
  res := public.t2_yb_yuk_elon_v1(k, adm, gen_random_uuid(), jsonb_build_object('id', y1, 'versiya', ver));
  if not (res ->> 'ok')::boolean then raise exception 'FAIL elon: %', res; end if;
  -- o'z yukini qabul qilish taqiqi
  res := public.t2_yb_p2_qabul_v1(adm, gen_random_uuid(), jsonb_build_object('yuk_id', y1, 'harakat', 'bron'));
  if (res ->> 'code') is distinct from 'OZ_YUKI' then raise exception 'FAIL o''z yukini qabul qildi: %', res; end if;
  -- firma qabul qiladi
  res := public.t2_yb_p2_qabul_v1(fx, gen_random_uuid(), jsonb_build_object('yuk_id', y1, 'harakat', 'bron', 'tashuvchi_id', tf));
  if not (res ->> 'ok')::boolean then raise exception 'FAIL firma qabul: %', res; end if;
  select id into b1 from public.t2_yb_bron where yuk_id = y1 and holat <> 'bekor';

  -- 5. Tayinlash
  res := public.t2_yb_p2_tayinla_v1(fx, gen_random_uuid(), jsonb_build_object('bron_id', b1, 'haydovchi_id', d2));
  if (res ->> 'code') is distinct from 'HAYDOVCHI_FIRMANIKI_EMAS' then raise exception 'FAIL firmasiz haydovchi tayinlandi: %', res; end if;
  res := public.t2_yb_p2_tayinla_v1(fx, gen_random_uuid(), jsonb_build_object('bron_id', b1, 'haydovchi_id', d1, 'mashina_id', m2));
  if not (res ->> 'ok')::boolean then raise exception 'FAIL tayinla: %', res; end if;
  if (select haydovchi_id from public.t2_yb_bron where id = b1) <> d1 or (select mashina_id from public.t2_yb_bron where id = b1) <> m2 then raise exception 'FAIL tayinlash yozilmadi'; end if;

  -- 6. Faqat tayinlangan haydovchi: boshqa haydovchi, dispetcher va begona rad
  res := public.t2_yb_p2_qadam_v1(d2, gen_random_uuid(), jsonb_build_object('bron_id', b1, 'qadam', 'keldi'));
  if (res ->> 'code') is distinct from 'BRON_TOPILMADI' then raise exception 'FAIL boshqa haydovchi qadam qildi: %', res; end if;
  res := public.t2_yb_p2_qadam_v1(fx, gen_random_uuid(), jsonb_build_object('bron_id', b1, 'qadam', 'keldi'));
  if (res ->> 'code') is distinct from 'BRON_TOPILMADI' then raise exception 'FAIL dispetcher tayinlangan reysda qadam qildi: %', res; end if;
  res := public.t2_yb_p2_qadam_v1(ext, gen_random_uuid(), jsonb_build_object('bron_id', b1, 'qadam', 'keldi'));
  if (res ->> 'code') is distinct from 'BRON_TOPILMADI' then raise exception 'FAIL begona qadam qildi: %', res; end if;
  res := public.t2_yb_p2_qadam_v1(d1, gen_random_uuid(), jsonb_build_object('bron_id', b1, 'qadam', 'yolda'));
  if (res ->> 'code') is distinct from 'QADAM_TARTIB' then raise exception 'FAIL tartib: %', res; end if;
  res := public.t2_yb_p2_qadam_v1(d1, gen_random_uuid(), jsonb_build_object('bron_id', b1, 'qadam', 'keldi'));
  if not (res ->> 'ok')::boolean then raise exception 'FAIL keldi: %', res; end if;
  res := public.t2_yb_p2_qadam_v1(d1, gen_random_uuid(), jsonb_build_object('bron_id', b1, 'qadam', 'yuklandi'));
  if (res ->> 'code') is distinct from 'DALIL_KERAK' then raise exception 'FAIL dalilsiz yuklandi: %', res; end if;
  res := public.t2_yb_p2_dalil_v1(d2, gen_random_uuid(), jsonb_build_object('bron_id', b1, 'tur', 'yuklash', 'r2_kalit', 'yb/u1/x.jpg'));
  if (res ->> 'code') is distinct from 'BRON_TOPILMADI' then raise exception 'FAIL boshqa haydovchi dalil qo''shdi: %', res; end if;
  res := public.t2_yb_p2_dalil_v1(d1, gen_random_uuid(), jsonb_build_object('bron_id', b1, 'tur', 'yuklash', 'r2_kalit', 'yb/u1/yuklash.jpg'));
  if not (res ->> 'ok')::boolean then raise exception 'FAIL dalil: %', res; end if;
  res := public.t2_yb_p2_qadam_v1(d1, gen_random_uuid(), jsonb_build_object('bron_id', b1, 'qadam', 'yuklandi'));
  if not (res ->> 'ok')::boolean then raise exception 'FAIL yuklandi: %', res; end if;
  -- joy: tayinlangan haydovchi yozadi (bitta qator), dispetcher yozolmaydi
  res := public.t2_yb_p2_joy_v1(fx, jsonb_build_object('bron_id', b1, 'lat', 41.3, 'lng', 69.2));
  if (res ->> 'code') is distinct from 'BRON_TOPILMADI' then raise exception 'FAIL dispetcher joy yozdi: %', res; end if;
  res := public.t2_yb_p2_joy_v1(d1, jsonb_build_object('bron_id', b1, 'lat', 41.30, 'lng', 69.25));
  res := public.t2_yb_p2_joy_v1(d1, jsonb_build_object('bron_id', b1, 'lat', 41.20, 'lng', 69.00));
  select count(*) into n from public.t2_yb_joy where bron_id = b1;
  if n <> 1 or (res ->> 'iz_soni')::int <> 2 then raise exception 'FAIL joy: % %', n, res; end if;
  res := public.t2_yb_p2_qadam_v1(d1, gen_random_uuid(), jsonb_build_object('bron_id', b1, 'qadam', 'yolda'));
  if not (res ->> 'ok')::boolean then raise exception 'FAIL yolda: %', res; end if;

  -- 7. Reyslar ko'rinishi: haydovchi o'zinikini, firma hammasini, begona hech narsani
  res := public.t2_yb_p2_reys_v1(d1);
  if jsonb_array_length(res -> 'bronlar') <> 1 or (res #>> '{bronlar,0,mening}') <> 'true' then raise exception 'FAIL d1 reys: %', res; end if;
  res := public.t2_yb_p2_reys_v1(d2);
  if jsonb_array_length(res -> 'bronlar') <> 0 then raise exception 'FAIL d2 boshqa reysni ko''rdi: %', res; end if;
  res := public.t2_yb_p2_reys_v1(fx);
  if jsonb_array_length(res -> 'bronlar') <> 1 or (res #>> '{bronlar,0,mening}') <> 'false' then raise exception 'FAIL firma reys: %', res; end if;
  res := public.t2_yb_p2_reys_v1(ext2);
  if jsonb_array_length(res -> 'bronlar') <> 0 then raise exception 'FAIL begona reys ko''rdi: %', res; end if;

  -- 8. Yetkazish + buyurtmaga bog'langan qabul so'rovi (bir marta, idempotent)
  insert into public.t2_tomon_aloqa (taklif_kompaniya_id, qabul_kompaniya_id, taklif_rol, qabul_rol, turi, holat, taklif_actor_id) values (k, kf, 'buyurtmachi', 'yetkazuvchi', 'shartnoma', 'faol', adm) returning id into al;
  insert into public.t2_buyurtma (kompaniya_id, ijrochi_kompaniya_id, aloqa_id, tur, operation_id, yaratdi_actor_id) values (k, kf, al, 'material', gen_random_uuid(), adm) returning id into by1;
  update public.t2_yb_yuk set buyurtma_id = by1 where id = y1;
  res := public.t2_yb_p2_qadam_v1(d1, gen_random_uuid(), jsonb_build_object('bron_id', b1, 'qadam', 'yetkazdi', 'qabul_nom', '_Qabul'));
  if (res ->> 'code') is distinct from 'DALIL_KERAK' then raise exception 'FAIL dalilsiz yetkazdi: %', res; end if;
  res := public.t2_yb_p2_dalil_v1(d1, gen_random_uuid(), jsonb_build_object('bron_id', b1, 'tur', 'yetkazish', 'r2_kalit', 'yb/u1/yetkazish.jpg'));
  op := gen_random_uuid();
  res := public.t2_yb_p2_qadam_v1(d1, op, jsonb_build_object('bron_id', b1, 'qadam', 'yetkazdi', 'qabul_nom', '_Qabul'));
  if not (res ->> 'ok')::boolean then raise exception 'FAIL yetkazdi: %', res; end if;
  select qabul_so_rov_vaqt into t0 from public.t2_yb_yuk where id = y1;
  if t0 is null then raise exception 'FAIL qabul so''rovi yo''q'; end if;
  res := public.t2_yb_p2_qadam_v1(d1, op, jsonb_build_object('bron_id', b1, 'qadam', 'yetkazdi', 'qabul_nom', '_Qabul'));
  if not coalesce((res ->> 'takror')::boolean, false) then raise exception 'FAIL idempotentlik: %', res; end if;
  res := public.t2_yb_p2_qadam_v1(d1, gen_random_uuid(), jsonb_build_object('bron_id', b1, 'qadam', 'yetkazdi', 'qabul_nom', 'X'));
  if (res ->> 'code') is distinct from 'QADAM_TARTIB' then raise exception 'FAIL ikkinchi yetkazdi: %', res; end if;
  if (select qabul_so_rov_vaqt from public.t2_yb_yuk where id = y1) is distinct from t0 then raise exception 'FAIL qabul so''rovi qayta yozildi'; end if;
  select count(*) into n from public.t2_yb_hodisa where bron_id = b1 and tur = 'yetkazildi';
  if n <> 1 then raise exception 'FAIL yetkazildi hodisasi % ta', n; end if;
  if (select holat from public.t2_yb_yuk where id = y1) <> 'yetkazildi' then raise exception 'FAIL yuk holati'; end if;

  res := public.t2_yb_p2_buyurtma_yuklar_v1(k, adm, array[by1]);
  if jsonb_array_length(res -> 'yuklar') <> 1 or (res #>> '{yuklar,0,holat}') <> 'yetkazildi' or not (res #>> '{yuklar,0,qabul_so_rov}')::boolean then raise exception 'FAIL buyurtma yuklar: %', res; end if;
  begin perform public.t2_yb_p2_buyurtma_yuklar_v1(k, ext, array[by1]); raise exception 'FAIL begona buyurtma yuklarini oldi'; exception when sqlstate '42501' then null; end;

  -- 9. Iz arxivi
  res := public.t2_yb_p2_iz_ol_v1(d2, b1);
  if (res ->> 'code') is distinct from 'BRON_TOPILMADI' then raise exception 'FAIL begona iz oldi: %', res; end if;
  res := public.t2_yb_p2_iz_ol_v1(d1, b1);
  if jsonb_typeof(res -> 'iz') <> 'array' or jsonb_array_length(res -> 'iz') < 2 then raise exception 'FAIL iz ol: %', res; end if;
  res := public.t2_yb_p2_iz_arxivla_v1(d1, b1, 'noto''g''ri/kalit');
  if (res ->> 'code') is distinct from 'R2_KALIT_NOTOGRI' then raise exception 'FAIL r2 kalit: %', res; end if;
  res := public.t2_yb_p2_iz_arxivla_v1(d1, b1, 'yb/iz/test-bron.json.gz');
  if not (res ->> 'ok')::boolean or (res ->> 'iz_km')::numeric <= 0 then raise exception 'FAIL arxivla: %', res; end if;
  if not (select arxivlandi from public.t2_yb_joy where bron_id = b1) or (select jsonb_array_length(iz) from public.t2_yb_joy where bron_id = b1) <> 0
     or (select iz_r2_kalit from public.t2_yb_joy where bron_id = b1) is distinct from 'yb/iz/test-bron.json.gz' or (select iz_nuqta_soni from public.t2_yb_joy where bron_id = b1) < 2 then raise exception 'FAIL arxiv holati'; end if;
  res := public.t2_yb_p2_iz_arxivla_v1(d1, b1, 'yb/iz/test-bron.json.gz');
  if not coalesce((res ->> 'takror')::boolean, false) then raise exception 'FAIL arxiv takror: %', res; end if;
  res := public.t2_yb_p2_ega_kuzat_v1(k, adm, y1);
  if not (res #>> '{joy,arxivlandi}')::boolean or jsonb_typeof(res #> '{joy,iz}') <> 'array' or jsonb_array_length(res #> '{joy,iz}') <> 0 or (res #>> '{bron,haydovchi}') is distinct from '_d1' then raise exception 'FAIL ega_kuzat p2: %', res; end if;

  -- 10. Auktsion: 2 taklif -> bittasi tanlanadi -> bitta bron
  res := public.t2_yb_yuk_saqla_v1(k, adm, gen_random_uuid(), jsonb_build_object('nom', '_Gisht', 'a_nom', 'A', 'b_nom', 'B', 'masofa_km', 420, 'tonna', 5, 'sana_dan', current_date + 1, 'sana_gacha', current_date + 3, 'tolov_shakli', 'otkazma'));
  y2 := (res ->> 'id')::bigint; ver := (res ->> 'versiya')::int;
  update public.t2_yb_yuk set a_lat = 41.2, a_lng = 69.2 where id = y2;
  perform public.t2_yb_p1_yuk_qosh_v1(k, adm, gen_random_uuid(), jsonb_build_object('yuk_id', y2, 'narx_rejim', 'taklif'));
  res := public.t2_yb_yuk_elon_v1(k, adm, gen_random_uuid(), jsonb_build_object('id', y2, 'versiya', ver));
  if not (res ->> 'ok')::boolean then raise exception 'FAIL elon 2: %', res; end if;
  res := public.t2_yb_p2_qabul_v1(ext, gen_random_uuid(), jsonb_build_object('yuk_id', y2, 'harakat', 'bron'));
  if (res ->> 'code') is distinct from 'REJIM_TAKLIF' then raise exception 'FAIL auktsionda bron: %', res; end if;
  res := public.t2_yb_p2_qabul_v1(ext, gen_random_uuid(), jsonb_build_object('yuk_id', y2, 'harakat', 'taklif', 'narx_qqs_siz', 700000));
  if not (res ->> 'ok')::boolean then raise exception 'FAIL taklif 1: %', res; end if;
  res := public.t2_yb_p2_qabul_v1(ext2, gen_random_uuid(), jsonb_build_object('yuk_id', y2, 'harakat', 'taklif', 'narx_qqs_siz', 650000));
  if not (res ->> 'ok')::boolean then raise exception 'FAIL taklif 2: %', res; end if;
  select id into tk1 from public.t2_yb_taklif where yuk_id = y2 and tashuvchi_id = te; select id into tk2 from public.t2_yb_taklif where yuk_id = y2 and tashuvchi_id = te2;
  res := public.t2_yb_yuk_javob_v1(k, adm, gen_random_uuid(), jsonb_build_object('yuk_id', y2, 'taklif_id', tk2, 'harakat', 'qabul'));
  if not (res ->> 'ok')::boolean then raise exception 'FAIL taklif tanlash: %', res; end if;
  select count(*) into n from public.t2_yb_bron where yuk_id = y2 and holat <> 'bekor';
  if n <> 1 or (select tashuvchi_id from public.t2_yb_bron where yuk_id = y2 and holat <> 'bekor') <> te2 then raise exception 'FAIL auktsion bron soni %', n; end if;
  if (select holat from public.t2_yb_taklif where id = tk1) = 'qabul' then raise exception 'FAIL yutqazgan taklif qabul'; end if;

  -- 11. Bekor qilish ma'lumot sifatida (firma, sabab kodi) + hisoblagich
  select id into b2 from public.t2_yb_bron where yuk_id = y2 and holat <> 'bekor';
  res := public.t2_yb_bron_bekor_v1(ext2, gen_random_uuid(), jsonb_build_object('bron_id', b2, 'sabab', 'Mashina buzildi'));
  if not (res ->> 'ok')::boolean then raise exception 'FAIL bekor: %', res; end if;
  if (select kim from public.t2_yb_bekor where bron_id = b2) <> 'tashuvchi' or (select sabab_kod from public.t2_yb_bekor where bron_id = b2) <> 'mashina_buzildi'
     or (select count(*) from public.t2_yb_bekor where bron_id = b2) <> 1 or (select bekor_soni from public.t2_yb_tashuvchi where id = te2) <> 1 then raise exception 'FAIL bekor yozuvi'; end if;

  -- 12. Yakka foydalanuvchi: kompaniyasiz profil yaratdi (yuqorida); kompaniya ma'lumotini o'qiy/yoza olmaydi; shaxsiy kompaniyasi bilan yuk yarata oladi
  begin perform public.t2_yb_p2_ega_kuzat_v1(k, ext, y1); raise exception 'FAIL kompaniyasiz foydalanuvchi kuzatdi'; exception when sqlstate '42501' then null; end;
  begin perform public.t2_yb_ol_v1(k, ext, 'yuklarim', '{}'); raise exception 'FAIL kompaniyasiz foydalanuvchi yuklarni o''qidi'; exception when sqlstate '42501' then null; end;
  begin perform public.t2_yb_yuk_saqla_v1(k, ext, gen_random_uuid(), '{"nom":"X"}'); raise exception 'FAIL kompaniyasiz foydalanuvchi yuk yozdi'; exception when sqlstate '42501' then null; end;
  res := public.t2_yb_yuk_saqla_v1(ks, ind, gen_random_uuid(), '{"nom":"_Shaxsiy yuk","tonna":1}');
  if not (res ->> 'ok')::boolean then raise exception 'FAIL shaxsiy kompaniya yuk yaratmadi: %', res; end if;
  ys := (res ->> 'id')::bigint;
  res := public.t2_yb_p2_ega_kuzat_v1(ks, ind, ys);
  if jsonb_typeof(res) <> 'object' or jsonb_exists(res, 'qatorlar') then raise exception 'FAIL ega_kuzat shakli'; end if;
  res := public.t2_yb_p2_ega_kuzat_v1(ks, ind, y1);
  if (res ->> 'code') is distinct from 'YUK_TOPILMADI' then raise exception 'FAIL shaxsiy kompaniya boshqa yukni ko''rdi: %', res; end if;

  raise notice 'ACCEPTANCE OK: 20261216410000';
end $acc$;
rollback;
