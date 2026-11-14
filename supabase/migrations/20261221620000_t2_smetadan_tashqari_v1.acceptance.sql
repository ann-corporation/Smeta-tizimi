-- ACCEPTANCE: 20261221620000 (smetadan tashqari). FAQAT sintetik fixture; BEGIN..ROLLBACK. Muvaffaqiyat: NOTICE 'SMETADAN_TASHQARI_ACCEPTANCE_PASS'.
-- Fixture: asl smeta 1000 (mat); qo'shimcha «ekspert» bo'limi 200 (ustamasiz belgili yaxlit bo'lim) + shu qatorda F-2 qoralama aktida 200.
--   T1 belgisiz: smeta_joriy 1200 (hozirgidek), smeta 1000, paketda 'smetadan_tashqari' yo'q.
--   T2 belgilangach (RPC): smeta_joriy 1000; paket.smetadan_tashqari = 200 (+QQS bilan, soni 1); smeta 1000 o'zgarmaydi;
--      f2_qoralama / aktlar / fakt paketlari belgigacha bo'lgan qiymatga AYNAN teng (qo'shimcha ish F-2 da hisoblanadi).
--   T3 t2_smeta_ozgarish_qatlam_v1: joriy 1000, o'zgarish 0 (qo'shimcha chiqdi), smetadan_tashqari 200 + qatorlar; invariant_ok.
--   T4 RPC: takror — idempotent; eski versiya — VERSIYA; sabab bo'sh — rad; boshqa kompaniya — rad; anon/authenticated EXECUTE yo'q.
--   T5 belgi olib tashlansa — hamma narsa avvalgi holatga qaytadi; T6 versiya qo'riqchisi yangi/yamalgan funksiyalarni belgilamaydi.
begin;
do $acc$
declare
  k bigint; k2 bigint; a bigint; b bigint; o bigint; rz bigint; m1 bigint; ez bigint; eb bigint; em bigint; yx bigint; ak bigint;
  mat text := U&'\041C\0410\0422';
  sj0 jsonb; sj1 jsonb; sm0 jsonb; sm1 jsonb; f0 jsonb; f1 jsonb; fk0 jsonb; fk1 jsonb; ak0 jsonb; ak1 jsonb; r jsonb; r2 jsonb; ok boolean; foiz numeric;
begin
  insert into public.t2_kompaniya(nom, kod) values ('_TEST_TASHQARI_', gen_random_uuid()::text) returning id into k;
  insert into public.t2_kompaniya(nom, kod) values ('_TEST_TASHQARI_2', gen_random_uuid()::text) returning id into k2;
  insert into public.t2_foydalanuvchi(login, ism) values ('_TEST_TASHQARI_a_' || gen_random_uuid(), '_TEST_ PTO') returning id into a;
  insert into public.t2_foydalanuvchi(login) values ('_TEST_TASHQARI_b_' || gen_random_uuid()) returning id into b;
  insert into public.t2_azolik(foydalanuvchi_id, kompaniya_id, rol) values (a, k, 'admin'), (b, k2, 'admin');
  insert into public.t2_obyekt(nom, kompaniya_id) values ('_TEST_TASHQARI_', k) returning id into o;

  insert into public.t2_qator(obyekt_id, kompaniya_id, tur, nom, tartib) values (o, k, 'rz', '_TEST_ RAZDEL', 1) returning id into rz;
  insert into public.t2_qator(obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm, narx, summa, kat, tartib, daraja)
    values (o, k, rz, 'mat', 'M1', 'TEST PLITA', 'М', 10, 100, 1000, mat, 2, 1) returning id into m1;
  -- Ekspert bo'limi: qo'shimcha rz → bl → mat 1 × 200; bl belgili yaxlit bo'lim (ustamasiz).
  insert into public.t2_qator(obyekt_id, kompaniya_id, tur, nom, tartib, qoshimcha, change_type) values (o, k, 'rz', '_TEST_ TASHQARI', 3, true, 'ADDITIONAL') returning id into ez;
  insert into public.t2_qator(obyekt_id, kompaniya_id, ota_id, tur, nom, tartib, daraja, qoshimcha, change_type) values (o, k, ez, 'bl', '_TEST_ EXPERT', 4, 1, true, 'ADDITIONAL') returning id into eb;
  insert into public.t2_qator(obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm, narx, summa, kat, tartib, daraja, qoshimcha, change_type)
    values (o, k, eb, 'mat', 'E1', 'TEST EXPERT SERVICE', 'SHT', 1, 200, 200, mat, 5, 2, true, 'ADDITIONAL') returning id into em;
  insert into public.t2_svod_yaxlit(kompaniya_id, obyekt_id, qator_id, sabab, turi, faol) values (k, o, eb, 'acceptance', 'ustamasiz', true) returning id into yx;
  perform public.t2_rollup(o);
  insert into public.t2_akt(obyekt_id, kompaniya_id, tur, raqam, oy, holat) values (o, k, 'f2', 'T-1', date '2026-03-01', 'qoralama') returning id into ak;
  insert into public.t2_akt_qator(akt_id, qator_id, obyekt_id, kompaniya_id, hajm, narx) values (ak, m1, o, k, 10, 100), (ak, em, o, k, 1, 200);

  -- T1: belgisiz (hozirgidek).
  select x.paket into sj0 from public._t2_summa_paket_v1(array[o], 'smeta_joriy') x;
  select x.paket into sm0 from public._t2_summa_paket_v1(array[o], 'smeta') x;
  select x.paket into f0 from public._t2_summa_paket_v1(array[o], 'f2_qoralama') x;
  select x.paket into fk0 from public._t2_summa_paket_v1(array[o], 'fakt') x;
  select x.paket into ak0 from public._t2_summa_paket_v1(array[o], 'aktlar', array[ak]) x;
  if (sj0->>'ustamasiz')::numeric <> 1200 then raise exception 'T1a: smeta_joriy 1200 emas: %', sj0; end if;
  if (sm0->>'ustamasiz')::numeric <> 1000 then raise exception 'T1b: smeta 1000 emas: %', sm0; end if;
  if sj0 ? 'smetadan_tashqari' or sm0 ? 'smetadan_tashqari' then raise exception 'T1c: belgisiz paketda smetadan_tashqari bor'; end if;
  if (f0->>'ustamasiz')::numeric <> 1200 then raise exception 'T1d: f2_qoralama 1200 emas: %', f0; end if;

  -- T2: RPC bilan belgilash.
  r := public.t2_svod_yaxlit_tashqari_v1(k, a, yx, true, 1, '_TEST_ sabab: smetadan tashqari');
  if coalesce(r->>'ok', '') <> 'true' or (r->>'versiya')::int <> 2 then raise exception 'T2a: belgilanmadi: %', r; end if;
  select x.paket into sj1 from public._t2_summa_paket_v1(array[o], 'smeta_joriy') x;
  select x.paket into sm1 from public._t2_summa_paket_v1(array[o], 'smeta') x;
  select x.paket into f1 from public._t2_summa_paket_v1(array[o], 'f2_qoralama') x;
  select x.paket into fk1 from public._t2_summa_paket_v1(array[o], 'fakt') x;
  select x.paket into ak1 from public._t2_summa_paket_v1(array[o], 'aktlar', array[ak]) x;
  if (sj1->>'ustamasiz')::numeric <> 1000 then raise exception 'T2b: smeta_joriy 1000 emas (tashqari chiqmadi): %', sj1; end if;
  foiz := (sj1->'smetadan_tashqari'->>'qqs_foiz')::numeric;
  if (sj1->'smetadan_tashqari'->>'ustamasiz')::numeric <> 200 or (sj1->'smetadan_tashqari'->>'soni')::int <> 1
     or (sj1->'smetadan_tashqari'->>'qqs_bilan')::numeric <> round(200 * (1 + foiz / 100), 2) then
    raise exception 'T2c: paket.smetadan_tashqari: %', sj1->'smetadan_tashqari'; end if;
  if sm1 is distinct from sm0 then raise exception 'T2d: asl smeta paketi o''zgardi: % / %', sm0, sm1; end if;
  if f1 is distinct from f0 or fk1 is distinct from fk0 or ak1 is distinct from ak0 then
    raise exception 'T2e: f2_qoralama/fakt/aktlar paketi o''zgardi (F-2 imzolangan hujjat bilan moslik buzildi)'; end if;
  if (sj1->>'qqs_bilan')::numeric >= (sj0->>'qqs_bilan')::numeric or (sj1->>'ustamali')::numeric >= (sj0->>'ustamali')::numeric then
    raise exception 'T2f: QQS bilan / ustamali kamaymadi'; end if;

  -- T3: o'zgarishlar qatlami RPC si.
  r2 := public.t2_smeta_ozgarish_qatlam_v1(o, a);
  if coalesce(r2->>'ok', '') <> 'true' then raise exception 'T3: %', r2; end if;
  if (r2->'asl'->>'ustamasiz')::numeric <> 1000 or (r2->'joriy'->>'ustamasiz')::numeric <> 1000
     or (r2->'ozgarish'->>'ustamasiz')::numeric <> 0 or (r2->'ozgarish'->>'qoshimcha')::numeric <> 0
     or (r2->'qoshimcha'->>'soni')::int <> 0 or (r2->'ozgarish'->>'invariant_ok')::boolean is not true then
    raise exception 'T3a: asl/joriy/o''zgarish: %', (r2->'asl') || (r2->'joriy') || (r2->'ozgarish' - 'kesim'); end if;
  if (r2->'smetadan_tashqari'->>'ustamasiz')::numeric <> 200 or (r2->'smetadan_tashqari'->'qatorlar'->0->>'qator_id')::bigint <> eb
     or (r2->'smetadan_tashqari'->'qatorlar'->0->>'summa')::numeric <> 200 then
    raise exception 'T3b: smetadan_tashqari: %', r2->'smetadan_tashqari'; end if;

  -- T4: RPC himoyalari.
  r := public.t2_svod_yaxlit_tashqari_v1(k, a, yx, true, 2, '_TEST_ takror');
  if coalesce(r->>'ok', '') <> 'true' or (r->>'takror')::boolean is not true then raise exception 'T4a: takror idempotent emas: %', r; end if;
  r := public.t2_svod_yaxlit_tashqari_v1(k, a, yx, false, 1, '_TEST_ eski versiya');
  if r->>'code' <> 'VERSIYA' then raise exception 'T4b: eski versiya o''tdi: %', r; end if;
  r := public.t2_svod_yaxlit_tashqari_v1(k, a, yx, false, 2, '  ');
  if r->>'code' <> 'SABAB_REQUIRED' then raise exception 'T4c: sababsiz o''tdi: %', r; end if;
  ok := false;
  begin perform public.t2_svod_yaxlit_tashqari_v1(k, b, yx, false, 2, '_TEST_ boshqa kompaniya'); exception when others then ok := true; end;
  if not ok then raise exception 'T4d: boshqa kompaniya a''zosi o''tdi'; end if;
  if has_function_privilege('anon', 'public.t2_svod_yaxlit_tashqari_v1(bigint,bigint,bigint,boolean,integer,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.t2_svod_yaxlit_tashqari_v1(bigint,bigint,bigint,boolean,integer,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public._t2_summa_paket_tashqari_v1(jsonb,jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public._t2_summa_paket_tashqari_v1(jsonb,jsonb)', 'EXECUTE') then
    raise exception 'T4e: anon/authenticated EXECUTE bor'; end if;

  -- T5: belgi olib tashlansa — avvalgi holat.
  r := public.t2_svod_yaxlit_tashqari_v1(k, a, yx, false, 2, '_TEST_ qaytarish');
  if coalesce(r->>'ok', '') <> 'true' then raise exception 'T5a: %', r; end if;
  select x.paket into sj1 from public._t2_summa_paket_v1(array[o], 'smeta_joriy') x;
  if sj1 is distinct from sj0 then raise exception 'T5b: belgisiz holatga qaytmadi: % / %', sj0, sj1; end if;

  -- T6: versiya qo'riqchisi.
  -- (boshqa, avvalgi funksiyalar haqidagi eski qaydlar bu migratsiyaga tegishli emas — faqat yangi obyektlar tekshiriladi.)
  if exists (select 1 from public.t2_versiya_xabardorlik_audit_v1() x
              where x.nom in ('t2_svod_yaxlit_tashqari_v1', '_t2_summa_paket_tashqari_v1', '_t2_summa_agg_v1', '_t2_summa_paket_v1', 't2_smeta_ozgarish_qatlam_v1')) then
    raise exception 'T6: versiya qo''riqchisi yangi/yamalgan funksiyani belgiladi: %',
      (select jsonb_agg(to_jsonb(x)) from public.t2_versiya_xabardorlik_audit_v1() x where x.nom like '%tashqari%' or x.nom in ('_t2_summa_agg_v1', '_t2_summa_paket_v1', 't2_smeta_ozgarish_qatlam_v1')); end if;

  raise notice 'SMETADAN_TASHQARI_ACCEPTANCE_PASS';
end $acc$;
rollback;
