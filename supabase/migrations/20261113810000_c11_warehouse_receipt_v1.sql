-- C11.1: central warehouse receipt ledger on the canonical t2_sklad_harakat.
-- Source only. Do not apply to production without L0/owner review.
-- No second stock table: t2_sklad_ombor_qoldiq_v1 is derived from posted rows.

BEGIN;

DO $preflight$
DECLARE
  v_object_nullable text;
BEGIN
  IF to_regclass('public.t2_sklad_harakat') IS NULL
     OR to_regclass('public.t2_sklad_mustaqil') IS NULL
     OR to_regclass('public.t2_document_registry') IS NULL
     OR to_regclass('public.t2_kontragent') IS NULL
     OR to_regclass('public.t2_erp_taminot') IS NULL
     OR to_regclass('public.t2_foydalanuvchi') IS NULL THEN
    RAISE EXCEPTION 'C11.1 prerequisites missing; reconcile schema before applying';
  END IF;

  SELECT is_nullable INTO v_object_nullable
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 't2_sklad_harakat'
     AND column_name = 'obyekt_id';
  IF v_object_nullable IS DISTINCT FROM 'NO' THEN
    RAISE EXCEPTION 'Expected legacy t2_sklad_harakat.obyekt_id NOT NULL; schema drift';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 't2_sklad_harakat'
       AND column_name IN ('c11_sklad_id','c11_document_id','c11_source_sheet',
                           'c11_source_row','c11_source_sha256','c11_operation_id','c11_request_hash',
                           'c11_storno_of_id','c11_actor_id','c11_kontragent_id','c11_taminot_id')
  ) THEN
    RAISE EXCEPTION 'C11.1 columns already exist; review partial migration/schema drift';
  END IF;

  IF to_regprocedure('public.t2_actor_kompaniya_azo_tekshir(bigint,bigint)') IS NULL
     OR to_regprocedure('public.t2_require_permission_v2(bigint,bigint,text)') IS NULL
     OR to_regprocedure('public.t2_audit_yoz(bigint,text,text,bigint,text,text,text)') IS NULL
     OR to_regprocedure('pg_catalog.sha256(bytea)') IS NULL THEN
    RAISE EXCEPTION 'C11.1 authorization/audit routines are missing; schema drift';
  END IF;
END
$preflight$;

-- These composite keys let a movement carry a warehouse in its own tenant.
CREATE UNIQUE INDEX t2_sklad_mustaqil_c11_tenant_id_uq
  ON public.t2_sklad_mustaqil (kompaniya_id, id);
CREATE UNIQUE INDEX t2_sklad_harakat_c11_tenant_id_uq
  ON public.t2_sklad_harakat (kompaniya_id, id);

ALTER TABLE public.t2_sklad_harakat
  ADD COLUMN c11_sklad_id bigint,
  ADD COLUMN c11_document_id bigint,
  ADD COLUMN c11_source_sheet text,
  ADD COLUMN c11_source_row integer,
  ADD COLUMN c11_source_sha256 text,
  ADD COLUMN c11_operation_id uuid,
  ADD COLUMN c11_request_hash text,
  ADD COLUMN c11_storno_of_id bigint,
  ADD COLUMN c11_actor_id bigint,
  ADD COLUMN c11_kontragent_id bigint,
  ADD COLUMN c11_taminot_id bigint;

ALTER TABLE public.t2_sklad_harakat
  ADD CONSTRAINT t2_sklad_harakat_c11_sklad_tenant_fk
    FOREIGN KEY (kompaniya_id, c11_sklad_id)
    REFERENCES public.t2_sklad_mustaqil (kompaniya_id, id)
    ON DELETE RESTRICT NOT VALID,
  ADD CONSTRAINT t2_sklad_harakat_c11_document_fk
    FOREIGN KEY (c11_document_id)
    REFERENCES public.t2_document_registry (id)
    ON DELETE RESTRICT NOT VALID,
  ADD CONSTRAINT t2_sklad_harakat_c11_kontragent_fk
    FOREIGN KEY (c11_kontragent_id)
    REFERENCES public.t2_kontragent (id)
    ON DELETE RESTRICT NOT VALID,
  ADD CONSTRAINT t2_sklad_harakat_c11_taminot_fk
    FOREIGN KEY (c11_taminot_id)
    REFERENCES public.t2_erp_taminot (id)
    ON DELETE RESTRICT NOT VALID,
  ADD CONSTRAINT t2_sklad_harakat_c11_storno_tenant_fk
    FOREIGN KEY (kompaniya_id, c11_storno_of_id)
    REFERENCES public.t2_sklad_harakat (kompaniya_id, id)
    ON DELETE RESTRICT NOT VALID,
  ADD CONSTRAINT t2_sklad_harakat_c11_actor_fk
    FOREIGN KEY (c11_actor_id)
    REFERENCES public.t2_foydalanuvchi (id)
    ON DELETE RESTRICT NOT VALID;

-- Preserve every legacy object-linked row. Object may be NULL only when the
-- row names a real warehouse in the same tenant.
ALTER TABLE public.t2_sklad_harakat
  ALTER COLUMN obyekt_id DROP NOT NULL;

ALTER TABLE public.t2_sklad_harakat
  ADD CONSTRAINT t2_sklad_harakat_c11_location_required
    CHECK (obyekt_id IS NOT NULL OR c11_sklad_id IS NOT NULL) NOT VALID,
  ADD CONSTRAINT t2_sklad_harakat_c11_hash_shape
    CHECK (c11_request_hash IS NULL OR c11_request_hash ~ '^[0-9a-f]{64}$') NOT VALID,
  ADD CONSTRAINT t2_sklad_harakat_c11_source_hash_shape
    CHECK (c11_source_sha256 IS NULL OR c11_source_sha256 ~ '^[0-9a-f]{64}$') NOT VALID,
  ADD CONSTRAINT t2_sklad_harakat_c11_receipt_shape
    CHECK (
      manba IS DISTINCT FROM 'c11_warehouse_receipt_v1'
      OR (operatsiya = 'prixod'
          AND c11_sklad_id IS NOT NULL
          AND c11_document_id IS NOT NULL
          AND c11_source_sheet IS NOT DISTINCT FROM 'Приход'
          AND c11_source_sheet IS NOT NULL
          AND c11_source_row IS NOT NULL
          AND c11_source_row > 0
          AND c11_source_sha256 IS NOT NULL
          AND c11_operation_id IS NOT NULL
          AND c11_request_hash IS NOT NULL
          AND c11_actor_id IS NOT NULL)
    ) NOT VALID,
  ADD CONSTRAINT t2_sklad_harakat_c11_storno_shape
    CHECK (
      c11_storno_of_id IS NULL
      OR (manba = 'c11_warehouse_storno_v1'
          AND operatsiya = 'rasxod'
          AND c11_sklad_id IS NOT NULL
          AND c11_operation_id IS NOT NULL
          AND c11_request_hash IS NOT NULL
          AND c11_actor_id IS NOT NULL)
    ) NOT VALID;

ALTER TABLE public.t2_sklad_harakat
  VALIDATE CONSTRAINT t2_sklad_harakat_c11_sklad_tenant_fk,
  VALIDATE CONSTRAINT t2_sklad_harakat_c11_document_fk,
  VALIDATE CONSTRAINT t2_sklad_harakat_c11_kontragent_fk,
  VALIDATE CONSTRAINT t2_sklad_harakat_c11_taminot_fk,
  VALIDATE CONSTRAINT t2_sklad_harakat_c11_storno_tenant_fk,
  VALIDATE CONSTRAINT t2_sklad_harakat_c11_actor_fk,
  VALIDATE CONSTRAINT t2_sklad_harakat_c11_location_required,
  VALIDATE CONSTRAINT t2_sklad_harakat_c11_hash_shape,
  VALIDATE CONSTRAINT t2_sklad_harakat_c11_source_hash_shape,
  VALIDATE CONSTRAINT t2_sklad_harakat_c11_receipt_shape,
  VALIDATE CONSTRAINT t2_sklad_harakat_c11_storno_shape;

CREATE INDEX t2_sklad_harakat_c11_operation_idx
  ON public.t2_sklad_harakat (kompaniya_id, c11_operation_id)
  WHERE c11_operation_id IS NOT NULL;

CREATE UNIQUE INDEX t2_sklad_harakat_c11_source_row_uq
  ON public.t2_sklad_harakat
     (kompaniya_id, c11_sklad_id, c11_source_sha256, c11_source_sheet, c11_source_row)
  WHERE manba = 'c11_warehouse_receipt_v1';

CREATE UNIQUE INDEX t2_sklad_harakat_c11_storno_once_uq
  ON public.t2_sklad_harakat (kompaniya_id, c11_storno_of_id)
  WHERE c11_storno_of_id IS NOT NULL;

CREATE INDEX t2_sklad_harakat_c11_stock_view_idx
  ON public.t2_sklad_harakat
     (kompaniya_id, c11_sklad_id, nomi, birligi)
  WHERE c11_sklad_id IS NOT NULL AND holat = 'faol';

-- Legacy cancellation/edit RPCs may update the shared journal or its holat.
-- C11 source rows are immutable; correction is a separate append-only storno.
CREATE OR REPLACE FUNCTION public.t2_sklad_c11_append_only_guard_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $trigger$
BEGIN
  IF OLD.c11_sklad_id IS NOT NULL
     OR OLD.c11_storno_of_id IS NOT NULL
     OR OLD.manba IN ('c11_warehouse_receipt_v1','c11_warehouse_storno_v1') THEN
    RAISE EXCEPTION 'C11 warehouse journal rows are append-only; use the reviewed storno command'
      USING ERRCODE = '55000';
  END IF;
  RETURN OLD;
END
$trigger$;

CREATE TRIGGER t2_sklad_c11_append_only_guard_v1
BEFORE UPDATE OR DELETE ON public.t2_sklad_harakat
FOR EACH ROW EXECUTE FUNCTION public.t2_sklad_c11_append_only_guard_v1();

-- The existing object cache t2_sklad_qoldiq is deliberately untouched.
CREATE VIEW public.t2_sklad_ombor_qoldiq_v1
  WITH (security_invoker = true)
AS
SELECT h.kompaniya_id,
       h.c11_sklad_id AS sklad_id,
       s.nomi AS sklad_nomi,
       h.nomi AS material_nomi,
       h.birligi,
       sum(CASE WHEN h.operatsiya = 'prixod' THEN h.obyomi
                WHEN h.operatsiya = 'rasxod' THEN -h.obyomi
                ELSE 0::numeric END) AS qoldiq
  FROM public.t2_sklad_harakat AS h
  JOIN public.t2_sklad_mustaqil AS s
    ON s.id = h.c11_sklad_id AND s.kompaniya_id = h.kompaniya_id
 WHERE h.c11_sklad_id IS NOT NULL
   AND h.holat = 'faol'
   AND h.manba IN ('c11_warehouse_receipt_v1','c11_warehouse_storno_v1')
 GROUP BY h.kompaniya_id, h.c11_sklad_id, s.nomi, h.nomi, h.birligi;

REVOKE ALL ON public.t2_sklad_ombor_qoldiq_v1 FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.t2_sklad_ombor_qoldiq_v1 TO service_role;

CREATE OR REPLACE FUNCTION public.t2_sklad_markaziy_prixod_import_v1(
  p_actor_id bigint,
  p_kompaniya_id bigint,
  p_sklad_id bigint,
  p_document_id bigint,
  p_source_sheet text,
  p_qatorlar jsonb,
  p_operation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_hash text;
  v_source_sha256 text;
  v_existing_count integer;
  v_existing_hash_ok boolean;
  v_existing_command_ok boolean;
  v_existing_rows jsonb;
  v_sklad_id bigint;
  v_doc record;
  v_item jsonb;
  v_row_no integer;
  v_sana date;
  v_nomi text;
  v_birligi text;
  v_miqdor numeric;
  v_postavshik text;
  v_kontragent_id bigint;
  v_taminot_id bigint;
  v_source_rows integer[] := ARRAY[]::integer[];
  v_qator_soni integer := 0;
  v_actor_role text;
  v_natija jsonb := '[]'::jsonb;
  v_harakat_id bigint;
BEGIN
  IF p_actor_id IS NULL OR p_kompaniya_id IS NULL OR p_sklad_id IS NULL
     OR p_document_id IS NULL OR p_operation_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REQUIRED_FIELD');
  END IF;
  IF p_source_sheet IS DISTINCT FROM 'Приход'
     OR pg_catalog.jsonb_typeof(p_qatorlar) IS DISTINCT FROM 'array' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BATCH_INVALID', 'max_rows', 500);
  END IF;
  IF pg_catalog.jsonb_array_length(p_qatorlar) < 1
     OR pg_catalog.jsonb_array_length(p_qatorlar) > 500 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BATCH_INVALID', 'max_rows', 500);
  END IF;

  v_actor_role := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  -- Current C11 warehouse gateway permission. A granular warehouse permission
  -- is not present in the reviewed contract and is not invented here.
  PERFORM public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'document.write');

  v_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_object(
    'actor_id', p_actor_id,
    'kompaniya_id', p_kompaniya_id,
    'sklad_id', p_sklad_id,
    'document_id', p_document_id,
    'source_sheet', p_source_sheet,
    'qatorlar', p_qatorlar
  )::text, 'UTF8')), 'hex');

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('c11-warehouse:' || p_kompaniya_id::text || ':' || p_operation_id::text, 0)
  );

  SELECT count(*)::integer,
         coalesce(bool_and(h.c11_request_hash = v_hash), false),
         coalesce(bool_and(h.manba = 'c11_warehouse_receipt_v1'), false),
         coalesce(jsonb_agg(jsonb_build_object(
           'harakat_id', h.id, 'source_row', h.c11_source_row
         ) ORDER BY h.c11_source_row), '[]'::jsonb)
    INTO v_existing_count, v_existing_hash_ok, v_existing_command_ok, v_existing_rows
    FROM public.t2_sklad_harakat AS h
   WHERE h.kompaniya_id = p_kompaniya_id
     AND h.c11_operation_id = p_operation_id;

  IF v_existing_count > 0 THEN
    IF NOT v_existing_hash_ok OR NOT v_existing_command_ok
       OR v_existing_count <> jsonb_array_length(p_qatorlar) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'OPERATION_ID_CONFLICT');
    END IF;
    RETURN jsonb_build_object('ok', true, 'takror', true,
                              'qator_soni', v_existing_count, 'qatorlar', v_existing_rows);
  END IF;

  SELECT s.id INTO v_sklad_id
    FROM public.t2_sklad_mustaqil AS s
   WHERE s.id = p_sklad_id AND s.kompaniya_id = p_kompaniya_id AND s.holat = 'faol'
   FOR KEY SHARE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WAREHOUSE_SCOPE_MISMATCH');
  END IF;

  SELECT d.kompaniya_id, d.provider, d.status, d.canonical_storage_status,
         d.sha256, d.sha256_verified
    INTO v_doc
    FROM public.t2_document_registry AS d
   WHERE d.id = p_document_id AND d.kompaniya_id = p_kompaniya_id
   FOR KEY SHARE;
  IF NOT FOUND
     OR v_doc.provider IS DISTINCT FROM 'cloudflare_r2'
     OR v_doc.status IS DISTINCT FROM 'active'
     OR v_doc.canonical_storage_status IS DISTINCT FROM 'stored'
     OR v_doc.sha256_verified IS DISTINCT FROM true
     OR v_doc.sha256 IS NULL
     OR v_doc.sha256 !~* '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SOURCE_DOCUMENT_NOT_VERIFIED');
  END IF;
  v_source_sha256 := pg_catalog.lower(v_doc.sha256);

  -- Identical source bytes re-registered under another document ID still map
  -- to the same physical rows in this warehouse. Serialize by file identity.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('c11-source:' || p_kompaniya_id::text || ':' || p_sklad_id::text || ':' || v_source_sha256, 0)
  );

  -- Bounded all-row preflight: validate every physical row and every optional
  -- existing-entity link before inserting the first movement.
  FOR v_item IN SELECT e.value FROM pg_catalog.jsonb_array_elements(p_qatorlar) AS e(value)
  LOOP
    IF pg_catalog.jsonb_typeof(v_item) IS DISTINCT FROM 'object'
       OR coalesce(v_item->>'source_row', '') !~ '^[0-9]+$'
       OR coalesce(v_item->>'sana', '') !~ '^\d{4}-\d{2}-\d{2}$'
       OR coalesce(v_item->>'obyomi', '') !~ '^[0-9]+(\.[0-9]+)?$'
       OR nullif(pg_catalog.btrim(coalesce(v_item->>'nomi', '')), '') IS NULL
       OR nullif(pg_catalog.btrim(coalesce(v_item->>'birligi', '')), '') IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'code', 'SOURCE_ROW_INVALID');
    END IF;

    BEGIN
      v_row_no := (v_item->>'source_row')::integer;
      v_sana := (v_item->>'sana')::date;
      v_miqdor := (v_item->>'obyomi')::numeric;
      v_kontragent_id := nullif(pg_catalog.btrim(coalesce(v_item->>'kontragent_id', '')), '')::bigint;
      v_taminot_id := nullif(pg_catalog.btrim(coalesce(v_item->>'taminot_id', '')), '')::bigint;
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object('ok', false, 'code', 'SOURCE_ROW_INVALID');
    END;

    IF v_row_no < 1 OR v_miqdor <= 0
       OR pg_catalog.length(pg_catalog.btrim(v_item->>'nomi')) > 500
       OR pg_catalog.length(pg_catalog.btrim(v_item->>'birligi')) > 100 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'SOURCE_ROW_INVALID');
    END IF;
    IF pg_catalog.array_position(v_source_rows, v_row_no) IS NOT NULL THEN
      RETURN jsonb_build_object('ok', false, 'code', 'DUPLICATE_PHYSICAL_ROW', 'source_row', v_row_no);
    END IF;
    v_source_rows := pg_catalog.array_append(v_source_rows, v_row_no);

    IF v_kontragent_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.t2_kontragent AS k
       WHERE k.id = v_kontragent_id AND k.kompaniya_id = p_kompaniya_id
    ) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'SUPPLIER_SCOPE_MISMATCH', 'source_row', v_row_no);
    END IF;
    IF v_taminot_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.t2_erp_taminot AS t
       WHERE t.id = v_taminot_id AND t.kompaniya_id = p_kompaniya_id
    ) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'REQUEST_SCOPE_MISMATCH', 'source_row', v_row_no);
    END IF;
  END LOOP;

  -- The earlier KEY SHARE lock keeps this registry row's verified metadata
  -- stable. The file-hash advisory lock serializes re-registrations too.
  IF EXISTS (
    SELECT 1
      FROM pg_catalog.jsonb_array_elements(p_qatorlar) AS e(value)
      JOIN public.t2_sklad_harakat AS h
        ON h.kompaniya_id = p_kompaniya_id
       AND h.c11_sklad_id = p_sklad_id
       AND h.c11_source_sha256 = v_source_sha256
       AND h.c11_source_sheet = p_source_sheet
       AND h.c11_source_row = (e.value->>'source_row')::integer
       AND h.manba = 'c11_warehouse_receipt_v1'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SOURCE_ROW_ALREADY_POSTED');
  END IF;

  BEGIN
    FOR v_item IN SELECT e.value FROM pg_catalog.jsonb_array_elements(p_qatorlar) AS e(value)
    LOOP
      v_row_no := (v_item->>'source_row')::integer;
      v_sana := (v_item->>'sana')::date;
      v_nomi := pg_catalog.btrim(v_item->>'nomi');
      v_birligi := pg_catalog.btrim(v_item->>'birligi');
      v_miqdor := (v_item->>'obyomi')::numeric;
      v_kontragent_id := nullif(pg_catalog.btrim(coalesce(v_item->>'kontragent_id', '')), '')::bigint;
      v_taminot_id := nullif(pg_catalog.btrim(coalesce(v_item->>'taminot_id', '')), '')::bigint;
      v_postavshik := nullif(pg_catalog.btrim(coalesce(v_item->>'postavshik', '')), '');

      IF v_kontragent_id IS NOT NULL AND v_postavshik IS NULL THEN
        SELECT k.nom INTO v_postavshik
          FROM public.t2_kontragent AS k
         WHERE k.id = v_kontragent_id AND k.kompaniya_id = p_kompaniya_id;
      END IF;

      INSERT INTO public.t2_sklad_harakat (
        kompaniya_id, obyekt_id, operatsiya, turi, sana, nomi, birligi, obyomi,
        postavshik, holat, operation_id, manba, kim,
        c11_sklad_id, c11_document_id, c11_source_sheet, c11_source_row, c11_source_sha256,
        c11_operation_id, c11_request_hash, c11_actor_id, c11_kontragent_id, c11_taminot_id
      ) VALUES (
        p_kompaniya_id, NULL, 'prixod', 'mat', v_sana, v_nomi, v_birligi, v_miqdor,
        v_postavshik, 'faol', NULL, 'c11_warehouse_receipt_v1', 'actor:' || p_actor_id,
        p_sklad_id, p_document_id, p_source_sheet, v_row_no, v_source_sha256,
        p_operation_id, v_hash, p_actor_id, v_kontragent_id, v_taminot_id
      ) RETURNING id INTO v_harakat_id;

      v_qator_soni := v_qator_soni + 1;
      v_natija := v_natija || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('harakat_id', v_harakat_id, 'source_row', v_row_no)
      );
    END LOOP;
  EXCEPTION WHEN unique_violation THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'SOURCE_ROW_ALREADY_POSTED');
  END;

  PERFORM public.t2_audit_yoz(
    p_kompaniya_id, 'c11_warehouse_receipt_posted', 'sklad', p_sklad_id,
    pg_catalog.format('document_id=%s; sheet=%s; rows=%s; operation_id=%s; actor_role=%s',
                      p_document_id, p_source_sheet, v_qator_soni, p_operation_id, v_actor_role),
    'actor:' || p_actor_id, NULL
  );

  RETURN pg_catalog.jsonb_build_object(
    'ok', true, 'takror', false, 'qator_soni', v_qator_soni, 'qatorlar', v_natija
  );
END
$function$;

REVOKE ALL ON FUNCTION public.t2_sklad_markaziy_prixod_import_v1(bigint,bigint,bigint,bigint,text,jsonb,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.t2_sklad_markaziy_prixod_import_v1(bigint,bigint,bigint,bigint,text,jsonb,uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.t2_sklad_markaziy_prixod_storno_v1(
  p_actor_id bigint,
  p_kompaniya_id bigint,
  p_harakat_id bigint,
  p_sabab text,
  p_operation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_hash text;
  v_actor_role text;
  v_existing public.t2_sklad_harakat%ROWTYPE;
  v_original public.t2_sklad_harakat%ROWTYPE;
  v_storno_id bigint;
  v_sabab text := nullif(pg_catalog.btrim(coalesce(p_sabab, '')), '');
BEGIN
  IF p_actor_id IS NULL OR p_kompaniya_id IS NULL OR p_harakat_id IS NULL
     OR p_operation_id IS NULL OR v_sabab IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'REQUIRED_FIELD');
  END IF;
  IF pg_catalog.length(v_sabab) > 1000 THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'REASON_TOO_LONG');
  END IF;

  v_actor_role := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  PERFORM public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'document.write');
  v_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_object(
    'actor_id', p_actor_id, 'kompaniya_id', p_kompaniya_id,
    'harakat_id', p_harakat_id, 'sabab', v_sabab
  )::text, 'UTF8')), 'hex');
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('c11-warehouse:' || p_kompaniya_id::text || ':' || p_operation_id::text, 0)
  );

  SELECT h.* INTO v_existing
    FROM public.t2_sklad_harakat AS h
   WHERE h.kompaniya_id = p_kompaniya_id AND h.c11_operation_id = p_operation_id
   ORDER BY h.id LIMIT 1;
  IF FOUND THEN
    IF v_existing.manba <> 'c11_warehouse_storno_v1'
       OR v_existing.c11_request_hash IS DISTINCT FROM v_hash
       OR v_existing.c11_storno_of_id IS DISTINCT FROM p_harakat_id THEN
      RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'OPERATION_ID_CONFLICT');
    END IF;
    RETURN pg_catalog.jsonb_build_object('ok', true, 'takror', true,
                                         'storno_id', v_existing.id,
                                         'harakat_id', p_harakat_id);
  END IF;

  SELECT h.* INTO v_original
    FROM public.t2_sklad_harakat AS h
   WHERE h.id = p_harakat_id AND h.kompaniya_id = p_kompaniya_id
   FOR UPDATE;
  IF NOT FOUND OR v_original.manba <> 'c11_warehouse_receipt_v1'
     OR v_original.operatsiya <> 'prixod'
     OR v_original.holat <> 'faol'
     OR v_original.c11_storno_of_id IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'RECEIPT_NOT_STORNABLE');
  END IF;
  IF v_original.yaratildi > pg_catalog.now()
     OR v_original.yaratildi < pg_catalog.now() - interval '24 hours' THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'STORNO_WINDOW_EXPIRED');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.t2_sklad_harakat AS h
     WHERE h.kompaniya_id = p_kompaniya_id AND h.c11_storno_of_id = p_harakat_id
  ) THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'ALREADY_STORNED');
  END IF;

  INSERT INTO public.t2_sklad_harakat (
    kompaniya_id, obyekt_id, operatsiya, turi, sana, nomi, birligi, obyomi,
    postavshik, qabul_qiluvchi, qabul_turi, izoh, holat, operation_id, manba, kim,
    c11_sklad_id, c11_document_id, c11_source_sheet, c11_source_row,
    c11_operation_id, c11_request_hash, c11_storno_of_id, c11_actor_id,
    c11_kontragent_id, c11_taminot_id
  ) VALUES (
    p_kompaniya_id, NULL, 'rasxod', v_original.turi,
    (pg_catalog.now() AT TIME ZONE 'Asia/Tashkent')::date,
    v_original.nomi, v_original.birligi, v_original.obyomi,
    v_original.postavshik, NULL, NULL,
    pg_catalog.left('C11 storno of #' || p_harakat_id || ': ' || v_sabab, 1000),
    'faol', NULL, 'c11_warehouse_storno_v1', 'actor:' || p_actor_id,
    v_original.c11_sklad_id, v_original.c11_document_id,
    v_original.c11_source_sheet, v_original.c11_source_row,
    p_operation_id, v_hash, p_harakat_id, p_actor_id,
    v_original.c11_kontragent_id, v_original.c11_taminot_id
  ) RETURNING id INTO v_storno_id;

  PERFORM public.t2_audit_yoz(
    p_kompaniya_id, 'c11_warehouse_receipt_storno', 'sklad', v_original.c11_sklad_id,
    pg_catalog.format('harakat_id=%s; storno_id=%s; sabab=%s; actor_id=%s; actor_role=%s',
                      p_harakat_id, v_storno_id, v_sabab, p_actor_id, v_actor_role),
    'actor:' || p_actor_id, NULL
  );

  RETURN pg_catalog.jsonb_build_object('ok', true, 'takror', false,
                                       'storno_id', v_storno_id,
                                       'harakat_id', p_harakat_id);
END
$function$;

REVOKE ALL ON FUNCTION public.t2_sklad_markaziy_prixod_storno_v1(bigint,bigint,bigint,text,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.t2_sklad_markaziy_prixod_storno_v1(bigint,bigint,bigint,text,uuid)
  TO service_role;

COMMIT;
