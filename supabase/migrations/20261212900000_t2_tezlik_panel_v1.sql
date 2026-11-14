-- t2_tezlik_panel_v1 (2026-11-11): tezlik, uchinchi bosqich. Natijalar AYNAN bir xil.
-- Prodda o'lchov (EXPLAIN ANALYZE, BUFFERS, kompaniya 123, 139 846 qator): t2_rahbar_panel_v1 = 1,82M buffer (~16 s);
-- uning ichida _t2_summa_agg_v1: 'fakt' 1,23M, 'smeta_joriy' 583k, 'smeta' 404k, 'f2' 68k. Rahbar paneli dashboard, obyektlar va F2 reestrida chaqiriladi.
--  1) _t2_fakt_olchov_v1(bigint[]): 'fakt' o'lchovi _t2_qator_holat_v2 dan faqat 7 ustunni oladi (qator_id, obyekt_id, smeta_hajm, smeta_narx,
--     fakt_hajm, fakt_summa, f2_hajm). v2 qoldiq/almashtirilgan ustunlari uchun t2_almashtirilgan_hajm ni 1800+ marta va har qatorga EXISTS ni
--     hisoblaydi. Yangisi shu 7 ustunni AYNAN shu formula bilan beradi (EXISTS -> hashed IN, t2_akt_qator agregati bir marta).
--     Prodda v2 bilan EXCEPT ALL natijasi ikki yo'nalishda 0 (139 846 qator).
--  2) _t2_summa_agg_v1 (7 arg): (a) 'fakt' shu funksiyadan; (b) t2_qator obyektlar uchun BIR marta o'qiladi (qq) - avval `r` har qator uchun
--     t2_qator ni id bo'yicha qayta o'qirdi (nested loop, ~3 buffer x 140k) va `ota` ham alohida skan edi.
-- Matn bo'yicha almashtirish (pg_get_functiondef + anchor): anchor topilmasa - xato (drift himoyasi).
-- versiya: tarix (holat funksiyasi t2_qator_holat kabi barcha versiyani o'qiydi; _t2_summa_agg_v1 versiya filtrini o'z ichida beradi).

CREATE OR REPLACE FUNCTION public._t2_fakt_olchov_v1(p_obyekt_ids bigint[])
RETURNS TABLE(qator_id bigint, obyekt_id bigint, smeta_hajm numeric, smeta_narx numeric, fakt_hajm numeric, fakt_summa numeric, f2_hajm numeric)
LANGUAGE sql
STABLE
AS $fn$
 WITH agg AS MATERIALIZED (
   SELECT aq.qator_id,
          count(*) AS n,
          sum(aq.hajm) FILTER (WHERE a.tur = 'fakt' AND a.holat <> 'bekor') AS direct_fakt_hajm,
          sum(aq.summa) FILTER (WHERE a.tur = 'fakt' AND a.holat <> 'bekor') AS direct_fakt_summa,
          sum(COALESCE(aq.certified_quantity, aq.hajm)) FILTER (WHERE a.tur = 'f2' AND a.holat = 'tasdiqlangan') AS f2_hajm,
          sum(COALESCE(aq.certified_amount, aq.summa)) FILTER (WHERE a.tur = 'f2' AND a.holat = 'tasdiqlangan') AS f2_summa_malum,
          count(*) FILTER (WHERE a.tur = 'f2' AND a.holat = 'tasdiqlangan' AND COALESCE(aq.certified_amount, aq.summa) IS NULL AND COALESCE(aq.certified_quantity, aq.hajm, 0) <> 0) AS f2_summa_yoq,
          sum(aq.hajm) FILTER (WHERE a.tur = 'fakt' AND a.holat <> 'bekor' AND aq.narx_manba = 'f2_sertifikat') AS f2s_hajm
     FROM public.t2_akt_qator aq
     LEFT JOIN public.t2_akt a ON a.id = aq.akt_id
    WHERE aq.qator_id IN (SELECT q2.id FROM public.t2_qator q2 WHERE q2.obyekt_id = ANY(p_obyekt_ids))
    GROUP BY aq.qator_id
 )
 SELECT q.id AS qator_id, q.obyekt_id,
    CASE WHEN (q.versiya_holat = 'almashtirilgan'::text) THEN (0)::numeric ELSE COALESCE(zr.v, q.hajm) END AS smeta_hajm,
    q.narx AS smeta_narx,
    e.fakt_hajm,
    CASE WHEN ((d.f2_hajm <> (0)::numeric) AND (d.f2_summa_yoq = 0) AND (e.fakt_hajm IS NOT NULL) AND (e.fakt_summa IS NOT NULL)) THEN public._t2_f2_narxda_v1(e.fakt_hajm, d.f2_hajm, d.f2_summa_malum) ELSE e.fakt_summa END AS fakt_summa,
    d.f2_hajm
   FROM public.t2_qator q
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN (((q.change_type = 'REPLACEMENT'::text) AND (q.replaces_line_id IS NOT NULL) AND (q.almashtirish_hajm IS NULL)) OR ((q.tur = ANY (ARRAY['rs'::text, 'mat'::text, 'ob'::text])) AND (q.ota_id IS NOT NULL) AND (q.ota_id IN ( SELECT zp.id
                       FROM public.t2_qator zp
                      WHERE ((zp.change_type = 'REPLACEMENT'::text) AND (zp.replaces_line_id IS NOT NULL) AND (zp.almashtirish_hajm IS NULL)))))) THEN public.t2_zamena_reja_hajm(q.id)
                    ELSE NULL::numeric
                END AS v OFFSET 0) zr
     LEFT JOIN agg dd ON (dd.qator_id = q.id)
     CROSS JOIN LATERAL ( SELECT COALESCE(dd.direct_fakt_hajm, (0)::numeric) AS direct_fakt_hajm,
            COALESCE(dd.direct_fakt_summa, (0)::numeric) AS direct_fakt_summa,
            COALESCE(dd.f2_hajm, (0)::numeric) AS f2_hajm,
            COALESCE(dd.f2_summa_malum, (0)::numeric) AS f2_summa_malum,
            COALESCE(dd.f2_summa_yoq, (0)::bigint) AS f2_summa_yoq) d
     LEFT JOIN public.t2_qator bp ON (((q.tur = 'rs'::text) AND (q.norma IS NOT NULL) AND (bp.id = q.ota_id) AND (bp.obyekt_id = q.obyekt_id) AND (bp.tur = 'bl'::text)))
     LEFT JOIN agg bla ON (bla.qator_id = bp.id)
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN (bp.id IS NULL) THEN (0)::bigint
                    ELSE GREATEST(COALESCE(bla.n, (0)::bigint), (1)::bigint)
                END AS bl_soni,
            COALESCE(bla.direct_fakt_hajm, (0)::numeric) AS fakt_hajm,
            COALESCE(bla.f2s_hajm, (0)::numeric) AS f2s_hajm) bl
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN ((bl.bl_soni > 0) AND (d.direct_fakt_hajm = (0)::numeric)) THEN ((bl.fakt_hajm - bl.f2s_hajm) * q.norma)
                    ELSE d.direct_fakt_hajm
                END AS fakt_hajm,
                CASE
                    WHEN ((bl.bl_soni > 0) AND (d.direct_fakt_hajm = (0)::numeric)) THEN
                    CASE
                        WHEN (q.narx IS NULL) THEN NULL::numeric
                        ELSE (((bl.fakt_hajm - bl.f2s_hajm) * q.norma) * q.narx)
                    END
                    ELSE d.direct_fakt_summa
                END AS fakt_summa) e
   WHERE q.obyekt_id = ANY(p_obyekt_ids)
$fn$;
REVOKE ALL ON FUNCTION public._t2_fakt_olchov_v1(bigint[]) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._t2_fakt_olchov_v1(bigint[]) TO service_role;
COMMENT ON FUNCTION public._t2_fakt_olchov_v1(bigint[]) IS '_t2_qator_holat_v2 ning qator_id/obyekt_id/smeta_hajm/smeta_narx/fakt_hajm/fakt_summa/f2_hajm ustunlari bilan bir xil (tezlik_panel_v1). Acceptance solishtiradi.';

DO $m$
DECLARE v text; v2 text;
BEGIN
  v := pg_get_functiondef('public._t2_summa_agg_v1(bigint[],text,bigint[],date,date,text,text)'::regprocedure);
  IF position('tezlik_panel_v1' in v) = 0 THEN
    v2 := v;
    -- (a) 'fakt' o'lchovi
    v2 := regexp_replace(v2, 'from public\._t2_qator_holat_v2\(p_obyekt_ids\) h\s+where p_olchov = ''fakt''',
      'from public._t2_fakt_olchov_v1(p_obyekt_ids) h /* tezlik_panel_v1 */
     where p_olchov = ''fakt''');
    IF v2 = v THEN RAISE EXCEPTION 'TEZLIK_PANEL_V1_ANCHOR_YOQ: fakt'; END IF;
    v := v2;
    -- (b) qq: t2_qator obyektlar uchun bir marta
    v2 := regexp_replace(v2, 'yb as \(select distinct on \(yr\.id\) yr\.id, yr\.bolim_id from yr order by yr\.id, yr\.bolim_id\),\s+ota as \(select distinct q\.ota_id as id from public\.t2_qator q where q\.obyekt_id = any\(p_obyekt_ids\) and q\.ota_id is not null\),',
      'yb as (select distinct on (yr.id) yr.id, yr.bolim_id from yr order by yr.id, yr.bolim_id),
  qq as materialized (
    select z.id, z.obyekt_id, z.tur, z.kat, z.birlik, z.nom, z.ota_id, z.summa, z.hajm, z.change_type, z.qoshimcha, z.zamena, z.versiya_holat
      from public.t2_qator z where z.obyekt_id = any(p_obyekt_ids)
  ),
  ota as (select distinct q.ota_id as id from qq q where q.ota_id is not null),');
    IF v2 = v THEN RAISE EXCEPTION 'TEZLIK_PANEL_V1_ANCHOR_YOQ: qq/ota'; END IF;
    v := v2;
    v2 := regexp_replace(v2, 'from public\.t2_qator q\s+where p_olchov = ''smeta'' and q\.obyekt_id = any\(p_obyekt_ids\) and q\.versiya_holat = ''faol''',
      'from qq q
     where p_olchov = ''smeta'' and q.versiya_holat = ''faol''');
    IF v2 = v THEN RAISE EXCEPTION 'TEZLIK_PANEL_V1_ANCHOR_YOQ: miqdor smeta'; END IF;
    v := v2;
    v2 := regexp_replace(v2, 'join public\.t2_qator q on q\.id = qm\.qator_id and q\.obyekt_id = any\(p_obyekt_ids\)',
      'join qq q on q.id = qm.qator_id');
    IF v2 = v THEN RAISE EXCEPTION 'TEZLIK_PANEL_V1_ANCHOR_YOQ: r join'; END IF;
    EXECUTE v2;
  END IF;
END $m$;
