-- Rollback t2_hisob_yadro_yagona_v1: oldingi (20261203001300) ta'riflar qaytariladi. Ma'lumotga tegilmaydi.
CREATE OR REPLACE VIEW public.t2_obyekt_jami AS
 SELECT o.id,
    o.nom,
    o.tur,
    COALESCE(a.qator_soni, 0::bigint) AS qator_soni,
    COALESCE(a.razdel, 0::bigint) AS razdel,
    COALESCE(a.ish, 0::bigint) AS ish,
    COALESCE(a.resurs, 0::bigint) AS resurs,
    CASE WHEN a.rz_asl IS NULL THEN NULL::numeric ELSE a.rz_asl - COALESCE(a.rz_ozgarish, 0::numeric) END AS jami,
    COALESCE(a.narxsiz, 0::bigint) AS narxsiz,
    a.chel,
    a.mash,
    a.mat,
    a.ob,
    o.yangilandi,
    o.kompaniya_id,
    o.lat,
    o.lng,
    o.versiya,
    o.loyiha_id
   FROM t2_obyekt o
     LEFT JOIN LATERAL ( SELECT count(*) AS qator_soni,
            count(*) FILTER (WHERE q.tur = 'rz'::text) AS razdel,
            count(*) FILTER (WHERE q.tur = 'bl'::text) AS ish,
            count(*) FILTER (WHERE q.tur = 'rs'::text) AS resurs,
            sum(q.summa) FILTER (WHERE q.tur = 'rz'::text AND public.t2_qator_asl_v1(q.change_type, q.qoshimcha, q.zamena)) AS rz_asl,
            sum(q.summa) FILTER (WHERE q.tur <> 'rz'::text AND NOT public.t2_qator_asl_v1(q.change_type, q.qoshimcha, q.zamena)
                                   AND p.versiya_holat = 'faol'::text AND public.t2_qator_asl_v1(p.change_type, p.qoshimcha, p.zamena)) AS rz_ozgarish,
            count(DISTINCT ROW(upper(btrim(COALESCE(q.nom, ''::text))), COALESCE(q.birlik, ''::text))) FILTER (WHERE (q.tur = ANY (ARRAY['rs'::text, 'mat'::text, 'ob'::text])) AND q.narx IS NULL AND COALESCE(q.nom, ''::text) !~* 'ЗАТРАТЫ\s+ТРУДА\s+МАШИНИСТ'::text) AS narxsiz,
            sum(q.summa) FILTER (WHERE (q.tur = ANY (ARRAY['rs'::text, 'mat'::text, 'ob'::text])) AND q.kat = 'ЧЕЛ'::text AND public.t2_qator_asl_v1(q.change_type, q.qoshimcha, q.zamena)) AS chel,
            sum(q.summa) FILTER (WHERE (q.tur = ANY (ARRAY['rs'::text, 'mat'::text, 'ob'::text])) AND q.kat = 'МАШ'::text AND public.t2_qator_asl_v1(q.change_type, q.qoshimcha, q.zamena)) AS mash,
            sum(q.summa) FILTER (WHERE (q.tur = ANY (ARRAY['rs'::text, 'mat'::text, 'ob'::text])) AND q.kat = 'МАТ'::text AND public.t2_qator_asl_v1(q.change_type, q.qoshimcha, q.zamena)) AS mat,
            sum(q.summa) FILTER (WHERE (q.tur = ANY (ARRAY['rs'::text, 'mat'::text, 'ob'::text])) AND q.kat = 'ОБ'::text AND public.t2_qator_asl_v1(q.change_type, q.qoshimcha, q.zamena)) AS ob
           FROM t2_qator q
             LEFT JOIN t2_qator p ON p.id = q.ota_id
          WHERE q.obyekt_id = o.id AND q.versiya_holat = 'faol'::text) a ON true
  WHERE o.holat <> 'bekor'::text;

DO $m$
DECLARE
  v text; v2 text;
  yangi constant text := '(SELECT sum(q.summa) FROM t2_qator q WHERE q.versiya_holat = ''faol'' AND q.obyekt_id = o.id /* hisob_yadro_v1 */ AND public.t2_qator_asl_v1(q.change_type, q.qoshimcha, q.zamena) AND NOT EXISTS (SELECT 1 FROM t2_qator c WHERE c.ota_id = q.id))';
BEGIN
  v := pg_get_functiondef('public.t2_mindmap_grafi(bigint)'::regprocedure);
  IF position(yangi in v) > 0 THEN
    EXECUTE replace(v, yangi, '(SELECT sum(q.summa) FROM t2_qator q WHERE q.versiya_holat = ''faol'' AND q.obyekt_id = o.id AND q.tur = ''rz'')');
  END IF;
  v := pg_get_functiondef('public.t2_ai_umumiy(bigint)'::regprocedure);
  IF position(yangi in v) > 0 THEN
    EXECUTE replace(v, yangi, '(select sum(q.summa) from t2_qator q where q.versiya_holat=''faol'' and q.obyekt_id=o.id and q.tur=''rz'')');
  END IF;
END
$m$;

-- t2_bux_dashboard: avvalgi ta'rif (/moliya «Bajarilgan (F2) / To'langan / Qarzdorlik»): bajarilgan = TASDIQLANGAN F2 (rahbar paneli va nakopitelniy
CREATE OR REPLACE VIEW public.t2_bux_dashboard AS
 WITH baj AS (
         SELECT bog.shartnoma_id,
            sum(a.hujjat_jami) AS bajarilgan
           FROM t2_shartnoma_bog bog
             JOIN t2_akt a ON a.obyekt_id = bog.obyekt_id
          WHERE a.tur = 'f2'::text AND a.holat <> 'bekor'::text
          GROUP BY bog.shartnoma_id
        ), tol AS (
         SELECT t2_tolov.shartnoma_id,
            COALESCE(sum(t2_tolov.summa) FILTER (WHERE t2_tolov.tur = ANY (ARRAY['avans'::text, 'tolov'::text])), 0::numeric) - COALESCE(sum(t2_tolov.summa) FILTER (WHERE t2_tolov.tur = 'qaytarim'::text), 0::numeric) AS tolangan
           FROM t2_tolov
          WHERE t2_tolov.holat <> 'bekor'::text
          GROUP BY t2_tolov.shartnoma_id
        )
 SELECT s.id AS shartnoma_id,
    s.raqam,
    s.nom,
    s.taraf,
    s.holat,
    COALESCE(s.jami_nds_bilan, s.summa_bez_nds, 0::numeric) AS dog_summa,
    COALESCE(baj.bajarilgan, 0::numeric) AS bajarilgan,
    COALESCE(tol.tolangan, 0::numeric) AS tolangan,
    GREATEST(COALESCE(baj.bajarilgan, 0::numeric) - COALESCE(tol.tolangan, 0::numeric), 0::numeric) AS debitor,
    GREATEST(COALESCE(tol.tolangan, 0::numeric) - COALESCE(baj.bajarilgan, 0::numeric), 0::numeric) AS avans,
        CASE
            WHEN COALESCE(s.jami_nds_bilan, s.summa_bez_nds, 0::numeric) > 0::numeric THEN round(100.0 * COALESCE(baj.bajarilgan, 0::numeric) / COALESCE(s.jami_nds_bilan, s.summa_bez_nds), 1)
            ELSE NULL::numeric
        END AS bajarilgan_pct,
        CASE
            WHEN COALESCE(s.jami_nds_bilan, s.summa_bez_nds, 0::numeric) > 0::numeric THEN round(100.0 * COALESCE(tol.tolangan, 0::numeric) / COALESCE(s.jami_nds_bilan, s.summa_bez_nds), 1)
            ELSE NULL::numeric
        END AS tolangan_pct,
    s.kompaniya_id
   FROM t2_shartnoma s
     LEFT JOIN baj ON baj.shartnoma_id = s.id
     LEFT JOIN tol ON tol.shartnoma_id = s.id
  WHERE s.holat <> 'bekor'::text;

DO $w$
DECLARE v text; a int; b int;
BEGIN
  v := pg_get_functiondef('public.t2_workbench_v1(bigint,bigint,date,integer)'::regprocedure);
  a := position(E',\n    /* hisob_yadro_v1 */' in v);
  IF a > 0 THEN
    b := position(E'limit 1));' in substr(v, a)) + a - 1;
    EXECUTE substr(v, 1, a - 1) || ');' || substr(v, b + length(E'limit 1));'));
  END IF;
END
$w$;