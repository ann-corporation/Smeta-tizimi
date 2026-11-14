-- Rollback t2_hisob_yadro_v2: funksiya matnlari qaytadi. 1-band (bl/rz summalarini qayta yig'ish) ma'lumoti QAYTARILMAYDI:
-- avvalgi saqlangan qiymatlar barglardan eskirgan edi; kerak bo'lsa public.t2_rollup(obyekt_id) bilan qayta hisoblang.
DO $f$
DECLARE v text; a text; b text;
BEGIN
  v := pg_get_functiondef('public.t2_nakopitelniy_v2(bigint,bigint,date,integer,boolean,integer)'::regprocedure);
  IF position('hisob_yadro_v2' in v) > 0 THEN
    v := replace(v, '/* hisob_yadro_v2 */ ''fakt_hajm'', coalesce(fh.fakt_hajm,0), ''fakt_summa'', coalesce(fh.fakt_summa,0),', '''fakt_hajm'', coalesce(p.fakt_hajm,0), ''fakt_summa'', coalesce(p.fakt_summa,0),');
    v := replace(v, '''f2_mumkin_hajm'', coalesce(fh.fakt_hajm,0) - (', '''f2_mumkin_hajm'', coalesce(p.fakt_hajm,0) - (');
    v := replace(v, 'coalesce(fh.fakt_hajm,0) <> 0', 'coalesce(p.fakt_hajm,0) <> 0');
    v := regexp_replace(v, ' left join \(select h\.qator_id, h\.fakt_hajm, h\.fakt_summa from public\._t2_qator_holat_v2\(array\[p_obyekt_id\]\) h\) fh on fh\.qator_id = q\.id', '');
    v := replace(v, 'coalesce((select sum(h.fakt_summa) from public._t2_qator_holat_v2(array[p_obyekt_id]) h where not exists (select 1 from public.t2_qator c where c.ota_id = h.qator_id)),0) as fakt_summa,', 'coalesce(sum(x.fakt_summa),0) as fakt_summa,');
    EXECUTE v;
  END IF;
  v := pg_get_functiondef('public.t2_agent_fakt_v1(bigint,bigint,text[],bigint)'::regprocedure);
  IF position('hisob_yadro_v2' in v) > 0 THEN
    EXECUTE replace(v, 'sum(q.summa) filter (where public.t2_qator_asl_v1(q.change_type, q.qoshimcha, q.zamena) and not exists (select 1 from t2_qator c where c.ota_id = q.id)) /* hisob_yadro_v2 */ smeta_rz,', 'sum(q.summa) filter (where q.tur = ''rz'') smeta_rz,');
  END IF;
END
$f$;