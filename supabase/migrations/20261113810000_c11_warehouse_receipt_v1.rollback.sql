-- C11.1 rollback is intentionally guarded. It never deletes journal rows.
BEGIN;

DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.t2_sklad_harakat
     WHERE c11_sklad_id IS NOT NULL
        OR c11_storno_of_id IS NOT NULL
        OR manba IN ('c11_warehouse_receipt_v1','c11_warehouse_storno_v1')
  ) THEN
    RAISE EXCEPTION 'C11.1 rollback refused: posted warehouse receipt/storno rows exist; retain data and use a reviewed forward correction';
  END IF;
  IF EXISTS (SELECT 1 FROM public.t2_sklad_harakat WHERE obyekt_id IS NULL) THEN
    RAISE EXCEPTION 'C11.1 rollback refused: object-only NOT NULL cannot be restored while warehouse-only rows exist';
  END IF;
END
$guard$;

DROP VIEW IF EXISTS public.t2_sklad_ombor_qoldiq_v1;
DROP FUNCTION IF EXISTS public.t2_sklad_kirim_royxat_v1(bigint,bigint,bigint,jsonb,integer,integer);
DROP FUNCTION IF EXISTS public.t2_sklad_c11_qidiruv_kaliti_v1(text);
DROP FUNCTION IF EXISTS public.t2_sklad_markaziy_prixod_storno_v1(bigint,bigint,bigint,text,uuid);
DROP FUNCTION IF EXISTS public.t2_sklad_markaziy_prixod_import_v1(bigint,bigint,bigint,bigint,text,jsonb,uuid);
DROP TRIGGER IF EXISTS t2_sklad_c11_append_only_guard_v1 ON public.t2_sklad_harakat;
DROP FUNCTION IF EXISTS public.t2_sklad_c11_append_only_guard_v1();

ALTER TABLE public.t2_sklad_harakat
  DROP CONSTRAINT IF EXISTS t2_sklad_harakat_c11_storno_tenant_fk,
  DROP CONSTRAINT IF EXISTS t2_sklad_harakat_c11_actor_fk,
  DROP CONSTRAINT IF EXISTS t2_sklad_harakat_c11_taminot_fk,
  DROP CONSTRAINT IF EXISTS t2_sklad_harakat_c11_kontragent_fk,
  DROP CONSTRAINT IF EXISTS t2_sklad_harakat_c11_document_fk,
  DROP CONSTRAINT IF EXISTS t2_sklad_harakat_c11_sklad_tenant_fk,
  DROP CONSTRAINT IF EXISTS t2_sklad_harakat_c11_location_required,
  DROP CONSTRAINT IF EXISTS t2_sklad_harakat_c11_hash_shape,
  DROP CONSTRAINT IF EXISTS t2_sklad_harakat_c11_source_hash_shape,
  DROP CONSTRAINT IF EXISTS t2_sklad_harakat_c11_receipt_shape,
  DROP CONSTRAINT IF EXISTS t2_sklad_harakat_c11_storno_shape;

DROP INDEX IF EXISTS public.t2_sklad_harakat_c11_stock_view_idx;
DROP INDEX IF EXISTS public.t2_sklad_harakat_c11_storno_once_uq;
DROP INDEX IF EXISTS public.t2_sklad_harakat_c11_source_row_uq;
DROP INDEX IF EXISTS public.t2_sklad_harakat_c11_operation_idx;

ALTER TABLE public.t2_sklad_harakat
  ALTER COLUMN obyekt_id SET NOT NULL,
  DROP COLUMN c11_sf_tasdiq,
  DROP COLUMN c11_manba_turi,
  DROP COLUMN c11_taminot_id,
  DROP COLUMN c11_kontragent_id,
  DROP COLUMN c11_storno_of_id,
  DROP COLUMN c11_actor_id,
  DROP COLUMN c11_request_hash,
  DROP COLUMN c11_source_sha256,
  DROP COLUMN c11_operation_id,
  DROP COLUMN c11_source_row,
  DROP COLUMN c11_source_sheet,
  DROP COLUMN c11_document_id,
  DROP COLUMN c11_sklad_id;

DROP INDEX IF EXISTS public.t2_sklad_harakat_c11_tenant_id_uq;
DROP INDEX IF EXISTS public.t2_sklad_mustaqil_c11_tenant_id_uq;

COMMIT;
