-- Qabul: 20261219300000 — kesh smeta_joriy va bajarilish foizi maxraji. Migratsiya qo'llangandan KEYIN ishga tushiriladi.
-- SINTETIK ma'lumot (real mijoz/summa yo'q); BEGIN … ROLLBACK: hech narsa saqlanmaydi. Muvaffaqiyat: NOTICE 'KESH_SMETA_JORIY_ACCEPTANCE_PASS'.
--   Seed: asl smeta 2300 (ЧЕЛ 1000 + МАТ 1000 + МАТ 300); KATTA qo'shimcha ish +5000 (asl 2300 dan ko'p); tasdiqlangan F2 = 5000 (qo'shimcha qatorda).
--   A1 kesh: smeta ustamasiz 2300 (asl o'zgarmaydi), smeta_joriy ustamasiz 7300; kesh smeta_joriy = jonli _t2_summa_paket_v1.
--   A2 mindmap: smeta 2300 ko'rinadi; f2_foiz = 5000 / 7300 = 68,5 (eski xato: 217,4 > 100); foiz_maxraj 'joriy'; smeta_joriy 7300.
--   A3 kesh smeta_joriy yo'q (NULL) → maxraj asl, belgi 'asl', smeta_joriy NULL (0 emas): f2_foiz asl bo'yicha (217,4).
--   A4 AI kontekst: bajarish.f2_foiz = 68,5, foiz_maxraj 'joriy', maxraj_summa 7300.
--   A5 rahbar paneli: obyektlar[].bajarilish.f2 = 68,5 (≤ 100), joriy = true; foiz_smeta_joriy = true.
--   A6 yangilash navbati: smeta_joriy yo'q qator t2_obyekt_kesh_yangila_v1 tanlovida; anon/authenticated EXECUTE yo'q.
begin;
do $test$
declare
  c bigint; a bigint; o bigint; rz bigint; b1 bigint; r1 bigint; m1 bigint; m2 bigint; qb bigint; qr bigint;
  v jsonb; akt bigint; k record; g jsonb; nd jsonb; p jsonb; ob jsonb; s numeric; t0 timestamptz;
begin
  insert into public.t2_kompaniya(nom, kod) values ('_TEST_KSJ_', gen_random_uuid()::text) returning id into c;
  insert into public.t2_foydalanuvchi(login, ism) values ('_TEST_KSJ_a_' || gen_random_uuid(), '_TEST_ PTO') returning id into a;
  insert into public.t2_azolik(foydalanuvchi_id, kompaniya_id, rol) values (a, c, 'admin');
  if public.t2_platforma_superadmin(a) then raise exception '0: test aktori superadmin bo''lmasligi kerak'; end if;

  insert into public.t2_obyekt(nom, kompaniya_id) values ('_TEST_KSJ_', c) returning id into o;
  insert into public.t2_qator(obyekt_id, kompaniya_id, tur, nom, tartib) values (o, c, 'rz', '_TEST_KSJ_ РАЗДЕЛ', 1) returning id into rz;
  insert into public.t2_qator(obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm, tartib, daraja) values (o, c, rz, 'bl', 'S1', 'ИШ СИНОВ', 'М3', 10, 2, 1) returning id into b1;
  insert into public.t2_qator(obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm, narx, summa, norma, kat, tartib, daraja) values (o, c, b1, 'rs', 'R1', 'ИШЧИ СИНОВ', 'ЧЕЛ.-Ч', 10, 100, 1000, 1, 'ЧЕЛ', 3, 2) returning id into r1;
  insert into public.t2_qator(obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm, narx, summa, kat, tartib, daraja) values (o, c, rz, 'mat', 'M1', 'ПЛИТА СИНОВ', 'М', 20, 50, 1000, 'МАТ', 4, 1) returning id into m1;
  insert into public.t2_qator(obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm, narx, summa, kat, tartib, daraja) values (o, c, rz, 'mat', 'M2', 'КАБЕЛЬ СИНОВ', 'М', 10, 30, 300, 'МАТ', 5, 1) returning id into m2;
  perform public.t2_rollup(o);

  -- KATTA qo'shimcha ish: rz → bl QB → rs ЧЕЛ 50 × 100 = 5000 (asl 2300 dan ko'p).
  insert into public.t2_qator(obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm, tartib, daraja, qoshimcha, change_type)
    values (o, c, rz, 'bl', 'Q1', 'ҚЎШИМЧА ИШ СИНОВ', 'М2', 50, 6, 1, true, 'ADDITIONAL') returning id into qb;
  insert into public.t2_qator(obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm, narx, summa, norma, kat, tartib, daraja, qoshimcha, change_type)
    values (o, c, qb, 'rs', 'QR', 'ИШЧИ ҚЎШИМЧА', 'ЧЕЛ.-Ч', 50, 100, 5000, 1, 'ЧЕЛ', 7, 2, true, 'ADDITIONAL') returning id into qr;
  perform public.t2_rollup(o);

  -- Tasdiqlangan F2 = 5000 (qo'shimcha qatorda).
  v := public.t2_akt_yarat(o, 'f2', date '2026-05-01', jsonb_build_array(jsonb_build_object('qator_id', qr, 'hajm', 50, 'narx', 100)), 'ACC-KSJ-1', gen_random_uuid());
  if (v->>'ok') <> 'true' then raise exception 'FAIL akt: %', v; end if;
  akt := (v->>'akt_id')::bigint;
  update public.t2_akt set holat = 'tasdiqlangan' where id = akt;

  -- A1: kesh.
  t0 := clock_timestamp();
  perform public._t2_kesh_hisobla_v1(o);
  delete from public.t2_obyekt_kesh_iflos where obyekt_id = o;   -- t2_obyekt_kesh_yangila_v1 ham hisobdan keyin shuni qiladi
  raise notice 'KESH hisob vaqti (sintetik): % ms', round(extract(epoch from clock_timestamp() - t0) * 1000);
  select * into k from public.t2_obyekt_kesh where obyekt_id = o;
  if (k.smeta->>'ustamasiz')::numeric is distinct from 2300 then raise exception 'A1a: asl smeta 2300 emas: %', k.smeta->>'ustamasiz'; end if;
  if k.smeta_joriy is null or (k.smeta_joriy->>'ustamasiz')::numeric is distinct from 7300 then raise exception 'A1b: smeta_joriy 7300 emas: %', k.smeta_joriy->>'ustamasiz'; end if;
  select p.paket into p from public._t2_summa_paket_v1(array[o], 'smeta_joriy') p;
  if (p->>'ustamasiz')::numeric is distinct from (k.smeta_joriy->>'ustamasiz')::numeric then raise exception 'A1c: kesh != jonli'; end if;
  if (select (x.paket->>'ustamasiz')::numeric from public._t2_summa_paket_kesh_v1(array[o], 'smeta_joriy') x) is distinct from 7300 then raise exception 'A1d: kesh o''quvchisi smeta_joriy'; end if;

  -- A2: mindmap — joriy maxraj.
  g := public.t2_mindmap_grafi(c);
  select e into nd from jsonb_array_elements(g->'tugunlar') e where e->>'id' = 'obyekt:' || o;
  if nd is null then raise exception 'A2: obyekt tuguni topilmadi'; end if;
  if (nd->'meta'->>'smeta')::numeric is distinct from 2300 then raise exception 'A2a: asl smeta ko''rinishi o''zgardi: %', nd->'meta'->>'smeta'; end if;
  if (nd->'meta'->>'smeta_joriy')::numeric is distinct from 7300 or nd->'meta'->>'foiz_maxraj' <> 'joriy' then raise exception 'A2b: joriy/belgi: %', nd->'meta'; end if;
  if (nd->'meta'->>'f2_foiz')::numeric is distinct from 68.5 then raise exception 'A2c: f2_foiz 68.5 emas: %', nd->'meta'->>'f2_foiz'; end if;
  if (nd->'meta'->>'f2_foiz')::numeric > 100 then raise exception 'A2d: foiz 100 dan oshdi'; end if;

  -- A3: joriy noma'lum → asl + belgi, NULL ≠ 0.
  update public.t2_obyekt_kesh set smeta_joriy = null where obyekt_id = o;
  g := public.t2_mindmap_grafi(c);
  select e into nd from jsonb_array_elements(g->'tugunlar') e where e->>'id' = 'obyekt:' || o;
  if nd->'meta'->>'foiz_maxraj' <> 'asl' or nd->'meta'->'smeta_joriy' <> 'null'::jsonb then raise exception 'A3a: asl belgisi/NULL: %', nd->'meta'; end if;
  if (nd->'meta'->>'f2_foiz')::numeric is distinct from 217.4 then raise exception 'A3b: asl maxrajda f2_foiz 217.4 emas: %', nd->'meta'->>'f2_foiz'; end if;
  perform public._t2_kesh_hisobla_v1(o);
  delete from public.t2_obyekt_kesh_iflos where obyekt_id = o;

  -- A4: AI kontekst.
  v := public.t2_ai_kontekst(o);
  if (v->'bajarish'->>'f2_foiz')::numeric is distinct from 68.49 or v->'bajarish'->>'foiz_maxraj' <> 'joriy'
     or (v->'bajarish'->>'maxraj_summa')::numeric is distinct from 7300 then
    raise exception 'A4: AI bajarish: %', v->'bajarish'; end if;

  -- A5: rahbar paneli.
  v := public.t2_rahbar_panel_v1(c, a, null, null, o);
  if coalesce(v->>'ok', '') <> 'true' then raise exception 'A5: rahbar paneli: %', v; end if;
  ob := v->'obyektlar'->0;
  if (ob->'bajarilish'->>'f2')::numeric is distinct from 68.5 or (ob->'bajarilish'->>'joriy')::boolean is not true then
    raise exception 'A5a: bajarilish: %', ob->'bajarilish'; end if;
  if (v->'kartalar'->'bajarildi'->>'foiz_smeta_joriy')::boolean is not true or (v->'kartalar'->'bajarildi'->>'foiz_smeta')::numeric > 100 then
    raise exception 'A5b: foiz_smeta: %', v->'kartalar'->'bajarildi'; end if;

  -- A6: backfill navbati va ruxsat.
  update public.t2_obyekt_kesh set smeta_joriy = null where obyekt_id = o;
  if not exists (select 1 from public.t2_obyekt o2 left join public.t2_obyekt_kesh k2 on k2.obyekt_id = o2.id
                  where o2.id = o and (k2.smeta is not null and k2.smeta_joriy is null)) then raise exception 'A6a: backfill sharti'; end if;
  if has_function_privilege('anon', 'public._t2_kesh_joriy_v1(bigint)', 'EXECUTE') or has_function_privilege('authenticated', 'public._t2_kesh_joriy_v1(bigint)', 'EXECUTE') then
    raise exception 'A6b: anon/authenticated EXECUTE bor'; end if;

  raise notice 'KESH_SMETA_JORIY_ACCEPTANCE_PASS';
end $test$;
rollback;
