-- Rollback t2_tezlik_paket_v1: t2_mindmap_grafi ort -> _t2_qator_holat_v2 (tezlik_v1 holati), keyin yangi funksiyalar o'chiriladi.
DO $m$
DECLARE v text; v2 text;
BEGIN
  v := pg_get_functiondef('public.t2_mindmap_grafi(bigint)'::regprocedure);
  IF position('tezlik_v2' in v) > 0 THEN
    v2 := replace(v, 'public._t2_ortiqcha_olchov_v1(ARRAY(SELECT o0.id FROM public.t2_obyekt o0 WHERE o0.kompaniya_id = p_kompaniya_id)) qh /* tezlik_v2 */',
                     'public._t2_qator_holat_v2(ARRAY(SELECT o0.id FROM public.t2_obyekt o0 WHERE o0.kompaniya_id = p_kompaniya_id)) qh');
    IF v2 = v THEN RAISE EXCEPTION 'TEZLIK_V2_ROLLBACK_ANCHOR_YOQ: t2_mindmap_grafi'; END IF;
    EXECUTE v2;
  END IF;
END $m$;
DROP FUNCTION IF EXISTS public._t2_ortiqcha_olchov_v1(bigint[]);
DROP FUNCTION IF EXISTS public.t2_obyekt_nakrutka_paket_v1(bigint, jsonb);