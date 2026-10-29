-- Acceptance (BEGIN..ROLLBACK, o'zi seed qiladi, sintetik): C11 ro'yxat RPC STABLE va READ ONLY tranzaksiyada
-- ishlaydi (GET yo'li), ruxsat tekshiruvi saqlangan. Hech narsa qolmaydi.
BEGIN;

DO $acc$
DECLARE
  v_tag uuid := gen_random_uuid();
  v_company bigint; v_actor bigint; v_outsider bigint; v_sklad bigint; v_doc bigint;
  v_r jsonb; v_list jsonb; v_denied boolean := false;
BEGIN
  ASSERT (SELECT provolatile FROM pg_proc
           WHERE oid = 'public.t2_sklad_kirim_royxat_v1(bigint,bigint,bigint,jsonb,integer,integer)'::regprocedure) = 's',
    'list RPC must be STABLE';
  ASSERT NOT has_function_privilege('anon', 'public.t2_sklad_kirim_royxat_v1(bigint,bigint,bigint,jsonb,integer,integer)', 'EXECUTE'),
    'anon must not execute list RPC';
  ASSERT NOT has_function_privilege('authenticated', 'public.t2_sklad_kirim_royxat_v1(bigint,bigint,bigint,jsonb,integer,integer)', 'EXECUTE'),
    'authenticated must not execute list RPC';

  INSERT INTO public.t2_kompaniya(nom, kod) VALUES ('C11B acc ' || v_tag, 'C11B-' || replace(v_tag::text, '-', '')) RETURNING id INTO v_company;
  INSERT INTO public.t2_foydalanuvchi(login, holat) VALUES ('c11b-admin-' || v_tag, 'faol') RETURNING id INTO v_actor;
  INSERT INTO public.t2_foydalanuvchi(login, holat) VALUES ('c11b-out-' || v_tag, 'faol') RETURNING id INTO v_outsider;
  INSERT INTO public.t2_azolik(foydalanuvchi_id, kompaniya_id, rol, holat) VALUES (v_actor, v_company, 'admin', 'faol');
  INSERT INTO public.t2_sklad_mustaqil(kompaniya_id, nomi, holat) VALUES (v_company, 'C11B synthetic warehouse', 'faol') RETURNING id INTO v_sklad;
  INSERT INTO public.t2_document_registry
    (kompaniya_id, document_type, provider, status, canonical_storage_status, sha256, sha256_verified, hash_source, r2_bucket, r2_key)
    VALUES (v_company, 'warehouse_receipt', 'cloudflare_r2', 'active', 'stored', repeat('b', 64), true, 'server',
            'canonical', 'c11b-acceptance/' || v_tag || '/source.xlsx')
    RETURNING id INTO v_doc;

  v_r := public.t2_sklad_markaziy_prixod_import_v1(v_actor, v_company, v_sklad, v_doc, 'Приход',
    '[{"source_row":3,"sana":"2026-01-05","nomi":"Synthetic cement","birligi":"t","obyomi":"5","postavshik":"Synthetic supplier"},
      {"source_row":4,"sana":"2026-01-06","nomi":"Synthetic cement","birligi":"t","obyomi":"2.5"}]'::jsonb,
    'c11b0000-0000-4000-8000-000000000001');
  ASSERT (v_r->>'ok')::boolean AND (v_r->>'qator_soni')::int = 2, 'seed import must post 2 rows: ' || v_r::text;

  -- GET yo'li: PostgREST o'qishni READ ONLY tranzaksiyada bajaradi.
  SET LOCAL transaction_read_only = on;
  v_list := public.t2_sklad_kirim_royxat_v1(v_actor, v_company, v_sklad, '{}'::jsonb, 50, 0);
  ASSERT (v_list->>'ok')::boolean AND (v_list->>'jami')::int = 2, 'list must work read-only: ' || v_list::text;
  ASSERT (v_list->>'rasxod_kiritilgan')::boolean = false, 'rasxod not entered must be explicit';
  ASSERT (v_list->'jami_materiallar'->0->>'sof_kirim')::numeric = 7.5, 'material total must be 7.5';
  ASSERT (v_list->'qatorlar'->0) ? 'manba_qator' AND (v_list->'qatorlar'->0->>'manba_varaq') = 'Приход', 'source evidence returned';
  ASSERT NOT ((v_list->'qatorlar'->0) ? 'narx'), 'receipt rows carry no price';

  v_list := public.t2_sklad_kirim_royxat_v1(v_actor, v_company, v_sklad, '{"qidir":"cement","dan":"2026-01-06"}'::jsonb, 1, 0);
  ASSERT (v_list->>'jami')::int = 1 AND jsonb_array_length(v_list->'qatorlar') = 1, 'filter + limit: ' || v_list::text;

  BEGIN
    PERFORM public.t2_sklad_kirim_royxat_v1(v_outsider, v_company, v_sklad, '{}'::jsonb, 50, 0);
  EXCEPTION WHEN OTHERS THEN v_denied := true;
  END;
  ASSERT v_denied, 'non-member must be denied';
  RAISE NOTICE 'C11 PR-B list STABLE acceptance: PASS';
END
$acc$;

ROLLBACK;
