-- T2-OMBOR-IDEAL-SIKL v1: kirimda NARX (QQS siz) yoziladi. t2_sklad_harakat append-only (UPDATE taqiqlangan) — narx faqat INSERT paytida.
-- Yangi funksiyalar (eski v1 ga tegilmaydi): t2_ombor_yozuv_v2 (+p_narx), t2_ombor_prixod_v2. Narx NULL = noma'lum (0 emas).
-- Idempotentlik xeshiga narx faqat berilganda qo'shiladi (eski operation_id lar bilan mos).
CREATE OR REPLACE FUNCTION public.t2_ombor_yozuv_v2(
  p_actor_id bigint, p_kompaniya_id bigint, p_sklad_id bigint, p_operatsiya text, p_nomi text, p_birligi text, p_miqdor numeric,
  p_sana date, p_kontragent text, p_tur text, p_izoh text, p_sf text, p_obyekt_id bigint, p_qabul_turi text,
  p_operation_id uuid, p_manfiy_ruxsat boolean DEFAULT false, p_narx numeric DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_k text; v_nomi text := nullif(pg_catalog.btrim(coalesce(p_nomi,'')), ''); v_birligi text := nullif(pg_catalog.btrim(coalesce(p_birligi,'')), '');
  v_sana date := coalesce(p_sana, (pg_catalog.now() AT TIME ZONE 'Asia/Tashkent')::date);
  v_kont text := nullif(pg_catalog.btrim(coalesce(p_kontragent,'')), ''); v_manba text; v_hash text;
  v_mavjud public.t2_sklad_harakat%ROWTYPE; v_qoldiq numeric; v_id bigint;
BEGIN
  IF p_operation_id IS NULL OR v_nomi IS NULL OR v_birligi IS NULL OR p_miqdor IS NULL OR p_operatsiya NOT IN ('prixod','rasxod') THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'REQUIRED_FIELD');
  END IF;
  IF p_miqdor <= 0 OR p_miqdor > 1000000000 OR pg_catalog.length(v_nomi) > 500 OR pg_catalog.length(v_birligi) > 100
     OR pg_catalog.length(coalesce(v_kont,'')) > 500 OR pg_catalog.length(coalesce(p_izoh,'')) > 1000
     OR (p_narx IS NOT NULL AND (p_narx <= 0 OR p_narx > 1000000000000)) THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'INVALID_INPUT');
  END IF;
  IF v_sana > (pg_catalog.now() AT TIME ZONE 'Asia/Tashkent')::date + 1 THEN RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'DATE_IN_FUTURE'); END IF;
  v_k := public.t2_ombor_kirish_v1(p_actor_id, p_kompaniya_id, p_sklad_id, true);
  IF v_k <> 'OK' THEN RETURN pg_catalog.jsonb_build_object('ok', false, 'code', v_k); END IF;
  IF p_obyekt_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.t2_obyekt o WHERE o.id = p_obyekt_id AND o.kompaniya_id = p_kompaniya_id) THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'OBJECT_SCOPE_MISMATCH');
  END IF;
  v_manba := CASE p_operatsiya WHEN 'prixod' THEN 'ombor_prixod_v1' ELSE 'ombor_chiqim_v1' END;
  v_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to((pg_catalog.jsonb_build_object(
    'a', p_actor_id, 'k', p_kompaniya_id, 's', p_sklad_id, 'o', p_operatsiya, 'n', v_nomi, 'b', v_birligi, 'm', p_miqdor::text, 'd', v_sana,
    'c', v_kont, 't', p_tur, 'i', p_izoh, 'f', p_sf, 'y', p_obyekt_id, 'q', p_qabul_turi)
    || CASE WHEN p_narx IS NULL THEN '{}'::jsonb ELSE pg_catalog.jsonb_build_object('p', p_narx::text) END)::text, 'UTF8')), 'hex');
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ombor:' || p_kompaniya_id::text || ':' || p_sklad_id::text, 0));
  SELECT h.* INTO v_mavjud FROM public.t2_sklad_harakat h
   WHERE h.kompaniya_id = p_kompaniya_id AND h.c11_operation_id = p_operation_id AND h.manba = v_manba LIMIT 1;
  IF FOUND THEN
    IF v_mavjud.c11_request_hash IS DISTINCT FROM v_hash THEN RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'OPERATION_ID_CONFLICT'); END IF;
    RETURN pg_catalog.jsonb_build_object('ok', true, 'takror', true, 'harakat_id', v_mavjud.id);
  END IF;
  v_qoldiq := public.t2_ombor_guruh_qoldiq_v1(p_kompaniya_id, p_sklad_id, v_nomi, v_birligi);
  IF p_operatsiya = 'rasxod' AND v_qoldiq - p_miqdor < 0 AND NOT coalesce(p_manfiy_ruxsat, false) THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'QOLDIQ_YETMAYDI', 'qoldiq', v_qoldiq, 'so_ralgan', p_miqdor);
  END IF;
  INSERT INTO public.t2_sklad_harakat (
    kompaniya_id, obyekt_id, operatsiya, turi, sana, nomi, birligi, obyomi, postavshik, qabul_qiluvchi, qabul_turi, izoh, holat, manba, kim,
    c11_sklad_id, c11_operation_id, c11_request_hash, c11_actor_id, c11_manba_turi, c11_sf_tasdiq, c11_hedef_obyekt_id, narx
  ) VALUES (
    p_kompaniya_id, NULL, p_operatsiya, 'mat', v_sana, v_nomi, v_birligi, p_miqdor,
    CASE WHEN p_operatsiya = 'prixod' THEN v_kont END, CASE WHEN p_operatsiya = 'rasxod' THEN v_kont END,
    nullif(pg_catalog.btrim(coalesce(p_qabul_turi,'')), ''), nullif(pg_catalog.btrim(coalesce(p_izoh,'')), ''), 'faol', v_manba, 'actor:' || p_actor_id::text,
    p_sklad_id, p_operation_id, v_hash, p_actor_id, nullif(pg_catalog.btrim(coalesce(p_tur,'')), ''), nullif(pg_catalog.btrim(coalesce(p_sf,'')), ''), p_obyekt_id,
    CASE WHEN p_operatsiya = 'prixod' THEN p_narx END
  ) RETURNING id INTO v_id;
  PERFORM public.t2_audit_yoz(p_kompaniya_id, 'ombor_' || p_operatsiya || '_yozildi', 'sklad', NULL::bigint,
    pg_catalog.format('sklad_id=' || p_sklad_id::text || '; ' || 'harakat_id=%s; miqdor=%s; birlik=%s; narx=%s; operation_id=%s', v_id, p_miqdor, v_birligi, coalesce(p_narx::text, '-'), p_operation_id),
    'actor:' || p_actor_id::text, NULL);
  RETURN pg_catalog.jsonb_build_object('ok', true, 'takror', false, 'harakat_id', v_id, 'qoldiq_keyin',
    CASE WHEN p_operatsiya = 'prixod' THEN v_qoldiq + p_miqdor ELSE v_qoldiq - p_miqdor END);
END
$function$;

CREATE OR REPLACE FUNCTION public.t2_ombor_prixod_v2(
  p_actor_id bigint, p_kompaniya_id bigint, p_sklad_id bigint, p_nomi text, p_birligi text, p_miqdor numeric, p_sana date,
  p_postavshik text, p_tur text, p_izoh text, p_sf text, p_narx numeric, p_operation_id uuid
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT public.t2_ombor_yozuv_v2(p_actor_id, p_kompaniya_id, p_sklad_id, 'prixod', p_nomi, p_birligi, p_miqdor, p_sana,
    p_postavshik, p_tur, p_izoh, p_sf, NULL, NULL, p_operation_id, false, p_narx);
$function$;

-- Ruxsatlar: faqat service_role (gateway orqali; a'zolik/ruxsat RPC ichida tekshiriladi).
DO $g$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_catalog.pg_proc p
            WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('t2_ombor_yozuv_v2','t2_ombor_prixod_v2')
  LOOP
    EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE pg_catalog.format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END
$g$;