-- Qabul: 20261203000600 — ish kartasi v1. Migratsiya qo'llangandan KEYIN (yoki shu BEGIN ichida undan keyin) ishga tushiriladi.
-- FAQAT sintetik fixture (o'zi yaratadi), oxirida ROLLBACK — prodda iz qolmaydi. Muvaffaqiyat: NOTICE 'ISH_KARTASI_ACCEPTANCE_PASS'.
-- Tekshiradi: RLS/grant yopiqligi; o'qish (kartalar / qatorlar + qo'shnilar / qidiruv) faqat o'z kompaniyasi va faol qatorlar;
-- tarkibli karta (asosiy + armatura materiali + MANFIY istisno qatori) ishora va NULL koef bilan saqlanadi; tenant izolyatsiyasi
-- (begona kompaniya qatori, begona aktor); CAS (STALE_VERSION); idempotentlik; nom bandligi; ulush yig'indisi 100; qamrov/parametr
-- validatsiyasi; arxiv; versiya qo'riqchisi bo'sh.
begin;
do $test$
declare c bigint; a bigint; c2 bigint; a2 bigint; o bigint; o2 bigint; rz bigint; bl bigint; arm bigint; ist bigint; zak bigint; boshqa bigint; begona bigint;
  v jsonb; op uuid; kid bigint; ver int; n int;
begin
  select kompaniya_id, foydalanuvchi_id into c, a from public.t2_azolik
   where holat = 'faol' and public.t2_permission_allowed_v2(kompaniya_id, foydalanuvchi_id, 'smeta.write')
     and public.t2_permission_allowed_v2(kompaniya_id, foydalanuvchi_id, 'smeta.read') order by id limit 1;
  if a is null then raise exception 'ACCEPTANCE_ACTOR_REQUIRED'; end if;

  -- 0) Tuzilma, RLS, grantlar.
  if to_regclass('public.t2_ish_kartasi') is null or to_regclass('public.t2_ish_kartasi_bog') is null
     or to_regclass('public.t2_ish_kartasi_bosqich_ulush') is null or to_regclass('public.t2_ish_kartasi_operation') is null then
    raise exception '0: jadval yo''q';
  end if;
  if exists (select 1 from pg_class where oid in ('public.t2_ish_kartasi'::regclass, 'public.t2_ish_kartasi_bog'::regclass,
              'public.t2_ish_kartasi_bosqich_ulush'::regclass, 'public.t2_ish_kartasi_operation'::regclass) and not relrowsecurity) then
    raise exception '0: RLS yo''q';
  end if;
  if has_table_privilege('anon', 'public.t2_ish_kartasi', 'select') or has_table_privilege('authenticated', 'public.t2_ish_kartasi_bog', 'select')
     or has_function_privilege('anon', 'public.t2_ish_kartasi_ol_v1(bigint,bigint,text,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.t2_ish_kartasi_saqla_v1(bigint,bigint,uuid,bigint,integer,jsonb,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.t2_ish_kartasi_ulush_saqla_v1(bigint,bigint,uuid,text,jsonb,integer)', 'execute')
     or not has_function_privilege('service_role', 'public.t2_ish_kartasi_ol_v1(bigint,bigint,text,jsonb)', 'execute') then
    raise exception '0: grant ochiq/yopiq noto''g''ri';
  end if;
  if (select provolatile from pg_proc where oid = 'public.t2_ish_kartasi_ol_v1(bigint,bigint,text,jsonb)'::regprocedure) <> 's' then
    raise exception '0: o''qish funksiyasi STABLE emas (/api/sb GET)';
  end if;

  -- 1) Sintetik smeta: RZ → asosiy BL (100М3) + armatura materiali (Т) + MANFIY istisno BL + zakladnoy BL + begona ish BL.
  insert into public.t2_kompaniya (nom, kod, faol) values ('_TEST_IK2_', gen_random_uuid()::text, true) returning id into c2;
  insert into public.t2_foydalanuvchi (ism, login, email) values ('_ik2', 'ik2_' || gen_random_uuid(), 'ik2_' || gen_random_uuid() || '@t.invalid') returning id into a2;
  insert into public.t2_azolik (kompaniya_id, foydalanuvchi_id, rol, holat) values (c2, a2, 'admin', 'faol');
  insert into public.t2_obyekt (nom, kompaniya_id) values ('_TEST_IK_O1_', c) returning id into o;
  insert into public.t2_obyekt (nom, kompaniya_id) values ('_TEST_IK_O2_', c2) returning id into o2;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, nom, daraja, tartib) values (o, c, 'rz', '_TEST_IK_RZ', 0, 1) returning id into rz;
  insert into public.t2_qator (obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm, daraja, tartib)
    values (o, c, rz, 'bl', '_T-1-1', '_TEST_IK УСТРОЙСТВО РИГЕЛЕЙ', '100М3', 0.5, 1, 2) returning id into bl;
  insert into public.t2_qator (obyekt_id, kompaniya_id, ota_id, tur, kat, nom, birlik, norma, hajm, narx, summa, daraja, tartib) values
    (o, c, bl, 'rs', 'ЧЕЛ', '_TEST_IK ЗАТРАТЫ ТРУДА', 'ЧЕЛ-Ч', 100, 50, 20, 1000, 2, 3),
    (o, c, bl, 'rs', 'МАШ', '_TEST_IK КРАН', 'МАШ-Ч', 2, 1, 100, 100, 2, 4),
    (o, c, bl, 'rs', 'БЕЗСКЛАД', '_TEST_IK БЕТОН', 'М3', 101.5, 50.75, 40, 2030, 2, 5),
    (o, c, bl, 'rs', 'МАШ', '_TEST_IK НАРХСИЗ', 'МАШ-Ч', 1, 0.5, null, null, 2, 6);
  insert into public.t2_qator (obyekt_id, kompaniya_id, ota_id, tur, kat, kod, nom, birlik, hajm, narx, summa, daraja, tartib)
    values (o, c, rz, 'mat', 'МАТ', '_С-6-1', '_TEST_IK АРМАТУРНЫЙ КАРКАС', 'Т', 8, 1000, 8000, 1, 7) returning id into arm;
  insert into public.t2_qator (obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm, daraja, tartib)
    values (o, c, rz, 'bl', '_T-1-97', '_TEST_IK УСТАНОВКА АРМАТУРЫ ИСКЛЮЧИТЬ ЗАТРАТЫ ТРУДА', 'Т', -8, 1, 8) returning id into ist;
  insert into public.t2_qator (obyekt_id, kompaniya_id, ota_id, tur, kat, nom, birlik, hajm, narx, summa, daraja, tartib)
    values (o, c, ist, 'rs', 'ЧЕЛ', '_TEST_IK ЗАТРАТЫ ТРУДА', 'ЧЕЛ-Ч', -4, 20, -80, 2, 9);
  insert into public.t2_qator (obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm, daraja, tartib)
    values (o, c, rz, 'bl', '_T-1-15', '_TEST_IK ЗАКЛАДНЫХ ДЕТАЛЕЙ', 'Т', 0.1, 1, 10) returning id into zak;
  insert into public.t2_qator (obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm, daraja, tartib)
    values (o, c, rz, 'bl', '_T-8-3', '_TEST_IK КЛАДКА СТЕН', 'М3', 10, 1, 11) returning id into boshqa;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, kod, nom, birlik, hajm, daraja, tartib)
    values (o2, c2, 'bl', '_T-1-1', '_TEST_IK УСТРОЙСТВО РИГЕЛЕЙ BEGONA', '100М3', 1, 0, 1) returning id into begona;

  -- 2) O'qish: tenant, qatorlar + qo'shnilar, qidiruv.
  begin perform public.t2_ish_kartasi_ol_v1(c, a2, 'kartalar', '{}'); raise exception '2: begona aktor o''qidi';
  exception when sqlstate '42501' then null; end;
  v := public.t2_ish_kartasi_ol_v1(c, a, 'qatorlar', jsonb_build_object('ids', jsonb_build_array(bl, begona), 'qoshni', false));
  if jsonb_array_length(v -> 'qatorlar') <> 1 or (v -> 'qatorlar' -> 0 ->> 'id')::bigint <> bl then raise exception '2: begona qator qaytdi: %', v; end if;
  if jsonb_array_length(v -> 'qatorlar' -> 0 -> 'bolalar') <> 4 then raise exception '2: resurslar to''liq emas'; end if;
  if (select count(*) from jsonb_array_elements(v -> 'qatorlar' -> 0 -> 'bolalar') b where b -> 'summa' = 'null'::jsonb) <> 1 then
    raise exception '2: narxsiz resurs summasi NULL emas (NULL ≠ 0)';
  end if;
  v := public.t2_ish_kartasi_ol_v1(c, a, 'qatorlar', jsonb_build_object('ids', jsonb_build_array(bl), 'qoshni', true));
  if jsonb_array_length(v -> 'qoshnilar') <> 4 or (v -> 'qoshnilar' -> 0 ->> 'id')::bigint <> arm or (v -> 'qoshnilar' -> 1 ->> 'hajm')::numeric <> -8 then
    raise exception '2: qo''shnilar noto''g''ri: %', v -> 'qoshnilar';
  end if;
  v := public.t2_ish_kartasi_ol_v1(c, a, 'qidir', '{"q":"_test_ik ригел"}');
  if jsonb_array_length(v -> 'qatorlar') <> 1 or (v -> 'qatorlar' -> 0 ->> 'id')::bigint <> bl then raise exception '2: qidiruv: %', v; end if;
  v := public.t2_ish_kartasi_ol_v1(c, a, 'nomalum', '{}');
  if (v ->> 'code') is distinct from 'BOLIM_NOMALUM' then raise exception '2: noma''lum bo''lim'; end if;

  -- 3) Tarkibli karta: asosiy (0,0015 100М3/m), armatura (nisbat, 0,024 Т/m), istisno (MANFIY −0,024 Т/m), zakladnoy koef NULL.
  op := gen_random_uuid();
  v := public.t2_ish_kartasi_saqla_v1(c, a, op, null, null,
    jsonb_build_object('nom', '_TEST_IK Rigel 300×500', 'tur', 'rigel', 'birlik', 'м', 'parametrlar', jsonb_build_object('b_mm', 300, 'h_mm', 500),
      'qamrov', jsonb_build_object('bosqichlar', jsonb_build_object('opalubka', true, 'armatura', true, 'beton', false), 'material', jsonb_build_object('armatura', 'biz'), 'mexanizm', 'biz'),
      'manba', 'qolda'),
    jsonb_build_array(
      jsonb_build_object('qator_id', bl, 'rol', 'asosiy', 'koef', 0.0015, 'koef_usul', 'parametr'),
      jsonb_build_object('qator_id', arm, 'rol', 'armatura_mat', 'koef', 0.024, 'koef_usul', 'nisbat', 'material_guruh', 'armatura', 'manba', 'avto'),
      jsonb_build_object('qator_id', ist, 'rol', 'istisno', 'koef', -0.024, 'koef_usul', 'nisbat', 'bosqich', 'armatura', 'manba', 'avto'),
      jsonb_build_object('qator_id', zak, 'rol', 'zakladnoy', 'koef', null, 'bosqich', 'armatura')));
  if not coalesce((v ->> 'ok')::boolean, false) or (v ->> 'bog_soni')::int <> 4 then raise exception '3: saqlanmadi: %', v; end if;
  kid := (v ->> 'id')::bigint; ver := (v ->> 'versiya')::int;
  if (select koef from public.t2_ish_kartasi_bog where karta_id = kid and qator_id = ist) <> -0.024 then raise exception '3: istisno ishorasi yo''qoldi'; end if;
  if (select koef from public.t2_ish_kartasi_bog where karta_id = kid and qator_id = zak) is not null then raise exception '3: NULL koef 0 ga aylandi'; end if;
  if (select obyekt_id from public.t2_ish_kartasi_bog where karta_id = kid and qator_id = arm) <> o then raise exception '3: obyekt qatordan olinmadi'; end if;
  -- idempotentlik
  v := public.t2_ish_kartasi_saqla_v1(c, a, op, null, null, '{"nom":"_TEST_IK boshqa","birlik":"м"}', '[]');
  if not coalesce((v ->> 'takror')::boolean, false) or (v ->> 'id')::bigint <> kid then raise exception '3: idempotent emas: %', v; end if;
  if (select count(*) from public.t2_ish_kartasi where kompaniya_id = c and nom like '_TEST_IK%') <> 1 then raise exception '3: takror karta yaratildi'; end if;
  -- nom band
  v := public.t2_ish_kartasi_saqla_v1(c, a, gen_random_uuid(), null, null, '{"nom":"_test_ik RIGEL 300×500","birlik":"м"}', '[]');
  if (v ->> 'code') is distinct from 'NOM_BAND' then raise exception '3: nom bandligi: %', v; end if;
  -- begona kompaniya qatori bog'lanmaydi
  begin
    perform public.t2_ish_kartasi_saqla_v1(c, a, gen_random_uuid(), kid, ver, '{"nom":"_TEST_IK Rigel 300×500","birlik":"м"}', jsonb_build_array(jsonb_build_object('qator_id', begona, 'koef', 1)));
    raise exception '3: begona qator bog''landi';
  exception when sqlstate '42501' then null; end;
  if (select count(*) from public.t2_ish_kartasi_bog where karta_id = kid) <> 4 then raise exception '3: rad etilgan yozuv bog''larni o''chirdi'; end if;
  -- begona aktor yoza olmaydi
  begin perform public.t2_ish_kartasi_saqla_v1(c, a2, gen_random_uuid(), null, null, '{"nom":"_TEST_IK X","birlik":"м"}', '[]'); raise exception '3: begona aktor yozdi';
  exception when sqlstate '42501' then null; end;
  -- validatsiya
  v := public.t2_ish_kartasi_saqla_v1(c, a, gen_random_uuid(), null, null, '{"nom":"_TEST_IK Y","birlik":"пог.м"}', '[]');
  if (v ->> 'code') is distinct from 'BIRLIK_NOTOGRI' then raise exception '3: birlik: %', v; end if;
  v := public.t2_ish_kartasi_saqla_v1(c, a, gen_random_uuid(), null, null, '{"nom":"_TEST_IK Y","birlik":"м","parametrlar":{"b_mm":-1}}', '[]');
  if (v ->> 'code') is distinct from 'PARAMETR_NOTOGRI' then raise exception '3: parametr: %', v; end if;
  v := public.t2_ish_kartasi_saqla_v1(c, a, gen_random_uuid(), null, null, '{"nom":"_TEST_IK Y","birlik":"м","qamrov":{"mexanizm":"kim"}}', '[]');
  if (v ->> 'code') is distinct from 'QAMROV_NOTOGRI' then raise exception '3: qamrov: %', v; end if;
  v := public.t2_ish_kartasi_saqla_v1(c, a, gen_random_uuid(), null, null, '{"nom":"_TEST_IK Y","birlik":"м","bosqich_ulush":{"opalubka":50,"armatura":30,"beton":30}}', '[]');
  if (v ->> 'code') is distinct from 'ULUSH_NOTOGRI' then raise exception '3: karta ulushi 100 emas: %', v; end if;
  -- CAS
  v := public.t2_ish_kartasi_saqla_v1(c, a, gen_random_uuid(), kid, ver + 5, '{"nom":"_TEST_IK Rigel 300×500","birlik":"м"}', '[]');
  if (v ->> 'code') is distinct from 'STALE_VERSION' then raise exception '3: CAS: %', v; end if;
  v := public.t2_ish_kartasi_saqla_v1(c, a, gen_random_uuid(), kid, ver,
    '{"nom":"_TEST_IK Rigel 300×500","birlik":"м","tur":"rigel","naryad_narx":250000,"usta_nom":"_usta","bosqich_ulush":{"opalubka":40,"armatura":25,"beton":35}}',
    jsonb_build_array(jsonb_build_object('qator_id', bl, 'rol', 'asosiy', 'koef', 0.0015)));
  if not coalesce((v ->> 'ok')::boolean, false) or (v ->> 'versiya')::int <> ver + 1 then raise exception '3: yangilash: %', v; end if;
  if (select count(*) from public.t2_ish_kartasi_bog where karta_id = kid) <> 1 then raise exception '3: bog'' to''plami almashtirilmadi'; end if;
  v := public.t2_ish_kartasi_ol_v1(c, a, 'kartalar', '{}');
  if (select count(*) from jsonb_array_elements(v -> 'kartalar') x where (x ->> 'id')::bigint = kid and (x ->> 'naryad_narx')::numeric = 250000
        and jsonb_array_length(x -> 'bog') = 1) <> 1 then raise exception '3: kartalar o''qilmadi: %', v; end if;
  v := public.t2_ish_kartasi_ol_v1(c2, a2, 'kartalar', '{}');
  if exists (select 1 from jsonb_array_elements(v -> 'kartalar') x where (x ->> 'id')::bigint = kid) then raise exception '3: karta begona kompaniyada ko''rindi'; end if;

  -- 4) Bosqich ulushi (kompaniya × tur).
  v := public.t2_ish_kartasi_ulush_saqla_v1(c, a, gen_random_uuid(), 'rigel', '{"opalubka":40,"armatura":25,"beton":30}', null);
  if (v ->> 'code') is distinct from 'ULUSH_NOTOGRI' then raise exception '4: yig''indi 95 qabul qilindi'; end if;
  v := public.t2_ish_kartasi_ulush_saqla_v1(c, a, gen_random_uuid(), 'rigel', '{"opalubka":40,"armatura":25}', null);
  if (v ->> 'code') is distinct from 'ULUSH_NOTOGRI' then raise exception '4: to''liq bo''lmagan ulush qabul qilindi'; end if;
  delete from public.t2_ish_kartasi_bosqich_ulush where kompaniya_id = c and tur = 'rigel';
  v := public.t2_ish_kartasi_ulush_saqla_v1(c, a, gen_random_uuid(), 'rigel', '{"opalubka":40,"armatura":25,"beton":35}', null);
  if not coalesce((v ->> 'ok')::boolean, false) or (v ->> 'versiya')::int <> 1 then raise exception '4: ulush saqlanmadi: %', v; end if;
  v := public.t2_ish_kartasi_ulush_saqla_v1(c, a, gen_random_uuid(), 'rigel', '{"opalubka":50,"armatura":20,"beton":30}', null);
  if (v ->> 'code') is distinct from 'STALE_VERSION' then raise exception '4: ulush CAS: %', v; end if;
  v := public.t2_ish_kartasi_ulush_saqla_v1(c, a, gen_random_uuid(), 'rigel', '{"opalubka":50,"armatura":20,"beton":30}', 1);
  if (v ->> 'versiya')::int <> 2 or (v -> 'ulush' ->> 'opalubka')::numeric <> 50 then raise exception '4: ulush yangilanmadi: %', v; end if;

  -- 5) Arxiv.
  select versiya into ver from public.t2_ish_kartasi where id = kid;
  v := public.t2_ish_kartasi_arxiv_v1(c, a, gen_random_uuid(), kid, ver);
  if (v ->> 'holat') is distinct from 'arxiv' then raise exception '5: arxivlanmadi: %', v; end if;
  v := public.t2_ish_kartasi_ol_v1(c, a, 'kartalar', '{}');
  if exists (select 1 from jsonb_array_elements(v -> 'kartalar') x where (x ->> 'id')::bigint = kid) then raise exception '5: arxiv karta faollar ichida'; end if;

  -- 6) Arxivlash bog'larni o'chirmaydi.
  select count(*) into n from public.t2_ish_kartasi_bog where karta_id = kid;
  if n <> 1 then raise exception '6: bog'' soni %', n; end if;

  if exists (select 1 from public.t2_versiya_xabardorlik_audit_v1()) then raise exception '7: versiya audit bo''sh emas'; end if;
  raise notice 'ISH_KARTASI_ACCEPTANCE_PASS';
end $test$;
rollback;
