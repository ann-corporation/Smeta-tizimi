DO $$
BEGIN
  IF (SELECT count(*) FROM pg_catalog.pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('t2_ombor_yozuv_v2','t2_ombor_prixod_v2')) <> 2 THEN RAISE EXCEPTION 'ACC1: ikki funksiya bo''lishi kerak'; END IF;
  IF has_function_privilege('anon', 'public.t2_ombor_prixod_v2(bigint,bigint,bigint,text,text,numeric,date,text,text,text,text,numeric,uuid)', 'EXECUTE') THEN RAISE EXCEPTION 'ACC2: anon ruxsati bo''lmasligi kerak'; END IF;
END $$;