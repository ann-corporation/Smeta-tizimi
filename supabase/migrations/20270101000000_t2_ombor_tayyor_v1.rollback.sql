-- ROLLBACK: T2-OMBOR-TAYYOR v1. Yozuvlar (ombor_* manbali t2_sklad_harakat qatorlari) o'chirilmaydi — jurnal append-only;
-- ular qoldiq ko'rinishidan chiqib ketmasligi uchun avval ularni teskari yozuvlar bilan yoping yoki alohida egasi qarori bilan o'chiring.
CREATE OR REPLACE VIEW public.t2_sklad_ombor_qoldiq_v1 AS
 SELECT h.kompaniya_id, h.c11_sklad_id AS sklad_id, s.nomi AS sklad_nomi, h.nomi AS material_nomi, h.birligi,
    sum(CASE WHEN (h.operatsiya = 'prixod'::text) THEN h.obyomi WHEN (h.operatsiya = 'rasxod'::text) THEN (- h.obyomi) ELSE (0)::numeric END) AS qoldiq
   FROM (public.t2_sklad_harakat h JOIN public.t2_sklad_mustaqil s ON (((s.id = h.c11_sklad_id) AND (s.kompaniya_id = h.kompaniya_id))))
  WHERE ((h.c11_sklad_id IS NOT NULL) AND (h.holat = 'faol'::text)
    AND (h.manba = ANY (ARRAY['c11_warehouse_receipt_v1'::text, 'c11_warehouse_storno_v1'::text, 'c11_warehouse_berdim_v1'::text])))
  GROUP BY h.kompaniya_id, h.c11_sklad_id, s.nomi, h.nomi, h.birligi;
DROP FUNCTION IF EXISTS public.t2_ombor_prixod_sinxron_v1(bigint,bigint,bigint,jsonb,uuid,boolean);
DROP FUNCTION IF EXISTS public.t2_ombor_prixod_kalitlar_v1(bigint,bigint,bigint);
DROP FUNCTION IF EXISTS public.t2_ombor_alias_tasdiq_v1(bigint,bigint,bigint,text,jsonb,uuid);
DROP FUNCTION IF EXISTS public.t2_ombor_tuzat_v1(bigint,bigint,bigint,bigint,jsonb,text,uuid);
DROP FUNCTION IF EXISTS public.t2_ombor_chiqim_v1(bigint,bigint,bigint,text,text,numeric,date,text,text,bigint,text,uuid,boolean);
DROP FUNCTION IF EXISTS public.t2_ombor_prixod_v1(bigint,bigint,bigint,text,text,numeric,date,text,text,text,text,uuid);
DROP FUNCTION IF EXISTS public.t2_ombor_yozuv_v1(bigint,bigint,bigint,text,text,text,numeric,date,text,text,text,text,bigint,text,uuid,boolean);
DROP FUNCTION IF EXISTS public.t2_ombor_guruh_qoldiq_v1(bigint,bigint,text,text);
DROP FUNCTION IF EXISTS public.t2_ombor_harakat_royxat_v1(bigint,bigint,bigint,jsonb,integer,integer);
DROP FUNCTION IF EXISTS public.t2_ombor_tarix_v1(bigint,bigint,bigint,text,text,integer,integer);
DROP FUNCTION IF EXISTS public.t2_ombor_qoldiq_v2(bigint,bigint,bigint,jsonb,integer,integer);
DROP FUNCTION IF EXISTS public.t2_ombor_kirish_v1(bigint,bigint,bigint,boolean);
DROP FUNCTION IF EXISTS public.t2_ombor_guruh_kaliti_v1(bigint,text);
DROP FUNCTION IF EXISTS public.t2_ombor_moslik_v1(text,text);
DROP FUNCTION IF EXISTS public.t2_ombor_birlik_v1(text);
DROP FUNCTION IF EXISTS public.t2_ombor_kalit_v1(text);
DROP INDEX IF EXISTS public.t2_sklad_harakat_ombor_tuzat_once_uq;
DROP INDEX IF EXISTS public.t2_sklad_harakat_ombor_sana_idx;
