-- Rollback: C11 BERDIM. Faqat BERDIM yozuvlari YO'Q bo'lsa (append-only qatorlar o'chirilmaydi).
-- BERDIM qatorlari bor bo'lsa to'xtaydi: avval ularni hisobga olib qo'lda hal qiling (qoldiq ikki tomonda ham o'zgargan).
BEGIN;

DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.t2_sklad_harakat WHERE manba IN ('c11_warehouse_berdim_v1','c11_berdim_obyekt_v1')) THEN
    RAISE EXCEPTION 'BERDIM rows exist; rollback would desync central and object stock. Reconcile first.';
  END IF;
END
$guard$;

DROP FUNCTION IF EXISTS public.t2_sklad_markaziy_qoldiq_v1(bigint,bigint,bigint,text,integer);
DROP FUNCTION IF EXISTS public.t2_sklad_markaziy_berdim_v1(bigint,bigint,bigint,bigint,text,text,numeric,date,text,text,uuid);

CREATE OR REPLACE VIEW public.t2_sklad_ombor_qoldiq_v1
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

DROP INDEX IF EXISTS public.t2_sklad_harakat_c11_berdim_juft_uq;
DROP INDEX IF EXISTS public.t2_sklad_harakat_c11_berdim_op_uq;
ALTER TABLE public.t2_sklad_harakat
  DROP CONSTRAINT IF EXISTS t2_sklad_harakat_c11_berdim_shape,
  DROP CONSTRAINT IF EXISTS t2_sklad_harakat_c11_juft_fk,
  DROP CONSTRAINT IF EXISTS t2_sklad_harakat_c11_hedef_obyekt_fk,
  DROP COLUMN IF EXISTS c11_juft_id,
  DROP COLUMN IF EXISTS c11_hedef_obyekt_id;

COMMIT;
