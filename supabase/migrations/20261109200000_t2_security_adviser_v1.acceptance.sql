DO $$
DECLARE r record;
BEGIN
  SELECT p.proconfig, has_function_privilege('anon', p.oid, 'EXECUTE') a, has_function_privilege('authenticated', p.oid, 'EXECUTE') b
    INTO r FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='t2_akt_raqam_takror_v1';
  IF r.a OR r.b THEN RAISE EXCEPTION 't2_akt_raqam_takror_v1 hali ham anon/authenticated uchun ochiq'; END IF;
  SELECT p.proconfig INTO r FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='t2_almashtirilgan_summa_hisob';
  IF r.proconfig IS NULL OR NOT (array_to_string(r.proconfig, ',') LIKE '%search_path=%') THEN
    RAISE EXCEPTION 't2_almashtirilgan_summa_hisob search_path o''rnatilmagan';
  END IF;
  RAISE NOTICE 'OK: security adviser v1';
END $$;