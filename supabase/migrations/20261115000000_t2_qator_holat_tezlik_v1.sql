-- t2_qator_holat tezligi (natija o'zgarmaydi):
-- 1) replaces_line_id EXISTS tekshiruvlari qisman indeksni ishlatadi (avval har o'qishda butun t2_qator 8 marta to'liq skan qilinardi).
-- 2) almashtirilgan summa ifodasi view ichida bir marta hisoblanadi (t2_almashtirilgan_summa_hisob bilan aynan bir xil formula;
--    SET search_path tufayli funksiya inline bo'lmas va har qatorda 2 marta chaqirilardi).
CREATE OR REPLACE VIEW public.t2_qator_holat AS
 SELECT q.id,
    q.id AS qator_id,
    q.obyekt_id,
    q.tur,
    q.raqam,
    q.kod,
    q.nom,
    q.birlik,
    q.kat,
    CASE WHEN q.versiya_holat = 'almashtirilgan'::text THEN (0)::numeric ELSE q.hajm END AS smeta_hajm,
    q.narx AS smeta_narx,
    CASE WHEN q.versiya_holat = 'almashtirilgan'::text THEN (0)::numeric ELSE q.summa END AS smeta_summa,
    e.fakt_hajm,
    e.fakt_summa,
    d.f2_hajm,
    d.f2_summa_malum AS f2_summa,
    CASE WHEN q.versiya_holat = 'almashtirilgan'::text THEN (0)::numeric ELSE ((q.hajm - d.f2_hajm) - al.v) END AS qoldiq_hajm,
    CASE WHEN q.versiya_holat = 'almashtirilgan'::text THEN (0)::numeric ELSE ((q.summa - d.f2_summa_malum) - COALESCE(als.s, (0)::numeric)) END AS qoldiq_summa,
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
    q.summa AS asl_smeta_summa
   FROM (((((t2_qator q
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN ((EXISTS ( SELECT 1
                       FROM t2_qator zz
                      WHERE ((zz.replaces_line_id = q.id) AND (zz.replaces_line_id IS NOT NULL)))) OR (EXISTS ( SELECT 1
                       FROM t2_qator zz
                      WHERE ((zz.replaces_line_id = q.ota_id) AND (zz.replaces_line_id IS NOT NULL))))) THEN t2_almashtirilgan_hajm(q.id)
                    ELSE (0)::numeric
                END AS v) al)
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN (COALESCE(al.v, (0)::numeric) = (0)::numeric) THEN (0)::numeric
                    WHEN (q.narx IS NOT NULL) THEN (al.v * q.narx)
                    WHEN ((q.hajm IS NOT NULL) AND (q.hajm <> (0)::numeric) AND (q.summa IS NOT NULL)) THEN ((al.v * q.summa) / q.hajm)
                    ELSE NULL::numeric
                END AS s) als)
     LEFT JOIN LATERAL ( SELECT COALESCE(sum(aq.hajm) FILTER (WHERE ((a.tur = 'fakt'::text) AND (a.holat <> 'bekor'::text))), (0)::numeric) AS direct_fakt_hajm,
            COALESCE(sum(aq.summa) FILTER (WHERE ((a.tur = 'fakt'::text) AND (a.holat <> 'bekor'::text))), (0)::numeric) AS direct_fakt_summa,
            COALESCE(sum(COALESCE(aq.certified_quantity, aq.hajm)) FILTER (WHERE ((a.tur = 'f2'::text) AND (a.holat = 'tasdiqlangan'::text))), (0)::numeric) AS f2_hajm,
            COALESCE(sum(COALESCE(aq.certified_amount, aq.summa)) FILTER (WHERE ((a.tur = 'f2'::text) AND (a.holat = 'tasdiqlangan'::text))), (0)::numeric) AS f2_summa_malum,
            count(*) FILTER (WHERE ((a.tur = 'f2'::text) AND (a.holat = 'tasdiqlangan'::text) AND (q.tur <> ALL (ARRAY['rz'::text, 'bl'::text])) AND (COALESCE(q.nom, ''::text) !~* 'ЗАТРАТЫ\s+ТРУДА\s+МАШИНИСТ'::text) AND (COALESCE(aq.certified_amount, aq.summa) IS NULL) AND (COALESCE(aq.certified_quantity, aq.hajm, (0)::numeric) <> (0)::numeric))) AS f2_summa_nomalum
           FROM (t2_akt_qator aq
             LEFT JOIN t2_akt a ON ((a.id = aq.akt_id)))
          WHERE (aq.qator_id = q.id)) d ON (true))
     LEFT JOIN LATERAL ( SELECT count(p.id) AS bl_soni,
            COALESCE(sum(paq.hajm) FILTER (WHERE ((pa.tur = 'fakt'::text) AND (pa.holat <> 'bekor'::text))), (0)::numeric) AS fakt_hajm,
            COALESCE(sum(paq.hajm) FILTER (WHERE ((pa.tur = 'fakt'::text) AND (pa.holat <> 'bekor'::text) AND (paq.narx_manba = 'f2_sertifikat'::text))), (0)::numeric) AS f2s_hajm
           FROM ((t2_qator p
             LEFT JOIN t2_akt_qator paq ON ((paq.qator_id = p.id)))
             LEFT JOIN t2_akt pa ON ((pa.id = paq.akt_id)))
          WHERE ((q.tur = 'rs'::text) AND (q.norma IS NOT NULL) AND (p.id = q.ota_id) AND (p.obyekt_id = q.obyekt_id) AND (p.tur = 'bl'::text))) bl ON (true))
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
                END AS fakt_manbasi) e);

ANALYZE public.t2_qator;
