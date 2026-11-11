-- Acceptance (o'zi seed qiladi, sintetik, BEGIN..ROLLBACK): markaziy BERDIM -> obyekt qoldig'i -> M-29 yecha oladi.
-- Rehearsal: avval migratsiya SQL, so'ng shu fayl (bu fayl oxirida ROLLBACK qiladi). Hech narsa qolmaydi.
BEGIN;

DO $acc$
DECLARE
  v_tag uuid := gen_random_uuid();
  v_company bigint; v_other bigint; v_actor bigint; v_outsider bigint; v_sklad bigint; v_doc bigint;
  v_obyekt bigint; v_obyekt_other bigint; v_op uuid := gen_random_uuid();
  v_r jsonb; v_r2 jsonb; v_denied boolean := false; v_q numeric; v_cnt integer; v_list jsonb;
  v_sheet text := U&'\041F\0440\0438\0445\043E\0434';
BEGIN
  INSERT INTO public.t2_kompaniya(nom, kod) VALUES ('BRD acc ' || v_tag, 'BRD-' || replace(v_tag::text, '-', '')) RETURNING id INTO v_company;
  INSERT INTO public.t2_kompaniya(nom, kod) VALUES ('BRD other ' || v_tag, 'BRO-' || replace(v_tag::text, '-', '')) RETURNING id INTO v_other;
  INSERT INTO public.t2_foydalanuvchi(login, holat) VALUES ('brd-admin-' || v_tag, 'faol') RETURNING id INTO v_actor;
  INSERT INTO public.t2_foydalanuvchi(login, holat) VALUES ('brd-out-' || v_tag, 'faol') RETURNING id INTO v_outsider;
  INSERT INTO public.t2_azolik(foydalanuvchi_id, kompaniya_id, rol, holat) VALUES (v_actor, v_company, 'admin', 'faol');
  INSERT INTO public.t2_sklad_mustaqil(kompaniya_id, nomi, holat) VALUES (v_company, 'BRD synthetic warehouse', 'faol') RETURNING id INTO v_sklad;
  INSERT INTO public.t2_obyekt(kompaniya_id, nom) VALUES (v_company, 'BRD synthetic object') RETURNING id INTO v_obyekt;
  INSERT INTO public.t2_obyekt(kompaniya_id, nom) VALUES (v_other, 'BRD foreign object') RETURNING id INTO v_obyekt_other;
  INSERT INTO public.t2_document_registry
    (kompaniya_id, document_type, provider, status, canonical_storage_status, sha256, sha256_verified, hash_source, r2_bucket, r2_key)
    VALUES (v_company, 'warehouse_receipt', 'cloudflare_r2', 'active', 'stored', repeat('c', 64), true, 'server',
            'canonical', 'brd-acceptance/' || v_tag || '/source.xlsx')
    RETURNING id INTO v_doc;

  v_r := public.t2_sklad_markaziy_prixod_import_v1(v_actor, v_company, v_sklad, v_doc, v_sheet,
    '[{"source_row":3,"sana":"2026-01-05","nomi":"Synthetic cement","birligi":"t","obyomi":"5"},
      {"source_row":4,"sana":"2026-01-06","nomi":"Synthetic cement","birligi":"t","obyomi":"2.5"}]'::jsonb, gen_random_uuid());
  ASSERT (v_r->>'ok')::boolean, 'seed central receipt: ' || v_r::text;

  -- STABLE o'qish (GET yo'li)
  ASSERT (SELECT provolatile FROM pg_proc WHERE oid = 'public.t2_sklad_markaziy_qoldiq_v1(bigint,bigint,bigint,text,integer)'::regprocedure) = 's',
    'qoldiq RPC must be STABLE';
  ASSERT NOT has_function_privilege('authenticated', 'public.t2_sklad_markaziy_berdim_v1(bigint,bigint,bigint,bigint,text,text,numeric,date,text,text,uuid)', 'EXECUTE'),
    'authenticated must not execute berdim';
  v_list := public.t2_sklad_markaziy_qoldiq_v1(v_actor, v_company, v_sklad, 'cement', 10);
  ASSERT (v_list->'qatorlar'->0->>'qoldiq')::numeric = 7.5, 'central stock before: ' || v_list::text;

  -- 1) BERDIM 3 t -> obyekt
  v_r := public.t2_sklad_markaziy_berdim_v1(v_actor, v_company, v_sklad, v_obyekt, 'Synthetic cement', 't', 3, DATE '2026-01-07', 'Synthetic foreman', 'test', v_op);
  ASSERT (v_r->>'ok')::boolean AND NOT (v_r->>'takror')::boolean, 'berdim ok: ' || v_r::text;
  ASSERT (v_r->>'qoldiq_keyin')::numeric = 4.5, 'central after = 4.5';
  SELECT qoldiq INTO v_q FROM public.t2_sklad_qoldiq WHERE obyekt_id = v_obyekt AND nomi = 'Synthetic cement';
  ASSERT v_q = 3, 'object stock must be 3 (M-29 source): ' || coalesce(v_q::text, 'null');
  SELECT qoldiq INTO v_q FROM public.t2_sklad_ombor_qoldiq_v1 WHERE kompaniya_id = v_company AND sklad_id = v_sklad AND material_nomi = 'Synthetic cement';
  ASSERT v_q = 4.5, 'central view = 4.5 (no double count): ' || v_q::text;
  ASSERT (SELECT count(*) FROM public.t2_sklad_harakat WHERE kompaniya_id = v_company AND manba = 'c11_berdim_obyekt_v1' AND obyekt_id = v_obyekt AND c11_sklad_id IS NULL) = 1,
    'one object-side row without central location';
  ASSERT (SELECT c11_juft_id FROM public.t2_sklad_harakat WHERE id = (v_r->>'markaz_harakat_id')::bigint) = (v_r->>'obyekt_harakat_id')::bigint, 'rows are linked';

  -- 2) takror: o'sha operation_id + o'sha payload -> ikkinchi yozuv yo'q
  v_r2 := public.t2_sklad_markaziy_berdim_v1(v_actor, v_company, v_sklad, v_obyekt, 'Synthetic cement', 't', 3, DATE '2026-01-07', 'Synthetic foreman', 'test', v_op);
  ASSERT (v_r2->>'ok')::boolean AND (v_r2->>'takror')::boolean AND v_r2->>'markaz_harakat_id' = v_r->>'markaz_harakat_id', 'idempotent replay: ' || v_r2::text;
  SELECT qoldiq INTO v_q FROM public.t2_sklad_qoldiq WHERE obyekt_id = v_obyekt AND nomi = 'Synthetic cement';
  ASSERT v_q = 3, 'replay must not change object stock';
  -- o'sha operation_id, boshqa payload -> conflict
  v_r2 := public.t2_sklad_markaziy_berdim_v1(v_actor, v_company, v_sklad, v_obyekt, 'Synthetic cement', 't', 1, DATE '2026-01-07', 'Synthetic foreman', 'test', v_op);
  ASSERT v_r2->>'code' = 'OPERATION_ID_CONFLICT', 'payload conflict: ' || v_r2::text;

  -- 3) markaziy qoldiqdan ortiq -> rad, hech narsa o'zgarmaydi
  v_r2 := public.t2_sklad_markaziy_berdim_v1(v_actor, v_company, v_sklad, v_obyekt, 'Synthetic cement', 't', 4.6, DATE '2026-01-07', NULL, NULL, gen_random_uuid());
  ASSERT v_r2->>'code' = 'QOLDIQ_YETMAYDI', 'overdraw rejected: ' || v_r2::text;
  -- boshqa birlik = boshqa material
  v_r2 := public.t2_sklad_markaziy_berdim_v1(v_actor, v_company, v_sklad, v_obyekt, 'Synthetic cement', 'kg', 1, DATE '2026-01-07', NULL, NULL, gen_random_uuid());
  ASSERT v_r2->>'code' = 'QOLDIQ_YETMAYDI', 'other unit has no stock: ' || v_r2::text;

  -- 4) tenant himoyasi
  v_r2 := public.t2_sklad_markaziy_berdim_v1(v_actor, v_company, v_sklad, v_obyekt_other, 'Synthetic cement', 't', 1, DATE '2026-01-07', NULL, NULL, gen_random_uuid());
  ASSERT v_r2->>'code' = 'OBJECT_SCOPE_MISMATCH', 'foreign object rejected: ' || v_r2::text;
  BEGIN
    PERFORM public.t2_sklad_markaziy_berdim_v1(v_outsider, v_company, v_sklad, v_obyekt, 'Synthetic cement', 't', 1, DATE '2026-01-07', NULL, NULL, gen_random_uuid());
  EXCEPTION WHEN OTHERS THEN v_denied := true;
  END;
  ASSERT v_denied, 'non-member must be denied';

  -- 5) markaziy qator append-only (UPDATE/DELETE bloklanadi)
  v_denied := false;
  BEGIN
    UPDATE public.t2_sklad_harakat SET holat = 'bekor' WHERE id = (v_r->>'markaz_harakat_id')::bigint;
  EXCEPTION WHEN OTHERS THEN v_denied := true;
  END;
  ASSERT v_denied, 'central berdim row is append-only';

  -- 6) M-29 manbasi: obyekt qoldig'idan chiqim (t2_skladga_yozish rasxod = m29 ishlatadigan tekshiruv) o'tadi, ortig'i rad
  v_r2 := public.t2_skladga_yozish(v_company, 'rasxod', v_obyekt, 'mat', current_date, 'Synthetic cement', 't', 2, NULL, NULL, NULL, NULL, gen_random_uuid(), 'acceptance', 'acc');
  ASSERT (v_r2->>'ok')::boolean, 'object stock can be drawn: ' || v_r2::text;
  v_r2 := public.t2_skladga_yozish(v_company, 'rasxod', v_obyekt, 'mat', current_date, 'Synthetic cement', 't', 2, NULL, NULL, NULL, NULL, gen_random_uuid(), 'acceptance', 'acc');
  ASSERT NOT (v_r2->>'ok')::boolean, 'cannot draw more than transferred';

  -- 7) o'qish READ ONLY
  SET LOCAL transaction_read_only = on;
  v_list := public.t2_sklad_markaziy_qoldiq_v1(v_actor, v_company, v_sklad, NULL, 50);
  ASSERT (v_list->>'ok')::boolean AND (v_list->'qatorlar'->0->>'qoldiq')::numeric = 4.5, 'read-only list: ' || v_list::text;

  RAISE NOTICE 'C11 BERDIM acceptance: PASS';
END
$acc$;

ROLLBACK;
