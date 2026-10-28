-- C11 PR-B: t2_sklad_kirim_royxat_v1 (20261113810000) — faqat o'qiydi, lekin VOLATILE yaratilgan.
-- /api/sb o'qish-RPC larini GET bilan chaqiradi; PostgREST GET'da faqat STABLE/IMMUTABLE funksiyani bajaradi.
-- Bu migratsiya faqat volatilikni STABLE qiladi: tana, imzo, grant, ruxsat tekshiruvi o'zgarmaydi.
-- Ichidagi t2_actor_kompaniya_azo_tekshir (VOLATILE, lekin yozmaydi) va t2_require_permission_v2 (STABLE)
-- boshqa STABLE o'qish-RPC larida (masalan t2_f2_import_job_royxat_v1) ham xuddi shunday ishlatiladi.

BEGIN;

DO $pre$
BEGIN
  IF to_regprocedure('public.t2_sklad_kirim_royxat_v1(bigint,bigint,bigint,jsonb,integer,integer)') IS NULL THEN
    RAISE EXCEPTION 'C11 list RPC missing; apply 20261113810000 first';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc
     WHERE oid = 'public.t2_sklad_kirim_royxat_v1(bigint,bigint,bigint,jsonb,integer,integer)'::regprocedure
       AND prosrc ~* '\m(insert|update|delete)\M\s'
  ) THEN
    RAISE EXCEPTION 'C11 list RPC body writes; refusing to mark STABLE';
  END IF;
END
$pre$;

ALTER FUNCTION public.t2_sklad_kirim_royxat_v1(bigint,bigint,bigint,jsonb,integer,integer) STABLE;

COMMIT;
