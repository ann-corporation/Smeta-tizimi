-- T2_DOCUMENT_DEDUP — bir xil mazmun qayta R2 ga yozilmasligi (rollback bilan). Natija: oxirgi exception matni.
do $$
declare p bigint; q bigint; up bigint; uq bigint; ly bigint; o1 bigint; o2 bigint; r1 jsonb; r2 jsonb; r3 jsonb; r4 jsonb; r5 jsonb; r6 jsonb; v_sha text := repeat('a', 64); n int; rep text[] := array[]::text[];
begin
  insert into t2_kompaniya (nom, kod, inn, faol) values ('TEST_P', 'TST-P', '900000001', true) returning id into p;
  insert into t2_kompaniya (nom, kod, inn, faol) values ('TEST_Q', 'TST-Q', '900000002', true) returning id into q;
  insert into t2_foydalanuvchi (login, ism, holat) values ('tst_dp', 'P', 'faol') returning id into up;
  insert into t2_foydalanuvchi (login, ism, holat) values ('tst_dq', 'Q', 'faol') returning id into uq;
  insert into t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values (up, p, 'boss', 'faol'), (uq, q, 'boss', 'faol');
  insert into t2_loyiha (kompaniya_id, nom) values (p, 'L') returning id into ly;
  insert into t2_obyekt (nom, kompaniya_id, loyiha_id) values ('O1', p, ly) returning id into o1;
  insert into t2_obyekt (nom, kompaniya_id, loyiha_id) values ('O2', p, ly) returning id into o2;

  r1 := t2_document_canonical_reserve_v1(p, up, ly, o1, 'f2_akt', 'F2.xlsx', 'application/octet-stream', 100, v_sha, gen_random_uuid());
  rep := rep || (case when (r1->>'ok')::boolean and r1->>'dedup' is null then 'OK   birinchi yuklash yangi hujjat yaratdi' else 'FAIL birinchi: ' || r1::text end);
  -- Hali saqlanmagan (reserved) hujjat dedupe EMAS — yangi urinish alohida
  r2 := t2_document_canonical_reserve_v1(p, up, ly, o1, 'f2_akt', 'F2.xlsx', 'application/octet-stream', 100, v_sha, gen_random_uuid());
  rep := rep || (case when r2->>'dedup' is null and r2->>'document_id' <> r1->>'document_id' then 'OK   saqlanmagan (reserved) hujjat dedupe qilinmaydi' else 'FAIL reserved dedupe: ' || r2::text end);
  update t2_document_registry set canonical_storage_status = 'stored', status = 'active', finalized_at = now() where id = (r1->>'document_id')::bigint;
  r3 := t2_document_canonical_reserve_v1(p, up, ly, o1, 'f2_akt', 'F2.xlsx', 'application/octet-stream', 100, v_sha, gen_random_uuid());
  rep := rep || (case when (r3->>'dedup')::boolean and r3->>'document_id' = r1->>'document_id' and r3->>'canonical_storage_status' = 'stored' then 'OK   bir xil mazmun — mavjud hujjat qaytdi (yangi nusxa yo''q)' else 'FAIL dedupe: ' || r3::text end);
  select count(*) into n from t2_document_registry where kompaniya_id = p and obyekt_id = o1 and document_type = 'f2_akt' and sha256 = v_sha and canonical_storage_status = 'stored';
  rep := rep || (case when n = 1 then 'OK   saqlangan nusxa bitta' else 'FAIL saqlangan nusxa soni ' || n end);
  r4 := t2_document_canonical_reserve_v1(p, up, ly, o2, 'f2_akt', 'F2.xlsx', 'application/octet-stream', 100, v_sha, gen_random_uuid());
  rep := rep || (case when r4->>'dedup' is null and r4->>'document_id' <> r1->>'document_id' then 'OK   boshqa obyektda bir xil fayl dedupe qilinmaydi' else 'FAIL boshqa obyekt: ' || r4::text end);
  r5 := t2_document_canonical_reserve_v1(p, up, ly, o1, 'f2_hujjat', 'F2.xlsx', 'application/octet-stream', 100, v_sha, gen_random_uuid());
  rep := rep || (case when r5->>'dedup' is null then 'OK   boshqa hujjat turida dedupe yo''q' else 'FAIL boshqa tur: ' || r5::text end);
  r6 := t2_document_canonical_reserve_v1(p, up, ly, o1, 'f2_akt', 'F2.xlsx', 'application/octet-stream', 100, repeat('b', 64), gen_random_uuid());
  rep := rep || (case when r6->>'dedup' is null and r6->>'document_id' <> r1->>'document_id' then 'OK   boshqa mazmun — yangi hujjat (yangi revision)' else 'FAIL boshqa mazmun: ' || r6::text end);
  begin perform t2_document_canonical_reserve_v1(p, uq, ly, o1, 'f2_akt', 'F2.xlsx', 'application/octet-stream', 100, v_sha, gen_random_uuid());
    rep := rep || 'FAIL a''zo emas actor dedupe orqali hujjat oldi';
  exception when others then rep := rep || (case when sqlstate = '42501' then 'OK   a''zo emas actor — 42501 (dedupe a''zolikdan keyin)' else 'FAIL: ' || sqlerrm end); end;
  raise exception 'DEDUP_TEST %', E'\n' || array_to_string(rep, E'\n');
end $$;
