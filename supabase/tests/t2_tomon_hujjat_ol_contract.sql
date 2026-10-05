-- T2_TOMON_HUJJAT_OL — taqdim qilingan R2 hujjatni qabul qiluvchi yuklab olishi (rollback bilan). Natija: oxirgi exception matni.
do $$
declare p bigint; z bigint; x bigint; up bigint; uz bigint; ux bigint; o1 bigint; ly bigint; al bigint; d1 bigint; d2 bigint; r jsonb; rep text[] := array[]::text[];
begin
  insert into t2_kompaniya (nom, kod, inn, faol) values ('TEST_PUD', 'TST-P', '900000001', true) returning id into p;
  insert into t2_kompaniya (nom, kod, inn, faol) values ('TEST_ZAK', 'TST-Z', '900000002', true) returning id into z;
  insert into t2_kompaniya (nom, kod, inn, faol) values ('TEST_BEGONA', 'TST-X', '900000003', true) returning id into x;
  insert into t2_foydalanuvchi (login, ism, holat) values ('tst_up', 'P', 'faol') returning id into up;
  insert into t2_foydalanuvchi (login, ism, holat) values ('tst_uz', 'Z', 'faol') returning id into uz;
  insert into t2_foydalanuvchi (login, ism, holat) values ('tst_ux', 'X', 'faol') returning id into ux;
  insert into t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values (up, p, 'boss', 'faol'), (uz, z, 'boss', 'faol'), (ux, x, 'boss', 'faol');
  insert into t2_loyiha (kompaniya_id, nom) values (p, 'P-loyiha') returning id into ly;
  insert into t2_obyekt (nom, kompaniya_id, loyiha_id) values ('P-obyekt', p, ly) returning id into o1;
  insert into t2_document_registry (kompaniya_id, loyiha_id, obyekt_id, document_type, status, canonical_storage_status, r2_key, original_filename, mime_type, size_bytes, sha256, finalized_at)
    values (p, ly, o1, 'f3', 'active', 'stored', 'docs/p/f3.xlsx', 'F3.xlsx', 'application/octet-stream', 10, repeat('a', 64), now()) returning id into d1;
  insert into t2_document_registry (kompaniya_id, loyiha_id, obyekt_id, document_type, status, canonical_storage_status, r2_key, original_filename, mime_type, size_bytes, sha256, finalized_at)
    values (p, ly, o1, 'f3', 'active', 'stored', 'docs/p/maxfiy.xlsx', 'Maxfiy.xlsx', 'application/octet-stream', 10, repeat('b', 64), now()) returning id into d2;
  r := t2_tomon_taklif_v1(up, p, z, '900000002', null, 'pudratchi', 'zakazchik', 'shartnoma', null, null, null, gen_random_uuid());
  al := (r->>'id')::bigint;
  perform t2_tomon_javob_v1(uz, z, al, 'qabul', null);
  rep := rep || (case when (t2_tomon_hujjat_ol_v1(uz, d1))->>'code' = 'DOCUMENT_FORBIDDEN' then 'OK   yuborilmagan hujjat — yuklab bo''lmaydi' else 'FAIL yuborilmagan hujjat ochildi' end);
  r := t2_tomon_taqdim_yarat_v1(up, p, al, 'hujjat', d1, null, gen_random_uuid());
  rep := rep || (case when (r->>'ok')::boolean then 'OK   hujjat taqdim qilindi' else 'FAIL hujjat taqdim: ' || r::text end);
  r := t2_tomon_hujjat_ol_v1(uz, d1);
  rep := rep || (case when (r->>'ok')::boolean and r->>'r2_key' = 'docs/p/f3.xlsx' then 'OK   qabul qiluvchi taqdim qilingan hujjatni oladi' else 'FAIL qabul qiluvchi: ' || r::text end);
  rep := rep || (case when (t2_tomon_hujjat_ol_v1(uz, d2))->>'code' = 'DOCUMENT_FORBIDDEN' then 'OK   boshqa (yuborilmagan) hujjat yopiq' else 'FAIL boshqa hujjat ochildi' end);
  rep := rep || (case when (t2_tomon_hujjat_ol_v1(ux, d1))->>'code' = 'DOCUMENT_FORBIDDEN' then 'OK   begona kompaniya yuklab ololmaydi' else 'FAIL begona oldi' end);
  perform t2_tomon_holat_v1(uz, z, al, 'toxtatish', null);
  rep := rep || (case when (t2_tomon_hujjat_ol_v1(uz, d1))->>'code' = 'DOCUMENT_FORBIDDEN' then 'OK   aloqa to''xtatilganda yuklab bo''lmaydi' else 'FAIL toxtatilgan aloqa' end);
  rep := rep || (case when not has_function_privilege('anon', 't2_tomon_hujjat_ol_v1(bigint,bigint)', 'execute') then 'OK   anon chaqira olmaydi' else 'FAIL anon' end);
  raise exception 'HUJJAT_OL_TEST %', E'\n' || array_to_string(rep, E'\n');
end $$;
