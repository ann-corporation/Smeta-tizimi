-- t2_tezlik_rpc_v1 (2026-11-11): tezlik. Natija AYNAN bir xil, faqat hisoblash yo'li tez.
--  1) t2_qator_asl_v1: SET search_path olib tashlandi -> planner inline qiladi (qator boshiga funksiya chaqiruvi yo'q).
--  2) _t2_qator_holat_v2(bigint[]): t2_qator_holat ko'rinishi bilan bir xil ustunlar; t2_akt_qator qator-bo'yicha
--     LATERAL (189M skan) o'rniga bir marta GROUP BY + JOIN, faqat so'ralgan obyektlar qatorlari uchun.
--  3) t2_mindmap_grafi: ort (overbilling soni) t2_overbilling_radar (butun jadval) o'rniga shu funksiyadan.
--  4) _t2_summa_agg_v1: 'fakt' o'lchovi t2_qator_holat o'rniga shu funksiyadan.
-- Funksiya 3, 4 matn bo'yicha (pg_get_functiondef + anchor) almashtiriladi: anchor topilmasa — xato (drift himoyasi).
-- versiya: tarix (holat funksiyasi t2_qator_holat kabi barcha versiyani o'qiydi; versiya_holat ustuni qaytadi).

CREATE OR REPLACE FUNCTION public.t2_qator_asl_v1(p_change_type text, p_qoshimcha boolean, p_zamena boolean)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  select p_change_type is null and not coalesce(p_qoshimcha, false) and not coalesce(p_zamena, false)
$function$;

CREATE OR REPLACE FUNCTION public._t2_qator_holat_v2(p_obyekt_ids bigint[])
RETURNS TABLE(
  id bigint,
  qator_id bigint,
  obyekt_id bigint,
  tur text,
  raqam text,
  kod text,
  nom text,
  birlik text,
  kat text,
  smeta_hajm numeric,
  smeta_narx numeric,
  smeta_summa numeric,
  fakt_hajm numeric,
  fakt_summa numeric,
  f2_hajm numeric,
  f2_summa numeric,
  qoldiq_hajm numeric,
  qoldiq_summa numeric,
  f2_mumkin_hajm numeric,
  f2_mumkin_summa numeric,
  f2_narx numeric,
  fakt_narx numeric,
  f2_narx_farq_foiz numeric,
  ota_id bigint,
  norma numeric,
  direct_fakt_hajm numeric,
  direct_fakt_summa numeric,
  fakt_manbasi text,
  f2_summa_nomalum bigint,
  almashtirilgan_hajm numeric,
  almashtirilgan_summa numeric,
  versiya_holat text,
  asl_smeta_hajm numeric,
  asl_smeta_summa numeric,
  f2_summa_yoq bigint,
  fakt_summa_nomalum bigint)
LANGUAGE sql
STABLE
AS $fn$
 SELECT q.id,
    q.id AS qator_id,
    q.obyekt_id,
    q.tur,
    q.raqam,
    q.kod,
    q.nom,
    q.birlik,
    q.kat,
        CASE
            WHEN (q.versiya_holat = 'almashtirilgan'::text) THEN (0)::numeric
            ELSE COALESCE(zr.v, q.hajm)
        END AS smeta_hajm,
    q.narx AS smeta_narx,
        CASE
            WHEN (q.versiya_holat = 'almashtirilgan'::text) THEN (0)::numeric
            ELSE q.summa
        END AS smeta_summa,
    e.fakt_hajm,
        CASE
            WHEN ((d.f2_hajm <> (0)::numeric) AND (d.f2_summa_yoq = 0) AND (e.fakt_hajm IS NOT NULL) AND (e.fakt_summa IS NOT NULL)) THEN public._t2_f2_narxda_v1(e.fakt_hajm, d.f2_hajm, d.f2_summa_malum)
            ELSE e.fakt_summa
        END AS fakt_summa,
    d.f2_hajm,
    d.f2_summa_malum AS f2_summa,
        CASE
            WHEN (q.versiya_holat = 'almashtirilgan'::text) THEN (0)::numeric
            ELSE ((COALESCE(zr.v, q.hajm) - d.f2_hajm) - al.v)
        END AS qoldiq_hajm,
        CASE
            WHEN (q.versiya_holat = 'almashtirilgan'::text) THEN (0)::numeric
            ELSE
            CASE
                WHEN ((zr.v IS NOT NULL) AND (q.change_type IS DISTINCT FROM 'REPLACEMENT'::text)) THEN
                CASE
                    WHEN ((q.hajm <> (0)::numeric) AND (q.summa IS NOT NULL)) THEN ((q.summa / q.hajm) * ((zr.v - d.f2_hajm) - al.v))
                    ELSE NULL::numeric
                END
                ELSE ((
                CASE
                    WHEN ((zr.v IS NOT NULL) AND (q.hajm <> (0)::numeric) AND (q.summa IS NOT NULL)) THEN ((q.summa * zr.v) / q.hajm)
                    ELSE q.summa
                END - d.f2_summa_malum) - COALESCE(als.s, (0)::numeric))
            END
        END AS qoldiq_summa,
    GREATEST((e.fakt_hajm - d.f2_hajm), (0)::numeric) AS f2_mumkin_hajm,
    GREATEST((e.fakt_summa - d.f2_summa_malum), (0)::numeric) AS f2_mumkin_summa,
        CASE
            WHEN (d.f2_hajm <> (0)::numeric) THEN round((d.f2_summa_malum / d.f2_hajm), 2)
            ELSE NULL::numeric
        END AS f2_narx,
        CASE
            WHEN (e.fakt_hajm <> (0)::numeric) THEN round((e.fakt_summa / e.fakt_hajm), 2)
            ELSE NULL::numeric
        END AS fakt_narx,
        CASE
            WHEN ((d.f2_hajm <> (0)::numeric) AND (q.narx IS NOT NULL) AND (q.narx <> (0)::numeric)) THEN round(((((d.f2_summa_malum / d.f2_hajm) - q.narx) / q.narx) * (100)::numeric), 1)
            ELSE NULL::numeric
        END AS f2_narx_farq_foiz,
    q.ota_id,
    q.norma,
    d.direct_fakt_hajm,
    d.direct_fakt_summa,
    e.fakt_manbasi,
    d.f2_summa_nomalum,
    al.v AS almashtirilgan_hajm,
    als.s AS almashtirilgan_summa,
    q.versiya_holat,
    q.hajm AS asl_smeta_hajm,
    q.summa AS asl_smeta_summa,
    d.f2_summa_yoq,
        CASE
            WHEN (e.fakt_manbasi = 'BL_NORMA'::text) THEN
            CASE
                WHEN ((e.fakt_summa IS NULL) AND (COALESCE(e.fakt_hajm, (0)::numeric) <> (0)::numeric)) THEN (1)::bigint
                ELSE (0)::bigint
            END
            ELSE d.fakt_summa_nomalum
        END AS fakt_summa_nomalum
   FROM public.t2_qator q
     LEFT JOIN ( SELECT z.obyekt_id,
            z.id,
            public.t2_almashtirilgan_hajm(z.id) AS v
           FROM public.t2_qator z
          WHERE ((z.id IN ( SELECT zz.replaces_line_id
                   FROM public.t2_qator zz
                  WHERE (zz.replaces_line_id IS NOT NULL))) OR (z.ota_id IN ( SELECT zz.replaces_line_id
                   FROM public.t2_qator zz
                  WHERE (zz.replaces_line_id IS NOT NULL))))) zm ON (zm.id = q.id AND zm.obyekt_id = q.obyekt_id)
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN (zm.id IS NOT NULL) THEN zm.v
                    ELSE (0)::numeric
                END AS v) al
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN (((q.change_type = 'REPLACEMENT'::text) AND (q.replaces_line_id IS NOT NULL) AND (q.almashtirish_hajm IS NULL)) OR ((q.tur = ANY (ARRAY['rs'::text, 'mat'::text, 'ob'::text])) AND (q.ota_id IS NOT NULL) AND (EXISTS ( SELECT 1
                       FROM public.t2_qator zp
                      WHERE ((zp.id = q.ota_id) AND (zp.change_type = 'REPLACEMENT'::text) AND (zp.replaces_line_id IS NOT NULL) AND (zp.almashtirish_hajm IS NULL)))))) THEN public.t2_zamena_reja_hajm(q.id)
                    ELSE NULL::numeric
                END AS v OFFSET 0) zr
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN (COALESCE(al.v, (0)::numeric) = (0)::numeric) THEN (0)::numeric
                    WHEN ((q.narx IS NOT NULL) AND (NOT ((q.narx = (0)::numeric) AND (COALESCE(q.summa, (0)::numeric) <> (0)::numeric)))) THEN (al.v * q.narx)
                    WHEN ((q.hajm IS NOT NULL) AND (q.hajm <> (0)::numeric) AND (q.summa IS NOT NULL)) THEN ((al.v * q.summa) / q.hajm)
                    ELSE NULL::numeric
                END AS s) als
     LEFT JOIN ( SELECT aq.qator_id,
            sum(aq.hajm) FILTER (WHERE ((a.tur = 'fakt'::text) AND (a.holat <> 'bekor'::text))) AS direct_fakt_hajm,
            sum(aq.summa) FILTER (WHERE ((a.tur = 'fakt'::text) AND (a.holat <> 'bekor'::text))) AS direct_fakt_summa,
            sum(COALESCE(aq.certified_quantity, aq.hajm)) FILTER (WHERE ((a.tur = 'f2'::text) AND (a.holat = 'tasdiqlangan'::text))) AS f2_hajm,
            sum(COALESCE(aq.certified_amount, aq.summa)) FILTER (WHERE ((a.tur = 'f2'::text) AND (a.holat = 'tasdiqlangan'::text))) AS f2_summa_malum,
            count(*) FILTER (WHERE ((a.tur = 'f2'::text) AND (a.holat = 'tasdiqlangan'::text) AND (COALESCE(aq.certified_amount, aq.summa) IS NULL) AND (COALESCE(aq.certified_quantity, aq.hajm, (0)::numeric) <> (0)::numeric))) AS f2_summa_yoq,
            count(*) FILTER (WHERE ((a.tur = 'fakt'::text) AND (a.holat <> 'bekor'::text) AND (aq.summa IS NULL) AND (COALESCE(aq.hajm, (0)::numeric) <> (0)::numeric))) AS fakt_summa_nomalum
           FROM (public.t2_akt_qator aq
             LEFT JOIN public.t2_akt a ON ((a.id = aq.akt_id)))
          WHERE aq.qator_id IN (SELECT q2.id FROM public.t2_qator q2 WHERE q2.obyekt_id = ANY(p_obyekt_ids))
          GROUP BY aq.qator_id) dd ON (dd.qator_id = q.id)
     CROSS JOIN LATERAL ( SELECT COALESCE(dd.direct_fakt_hajm, (0)::numeric) AS direct_fakt_hajm,
            COALESCE(dd.direct_fakt_summa, (0)::numeric) AS direct_fakt_summa,
            COALESCE(dd.f2_hajm, (0)::numeric) AS f2_hajm,
            COALESCE(dd.f2_summa_malum, (0)::numeric) AS f2_summa_malum,
            COALESCE(dd.f2_summa_yoq, (0)::bigint) AS f2_summa_yoq,
            COALESCE(dd.fakt_summa_nomalum, (0)::bigint) AS fakt_summa_nomalum,
                CASE
                    WHEN ((q.tur <> ALL (ARRAY['rz'::text, 'bl'::text])) AND (COALESCE(q.nom, ''::text) !~* 'ЗАТРАТЫ\s+ТРУДА\s+МАШИНИСТ'::text)) THEN COALESCE(dd.f2_summa_yoq, (0)::bigint)
                    ELSE (0)::bigint
                END AS f2_summa_nomalum) d
     LEFT JOIN public.t2_qator bp ON (((q.tur = 'rs'::text) AND (q.norma IS NOT NULL) AND (bp.id = q.ota_id) AND (bp.obyekt_id = q.obyekt_id) AND (bp.tur = 'bl'::text)))
     LEFT JOIN ( SELECT paq.qator_id,
            count(*) AS n,
            sum(paq.hajm) FILTER (WHERE ((pa.tur = 'fakt'::text) AND (pa.holat <> 'bekor'::text))) AS fakt_hajm,
            sum(paq.hajm) FILTER (WHERE ((pa.tur = 'fakt'::text) AND (pa.holat <> 'bekor'::text) AND (paq.narx_manba = 'f2_sertifikat'::text))) AS f2s_hajm
           FROM (public.t2_akt_qator paq
             LEFT JOIN public.t2_akt pa ON ((pa.id = paq.akt_id)))
          WHERE paq.qator_id IN (SELECT q3.id FROM public.t2_qator q3 WHERE q3.obyekt_id = ANY(p_obyekt_ids))
          GROUP BY paq.qator_id) bla ON (bla.qator_id = bp.id)
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN (bp.id IS NULL) THEN (0)::bigint
                    ELSE GREATEST(COALESCE(bla.n, (0)::bigint), (1)::bigint)
                END AS bl_soni,
            COALESCE(bla.fakt_hajm, (0)::numeric) AS fakt_hajm,
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
                END AS fakt_summa,
                CASE
                    WHEN ((bl.bl_soni > 0) AND (d.direct_fakt_hajm = (0)::numeric)) THEN 'BL_NORMA'::text
                    ELSE 'DIRECT'::text
                END AS fakt_manbasi) e
   WHERE q.obyekt_id = ANY(p_obyekt_ids)
$fn$;
REVOKE ALL ON FUNCTION public._t2_qator_holat_v2(bigint[]) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._t2_qator_holat_v2(bigint[]) TO service_role;
COMMENT ON FUNCTION public._t2_qator_holat_v2(bigint[]) IS 't2_qator_holat bilan bir xil ustunlar va natija; faqat p_obyekt_ids qatorlari (tezlik_v1).';

DO $m$
DECLARE v text; v2 text;
BEGIN
  -- t2_mindmap_grafi: ort
  v := pg_get_functiondef('public.t2_mindmap_grafi(bigint)'::regprocedure);
  IF position('tezlik_v1' in v) = 0 THEN
    v2 := regexp_replace(v,
      'ort AS \(\s*SELECT r\.obyekt_id, count\(\*\)::integer AS n\s*FROM public\.t2_overbilling_radar r\s*WHERE r\.kompaniya_id = p_kompaniya_id\s*AND \(r\.f2_fakt_ortiqcha > 0 OR r\.f2_smeta_ortiqcha > 0\)\s*GROUP BY r\.obyekt_id\s*\)',
      'ort AS ( /* tezlik_v1 */
  SELECT r.obyekt_id, count(*)::integer AS n
    FROM (SELECT qh.obyekt_id,
                 (qh.f2_hajm - qh.fakt_hajm) AS f2_fakt_ortiqcha,
                 CASE WHEN qh.smeta_hajm >= 0 THEN qh.f2_hajm - qh.smeta_hajm END AS f2_smeta_ortiqcha
            FROM public._t2_qator_holat_v2(ARRAY(SELECT o0.id FROM public.t2_obyekt o0 WHERE o0.kompaniya_id = p_kompaniya_id)) qh
           WHERE COALESCE(qh.f2_hajm, 0) > COALESCE(qh.fakt_hajm, 0)
              OR (qh.smeta_hajm >= 0 AND COALESCE(qh.f2_hajm, 0) > qh.smeta_hajm)
              OR (qh.smeta_hajm >= 0 AND COALESCE(qh.fakt_hajm, 0) > qh.smeta_hajm)) r
   WHERE (r.f2_fakt_ortiqcha > 0 OR r.f2_smeta_ortiqcha > 0)
   GROUP BY r.obyekt_id
)');
    IF v2 = v THEN RAISE EXCEPTION 'TEZLIK_V1_ANCHOR_YOQ: t2_mindmap_grafi'; END IF;
    EXECUTE v2;
  END IF;

  -- _t2_summa_agg_v1: fakt o'lchovi
  v := pg_get_functiondef('public._t2_summa_agg_v1(bigint[],text,bigint[],date,date,text,text)'::regprocedure);
  IF position('_t2_qator_holat_v2' in v) = 0 THEN
    v2 := regexp_replace(v,
      'from public\.t2_qator_holat h\s+where p_olchov = ''fakt'' and h\.obyekt_id = any\(p_obyekt_ids\)',
      'from public._t2_qator_holat_v2(p_obyekt_ids) h
     where p_olchov = ''fakt''');
    IF v2 = v THEN RAISE EXCEPTION 'TEZLIK_V1_ANCHOR_YOQ: _t2_summa_agg_v1'; END IF;
    EXECUTE v2;
  END IF;
END $m$;