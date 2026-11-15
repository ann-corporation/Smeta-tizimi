-- Acceptance: 20261224110000 t2_omborchi_berdim_v1. Sintetik; tashqi tranzaksiya ichida. Faqat funksiya matnini tekshiradi (jadvalga tegmaydi).
DO $acc$
DECLARE v_def text;
BEGIN
  v_def := pg_get_functiondef('public.t2_sklad_markaziy_berdim_v1(bigint,bigint,bigint,bigint,text,text,numeric,date,text,text,uuid)'::regprocedure);
  IF v_def NOT LIKE '%warehouse.write%' OR v_def NOT LIKE '%document.write%' THEN RAISE EXCEPTION 'ACCEPT_FAIL: berdim ruxsati warehouse.write yoki document.write emas'; END IF;
  IF has_function_privilege('anon','public.t2_sklad_markaziy_berdim_v1(bigint,bigint,bigint,bigint,text,text,numeric,date,text,text,uuid)','execute')
     OR has_function_privilege('authenticated','public.t2_sklad_markaziy_berdim_v1(bigint,bigint,bigint,bigint,text,text,numeric,date,text,text,uuid)','execute') THEN
    RAISE EXCEPTION 'ACCEPT_FAIL: berdim public ga ochiq';
  END IF;
  RAISE NOTICE 'ACCEPT_OK t2_omborchi_berdim_v1';
END $acc$;