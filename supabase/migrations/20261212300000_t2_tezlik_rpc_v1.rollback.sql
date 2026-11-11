-- Rollback t2_tezlik_rpc_v1: oldingi ta'riflar (verbatim) qaytariladi.
DO $m$
DECLARE v text; v2 text;
BEGIN
  v := pg_get_functiondef('public.t2_mindmap_grafi(bigint)'::regprocedure);
  IF position('tezlik_v1' in v) > 0 THEN
    v2 := regexp_replace(v, 'ort AS \( /\* tezlik_v1 \*/.*?GROUP BY r\.obyekt_id\s*\)',
      replace(E'ort AS (\r\n  SELECT r.obyekt_id, count(*)::integer AS n\r\n    FROM public.t2_overbilling_radar r\r\n   WHERE r.kompaniya_id = p_kompaniya_id\r\n     AND (r.f2_fakt_ortiqcha > 0 OR r.f2_smeta_ortiqcha > 0)\r\n   GROUP BY r.obyekt_id\r\n)', '\', '\\'), 's');
    IF v2 = v THEN RAISE EXCEPTION 'TEZLIK_V1_ROLLBACK_ANCHOR_YOQ: t2_mindmap_grafi'; END IF;
    EXECUTE v2;
  END IF;
  v := pg_get_functiondef('public._t2_summa_agg_v1(bigint[],text,bigint[],date,date,text,text)'::regprocedure);
  IF position('_t2_qator_holat_v2' in v) > 0 THEN
    v2 := regexp_replace(v, 'from public\._t2_qator_holat_v2\(p_obyekt_ids\) h\s+where p_olchov = ''fakt''',
      E'from public.t2_qator_holat h\n     where p_olchov = ''fakt'' and h.obyekt_id = any(p_obyekt_ids)');
    IF v2 = v THEN RAISE EXCEPTION 'TEZLIK_V1_ROLLBACK_ANCHOR_YOQ: _t2_summa_agg_v1'; END IF;
    EXECUTE v2;
  END IF;
END $m$;
DROP FUNCTION IF EXISTS public._t2_qator_holat_v2(bigint[]);
CREATE OR REPLACE FUNCTION public.t2_qator_asl_v1(p_change_type text, p_qoshimcha boolean, p_zamena boolean)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select p_change_type is null and not coalesce(p_qoshimcha, false) and not coalesce(p_zamena, false)
$function$;