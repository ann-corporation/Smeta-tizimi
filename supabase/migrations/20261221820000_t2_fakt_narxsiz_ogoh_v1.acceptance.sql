-- ACCEPTANCE: 20261221820000 (fakt narxsiz ogohlantirish). FAQAT sintetik fixture; BEGIN..ROLLBACK. Muvaffaqiyat: NOTICE 'FAKT_NARXSIZ_OGOH_ACCEPTANCE_PASS'.
-- Fixture: mat M1 (narx NULL), M2 (narx 0), M3 (narx 50), bl B1 (narx NULL).
--   T1 M1+M2+M3+B1 ga fakt: ok=true (BLOKLANMAYDI); narxsiz_soni = 1 (faqat M1: narx 0 narxsiz emas, bl sanalmaydi); narxsiz_qatorlar = [M1];
--      narxsiz_ogohlantirish matni bor; contract/entry_policy avvalgidek.
--   T2 faqat M3 (narxli) — narxsiz kalitlari YO'Q.
--   T3 M1 summasi bo'sh qoladi (NULL, 0 emas); M2 summasi 0.
--   T4 takror (bir xil operation_id) — ogohlantirish yana ko'rsatiladi, yangi hujjat yo'q.
begin;
do $acc$
declare
  k bigint; a bigint; o bigint; rz bigint; b1 bigint; m1 bigint; m2 bigint; m3 bigint;
  mat text := U&'\041C\0410\0422';
  r jsonb; r2 jsonb; r3 jsonb; s1 numeric; s2 numeric; op1 uuid := gen_random_uuid(); op2 uuid := gen_random_uuid();
begin
  insert into public.t2_kompaniya(nom, kod) values ('_TEST_NARXSIZ_', gen_random_uuid()::text) returning id into k;
  insert into public.t2_foydalanuvchi(login, ism) values ('_TEST_NARXSIZ_a_' || gen_random_uuid(), '_TEST_ PTO') returning id into a;
  insert into public.t2_azolik(foydalanuvchi_id, kompaniya_id, rol) values (a, k, 'admin');
  insert into public.t2_obyekt(nom, kompaniya_id) values ('_TEST_NARXSIZ_', k) returning id into o;
  insert into public.t2_qator(obyekt_id, kompaniya_id, tur, nom, tartib) values (o, k, 'rz', '_TEST_ RAZDEL', 1) returning id into rz;
  insert into public.t2_qator(obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm, narx, summa, kat, tartib, daraja)
    values (o, k, rz, 'bl', 'B1', 'TEST ISH', 'М', 10, null, null, null, 2, 1) returning id into b1;
  insert into public.t2_qator(obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm, narx, summa, kat, tartib, daraja)
    values (o, k, b1, 'mat', 'M1', 'TEST NARXSIZ', 'М', 10, null, null, mat, 3, 2) returning id into m1;
  insert into public.t2_qator(obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm, narx, summa, kat, tartib, daraja)
    values (o, k, b1, 'mat', 'M2', 'TEST NOL NARX', 'М', 10, 0, 0, mat, 4, 2) returning id into m2;
  insert into public.t2_qator(obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm, narx, summa, kat, tartib, daraja)
    values (o, k, b1, 'mat', 'M3', 'TEST NARXLI', 'М', 10, 50, 500, mat, 5, 2) returning id into m3;

  r := public.t2_fakt_yoz_v2(o, date '2026-03-05',
         jsonb_build_array(jsonb_build_object('qator_id', m1, 'hajm', 1), jsonb_build_object('qator_id', m2, 'hajm', 1),
                           jsonb_build_object('qator_id', m3, 'hajm', 1), jsonb_build_object('qator_id', b1, 'hajm', 1)),
         a, op1, 'acceptance');
  if (r->>'ok')::boolean is not true then raise exception 'T1: ok=false: %', r; end if;
  if (r->>'narxsiz_soni')::int is distinct from 1 then raise exception 'T1: narxsiz_soni kutilgan 1: %', r; end if;
  if jsonb_array_length(r->'narxsiz_qatorlar') <> 1 or (r->'narxsiz_qatorlar'->0->>'qator_id')::bigint <> m1 then raise exception 'T1: narxsiz_qatorlar: %', r; end if;
  if coalesce(r->>'narxsiz_ogohlantirish', '') = '' then raise exception 'T1: ogohlantirish matni yo''q: %', r; end if;
  if r->>'contract' is distinct from 'FAKT_V2' or r->>'entry_policy' is distinct from 'BL_MAT_OB_RS_F2_COPY' then raise exception 'T1: eski kalitlar: %', r; end if;

  select aq.summa into s1 from public.t2_akt_qator aq where aq.akt_id = (r->>'akt_id')::bigint and aq.qator_id = m1;
  select aq.summa into s2 from public.t2_akt_qator aq where aq.akt_id = (r->>'akt_id')::bigint and aq.qator_id = m2;
  if s1 is not null then raise exception 'T3: M1 summasi NULL bo''lishi kerak, bor: %', s1; end if;
  if s2 is distinct from 0 then raise exception 'T3: M2 summasi 0 bo''lishi kerak, bor: %', s2; end if;

  r2 := public.t2_fakt_yoz_v2(o, date '2026-03-06', jsonb_build_array(jsonb_build_object('qator_id', m3, 'hajm', 1)), a, op2, 'acceptance 2');
  if (r2->>'ok')::boolean is not true then raise exception 'T2: ok=false: %', r2; end if;
  if r2 ? 'narxsiz_soni' or r2 ? 'narxsiz_qatorlar' or r2 ? 'narxsiz_ogohlantirish' then raise exception 'T2: narxli qatorda ogohlantirish bo''lmasligi kerak: %', r2; end if;

  r3 := public.t2_fakt_yoz_v2(o, date '2026-03-05',
         jsonb_build_array(jsonb_build_object('qator_id', m1, 'hajm', 1), jsonb_build_object('qator_id', m2, 'hajm', 1),
                           jsonb_build_object('qator_id', m3, 'hajm', 1), jsonb_build_object('qator_id', b1, 'hajm', 1)),
         a, op1, 'acceptance');
  if (r3->>'takror')::boolean is not true or (r3->>'akt_id') is distinct from (r->>'akt_id') then raise exception 'T4: takror: %', r3; end if;
  if (r3->>'narxsiz_soni')::int is distinct from 1 then raise exception 'T4: takrorda ogohlantirish yo''q: %', r3; end if;

  raise notice 'FAKT_NARXSIZ_OGOH_ACCEPTANCE_PASS';
end $acc$;
rollback;
