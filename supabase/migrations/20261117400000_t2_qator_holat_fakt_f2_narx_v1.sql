-- T2_QATOR_HOLAT_FAKT_F2_NARX v1 (egasi PR #211 qoidasi, SERVER tomoni): tasdiqlangan F2 bor qatorda fakt SUMMASI F2 birlik narxida.
--   fakt_summa = _t2_f2_narxda_v1(fakt_hajm, f2_hajm, f2_summa) = yaxlit2((H*K)/J)  (f2_hajm <> 0 va F2 summasi MALUM, ya'ni f2_summa_yoq = 0 bo'lganda;
--   TS: hisob-yadro/korinish.ts faktSummaF2Narxda, Excel bilan bir xil tartib (H*K)/J, keyin ROUND 2).
--   F2 summasi NOMALUM (NULL <> 0): tasdiqlangan F2 qatorlarida hajm bor-u COALESCE(certified_amount, summa) NULL (BL/RZ ham; svod bo'limlarda F2 summasi
--   qatorda yozilmaydi) - narx tuqilmaydi, fakt_summa avvalgidek (0 ga tushmaydi). Boshqa hollarda (F2 yo'q, fakt NULL) fakt_summa avvalgidek; NULL NULL bo'lib qoladi. MAX(fakt,F2) YO'Q.
--   Mavjud 34 ustun va tartibi prod ta'rifi bilan AYNAN; yangi f2_summa_yoq (bigint) OXIRIGA qo'shildi (17 ta bog'liq view buzilmaydi).
--   f2_summa / f2_summa_nomalum / f2 o'lchovi O'ZGARMADI. f2_mumkin_summa / fakt_narx hisobi o'zgarmadi (xom fakt summasi).

-- TS yaxlit2 bilan AYNAN: (H*K)/J float8 da, so'ng 15 muhim raqamga (float8 -> numeric), ROUND 2 yarmi noldan uzoqqa.
-- Sof numeric round() F2 summasi float shovqinli qatorlarda (x.xx4999999999995) 1 tiyin farq berardi (real 3 obyektda ~0.5% qator).
create or replace function public._t2_f2_narxda_v1(p_fakt numeric, p_f2_hajm numeric, p_f2_summa numeric)
 returns numeric
 language sql
 immutable parallel safe
 set search_path to 'public', 'pg_temp'
as $function$
  select sign(t.x)::numeric * (round((abs(t.x) * 100)::numeric) / 100)
    from (select (p_fakt::float8 * p_f2_summa::float8) / p_f2_hajm::float8 as x) t
$function$;
create or replace view public.t2_qator_holat as
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
            WHEN q.versiya_holat = 'almashtirilgan'::text THEN 0::numeric
            ELSE q.hajm
        END AS smeta_hajm,
    q.narx AS smeta_narx,
        CASE
            WHEN q.versiya_holat = 'almashtirilgan'::text THEN 0::numeric
            ELSE q.summa
        END AS smeta_summa,
    e.fakt_hajm,
    CASE
            WHEN d.f2_hajm <> 0::numeric AND d.f2_summa_yoq = 0 AND e.fakt_hajm IS NOT NULL AND e.fakt_summa IS NOT NULL THEN public._t2_f2_narxda_v1(e.fakt_hajm, d.f2_hajm, d.f2_summa_malum)
            ELSE e.fakt_summa
        END AS fakt_summa,
    d.f2_hajm,
    d.f2_summa_malum AS f2_summa,
        CASE
            WHEN q.versiya_holat = 'almashtirilgan'::text THEN 0::numeric
            ELSE q.hajm - d.f2_hajm - al.v
        END AS qoldiq_hajm,
        CASE
            WHEN q.versiya_holat = 'almashtirilgan'::text THEN 0::numeric
            ELSE q.summa - d.f2_summa_malum - COALESCE(als.s, 0::numeric)
        END AS qoldiq_summa,
    GREATEST(e.fakt_hajm - d.f2_hajm, 0::numeric) AS f2_mumkin_hajm,
    GREATEST(e.fakt_summa - d.f2_summa_malum, 0::numeric) AS f2_mumkin_summa,
        CASE
            WHEN d.f2_hajm <> 0::numeric THEN round(d.f2_summa_malum / d.f2_hajm, 2)
            ELSE NULL::numeric
        END AS f2_narx,
        CASE
            WHEN e.fakt_hajm <> 0::numeric THEN round(e.fakt_summa / e.fakt_hajm, 2)
            ELSE NULL::numeric
        END AS fakt_narx,
        CASE
            WHEN d.f2_hajm <> 0::numeric AND q.narx IS NOT NULL AND q.narx <> 0::numeric THEN round((d.f2_summa_malum / d.f2_hajm - q.narx) / q.narx * 100::numeric, 1)
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
    d.f2_summa_yoq
   FROM t2_qator q
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN (EXISTS ( SELECT 1
                       FROM t2_qator zz
                      WHERE zz.replaces_line_id = q.id AND zz.replaces_line_id IS NOT NULL)) OR (EXISTS ( SELECT 1
                       FROM t2_qator zz
                      WHERE zz.replaces_line_id = q.ota_id AND zz.replaces_line_id IS NOT NULL)) THEN t2_almashtirilgan_hajm(q.id)
                    ELSE 0::numeric
                END AS v) al
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN COALESCE(al.v, 0::numeric) = 0::numeric THEN 0::numeric
                    WHEN q.narx IS NOT NULL THEN al.v * q.narx
                    WHEN q.hajm IS NOT NULL AND q.hajm <> 0::numeric AND q.summa IS NOT NULL THEN al.v * q.summa / q.hajm
                    ELSE NULL::numeric
                END AS s) als
     LEFT JOIN LATERAL ( SELECT COALESCE(sum(aq.hajm) FILTER (WHERE a.tur = 'fakt'::text AND a.holat <> 'bekor'::text), 0::numeric) AS direct_fakt_hajm,
            COALESCE(sum(aq.summa) FILTER (WHERE a.tur = 'fakt'::text AND a.holat <> 'bekor'::text), 0::numeric) AS direct_fakt_summa,
            COALESCE(sum(COALESCE(aq.certified_quantity, aq.hajm)) FILTER (WHERE a.tur = 'f2'::text AND a.holat = 'tasdiqlangan'::text), 0::numeric) AS f2_hajm,
            COALESCE(sum(COALESCE(aq.certified_amount, aq.summa)) FILTER (WHERE a.tur = 'f2'::text AND a.holat = 'tasdiqlangan'::text), 0::numeric) AS f2_summa_malum,
            count(*) FILTER (WHERE a.tur = 'f2'::text AND a.holat = 'tasdiqlangan'::text AND (q.tur <> ALL (ARRAY['rz'::text, 'bl'::text])) AND COALESCE(q.nom, ''::text) !~* 'ЗАТРАТЫ\s+ТРУДА\s+МАШИНИСТ'::text AND COALESCE(aq.certified_amount, aq.summa) IS NULL AND COALESCE(aq.certified_quantity, aq.hajm, 0::numeric) <> 0::numeric) AS f2_summa_nomalum,
            count(*) FILTER (WHERE a.tur = 'f2'::text AND a.holat = 'tasdiqlangan'::text AND COALESCE(aq.certified_amount, aq.summa) IS NULL AND COALESCE(aq.certified_quantity, aq.hajm, 0::numeric) <> 0::numeric) AS f2_summa_yoq
           FROM t2_akt_qator aq
             LEFT JOIN t2_akt a ON a.id = aq.akt_id
          WHERE aq.qator_id = q.id) d ON true
     LEFT JOIN LATERAL ( SELECT count(p.id) AS bl_soni,
            COALESCE(sum(paq.hajm) FILTER (WHERE pa.tur = 'fakt'::text AND pa.holat <> 'bekor'::text), 0::numeric) AS fakt_hajm,
            COALESCE(sum(paq.hajm) FILTER (WHERE pa.tur = 'fakt'::text AND pa.holat <> 'bekor'::text AND paq.narx_manba = 'f2_sertifikat'::text), 0::numeric) AS f2s_hajm
           FROM t2_qator p
             LEFT JOIN t2_akt_qator paq ON paq.qator_id = p.id
             LEFT JOIN t2_akt pa ON pa.id = paq.akt_id
          WHERE q.tur = 'rs'::text AND q.norma IS NOT NULL AND p.id = q.ota_id AND p.obyekt_id = q.obyekt_id AND p.tur = 'bl'::text) bl ON true
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN bl.bl_soni > 0 AND d.direct_fakt_hajm = 0::numeric THEN (bl.fakt_hajm - bl.f2s_hajm) * q.norma
                    ELSE d.direct_fakt_hajm
                END AS fakt_hajm,
                CASE
                    WHEN bl.bl_soni > 0 AND d.direct_fakt_hajm = 0::numeric THEN
                    CASE
                        WHEN q.narx IS NULL THEN NULL::numeric
                        ELSE (bl.fakt_hajm - bl.f2s_hajm) * q.norma * q.narx
                    END
                    ELSE d.direct_fakt_summa
                END AS fakt_summa,
                CASE
                    WHEN bl.bl_soni > 0 AND d.direct_fakt_hajm = 0::numeric THEN 'BL_NORMA'::text
                    ELSE 'DIRECT'::text
                END AS fakt_manbasi) e;
