-- ACCEPTANCE: 20261203000500 (hujjat eslatma cron v1) — BEGIN..ROLLBACK, faqat sintetik fixture (prodda iz qolmaydi).
-- Tekshiradi: pg_cron joblari (nom, jadval, buyruq); grantlar yopiq; cron buyruqlari xatosiz bajariladi;
-- Telegram navbati: faqat hujjat.*, faqat o'qilmagan/yangi; claim bir marta; xato → qayta urinish → xato_yakuniy;
-- yuborildi qayta ochilmaydi (hech qachon qayta yuborilmaydi); o'qilgan → otkazildi; osilib qolgan → nomalum (qayta yuborilmaydi).
begin;
do $acc$
declare
  k bigint; u bigint; ob bigint; b1 bigint; b2 bigint; b3 bigint; b4 bigint; b_eski bigint; res jsonb; n integer; h text; ur integer;
begin
  -- 1. pg_cron joblari
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if (select count(*) from cron.job where jobname = 't2-hujjat-eslatma-kunlik' and schedule = '0 3 * * *'
          and command = 'select public.t2_hujjat_eslatma_v1(2)' and active) <> 1 then raise exception 'FAIL job eslatma'; end if;
    if (select count(*) from cron.job where jobname = 't2-yb-muddat-kunlik' and schedule = '5 0 * * *'
          and command = 'select public.t2_yb_muddat_v1()' and active) <> 1 then raise exception 'FAIL job yb_muddat'; end if;
    if (select count(*) from cron.job where jobname = 't2-outbox-bildirishnoma' and schedule = '*/2 * * * *'
          and command like 'select public.t2_outbox_ishlov_v1(%' and active) <> 1 then raise exception 'FAIL job outbox'; end if;
    if (select count(*) from cron.job where jobname = 't2-bildirishnoma-tg-tozala' and active) <> 1 then raise exception 'FAIL job tozala'; end if;
    if not exists (select 1 from cron.job where jobname = 't2-obyekt-snapshot-kunlik') then raise exception 'FAIL snapshot job yo''qoldi'; end if;
  else
    raise warning 'pg_cron yoq — job tekshiruvi o''tkazib yuborildi';
  end if;

  -- 2. Grantlar
  if has_function_privilege('anon', 'public.t2_bildirishnoma_tg_navbat_v1(integer,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.t2_bildirishnoma_tg_navbat_v1(integer,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.t2_bildirishnoma_tg_natija_v1(jsonb,integer)', 'execute')
     or has_table_privilege('anon', 'public.t2_bildirishnoma_tg', 'select')
     or has_table_privilege('authenticated', 'public.t2_bildirishnoma_tg', 'select')
     or not has_function_privilege('service_role', 'public.t2_bildirishnoma_tg_navbat_v1(integer,integer)', 'execute')
     or not has_function_privilege('service_role', 'public.t2_bildirishnoma_tg_natija_v1(jsonb,integer)', 'execute') then
    raise exception 'FAIL grant';
  end if;

  -- 3. Cron buyruqlari xatosiz ishlaydi (tranzaksiya oxirida ROLLBACK)
  res := public.t2_hujjat_eslatma_v1(2);
  if not (res ->> 'ok')::boolean then raise exception 'FAIL eslatma: %', res; end if;
  res := public.t2_outbox_ishlov_v1('bildirishnoma', 500);
  if not (res ->> 'ok')::boolean then raise exception 'FAIL outbox ishlov: %', res; end if;

  -- Fixture
  insert into public.t2_kompaniya (nom, kod, faol) values ('_TEST_ESL_', gen_random_uuid()::text, true) returning id into k;
  insert into public.t2_foydalanuvchi (ism, login, email) values ('_esl', 'esl_' || gen_random_uuid(), 'esl_' || gen_random_uuid() || '@t.invalid') returning id into u;
  insert into public.t2_azolik (kompaniya_id, foydalanuvchi_id, rol, holat) values (k, u, 'admin', 'faol');
  insert into public.t2_outbox (kompaniya_id, mavzu, entity_jadval, entity_id, payload) values (k, 'hujjat.muddat_yaqin', 't2_xat', 1, '{"xat_id":1}') returning id into ob;
  insert into public.t2_bildirishnoma (foydalanuvchi_id, kompaniya_id, outbox_id, mavzu, sarlavha_kalit, parametrlar)
    values (u, k, ob, 'hujjat.muddat_yaqin', 'bildirishnoma.hujjat.muddat_yaqin', '{"xat_id":1}') returning id into b1;
  insert into public.t2_outbox (kompaniya_id, mavzu, entity_jadval, entity_id) values (k, 'hujjat.muddat_otdi', 't2_xat', 2) returning id into ob;
  insert into public.t2_bildirishnoma (foydalanuvchi_id, kompaniya_id, outbox_id, mavzu, sarlavha_kalit) values (u, k, ob, 'hujjat.muddat_otdi', 'x') returning id into b2;
  insert into public.t2_outbox (kompaniya_id, mavzu, entity_jadval, entity_id) values (k, 'hujjat.xat_keldi', 't2_xat', 3) returning id into ob;
  insert into public.t2_bildirishnoma (foydalanuvchi_id, kompaniya_id, outbox_id, mavzu, sarlavha_kalit) values (u, k, ob, 'hujjat.xat_keldi', 'x') returning id into b3;
  -- hujjat emas → navbatga tushmaydi
  insert into public.t2_outbox (kompaniya_id, mavzu, entity_jadval, entity_id) values (k, 'topshiriq.yaratildi', 't2_topshiriq', 4) returning id into ob;
  insert into public.t2_bildirishnoma (foydalanuvchi_id, kompaniya_id, outbox_id, mavzu, sarlavha_kalit) values (u, k, ob, 'topshiriq.yaratildi', 'x') returning id into b4;
  -- eski (3 kundan oldin) → navbatga tushmaydi
  insert into public.t2_outbox (kompaniya_id, mavzu, entity_jadval, entity_id) values (k, 'hujjat.xat_keldi', 't2_xat', 5) returning id into ob;
  insert into public.t2_bildirishnoma (foydalanuvchi_id, kompaniya_id, outbox_id, mavzu, sarlavha_kalit, yaratildi)
    values (u, k, ob, 'hujjat.xat_keldi', 'x', now() - interval '5 days') returning id into b_eski;

  -- 4. Birinchi claim: b1, b2, b3 olinadi (urinish 1), b4 va eski yo'q
  res := public.t2_bildirishnoma_tg_navbat_v1(200, 3);
  select count(*) into n from jsonb_array_elements(res -> 'qatorlar') e where (e ->> 'id')::bigint in (b1, b2, b3) and (e ->> 'urinish')::int = 1;
  if n <> 3 then raise exception 'FAIL birinchi claim: %', res; end if;
  if exists (select 1 from jsonb_array_elements(res -> 'qatorlar') e where (e ->> 'id')::bigint in (b4, b_eski)) then raise exception 'FAIL begona mavzu/eski claim'; end if;
  if exists (select 1 from public.t2_bildirishnoma_tg where bildirishnoma_id in (b4, b_eski)) then raise exception 'FAIL begona navbatga tushdi'; end if;
  if (select holat from public.t2_bildirishnoma_tg where bildirishnoma_id = b1) <> 'yuborilmoqda' then raise exception 'FAIL holat yuborilmoqda'; end if;
  if (select payload_tekshir from (select (e -> 'parametrlar' ->> 'xat_id') = '1' as payload_tekshir from jsonb_array_elements(res -> 'qatorlar') e where (e ->> 'id')::bigint = b1) s) is not true then
    raise exception 'FAIL parametrlar qaytmadi';
  end if;

  -- 5. Ikkinchi claim: olingan qatorlar qayta olinmaydi
  res := public.t2_bildirishnoma_tg_navbat_v1(200, 3);
  if exists (select 1 from jsonb_array_elements(res -> 'qatorlar') e where (e ->> 'id')::bigint in (b1, b2, b3)) then raise exception 'FAIL takror claim'; end if;

  -- 6. Natija: b1 yuborildi, b2 xato, b3 otkazildi; noto'g'ri yozuvlar e'tiborsiz
  res := public.t2_bildirishnoma_tg_natija_v1(jsonb_build_array(
    jsonb_build_object('id', b1, 'holat', 'yuborildi'),
    jsonb_build_object('id', b2, 'holat', 'xato', 'xato', 'HTTP_429'),
    jsonb_build_object('id', b3, 'holat', 'otkazildi', 'xato', 'ULANMAGAN'),
    jsonb_build_object('id', b4, 'holat', 'yuborildi'),
    jsonb_build_object('id', 'abc', 'holat', 'yuborildi'),
    jsonb_build_object('id', b1, 'holat', 'navbat')), 3);
  if (res ->> 'yangilandi')::int <> 3 then raise exception 'FAIL natija soni: %', res; end if;
  if (select holat from public.t2_bildirishnoma_tg where bildirishnoma_id = b1) <> 'yuborildi'
     or (select holat from public.t2_bildirishnoma_tg where bildirishnoma_id = b2) <> 'xato'
     or (select holat from public.t2_bildirishnoma_tg where bildirishnoma_id = b3) <> 'otkazildi' then raise exception 'FAIL natija holatlari'; end if;
  if (public.t2_bildirishnoma_tg_natija_v1('{"x":1}'::jsonb) ->> 'code') is distinct from 'ROYXAT' then raise exception 'FAIL royxat tekshiruvi'; end if;

  -- 7. Yuborilgan qayta ochilmaydi: «xato» natijasi yuborildi qatorini o'zgartirmaydi
  res := public.t2_bildirishnoma_tg_natija_v1(jsonb_build_array(jsonb_build_object('id', b1, 'holat', 'xato')), 3);
  if (res ->> 'yangilandi')::int <> 0 or (select holat from public.t2_bildirishnoma_tg where bildirishnoma_id = b1) <> 'yuborildi' then raise exception 'FAIL yuborildi qayta ochildi'; end if;

  -- 8. Qayta urinish: b2 (xato) qayta olinadi, b1/b3 olinmaydi; 3-urinishdan keyin xato_yakuniy
  res := public.t2_bildirishnoma_tg_navbat_v1(200, 3);
  if not exists (select 1 from jsonb_array_elements(res -> 'qatorlar') e where (e ->> 'id')::bigint = b2 and (e ->> 'urinish')::int = 2) then raise exception 'FAIL qayta urinish: %', res; end if;
  if exists (select 1 from jsonb_array_elements(res -> 'qatorlar') e where (e ->> 'id')::bigint in (b1, b3)) then raise exception 'FAIL yopilgan qayta olindi'; end if;
  perform public.t2_bildirishnoma_tg_natija_v1(jsonb_build_array(jsonb_build_object('id', b2, 'holat', 'xato')), 3);
  res := public.t2_bildirishnoma_tg_navbat_v1(200, 3);
  if not exists (select 1 from jsonb_array_elements(res -> 'qatorlar') e where (e ->> 'id')::bigint = b2 and (e ->> 'urinish')::int = 3) then raise exception 'FAIL 3-urinish'; end if;
  perform public.t2_bildirishnoma_tg_natija_v1(jsonb_build_array(jsonb_build_object('id', b2, 'holat', 'xato')), 3);
  select holat, urinish into h, ur from public.t2_bildirishnoma_tg where bildirishnoma_id = b2;
  if h <> 'xato_yakuniy' or ur <> 3 then raise exception 'FAIL xato_yakuniy: % %', h, ur; end if;
  res := public.t2_bildirishnoma_tg_navbat_v1(200, 3);
  if exists (select 1 from jsonb_array_elements(res -> 'qatorlar') e where (e ->> 'id')::bigint = b2) then raise exception 'FAIL xato_yakuniy qayta olindi'; end if;

  -- 9. O'qilgan bildirishnoma → otkazildi (Telegramga ketmaydi)
  insert into public.t2_outbox (kompaniya_id, mavzu, entity_jadval, entity_id) values (k, 'hujjat.tasdiqlandi', 't2_hujjat_zanjir', 6) returning id into ob;
  insert into public.t2_bildirishnoma (foydalanuvchi_id, kompaniya_id, outbox_id, mavzu, sarlavha_kalit) values (u, k, ob, 'hujjat.tasdiqlandi', 'x') returning id into b4;
  insert into public.t2_bildirishnoma_tg (bildirishnoma_id) values (b4);
  update public.t2_bildirishnoma set oqildi = now() where id = b4;
  res := public.t2_bildirishnoma_tg_navbat_v1(200, 3);
  if exists (select 1 from jsonb_array_elements(res -> 'qatorlar') e where (e ->> 'id')::bigint = b4) then raise exception 'FAIL o''qilgan claim qilindi'; end if;
  if (select holat from public.t2_bildirishnoma_tg where bildirishnoma_id = b4) <> 'otkazildi' then raise exception 'FAIL o''qilgan otkazildi emas'; end if;

  -- 10. Osilib qolgan «yuborilmoqda» → nomalum, qayta yuborilmaydi
  insert into public.t2_outbox (kompaniya_id, mavzu, entity_jadval, entity_id) values (k, 'hujjat.rad_etildi', 't2_hujjat_zanjir', 7) returning id into ob;
  insert into public.t2_bildirishnoma (foydalanuvchi_id, kompaniya_id, outbox_id, mavzu, sarlavha_kalit) values (u, k, ob, 'hujjat.rad_etildi', 'x') returning id into b4;
  insert into public.t2_bildirishnoma_tg (bildirishnoma_id, holat, urinish, yangilandi) values (b4, 'yuborilmoqda', 1, now() - interval '1 hour');
  res := public.t2_bildirishnoma_tg_navbat_v1(200, 3);
  if exists (select 1 from jsonb_array_elements(res -> 'qatorlar') e where (e ->> 'id')::bigint = b4) then raise exception 'FAIL osilgan qayta yuborildi'; end if;
  if (select holat from public.t2_bildirishnoma_tg where bildirishnoma_id = b4) <> 'nomalum' then raise exception 'FAIL nomalum'; end if;

  raise notice 'ACCEPTANCE 20261203000500 OK';
end $acc$;
rollback;
