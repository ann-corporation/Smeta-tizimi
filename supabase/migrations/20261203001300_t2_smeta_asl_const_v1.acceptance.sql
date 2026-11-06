-- Qabul: 20261203001300 — smeta (asl) CONST + asoslangan o'zgarishlar qatlami. Migratsiya qo'llangandan KEYIN ishga tushiriladi.
-- SINTETIK ma'lumot (real mijoz/summa yo'q); BEGIN … ROLLBACK: hech narsa saqlanmaydi. Muvaffaqiyat: NOTICE 'SMETA_ASL_CONST_ACCEPTANCE_PASS'.
--   A1 asl smeta 2300 (rs ЧЕЛ 1000 + mat 1000 + mat 300) — qo'shimcha/zamena/bajarilmadi qo'shilgandan keyin ham AYNAN 2300:
--      _t2_summa_agg_v1('smeta').ustamasiz, t2_obyekt_jami.jami (t2_rollup dan keyin ham), t2_object_financials_v1 smeta.known,
--      t2_obyekt_nakrutka / t2_obyekt_nakrutka_v1 kategoriya kesimi.
--   A2 o'zgarishlar: qo'shimcha +500; narxli zamena 800 aslning yarmini (10 / 20 М, 500) almashtiradi → farq +300 (ikki marta emas);
--      narxsiz zamena aslni kamaytirmaydi (farq noma'lum); bajarilmaydi 5 / 10 × 30 = −150; jami +650; Smeta + o'zgarishlar = 2950
--      (= _t2_summa_agg_v1('smeta_joriy').ustamasiz); avvalgi (xato) ko'rinish 3600; invariant_ok.
--   A3 asos: qo'shimcha guruhi sababi va kim — t2_smeta_ozgarish dan; asossiz_soni 0 (qo'shimcha), narxsiz zamena sanaladi.
--   A4 tenant: boshqa kompaniya a'zosi — rad; anon/authenticated EXECUTE yo'q. A5 versiya qo'riqchisi bo'sh.
begin;
do $test$
declare
  c bigint; c2 bigint; a bigint; b bigint; o bigint; rz bigint; b1 bigint; r1 bigint; m1 bigint; m2 bigint; qb bigint; qr bigint; z1 bigint; z2 bigint;
  ch bigint; r jsonb; s numeric; ok boolean; f jsonb;
begin
  insert into public.t2_kompaniya(nom, kod) values ('_TEST_SMASL_', gen_random_uuid()::text) returning id into c;
  insert into public.t2_kompaniya(nom, kod) values ('_TEST_SMASL_2', gen_random_uuid()::text) returning id into c2;
  insert into public.t2_foydalanuvchi(login, ism) values ('_TEST_SMASL_a_' || gen_random_uuid(), '_TEST_ ПТО') returning id into a;
  insert into public.t2_foydalanuvchi(login) values ('_TEST_SMASL_b_' || gen_random_uuid()) returning id into b;
  insert into public.t2_azolik(foydalanuvchi_id, kompaniya_id, rol) values (a, c, 'admin'), (b, c2, 'admin');
  if public.t2_platforma_superadmin(a) or public.t2_platforma_superadmin(b) then raise exception '0: test aktori superadmin bo''lmasligi kerak'; end if;

  -- Asl smeta: rz → bl (10) → rs ЧЕЛ 10 × 100; rz → mat М1 20 × 50; rz → mat М2 10 × 30.
  insert into public.t2_obyekt(nom, kompaniya_id) values ('_TEST_SMASL_', c) returning id into o;
  insert into public.t2_qator(obyekt_id, kompaniya_id, tur, nom, tartib) values (o, c, 'rz', '_TEST_SMASL_ РАЗДЕЛ', 1) returning id into rz;
  insert into public.t2_qator(obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm, tartib, daraja) values (o, c, rz, 'bl', 'S1', 'ИШ СИНОВ', 'М3', 10, 2, 1) returning id into b1;
  insert into public.t2_qator(obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm, narx, summa, norma, kat, tartib, daraja) values (o, c, b1, 'rs', 'R1', 'ИШЧИ СИНОВ', 'ЧЕЛ.-Ч', 10, 100, 1000, 1, 'ЧЕЛ', 3, 2) returning id into r1;
  insert into public.t2_qator(obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm, narx, summa, kat, tartib, daraja) values (o, c, rz, 'mat', 'M1', 'ПЛИТА СИНОВ', 'М', 20, 50, 1000, 'МАТ', 4, 1) returning id into m1;
  insert into public.t2_qator(obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm, narx, summa, kat, tartib, daraja) values (o, c, rz, 'mat', 'M2', 'КАБЕЛЬ СИНОВ', 'М', 10, 30, 300, 'МАТ', 5, 1) returning id into m2;
  perform public.t2_rollup(o);

  select (x.agg->>'chel')::numeric + (x.agg->>'mat')::numeric into s from public._t2_summa_agg_v1(array[o], 'smeta') x;
  if s is distinct from 2300 then raise exception 'A1a: asl smeta 2300 emas (oldin): %', s; end if;
  if (select jami from public.t2_obyekt_jami where id = o) is distinct from 2300 then raise exception 'A1b: t2_obyekt_jami.jami 2300 emas (oldin)'; end if;

  -- Qo'shimcha ish (asos bilan): rz → bl QB → rs ЧЕЛ 5 × 100.
  insert into public.t2_smeta_ozgarish(obyekt_id, kompaniya_id, tur, kind, sabab, holat, actor_id, kim, operation_id)
    values (o, c, 'qoshimcha_ish', 'additional_work', '_TEST_ sabab: buyurtmachi xati', 'qoralama', a, 'actor:' || a, gen_random_uuid()) returning id into ch;
  insert into public.t2_qator(obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm, tartib, daraja, qoshimcha, change_type, change_id)
    values (o, c, rz, 'bl', 'Q1', 'ҚЎШИМЧА ИШ СИНОВ', 'М2', 5, 6, 1, true, 'ADDITIONAL', ch) returning id into qb;
  insert into public.t2_qator(obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm, narx, summa, norma, kat, tartib, daraja, qoshimcha, change_type, change_id)
    values (o, c, qb, 'rs', 'QR', 'ИШЧИ ҚЎШИМЧА', 'ЧЕЛ.-Ч', 5, 100, 500, 1, 'ЧЕЛ', 7, 2, true, 'ADDITIONAL', ch) returning id into qr;
  -- Narxli zamena: М1 o'rniga 10 М × 80 = 800 (birlik bir xil → 10 / 20 = yarmi almashtiriladi).
  insert into public.t2_qator(obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm, narx, summa, kat, tartib, daraja, qoshimcha, zamena, change_type, replaces_line_id)
    values (o, c, rz, 'mat', 'Z1', 'ПЛИТА ЯНГИ СИНОВ', 'М', 10, 80, 800, 'МАТ', 8, 1, true, true, 'REPLACEMENT', m1) returning id into z1;
  -- Narxsiz zamena: М2 o'rniga (summa noma'lum) — asl kamaymaydi.
  insert into public.t2_qator(obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm, kat, tartib, daraja, qoshimcha, zamena, change_type, replaces_line_id)
    values (o, c, rz, 'mat', 'Z2', 'КАБЕЛЬ ЯНГИ СИНОВ', 'М', 10, 'МАТ', 9, 1, true, true, 'REPLACEMENT', m2) returning id into z2;
  -- Bajarilmaydi: М2 dan 5 М (5 / 10 × 300 = 150).
  r := public.t2_bajarilmadi_belgila_v1(c, a, o, jsonb_build_array(jsonb_build_object('qator_id', m2, 'hajm', 5)), 'texnik_sabab', '_TEST_', null, current_date, null, gen_random_uuid());
  if coalesce(r->>'ok', '') <> 'true' then raise exception 'A0: bajarilmadi belgilanmadi: %', r; end if;
  perform public.t2_rollup(o);

  -- A1: asl smeta CONST.
  select (x.agg->>'chel')::numeric + (x.agg->>'mat')::numeric into s from public._t2_summa_agg_v1(array[o], 'smeta') x;
  if s is distinct from 2300 then raise exception 'A1c: asl smeta o''zgardi: % (2300 kutilgan)', s; end if;
  if (select jami from public.t2_obyekt_jami where id = o) is distinct from 2300 then
    raise exception 'A1d: t2_obyekt_jami.jami o''zgardi: %', (select jami from public.t2_obyekt_jami where id = o); end if;
  if (select chel from public.t2_obyekt_jami where id = o) is distinct from 1000 or (select mat from public.t2_obyekt_jami where id = o) is distinct from 1300 then
    raise exception 'A1e: t2_obyekt_jami kesimi asl emas'; end if;
  f := public.t2_object_financials_v1(c, a, array[o]);
  if (f->'objects'->0->'smeta'->>'known')::numeric is distinct from 2300 then raise exception 'A1f: object_financials smeta: %', f->'objects'->0->'smeta'; end if;
  f := public.t2_obyekt_nakrutka_v1(o, a, null);
  if (f->'cats'->>'chel')::numeric is distinct from 1000 or (f->'cats'->>'mat')::numeric is distinct from 1300 then
    raise exception 'A1g: obyekt_nakrutka_v1 kesimi asl emas: %', f->'cats'; end if;
  if (select n.chel + n.mat from public.t2_obyekt_nakrutka n where n.obyekt_id = o) is distinct from 2300 then
    raise exception 'A1h: t2_obyekt_nakrutka kesimi asl emas'; end if;

  -- A2: o'zgarishlar qatlami va hosila.
  select (x.agg->>'chel')::numeric + (x.agg->>'mat')::numeric into s from public._t2_summa_agg_v1(array[o], 'smeta_joriy') x;
  if s is distinct from 2950 then raise exception 'A2a: smeta_joriy 2950 emas: %', s; end if;
  r := public.t2_smeta_ozgarish_qatlam_v1(o, a);
  if coalesce(r->>'ok', '') <> 'true' then raise exception 'A2: %', r; end if;
  if (r->'asl'->>'ustamasiz')::numeric <> 2300 or (r->'joriy'->>'ustamasiz')::numeric <> 2950 then raise exception 'A2b: asl/joriy: %', r->'asl' || r->'joriy'; end if;
  if (r->'ozgarish'->>'qoshimcha')::numeric <> 500 or (r->'ozgarish'->>'zamena_summa')::numeric <> 800
     or (r->'ozgarish'->>'almashtirilgan_summa')::numeric <> 500 or (r->'ozgarish'->>'zamena_farq')::numeric <> 300
     or (r->'ozgarish'->>'bajarilmadi')::numeric <> -150 or (r->'ozgarish'->>'ustamasiz')::numeric <> 650
     or (r->'ozgarish'->>'avvalgi_jami')::numeric <> 3600 or (r->'ozgarish'->>'invariant_ok')::boolean is not true
     or r->'ozgarish'->'narx_farqi' <> 'null'::jsonb then
    raise exception 'A2c: o''zgarishlar kutilgandek emas: %', r->'ozgarish' - 'kesim'; end if;
  if (r->'zamena'->>'soni')::int <> 2 or (r->'zamena'->>'narxsiz_soni')::int <> 1 then raise exception 'A2d: zamena: %', r->'zamena' - 'qatorlar'; end if;
  if not exists (select 1 from jsonb_array_elements(r->'zamena'->'qatorlar') e where (e->>'qator_id')::bigint = z1
                   and (e->>'farq')::numeric = 300 and (e->>'almashtirilgan_summa')::numeric = 500 and (e->>'asl_id')::bigint = m1) then
    raise exception 'A2e: narxli zamena qatori: %', r->'zamena'->'qatorlar'; end if;
  if not exists (select 1 from jsonb_array_elements(r->'zamena'->'qatorlar') e where (e->>'qator_id')::bigint = z2
                   and (e->>'narxsiz')::boolean and e->'farq' is null) then
    raise exception 'A2f: narxsiz zamena farqi noma''lum bo''lishi kerak: %', r->'zamena'->'qatorlar'; end if;
  if (r->'bajarilmadi'->>'summa')::numeric <> -150 or (r->'bajarilmadi'->'qatorlar'->0->>'qator_id')::bigint <> m2 then
    raise exception 'A2g: bajarilmadi: %', r->'bajarilmadi'; end if;

  -- A3: asos.
  if (r->'qoshimcha'->>'soni')::int <> 1 or (r->'qoshimcha'->>'asossiz_soni')::int <> 0 then raise exception 'A3a: qo''shimcha: %', r->'qoshimcha' - 'qatorlar'; end if;
  if (r->'qoshimcha'->'qatorlar'->0->>'qator_id')::bigint <> qb or (r->'qoshimcha'->'qatorlar'->0->>'summa')::numeric <> 500
     or r->'qoshimcha'->'qatorlar'->0->'asos'->>'sabab' <> '_TEST_ sabab: buyurtmachi xati'
     or r->'qoshimcha'->'qatorlar'->0->'asos'->>'kim' <> '_TEST_ ПТО' then
    raise exception 'A3b: qo''shimcha asosi: %', r->'qoshimcha'->'qatorlar'; end if;
  if (r->'zamena'->>'asossiz_soni')::int <> 2 then raise exception 'A3c: asossiz zamena sanalmadi: %', r->'zamena' - 'qatorlar'; end if;

  -- A4: tenant va ruxsat.
  ok := false;
  begin perform public.t2_smeta_ozgarish_qatlam_v1(o, b); exception when others then ok := true; end;
  if not ok then raise exception 'A4a: boshqa kompaniya a''zosi o''tdi'; end if;
  if has_function_privilege('anon', 'public.t2_smeta_ozgarish_qatlam_v1(bigint,bigint)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.t2_smeta_ozgarish_qatlam_v1(bigint,bigint)', 'EXECUTE')
     or has_function_privilege('anon', 'public._t2_smeta_qatlam_qator_v1(bigint[])', 'EXECUTE')
     or has_function_privilege('authenticated', 'public._t2_smeta_qatlam_qator_v1(bigint[])', 'EXECUTE') then
    raise exception 'A4b: anon/authenticated EXECUTE bor'; end if;

  -- A5: versiya qo'riqchisi.
  if exists (select 1 from public.t2_versiya_xabardorlik_audit_v1()) then
    raise exception 'A5: versiya qo''riqchisi bo''sh emas: %', (select jsonb_agg(to_jsonb(x)) from public.t2_versiya_xabardorlik_audit_v1() x); end if;

  raise notice 'SMETA_ASL_CONST_ACCEPTANCE_PASS';
end $test$;
rollback;
