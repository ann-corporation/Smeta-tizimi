-- Rollback t2_tezlik_panel_v1: _t2_summa_agg_v1 oldingi matniga qaytariladi, keyin yangi funksiya o'chiriladi.
DO $m$
DECLARE v text; v2 text;
BEGIN
  v := pg_get_functiondef('public._t2_summa_agg_v1(bigint[],text,bigint[],date,date,text,text)'::regprocedure);
  IF position('tezlik_panel_v1' in v) > 0 THEN
    v2 := v;
    v2 := regexp_replace(v2, 'from public\._t2_fakt_olchov_v1\(p_obyekt_ids\) h /\* tezlik_panel_v1 \*/', 'from public._t2_qator_holat_v2(p_obyekt_ids) h');
    v2 := regexp_replace(v2, 'qq as materialized \(.*?\),\s+ota as \(select distinct q\.ota_id as id from qq q where q\.ota_id is not null\),',
      'ota as (select distinct q.ota_id as id from public.t2_qator q where q.obyekt_id = any(p_obyekt_ids) and q.ota_id is not null),', 's');
    v2 := regexp_replace(v2, 'from qq q\s+where p_olchov = ''smeta'' and q\.versiya_holat = ''faol''',
      'from public.t2_qator q
     where p_olchov = ''smeta'' and q.obyekt_id = any(p_obyekt_ids) and q.versiya_holat = ''faol''');
    v2 := regexp_replace(v2, 'join qq q on q\.id = qm\.qator_id', 'join public.t2_qator q on q.id = qm.qator_id and q.obyekt_id = any(p_obyekt_ids)');
    IF v2 = v OR position('qq' in v2) > 0 AND position('qq as materialized' in v2) > 0 THEN RAISE EXCEPTION 'TEZLIK_PANEL_V1_ROLLBACK_ANCHOR_YOQ'; END IF;
    EXECUTE v2;
  END IF;
END $m$;
DROP FUNCTION IF EXISTS public._t2_fakt_olchov_v1(bigint[]);