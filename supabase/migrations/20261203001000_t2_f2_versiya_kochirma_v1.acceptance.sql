-- Qabul: 20261203001000 — F2 versiya ko'chirmasi (o'qish). Migratsiya qo'llangandan KEYIN ishga tushiriladi.
-- SINTETIK ma'lumot (real mijoz/summa yo'q); BEGIN … ROLLBACK: hech narsa saqlanmaydi. Muvaffaqiyat: NOTICE 'F2_VERSIYA_KOCHIRMA_ACCEPTANCE_PASS'.
--   K1 faollashtirishdan keyin: ish ichidagi rs F2 → yangi rs; ish (bl) F2 → yangi bl; yangi smetada yo'q mustaqil mat → moslanmagan.
--   K2 invariant: kochdi + kutilmoqda + moslanmagan = eski F2 jami; t2_qator_holat va obyekt F2 jami O'ZGARMAYDI (ikki marta yo'q).
--   K3 moslik tasdig'i 'kutilmoqda' → ko'chmaydi, nomzod bilan ro'yxatda; 'rad' → rad_etilgan.
--   K4 zanjir: ikkinchi faollashtirishdan keyin ham F2 oxirgi faol qatorga ko'chadi (zanjir_qadam = 2).
--   K5 tasdiqlanmagan F2 ko'chmaydi (faqat holat = 'tasdiqlangan'; bekor qilingan F2 ham shu qoida bilan chiqadi).
--   K6 tenant: boshqa kompaniyaning ODDIY a'zosi (admin, superadmin emas) va a'zo bo'lmagan foydalanuvchi — rad; anon/authenticated EXECUTE yo'q.
--   K7 versiya qo'riqchisi: funksiya t2_versiya_xabardorlik_audit_v1() da chiqmaydi.
begin;
do $test$
declare
  c bigint; c2 bigint; a bigint; b bigint; x bigint; o bigint; rz bigint; b1 bigint; r1 bigint; b2 bigint; r2 bigint; m1 bigint;
  ak bigint; ak2 bigint; r jsonb; k jsonb; v1 bigint; nr1 bigint; nb2 bigint; f2_oldin numeric; f2_keyin numeric; ok boolean;
begin
  insert into public.t2_kompaniya(nom, kod) values ('_TEST_F2VK_', gen_random_uuid()::text) returning id into c;
  insert into public.t2_kompaniya(nom, kod) values ('_TEST_F2VK_2', gen_random_uuid()::text) returning id into c2;
  insert into public.t2_foydalanuvchi(login) values ('_TEST_F2VK_a_' || gen_random_uuid()) returning id into a;
  insert into public.t2_foydalanuvchi(login) values ('_TEST_F2VK_b_' || gen_random_uuid()) returning id into b;
  insert into public.t2_foydalanuvchi(login) values ('_TEST_F2VK_x_' || gen_random_uuid()) returning id into x;
  insert into public.t2_azolik(foydalanuvchi_id, kompaniya_id, rol) values (a, c, 'admin'), (b, c2, 'admin');
  if public.t2_platforma_superadmin(a) or public.t2_platforma_superadmin(b) then raise exception '0: test aktori superadmin bo''lmasligi kerak'; end if;

  -- Eski smeta: rz → bl E1 (10) → rs ЦЕМЕНТ; bl E2 (5) → rs ГВОЗДИ; rz ostida mustaqil mat КАБЕЛЬ.
  insert into public.t2_obyekt(nom, kompaniya_id) values ('_TEST_F2VK_', c) returning id into o;
  insert into public.t2_qator(obyekt_id, kompaniya_id, tur, nom, tartib) values (o, c, 'rz', '_TEST_F2VK_ РАЗДЕЛ', 1) returning id into rz;
  insert into public.t2_qator(obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm, tartib, daraja) values (o, c, rz, 'bl', 'T1-1', 'ИШ БИР СИНОВ', 'М3', 10, 2, 1) returning id into b1;
  insert into public.t2_qator(obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm, narx, summa, norma, kat, tartib, daraja) values (o, c, b1, 'rs', 'R1', 'ЦЕМЕНТ СИНОВ', 'Т', 10, 100, 1000, 1, 'МАТ', 3, 2) returning id into r1;
  insert into public.t2_qator(obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm, tartib, daraja) values (o, c, rz, 'bl', 'T2-2', 'ИШ ИККИ СИНОВ', 'М2', 5, 4, 1) returning id into b2;
  insert into public.t2_qator(obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm, narx, summa, norma, kat, tartib, daraja) values (o, c, b2, 'rs', 'R2', 'ГВОЗДИ СИНОВ', 'КГ', 5, 100, 500, 1, 'МАТ', 5, 2) returning id into r2;
  insert into public.t2_qator(obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm, narx, summa, kat, tartib, daraja) values (o, c, rz, 'mat', 'M1', 'КАБЕЛЬ СИНОВ', 'М', 20, 10, 200, 'МАТ', 6, 1) returning id into m1;
  perform public.t2_rollup(o);

  -- Tasdiqlangan F2: ЦЕМЕНТ 4 × 100; ish E2 2 × 100; КАБЕЛЬ 5 × 10. Tasdiqlanmagan (qoralama) F2: ЦЕМЕНТ 1 × 100 (K5).
  insert into public.t2_akt(obyekt_id, kompaniya_id, tur, oy, holat) values (o, c, 'f2', '2026-09-01', 'qoralama') returning id into ak;
  insert into public.t2_akt_qator(akt_id, qator_id, obyekt_id, kompaniya_id, hajm, narx) values (ak, r1, o, c, 4, 100), (ak, b2, o, c, 2, 100), (ak, m1, o, c, 5, 10);
  update public.t2_akt set holat = 'tasdiqlangan' where id = ak;
  insert into public.t2_akt(obyekt_id, kompaniya_id, tur, oy, holat) values (o, c, 'f2', '2026-08-01', 'qoralama') returning id into ak2;
  insert into public.t2_akt_qator(akt_id, qator_id, obyekt_id, kompaniya_id, hajm, narx) values (ak2, r1, o, c, 1, 100);
  select coalesce(sum(f2_summa), 0) into f2_oldin from public.t2_qator_holat where obyekt_id = o;

  -- Faollashtirish: yangi smeta — E1 (8) → ЦЕМЕНТ; E2 (5) → ГВОЗДИ; КАБЕЛЬ yo'q.
  r := public.t2_smeta_versiya_faollashtir_v1(c, a, o, jsonb_build_array(
    jsonb_build_object('local_id','rz','tur','rz','nom','_TEST_F2VK_ ЭКСПЕРТИЗА'),
    jsonb_build_object('local_id','b1','parent_local_id','rz','tur','bl','kod','T1-1','nom','ИШ БИР СИНОВ','birlik','М3','hajm','8'),
    jsonb_build_object('local_id','r1','parent_local_id','b1','tur','rs','kod','R1X','nom','ЦЕМЕНТ СИНОВ','birlik','Т','hajm','8','narx','100','summa','800','norma','1'),
    jsonb_build_object('local_id','b2','parent_local_id','rz','tur','bl','kod','T2-2','nom','ИШ ИККИ СИНОВ','birlik','М2','hajm','5'),
    jsonb_build_object('local_id','r2','parent_local_id','b2','tur','rs','kod','R2','nom','ГВОЗДИ СИНОВ','birlik','КГ','hajm','5','narx','100','summa','500','norma','1')
  ), jsonb_build_object('nom','_TEST_F2VK_ v1'), gen_random_uuid());
  if coalesce(r->>'ok','') <> 'true' then raise exception 'K1: faollashtirilmadi: %', r; end if;
  v1 := (r->>'almashtirilgan_versiya_id')::bigint;
  select q.id into nr1 from public.t2_qator q where q.obyekt_id = o and q.versiya_holat = 'faol' and q.tur = 'rs' and q.nom = 'ЦЕМЕНТ СИНОВ';
  select q.id into nb2 from public.t2_qator q where q.obyekt_id = o and q.versiya_holat = 'faol' and q.tur = 'bl' and q.kod = 'T2-2';

  -- K1
  k := public.t2_f2_versiya_kochirma_v1(o, a);
  if coalesce(k->>'ok','') <> 'true' then raise exception 'K1: %', k; end if;
  if not exists (select 1 from jsonb_array_elements(k->'qatorlar') e where (e->>'qator_id')::bigint = nr1
                   and (e->>'f2_avvalgi_hajm')::numeric = 4 and (e->>'f2_avvalgi_summa')::numeric = 400 and (e->>'eski_soni')::int = 1) then
    raise exception 'K1a: ЦЕМЕНТ F2 (4 / 400) yangi rs ga ko''chmadi: %', k->'qatorlar'; end if;
  if not exists (select 1 from jsonb_array_elements(k->'qatorlar') e where (e->>'qator_id')::bigint = nb2
                   and (e->>'f2_avvalgi_hajm')::numeric = 2 and (e->>'f2_avvalgi_summa')::numeric = 200) then
    raise exception 'K1b: ish E2 F2 (2 / 200) yangi bl ga ko''chmadi: %', k->'qatorlar'; end if;
  if not exists (select 1 from jsonb_array_elements(k->'moslanmagan') e where (e->>'eski_qator_id')::bigint = m1
                   and e->>'sabab' = 'yangi_smetada_yoq' and (e->>'f2_summa')::numeric = 50) then
    raise exception 'K1c: КАБЕЛЬ moslanmagan ro''yxatda yo''q: %', k->'moslanmagan'; end if;

  -- K2
  if (k->'jami'->>'eski_soni')::int <> 3 or (k->'jami'->>'eski_summa')::numeric <> 650
     or (k->'jami'->>'kochdi_soni')::int + (k->'jami'->>'kutilmoqda_soni')::int + (k->'jami'->>'moslanmagan_soni')::int <> 3
     or (k->'jami'->>'kochdi_summa')::numeric + (k->'jami'->>'kutilmoqda_summa')::numeric + (k->'jami'->>'moslanmagan_summa')::numeric <> 650 then
    raise exception 'K2: invariant buzildi: %', k->'jami'; end if;
  select coalesce(sum(f2_summa), 0) into f2_keyin from public.t2_qator_holat where obyekt_id = o;
  if f2_keyin <> f2_oldin or f2_keyin <> 650 then raise exception 'K2: obyekt F2 jami o''zgardi (% → %)', f2_oldin, f2_keyin; end if;
  if (select f2_hajm from public.t2_qator_holat where qator_id = nr1) <> 0 then raise exception 'K2: yangi qator t2_qator_holat F2 si o''zgardi'; end if;

  -- K3
  update public.t2_smeta_versiya_moslik set tasdiq = 'kutilmoqda' where versiya_id = v1 and qator_id = nb2;
  k := public.t2_f2_versiya_kochirma_v1(o, a);
  if exists (select 1 from jsonb_array_elements(k->'qatorlar') e where (e->>'qator_id')::bigint = nb2) then raise exception 'K3a: kutilmoqda moslik bo''yicha F2 ko''chdi'; end if;
  if not exists (select 1 from jsonb_array_elements(k->'moslanmagan') e where (e->>'eski_qator_id')::bigint = b2
                   and e->>'sabab' = 'tasdiq_kutilmoqda' and (e->>'nomzod_qator_id')::bigint = nb2) then raise exception 'K3b: %', k->'moslanmagan'; end if;
  update public.t2_smeta_versiya_moslik set tasdiq = 'rad' where versiya_id = v1 and qator_id = nb2;
  k := public.t2_f2_versiya_kochirma_v1(o, a);
  if not exists (select 1 from jsonb_array_elements(k->'moslanmagan') e where (e->>'eski_qator_id')::bigint = b2 and e->>'sabab' = 'rad_etilgan') then raise exception 'K3c: %', k->'moslanmagan'; end if;
  update public.t2_smeta_versiya_moslik set tasdiq = 'tasdiqlandi' where versiya_id = v1 and qator_id = nb2;

  -- K4: ikkinchi faollashtirish (zanjir).
  -- Faollashtirish yo'li (t2_smeta_import_yakunla_unlocked_v1 va yordamchilari) `on commit drop` vaqtinchalik jadvallar
  -- yaratadi; bitta tranzaksiyada ikkinchi chaqiriq «already exists» beradi. Faqat test: pg_temp dagilarni tozalaymiz
  -- (pg_temp. prefiksi — doimiy jadvalga tegmaydi; prod funksiyalar o'zgarmaydi).
  drop table if exists pg_temp.t2_imp_qator, pg_temp.t2_pkg_imp_qator, pg_temp.t2_smeta_import_map, pg_temp._muhr_eksp,
    pg_temp._ier_k, pg_temp._ier_t, pg_temp._snap_s, pg_temp._snap_j, pg_temp._sv_moslik, pg_temp._sv_qaror, pg_temp._sv_rad;
  r := public.t2_smeta_versiya_faollashtir_v1(c, a, o, jsonb_build_array(
    jsonb_build_object('local_id','rz','tur','rz','nom','_TEST_F2VK_ ЭКСПЕРТИЗА 2'),
    jsonb_build_object('local_id','b1','parent_local_id','rz','tur','bl','kod','T1-1','nom','ИШ БИР СИНОВ','birlik','М3','hajm','9'),
    jsonb_build_object('local_id','r1','parent_local_id','b1','tur','rs','kod','R1Y','nom','ЦЕМЕНТ СИНОВ','birlik','Т','hajm','9','narx','100','summa','900','norma','1'),
    jsonb_build_object('local_id','b2','parent_local_id','rz','tur','bl','kod','T2-2','nom','ИШ ИККИ СИНОВ','birlik','М2','hajm','5'),
    jsonb_build_object('local_id','r2','parent_local_id','b2','tur','rs','kod','R2','nom','ГВОЗДИ СИНОВ','birlik','КГ','hajm','5','narx','100','summa','500','norma','1')
  ), jsonb_build_object('nom','_TEST_F2VK_ v2'), gen_random_uuid());
  if coalesce(r->>'ok','') <> 'true' then raise exception 'K4: ikkinchi faollashtirish: %', r; end if;
  select q.id into nr1 from public.t2_qator q where q.obyekt_id = o and q.versiya_holat = 'faol' and q.tur = 'rs' and q.nom = 'ЦЕМЕНТ СИНОВ';
  select q.id into nb2 from public.t2_qator q where q.obyekt_id = o and q.versiya_holat = 'faol' and q.tur = 'bl' and q.kod = 'T2-2';
  k := public.t2_f2_versiya_kochirma_v1(o, a);
  if not exists (select 1 from jsonb_array_elements(k->'qatorlar') e where (e->>'qator_id')::bigint = nr1
                   and (e->>'f2_avvalgi_summa')::numeric = 400 and (e->>'zanjir_qadam')::int = 2) then raise exception 'K4a: zanjir ЦЕМЕНТ: %', k->'qatorlar'; end if;
  if not exists (select 1 from jsonb_array_elements(k->'qatorlar') e where (e->>'qator_id')::bigint = nb2 and (e->>'f2_avvalgi_summa')::numeric = 200) then
    raise exception 'K4b: zanjir E2: %', k->'qatorlar'; end if;
  if jsonb_array_length(k->'versiyalar') <> 2 then raise exception 'K4c: versiyalar %', k->'versiyalar'; end if;

  -- K5: qoralama F2 (1 × 100) hech qayerda yo'q.
  if (k->'jami'->>'eski_summa')::numeric <> 650 then raise exception 'K5: tasdiqlanmagan F2 sanaldi: %', k->'jami'; end if;

  -- K6: tenant izolyatsiyasi.
  ok := false;
  begin perform public.t2_f2_versiya_kochirma_v1(o, b); exception when others then ok := true; end;
  if not ok then raise exception 'K6a: boshqa kompaniya a''zosi boshqa tenant F2 sini o''qidi'; end if;
  ok := false;
  begin perform public.t2_f2_versiya_kochirma_v1(o, x); exception when others then ok := true; end;
  if not ok then raise exception 'K6b: a''zo bo''lmagan foydalanuvchi o''qidi'; end if;
  if (public.t2_f2_versiya_kochirma_v1(-1, a)->>'code') is distinct from 'OBYEKT_NOT_FOUND' then raise exception 'K6c: yo''q obyekt'; end if;
  if has_function_privilege('authenticated', 'public.t2_f2_versiya_kochirma_v1(bigint,bigint)', 'execute')
     or has_function_privilege('anon', 'public.t2_f2_versiya_kochirma_v1(bigint,bigint)', 'execute')
     or not has_function_privilege('service_role', 'public.t2_f2_versiya_kochirma_v1(bigint,bigint)', 'execute') then
    raise exception 'K6d: EXECUTE ruxsati noto''g''ri'; end if;

  -- K7
  if exists (select 1 from public.t2_versiya_xabardorlik_audit_v1() z where z.nom like '%t2_f2_versiya_kochirma_v1%') then
    raise exception 'K7: versiya qo''riqchisi funksiyani qaytardi'; end if;

  raise notice 'F2_VERSIYA_KOCHIRMA_ACCEPTANCE_PASS obyekt=% kochdi=% moslanmagan=%', o, k->'jami'->>'kochdi_soni', k->'jami'->>'moslanmagan_soni';
end $test$;
rollback;
