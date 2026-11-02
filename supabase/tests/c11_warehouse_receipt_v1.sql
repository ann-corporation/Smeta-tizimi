-- Synthetic, rollback-only contract acceptance for C11.1.
-- Run only against a disposable/dev DB after the migration. This script seeds
-- its own company, active actor/membership, warehouses, and synthetic R2 registry
-- metadata inside the transaction; all fixtures and movements roll back.
-- The R2 rows are metadata only: no object is uploaded or read.
-- Use c11-warehouse-pglite.mjs for source-only synthetic execution; its auth
-- guards are mocks and do not claim parity with production authorization.

BEGIN;

DO $acceptance$
DECLARE
  v_company bigint;
  v_actor bigint;
  v_warehouse bigint;
  v_foreign_warehouse bigint;
  v_document bigint;
  v_reuploaded_document bigint;
  v_null_hash_document bigint;
  v_other_company bigint;
  v_nonmember_actor bigint;
  v_denied_actor bigint;
  v_unknown_actor bigint;
  v_seed_tag uuid := gen_random_uuid();
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
  v_large_payload jsonb;
  v_large_before integer;
  v_large_after integer;
  v_list jsonb;
  v_list_second jsonb;
  v_list_filtered jsonb;
BEGIN
  INSERT INTO public.t2_kompaniya(nom, kod)
    VALUES ('C11 synthetic tenant A ' || v_seed_tag::text, 'C11A-' || replace(v_seed_tag::text, '-', ''))
    RETURNING id INTO v_company;
  INSERT INTO public.t2_kompaniya(nom, kod)
    VALUES ('C11 synthetic tenant B ' || v_seed_tag::text, 'C11B-' || replace(v_seed_tag::text, '-', ''))
    RETURNING id INTO v_other_company;
  INSERT INTO public.t2_foydalanuvchi(login, holat)
    VALUES ('c11-admin-' || v_seed_tag::text, 'faol') RETURNING id INTO v_actor;
  INSERT INTO public.t2_foydalanuvchi(login, holat)
    VALUES ('c11-outsider-' || v_seed_tag::text, 'faol') RETURNING id INTO v_nonmember_actor;
  INSERT INTO public.t2_foydalanuvchi(login, holat)
    VALUES ('c11-denied-' || v_seed_tag::text, 'faol') RETURNING id INTO v_denied_actor;
  INSERT INTO public.t2_azolik(foydalanuvchi_id, kompaniya_id, rol, holat)
    VALUES (v_actor, v_company, 'admin', 'faol'),
           (v_denied_actor, v_company, 'unknown', 'faol');
  SELECT coalesce(max(id), 0) + 1 INTO v_unknown_actor FROM public.t2_foydalanuvchi;
  INSERT INTO public.t2_sklad_mustaqil(kompaniya_id, nomi, holat)
    VALUES (v_company, 'C11 synthetic main warehouse', 'faol') RETURNING id INTO v_warehouse;
  INSERT INTO public.t2_sklad_mustaqil(kompaniya_id, nomi, holat)
    VALUES (v_other_company, 'C11 synthetic foreign warehouse', 'faol') RETURNING id INTO v_foreign_warehouse;
  INSERT INTO public.t2_document_registry
    (kompaniya_id, document_type, provider, status, canonical_storage_status, sha256, sha256_verified, hash_source, r2_bucket, r2_key)
    VALUES (v_company, 'warehouse_receipt', 'cloudflare_r2', 'active', 'stored', repeat('a',64), true, 'server',
      'canonical', 'c11-acceptance/' || v_seed_tag::text || '/source.xlsx')
    RETURNING id INTO v_document;
  INSERT INTO public.t2_document_registry
    (kompaniya_id, document_type, provider, status, canonical_storage_status, sha256, sha256_verified, hash_source, r2_bucket, r2_key)
    VALUES (v_company, 'warehouse_receipt', 'cloudflare_r2', 'active', 'stored', repeat('a',64), true, 'server',
      'canonical', 'c11-acceptance/' || v_seed_tag::text || '/reupload.xlsx')
    RETURNING id INTO v_reuploaded_document;
  INSERT INTO public.t2_document_registry
    (kompaniya_id, document_type, provider, status, canonical_storage_status, sha256, sha256_verified, hash_source, r2_bucket, r2_key)
    VALUES (v_company, 'warehouse_receipt', 'cloudflare_r2', 'active', 'stored', NULL, true, 'server',
      'canonical', 'c11-acceptance/' || v_seed_tag::text || '/null-hash.xlsx')
    RETURNING id INTO v_null_hash_document;

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
       AND r2_bucket = 'canonical'
       AND r2_key = 'c11-acceptance/' || v_seed_tag::text || '/source.xlsx'
  ), 'test source document must be verified and point at a unique synthetic canonical R2 key';
  ASSERT EXISTS (
    SELECT 1 FROM public.t2_document_registry AS d
    JOIN public.t2_document_registry AS original
      ON original.id = v_document AND original.kompaniya_id = d.kompaniya_id
     AND lower(original.sha256) = lower(d.sha256)
   WHERE d.id = v_reuploaded_document AND d.kompaniya_id = v_company
     AND d.provider = 'cloudflare_r2' AND d.status = 'active'
     AND d.canonical_storage_status = 'stored' AND d.sha256_verified IS TRUE
     AND d.sha256 ~* '^[0-9a-f]{64}$'
     AND d.r2_bucket = 'canonical'
     AND d.r2_key = 'c11-acceptance/' || v_seed_tag::text || '/reupload.xlsx'
  ), 're-upload fixture must have same verified bytes and a distinct metadata key';
  ASSERT v_null_hash_document <> v_document AND EXISTS (
    SELECT 1 FROM public.t2_document_registry
     WHERE id = v_null_hash_document AND kompaniya_id = v_company
       AND provider = 'cloudflare_r2' AND status = 'active'
       AND canonical_storage_status = 'stored' AND sha256_verified IS TRUE
       AND sha256 IS NULL AND r2_bucket = 'canonical'
       AND r2_key = 'c11-acceptance/' || v_seed_tag::text || '/null-hash.xlsx'
  ), 'null-hash fixture must keep canonical metadata while exercising the verified=true/null-hash edge case';
  ASSERT NOT has_function_privilege('anon', 'public.t2_sklad_markaziy_prixod_import_v1(bigint,bigint,bigint,bigint,text,jsonb,uuid)', 'EXECUTE'),
    'anon must not execute receipt RPC';
  ASSERT NOT has_function_privilege('authenticated', 'public.t2_sklad_markaziy_prixod_import_v1(bigint,bigint,bigint,bigint,text,jsonb,uuid)', 'EXECUTE'),
    'authenticated must not execute receipt RPC directly';
  ASSERT has_function_privilege('service_role', 'public.t2_sklad_markaziy_prixod_import_v1(bigint,bigint,bigint,bigint,text,jsonb,uuid)', 'EXECUTE'),
    'gateway service_role must execute receipt RPC';
  ASSERT NOT has_function_privilege('anon', 'public.t2_sklad_kirim_royxat_v1(bigint,bigint,bigint,jsonb,integer,integer)', 'EXECUTE'),
    'anon must not execute receipt list RPC';
  ASSERT NOT has_function_privilege('authenticated', 'public.t2_sklad_kirim_royxat_v1(bigint,bigint,bigint,jsonb,integer,integer)', 'EXECUTE'),
    'authenticated must not execute receipt list RPC directly';
  ASSERT has_function_privilege('service_role', 'public.t2_sklad_kirim_royxat_v1(bigint,bigint,bigint,jsonb,integer,integer)', 'EXECUTE'),
    'gateway service_role must execute receipt list RPC';
  BEGIN
    PERFORM public.t2_sklad_markaziy_prixod_import_v1(
      v_unknown_actor, v_company, v_warehouse, v_document, 'Приход',
      jsonb_build_array(jsonb_build_object('source_row', 9901, 'sana', CURRENT_DATE::text,
        'nomi', 'C11 valid auth probe', 'birligi', 'dona', 'obyomi', '1')),
      'c1100000-0000-4000-8000-000000000111'::uuid
    );
    RAISE EXCEPTION 'unknown actor was accepted' USING ERRCODE = 'P0001';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.t2_sklad_markaziy_prixod_import_v1(
      v_nonmember_actor, v_company, v_warehouse, v_document, 'Приход',
      jsonb_build_array(jsonb_build_object('source_row', 9902, 'sana', CURRENT_DATE::text,
        'nomi', 'C11 valid auth probe', 'birligi', 'dona', 'obyomi', '1')),
      'c1100000-0000-4000-8000-000000000112'::uuid
    );
    RAISE EXCEPTION 'nonmember actor was accepted' USING ERRCODE = 'P0001';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.t2_sklad_kirim_royxat_v1(v_denied_actor, v_company, v_warehouse, '{}'::jsonb, 50, 0);
    RAISE EXCEPTION 'unknown-role member was permitted to list receipts' USING ERRCODE = 'P0001';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

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
    jsonb_build_object('source_row', 903, 'sana', CURRENT_DATE::text, 'nomi', 'C11 synthetic aggregate', 'birligi', 'kg', 'obyomi', '7', 'postavshik', 'C11 synthetic supplier',
      'manba_turi', 'c11_acceptance', 'sf_tasdiq', 'C11 SF synthetic'),
    jsonb_build_object('source_row', 901, 'sana', CURRENT_DATE::text, 'nomi', 'C11 synthetic aggregate', 'birligi', 'dona', 'obyomi', '5', 'postavshik', 'C11 synthetic supplier', 'manba_turi', 'c11_acceptance', 'sf_tasdiq', 'C11 SF synthetic'),
    jsonb_build_object('source_row', 902, 'sana', CURRENT_DATE::text, 'nomi', 'C11 synthetic aggregate', 'birligi', 'dona', 'obyomi', '2', 'postavshik', 'C11 synthetic supplier', 'manba_turi', 'c11_acceptance', 'sf_tasdiq', 'C11 SF synthetic')
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
    v_actor, v_company, v_warehouse, v_document, 'Приход',
    jsonb_build_array(v_payload->1, v_payload->2, v_payload->0), v_op
  );
  ASSERT v_retry = v_first,
    'replay must return the identical first response, including takror=false';
  ASSERT (v_first->'qatorlar'->0->>'source_row')::integer = 901
     AND (v_first->'qatorlar'->1->>'source_row')::integer = 902
     AND (v_first->'qatorlar'->2->>'source_row')::integer = 903,
    'accepted response rows must be ordered by physical source row despite unordered input';

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

  v_bad_batch := public.t2_sklad_markaziy_prixod_import_v1(
    v_actor, v_company, v_warehouse, v_document, 'Приход',
    jsonb_build_array(
      jsonb_build_object('source_row', 20001, 'sana', CURRENT_DATE::text, 'nomi', 'C11 should roll back', 'birligi', 'dona', 'obyomi', '1'),
      jsonb_build_object('source_row', 0, 'sana', CURRENT_DATE::text, 'nomi', 'C11 invalid row', 'birligi', 'dona', 'obyomi', '1')
    ), 'c1100000-0000-4000-8000-000000000108'::uuid
  );
  ASSERT NOT (v_bad_batch->>'ok')::boolean AND v_bad_batch->>'code' = 'SOURCE_ROW_INVALID'
     AND NOT EXISTS (SELECT 1 FROM public.t2_sklad_harakat WHERE kompaniya_id = v_company AND c11_source_row = 20001),
    'a bad row must reject the batch without persisting earlier valid rows';

  SELECT jsonb_agg(jsonb_build_object('source_row', 10000 + n, 'sana', CURRENT_DATE::text,
           'nomi', 'C11 bounded batch', 'birligi', 'dona', 'obyomi', '1') ORDER BY n)
    INTO v_large_payload FROM generate_series(1, 1000) AS g(n);
  v_first := public.t2_sklad_markaziy_prixod_import_v1(
    v_actor, v_company, v_warehouse, v_document, 'Приход', v_large_payload,
    'c1100000-0000-4000-8000-000000000109'::uuid
  );
  ASSERT (v_first->>'ok')::boolean AND (v_first->>'qator_soni')::integer = 1000,
    'a batch at the inclusive 1000-row limit must be accepted';
  SELECT count(*) INTO v_large_before FROM public.t2_sklad_harakat
   WHERE kompaniya_id = v_company AND c11_operation_id = 'c1100000-0000-4000-8000-000000000109'::uuid;
  v_bad_batch := public.t2_sklad_markaziy_prixod_import_v1(
    v_actor, v_company, v_warehouse, v_document, 'Приход',
    v_large_payload || jsonb_build_array(jsonb_build_object('source_row', 12000, 'sana', CURRENT_DATE::text,
      'nomi', 'C11 over limit', 'birligi', 'dona', 'obyomi', '1')),
    'c1100000-0000-4000-8000-000000000110'::uuid
  );
  SELECT count(*) INTO v_large_after FROM public.t2_sklad_harakat
   WHERE kompaniya_id = v_company AND c11_operation_id = 'c1100000-0000-4000-8000-000000000110'::uuid;
  ASSERT NOT (v_bad_batch->>'ok')::boolean AND v_bad_batch->>'code' = 'BATCH_INVALID'
     AND v_large_before = 1000 AND v_large_after = 0,
    '1001 rows must be rejected before any movement is written';
  v_retry := public.t2_sklad_markaziy_prixod_import_v1(
    v_actor, v_company, v_warehouse, v_document, 'Приход',
    (SELECT jsonb_agg(e.value ORDER BY (e.value->>'source_row')::integer DESC)
       FROM jsonb_array_elements(v_large_payload) AS e(value)),
    'c1100000-0000-4000-8000-000000000109'::uuid
  );
  SELECT count(*) INTO v_large_after FROM public.t2_sklad_harakat
   WHERE kompaniya_id = v_company AND c11_operation_id = 'c1100000-0000-4000-8000-000000000109'::uuid;
  ASSERT v_retry = v_first AND v_large_after = v_large_before,
    '1000-row reordered replay must return the exact first JSON response without adding movements';

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

  v_list := public.t2_sklad_kirim_royxat_v1(v_actor, v_company, v_warehouse, '{}'::jsonb, 1, 0);
  v_list_second := public.t2_sklad_kirim_royxat_v1(v_actor, v_company, v_warehouse, '{}'::jsonb, 1, 1);
  ASSERT (v_list->>'ok')::boolean AND jsonb_typeof(v_list->'qatorlar') = 'array'
     AND jsonb_array_length(v_list->'qatorlar') = 1
     AND (v_list->>'limit')::integer = 1 AND (v_list->>'offset')::integer = 0
     AND (v_list_second->>'offset')::integer = 1
     AND (v_list->>'jami')::integer = (v_list_second->>'jami')::integer
     AND v_list->'qatorlar' <> v_list_second->'qatorlar',
    'receipt list pages must be stable, distinct, and report the filtered total across pages';
  v_list_filtered := public.t2_sklad_kirim_royxat_v1(
    v_actor, v_company, v_warehouse,
    jsonb_build_object('dan', CURRENT_DATE::text, 'gacha', CURRENT_DATE::text,
      'qidir', 'synthetic aggregate', 'tur', 'mat', 'yetkazuvchi', 'synthetic supplier'),
    1, 0
  );
  ASSERT (v_list_filtered->>'ok')::boolean
     AND (v_list_filtered->>'jami')::integer = 3
     AND jsonb_array_length(v_list_filtered->'qatorlar') = 1
     AND jsonb_array_length(v_list_filtered->'jami_materiallar') = 2
     AND (v_list_filtered->>'rasxod_kiritilgan')::boolean IS FALSE
     AND EXISTS (
       SELECT 1 FROM jsonb_array_elements(v_list_filtered->'jami_materiallar') AS m
        WHERE m->>'nomi' = 'C11 synthetic aggregate' AND m->>'birligi' = 'dona'
          AND (m->>'kirim')::numeric = 7 AND (m->>'storno')::numeric = 5
          AND (m->>'sof_kirim')::numeric = 2
     ),
    'list filters must cover date, case-insensitive material, type, and supplier; totals span the filtered set, preserve exact name+unit with kirim/storno/sof_kirim, and disclose no issue command';
  v_list_filtered := public.t2_sklad_kirim_royxat_v1(
    v_actor, v_company, v_warehouse,
    jsonb_build_object('dan', '2026-02-30'), 50, 0
  );
  ASSERT NOT (v_list_filtered->>'ok')::boolean AND v_list_filtered->>'code' = 'FILTER_INVALID',
    'an impossible filter date must return FILTER_INVALID without raising a date-cast error';
  v_list_filtered := public.t2_sklad_kirim_royxat_v1(v_actor, v_company, v_warehouse, '{}'::jsonb, -1, 0);
  ASSERT NOT (v_list_filtered->>'ok')::boolean AND v_list_filtered->>'code' = 'PAGINATION_INVALID',
    'negative page size must return PAGINATION_INVALID';
  v_list_filtered := public.t2_sklad_kirim_royxat_v1(v_actor, v_company, v_warehouse, '{}'::jsonb, 1, -1);
  ASSERT NOT (v_list_filtered->>'ok')::boolean AND v_list_filtered->>'code' = 'PAGINATION_INVALID',
    'negative page offset must return PAGINATION_INVALID';
  v_list_filtered := public.t2_sklad_kirim_royxat_v1(
    v_actor, v_company, v_warehouse,
    jsonb_build_object('qidir', 'synthetic aggregate', 'tur', 'c11_acceptance'), 50, 0
  );
  ASSERT (v_list_filtered->>'ok')::boolean AND (v_list_filtered->>'jami')::integer = 3
     AND (v_list_filtered->'qatorlar'->0->>'manba_turi') = 'c11_acceptance'
     AND (v_list_filtered->'qatorlar'->0->>'sf_tasdiq') = 'C11 SF synthetic'
     AND (SELECT bool_and(item->>'manba_turi' = 'c11_acceptance' AND item->>'sf_tasdiq' = 'C11 SF synthetic')
            FROM jsonb_array_elements(v_list_filtered->'qatorlar') AS item),
    'source-category filtering must work and both optional SF provenance fields must round-trip in list rows';

  v_duplicate := public.t2_sklad_markaziy_prixod_import_v1(
    v_actor, v_company, v_warehouse, v_document, 'Приход',
    jsonb_build_array(jsonb_build_object('source_row', 15001, 'sana', CURRENT_DATE::text,
      'nomi', 'Щебень synthetic item', 'birligi', 'дона', 'obyomi', '1', 'postavshik', 'C11 synthetic supplier')),
    'c1100000-0000-4000-8000-000000000113'::uuid
  );
  ASSERT (v_duplicate->>'ok')::boolean AND (v_duplicate->>'qator_soni')::integer = 1,
    'one Cyrillic material row must post in its own operation';
  v_list_filtered := public.t2_sklad_kirim_royxat_v1(
    v_actor, v_company, v_warehouse, jsonb_build_object('qidir', 'sheb'), 50, 0
  );
  ASSERT (v_list_filtered->>'ok')::boolean
     AND (v_list_filtered->>'jami')::integer = 1
     AND jsonb_array_length(v_list_filtered->'qatorlar') = 1
     AND v_list_filtered->'qatorlar'->0->>'nomi' = 'Щебень synthetic item',
    'Cyrillic qidir must match the material name case-insensitively';
  v_list := public.t2_sklad_kirim_royxat_v1(
    v_actor, v_company, v_warehouse,
    jsonb_build_object('qidir', 'synthetic aggregate'), 50, 0
  );
  ASSERT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_list->'qatorlar') AS q
    CROSS JOIN LATERAL jsonb_each(q) AS field(key, value)
    WHERE field.key ILIKE '%storno%' AND jsonb_typeof(field.value) = 'boolean'
      AND field.value = 'true'::jsonb
  ), 'receipt listing must expose a true storno state for a reversed receipt';
  BEGIN
    PERFORM public.t2_sklad_kirim_royxat_v1(v_actor, v_other_company, v_foreign_warehouse, '{}'::jsonb, 50, 0);
    RAISE EXCEPTION 'cross-tenant list was accepted' USING ERRCODE = 'P0001';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

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
         AND position('FOR SHARE' in v_def) > 0,
    'RPC must serialize operation/file identity and stabilize verified registry metadata';
  ASSERT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public'
      AND indexname = 't2_sklad_harakat_c11_source_row_uq'
  ), 'physical source row must have a unique dedup index';
END
$acceptance$;

ROLLBACK;
