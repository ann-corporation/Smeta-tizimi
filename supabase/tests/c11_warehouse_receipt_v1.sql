-- Synthetic, rollback-only contract acceptance for C11.1.
-- Run only against a disposable/dev DB after the migration. Configure a seeded
-- test tenant, active warehouse, actor with document.write, verified R2 test
-- document (active + stored + server sha256_verified), and a second tenant:
--   SET t2.c11_test_company_id = '...';
--   SET t2.c11_test_actor_id = '...';
--   SET t2.c11_test_warehouse_id = '...';
--   SET t2.c11_test_foreign_warehouse_id = '...';
--   SET t2.c11_test_document_id = '...';
--   SET t2.c11_test_reuploaded_document_id = '...'; -- same verified SHA-256, different registry ID
--   SET t2.c11_test_null_hash_document_id = '...'; -- active/stored/verified=true but SHA-256 NULL
--   SET t2.c11_test_other_company_id = '...';
-- These IDs must identify synthetic fixtures only. All writes below roll back.
-- Use c11-warehouse-pglite.mjs for source-only synthetic execution; its auth
-- guards are mocks and do not claim parity with production authorization.

BEGIN;

DO $acceptance$
DECLARE
  v_company bigint := current_setting('t2.c11_test_company_id')::bigint;
  v_actor bigint := current_setting('t2.c11_test_actor_id')::bigint;
  v_warehouse bigint := current_setting('t2.c11_test_warehouse_id')::bigint;
  v_foreign_warehouse bigint := current_setting('t2.c11_test_foreign_warehouse_id')::bigint;
  v_document bigint := current_setting('t2.c11_test_document_id')::bigint;
  v_reuploaded_document bigint := current_setting('t2.c11_test_reuploaded_document_id')::bigint;
  v_null_hash_document bigint := current_setting('t2.c11_test_null_hash_document_id')::bigint;
  v_other_company bigint := current_setting('t2.c11_test_other_company_id')::bigint;
  v_op uuid := 'c1100000-0000-4000-8000-000000000101';
  v_storno_op uuid := 'c1100000-0000-4000-8000-000000000102';
  v_conflict jsonb;
  v_first jsonb;
  v_retry jsonb;
  v_duplicate jsonb;
  v_storno jsonb;
  v_storno_retry jsonb;
  v_storno_again jsonb;
  v_payload jsonb;
  v_first_id bigint;
  v_storno_id bigint;
  v_count integer;
  v_qty numeric;
  v_def text;
  v_bad_batch jsonb;
BEGIN
  ASSERT v_company <> v_other_company, 'test tenants must be distinct';
  ASSERT EXISTS (
    SELECT 1 FROM public.t2_sklad_mustaqil
     WHERE id = v_warehouse AND kompaniya_id = v_company AND holat = 'faol'
  ), 'test warehouse must be active in test tenant';
  ASSERT EXISTS (
    SELECT 1 FROM public.t2_sklad_mustaqil
     WHERE id = v_foreign_warehouse AND kompaniya_id = v_other_company AND holat = 'faol'
  ), 'foreign warehouse fixture must belong to the other tenant';
  ASSERT EXISTS (
    SELECT 1 FROM public.t2_document_registry
     WHERE id = v_document AND kompaniya_id = v_company
       AND provider = 'cloudflare_r2' AND status = 'active'
       AND canonical_storage_status = 'stored'
       AND sha256_verified IS TRUE AND sha256 ~* '^[0-9a-f]{64}$'
  ), 'test source document must be a verified synthetic canonical R2 fixture';
  ASSERT EXISTS (
    SELECT 1 FROM public.t2_document_registry AS d
    JOIN public.t2_document_registry AS original
      ON original.id = v_document AND original.kompaniya_id = d.kompaniya_id
     AND lower(original.sha256) = lower(d.sha256)
   WHERE d.id = v_reuploaded_document AND d.kompaniya_id = v_company
     AND d.provider = 'cloudflare_r2' AND d.status = 'active'
     AND d.canonical_storage_status = 'stored' AND d.sha256_verified IS TRUE
     AND d.sha256 ~* '^[0-9a-f]{64}$'
  ), 're-upload fixture must have same verified bytes but a different registry ID';
  ASSERT v_null_hash_document <> v_document AND EXISTS (
    SELECT 1 FROM public.t2_document_registry
     WHERE id = v_null_hash_document AND kompaniya_id = v_company
       AND provider = 'cloudflare_r2' AND status = 'active'
       AND canonical_storage_status = 'stored' AND sha256_verified IS TRUE
       AND sha256 IS NULL
  ), 'null-hash fixture must exercise the verified=true/null-hash edge case';
  ASSERT NOT has_function_privilege('anon', 'public.t2_sklad_markaziy_prixod_import_v1(bigint,bigint,bigint,bigint,text,jsonb,uuid)', 'EXECUTE'),
    'anon must not execute receipt RPC';
  ASSERT NOT has_function_privilege('authenticated', 'public.t2_sklad_markaziy_prixod_import_v1(bigint,bigint,bigint,bigint,text,jsonb,uuid)', 'EXECUTE'),
    'authenticated must not execute receipt RPC directly';
  ASSERT has_function_privilege('service_role', 'public.t2_sklad_markaziy_prixod_import_v1(bigint,bigint,bigint,bigint,text,jsonb,uuid)', 'EXECUTE'),
    'gateway service_role must execute receipt RPC';

  v_bad_batch := public.t2_sklad_markaziy_prixod_import_v1(
    v_actor, v_company, v_warehouse, v_document, 'Приход', jsonb_build_object('not','array'),
    'c1100000-0000-4000-8000-000000000100'::uuid
  );
  ASSERT NOT (v_bad_batch->>'ok')::boolean AND v_bad_batch->>'code' = 'BATCH_INVALID',
    'a non-array batch must return BATCH_INVALID without array_length SQL error';

  v_bad_batch := public.t2_sklad_markaziy_prixod_import_v1(
    v_actor, v_company, v_warehouse, v_null_hash_document, 'Приход',
    jsonb_build_array(jsonb_build_object('source_row', 900, 'sana', CURRENT_DATE::text,
      'nomi', 'C11 null hash must reject', 'birligi', 'dona', 'obyomi', '1')),
    'c1100000-0000-4000-8000-000000000099'::uuid
  );
  ASSERT NOT (v_bad_batch->>'ok')::boolean AND v_bad_batch->>'code' = 'SOURCE_DOCUMENT_NOT_VERIFIED',
    'sha256_verified=true with a NULL sha256 must be rejected';

  v_payload := jsonb_build_array(
    jsonb_build_object('source_row', 901, 'sana', CURRENT_DATE::text, 'nomi', 'C11 synthetic aggregate', 'birligi', 'dona', 'obyomi', '5'),
    jsonb_build_object('source_row', 902, 'sana', CURRENT_DATE::text, 'nomi', 'C11 synthetic aggregate', 'birligi', 'dona', 'obyomi', '2'),
    jsonb_build_object('source_row', 903, 'sana', CURRENT_DATE::text, 'nomi', 'C11 synthetic aggregate', 'birligi', 'kg', 'obyomi', '7')
  );

  v_first := public.t2_sklad_markaziy_prixod_import_v1(
    v_actor, v_company, v_warehouse, v_document, 'Приход', v_payload, v_op
  );
  ASSERT (v_first->>'ok')::boolean AND NOT (v_first->>'takror')::boolean,
    'valid receipt batch must post once';
  ASSERT (v_first->>'qator_soni')::integer = 3,
    'same material on two physical rows and a second unit must remain three rows';
  ASSERT jsonb_array_length(v_first->'qatorlar') = 3,
    'all accepted source row IDs must be returned';

  v_first_id := (v_first->'qatorlar'->0->>'harakat_id')::bigint;
  v_retry := public.t2_sklad_markaziy_prixod_import_v1(
    v_actor, v_company, v_warehouse, v_document, 'Приход', v_payload, v_op
  );
  ASSERT (v_retry->>'ok')::boolean AND (v_retry->>'takror')::boolean
         AND v_retry->'qatorlar' = v_first->'qatorlar',
    'same tenant + operation_id + same request hash must replay original movement IDs';

  v_conflict := public.t2_sklad_markaziy_prixod_import_v1(
    v_actor, v_company, v_warehouse, v_document, 'Приход',
    v_payload || jsonb_build_array(jsonb_build_object('source_row', 904, 'sana', CURRENT_DATE::text,
      'nomi', 'C11 changed payload', 'birligi', 'dona', 'obyomi', '1')),
    v_op
  );
  ASSERT NOT (v_conflict->>'ok')::boolean AND v_conflict->>'code' = 'OPERATION_ID_CONFLICT',
    'same operation ID with a different payload must conflict';

  v_duplicate := public.t2_sklad_markaziy_prixod_import_v1(
    v_actor, v_company, v_warehouse, v_document, 'Приход', v_payload,
    'c1100000-0000-4000-8000-000000000103'::uuid
  );
  ASSERT NOT (v_duplicate->>'ok')::boolean AND v_duplicate->>'code' = 'SOURCE_ROW_ALREADY_POSTED',
    'same document physical rows under another operation must not post twice';

  v_duplicate := public.t2_sklad_markaziy_prixod_import_v1(
    v_actor, v_company, v_warehouse, v_reuploaded_document, 'Приход', v_payload,
    'c1100000-0000-4000-8000-000000000107'::uuid
  );
  ASSERT NOT (v_duplicate->>'ok')::boolean AND v_duplicate->>'code' = 'SOURCE_ROW_ALREADY_POSTED',
    'same source SHA-256 re-registered under a new document ID must deduplicate by physical row';

  SELECT count(*) INTO v_count
    FROM public.t2_sklad_harakat
   WHERE kompaniya_id = v_company AND c11_document_id = v_document
     AND c11_source_sheet = 'Приход' AND c11_source_row IN (901,902,903)
     AND manba = 'c11_warehouse_receipt_v1';
  ASSERT v_count = 3, 'distinct physical source rows must survive even with same name/unit/quantity';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.t2_sklad_harakat
     WHERE kompaniya_id = v_company AND c11_source_row IN (901,902,903)
       AND c11_source_sha256 = lower((SELECT sha256 FROM public.t2_document_registry WHERE id = v_document))
       AND (c11_actor_id IS DISTINCT FROM v_actor)
  ), 'each receipt row must retain its validated actor as a typed FK';

  SELECT count(*), sum(qoldiq) INTO v_count, v_qty
    FROM public.t2_sklad_ombor_qoldiq_v1
   WHERE kompaniya_id = v_company AND sklad_id = v_warehouse
     AND material_nomi = 'C11 synthetic aggregate';
  ASSERT v_count = 2, 'derived stock must keep exact material+unit as separate groups';
  ASSERT v_qty = 14, 'derived stock must sum receipt quantities without a mutable cache';

  v_storno := public.t2_sklad_markaziy_prixod_storno_v1(
    v_actor, v_company, v_first_id, 'synthetic acceptance reversal', v_storno_op
  );
  ASSERT (v_storno->>'ok')::boolean AND NOT (v_storno->>'takror')::boolean,
    'first storno within 24 hours must append one reverse movement';
  v_storno_id := (v_storno->>'storno_id')::bigint;
  v_storno_retry := public.t2_sklad_markaziy_prixod_storno_v1(
    v_actor, v_company, v_first_id, 'synthetic acceptance reversal', v_storno_op
  );
  ASSERT (v_storno_retry->>'takror')::boolean
         AND (v_storno_retry->>'storno_id')::bigint = v_storno_id,
    'same storno operation must replay the same reverse movement';
  v_storno_again := public.t2_sklad_markaziy_prixod_storno_v1(
    v_actor, v_company, v_first_id, 'second synthetic reversal',
    'c1100000-0000-4000-8000-000000000104'::uuid
  );
  ASSERT NOT (v_storno_again->>'ok')::boolean AND v_storno_again->>'code' = 'ALREADY_STORNED',
    'a second distinct storno of the same receipt must be refused';
  ASSERT EXISTS (SELECT 1 FROM public.t2_sklad_harakat WHERE id = v_first_id AND holat = 'faol'),
    'storno must not mutate/cancel the original receipt row';
  ASSERT EXISTS (SELECT 1 FROM public.t2_sklad_harakat WHERE id = v_storno_id AND operatsiya = 'rasxod'),
    'storno must be an appended opposite-direction movement';
  ASSERT EXISTS (
    SELECT 1 FROM public.t2_sklad_harakat
     WHERE id = v_first_id AND c11_actor_id = v_actor
  ) AND EXISTS (
    SELECT 1 FROM public.t2_sklad_harakat
     WHERE id = v_storno_id AND c11_actor_id = v_actor
  ), 'receipt and storno must both record the actor in the typed actor column';

  BEGIN
    UPDATE public.t2_sklad_harakat SET holat = 'bekor'
     WHERE id = v_first_id AND kompaniya_id = v_company;
    RAISE EXCEPTION 'append-only trigger did not block legacy cancellation' USING ERRCODE = 'P0001';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    NULL;
  END;
  BEGIN
    DELETE FROM public.t2_sklad_harakat
     WHERE id = v_storno_id AND kompaniya_id = v_company;
    RAISE EXCEPTION 'append-only trigger did not block legacy deletion' USING ERRCODE = 'P0001';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    NULL;
  END;
  ASSERT EXISTS (SELECT 1 FROM public.t2_sklad_harakat WHERE id = v_first_id AND holat = 'faol')
     AND EXISTS (SELECT 1 FROM public.t2_sklad_harakat WHERE id = v_storno_id),
    'legacy status update/delete attempts must not hide or erase receipt/storno history';

  SELECT qoldiq INTO v_qty FROM public.t2_sklad_ombor_qoldiq_v1
   WHERE kompaniya_id = v_company AND sklad_id = v_warehouse
     AND material_nomi = 'C11 synthetic aggregate' AND birligi = 'dona';
  ASSERT v_qty = 2, 'storno must reverse only the selected row in its exact unit';
  SELECT qoldiq INTO v_qty FROM public.t2_sklad_ombor_qoldiq_v1
   WHERE kompaniya_id = v_company AND sklad_id = v_warehouse
     AND material_nomi = 'C11 synthetic aggregate' AND birligi = 'kg';
  ASSERT v_qty = 7, 'storno must leave the other unit untouched';

  v_duplicate := public.t2_sklad_markaziy_prixod_import_v1(
    v_actor, v_company, v_foreign_warehouse, v_document, 'Приход',
    jsonb_build_array(jsonb_build_object('source_row', 905, 'sana', CURRENT_DATE::text,
      'nomi', 'C11 tenant forgery', 'birligi', 'dona', 'obyomi', '1')),
    'c1100000-0000-4000-8000-000000000105'::uuid
  );
  ASSERT NOT (v_duplicate->>'ok')::boolean AND v_duplicate->>'code' = 'WAREHOUSE_SCOPE_MISMATCH',
    'cross-tenant warehouse ID must be rejected even for a valid actor';

  BEGIN
    v_duplicate := public.t2_sklad_markaziy_prixod_import_v1(
      v_actor, v_other_company, v_warehouse, v_document, 'Приход',
      jsonb_build_array(jsonb_build_object('source_row', 906, 'sana', CURRENT_DATE::text,
        'nomi', 'C11 forged tenant', 'birligi', 'dona', 'obyomi', '1')),
      'c1100000-0000-4000-8000-000000000106'::uuid
    );
    ASSERT NOT coalesce((v_duplicate->>'ok')::boolean, false),
      'actor from tenant A must not post in tenant B';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  -- The function must hold both locks used to serialize operation replay and
  -- same-document physical-row dedup. True two-session contention is a separate
  -- PGlite is single-connection and cannot prove contention behavior. It can
  -- assert the production RPC uses operation and source advisory locks plus
  -- the row lock that stabilizes verified registry metadata.
  SELECT pg_get_functiondef('public.t2_sklad_markaziy_prixod_import_v1(bigint,bigint,bigint,bigint,text,jsonb,uuid)'::regprocedure)
    INTO v_def;
  ASSERT position('pg_advisory_xact_lock' in v_def) > 0
         AND position('FOR KEY SHARE' in v_def) > 0,
    'RPC must serialize operation/file identity and stabilize verified registry metadata';
  ASSERT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public'
      AND indexname = 't2_sklad_harakat_c11_source_row_uq'
  ), 'physical source row must have a unique dedup index';
END
$acceptance$;

ROLLBACK;
