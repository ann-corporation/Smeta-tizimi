-- Qabul: 20261219030000 — zamena narxi F-2 sertifikatidan (fallback). Migratsiya qo'llangandan KEYIN ishga tushiriladi.
-- SINTETIK ma'lumot; BEGIN … ROLLBACK. Muvaffaqiyat: NOTICE 'ZAMENA_F2_NARX_ACCEPTANCE_PASS'.
--   Z1 asl mat M1 20 × 50 = 1000; narxsiz zamena Z (hajm 10, summa NULL) → F-2 yo'q: narxsiz (farq noma'lum), joriy 1000.
--   Z2 tasdiqlangan F-2 da Z uchun sertifikat 10 / 800 → zamena_summa 800, narxsiz 0, f2_narx_soni 1, almashtirilgan 500, farq 300, joriy 1300; t2_qator.summa NULL qoladi.
--   Z3 qoralama F-2 hisobga olinmaydi (faqat tasdiqlangan).
begin;
do $test$
declare
  c bigint; a bigint; o bigint; rz bigint; m1 bigint; z bigint; ak bigint; r jsonb;
begin
  insert into public.t2_kompaniya(nom, kod) values ('_TEST_ZF2N_', gen_random_uuid()::text) returning id into c;
  insert into public.t2_foydalanuvchi(login, ism) values ('_TEST_ZF2N_a_' || gen_random_uuid(), '_TEST_ ПТО') returning id into a;
  insert into public.t2_azolik(foydalanuvchi_id, kompaniya_id, rol) values (a, c, 'admin');
  insert into public.t2_obyekt(nom, kompaniya_id) values ('_TEST_ZF2N_', c) returning id into o;
  insert into public.t2_qator(obyekt_id, kompaniya_id, tur, nom, tartib) values (o, c, 'rz', '_TEST_ZF2N_ РАЗДЕЛ', 1) returning id into rz;
  insert into public.t2_qator(obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm, narx, summa, kat, tartib, daraja) values (o, c, rz, 'mat', 'M1', 'ПЛИТА СИНОВ', 'М', 20, 50, 1000, 'МАТ', 2, 1) returning id into m1;
  insert into public.t2_qator(obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm, kat, tartib, daraja, qoshimcha, zamena, change_type, replaces_line_id)
    values (o, c, rz, 'mat', 'Z1', 'ПЛИТА ЯНГИ СИНОВ', 'М', 10, 'МАТ', 3, 1, true, true, 'REPLACEMENT', m1) returning id into z;
  perform public.t2_rollup(o);

  r := public.t2_smeta_ozgarish_qatlam_v1(o, a);
  if (r->'zamena'->>'narxsiz_soni')::int <> 1 or (r->'joriy'->>'ustamasiz')::numeric <> 1000 then raise exception 'Z1: %', r->'zamena' - 'qatorlar'; end if;

  -- Z3: qoralama F-2 — hisobga olinmaydi.
  insert into public.t2_akt(obyekt_id, tur, oy, holat, lifecycle_status) values (o, 'f2', date_trunc('month', current_date)::date, 'qoralama', 'draft') returning id into ak;
  insert into public.t2_akt_qator(akt_id, qator_id, obyekt_id, hajm, certified_quantity, certified_amount) values (ak, z, o, 10, 10, 800);
  r := public.t2_smeta_ozgarish_qatlam_v1(o, a);
  if (r->'zamena'->>'narxsiz_soni')::int <> 1 then raise exception 'Z3: qoralama F-2 hisobga olindi: %', r->'zamena' - 'qatorlar'; end if;

  -- Z2: tasdiqlangan F-2.
  perform set_config('t2.akt.lifecycle_transition', '1', true);  -- transition ichki bayrog'i (faqat test)
  update public.t2_akt set lifecycle_status = 'approved' where id = ak;
  r := public.t2_smeta_ozgarish_qatlam_v1(o, a);
  if (r->'zamena'->>'narxsiz_soni')::int <> 0 or (r->'zamena'->>'f2_narx_soni')::int <> 1 or (r->'ozgarish'->>'zamena_summa')::numeric <> 800
     or (r->'ozgarish'->>'almashtirilgan_summa')::numeric <> 500 or (r->'ozgarish'->>'zamena_farq')::numeric <> 300
     or (r->'joriy'->>'ustamasiz')::numeric <> 1300 or (r->'ozgarish'->>'invariant_ok')::boolean is not true then
    raise exception 'Z2: %', r->'ozgarish' - 'kesim'; end if;
  if r->'zamena'->'qatorlar'->0->>'narx_manba' <> 'f2_narx' then raise exception 'Z2b: manba belgisi yo''q'; end if;
  if (select summa from public.t2_qator where id = z) is not null then raise exception 'Z2c: t2_qator.summa yozilgan'; end if;

  raise notice 'ZAMENA_F2_NARX_ACCEPTANCE_PASS';
end
$test$;
rollback;