-- t2_hisob_yadro_yagona_v1 (2026-11-11): «smeta jami» YAGONA manba — asl smeta BARGLARI yig'indisi.
--
-- Sabab (sayt auditi 2026-11-11, band 1/21/37): bir xil obyektning smetasi sahifalarda har xil chiqardi (6 xil qiymat).
-- Ildiz: `t2_obyekt_jami.jami` (dashboard, obyektlar, loyiha, f2-reestr, boss) va `t2_mindmap_grafi.smeta` bo'lim (rz) qatorlarining
-- SAQLANGAN summasini (t2_rollup) yig'adi. Ba'zi bo'limlarda saqlangan yig'indi barglar yig'indisidan eskirgan (26 obyektda farq bor), ustiga
-- jami = ОЈ rz.summa − ОЈ qo'shimcha/zamena ni ayiradi (rollup ga kirmagan zamena ham ayiriladi — ikki marta ayirish).
-- Server summa paketi (`_t2_summa_agg_v1`, 'smeta' o'lchovi — rahbar paneli, o'zgarishlar qatlami, nakrutka) esa BARGLARni yig'adi.
-- Bu migratsiya shu ikki o'qishni aynan paket qoidasiga keltiradi: smeta = asl (t2_qator_asl_v1) BARG (ota emas) qatorlar summasi.
-- Tekshiruv (prodda, migratsiyadan oldin): barcha faol obyektlarda ОЈ barg-asl = ОЈ paket.ustamasiz (0 ta farqli obyekt).
--
-- O'ZGARADI: faqat «smeta jami» o'qishi: public.t2_obyekt_jami.jami, public.t2_mindmap_grafi (smeta), public.t2_ai_umumiy (smeta).
-- O'ZGARMAYDI: ustunlar va tartib, chel/mash/mat/ob, F2 / fakt / nakopitelniy, qatorlar ma'lumoti (yozuv yo'q).
-- Rollback: .rollback.sql. Qabul: .acceptance.sql (faqat o'qish).

-- 1) t2_obyekt_jami: jami = asl barglar yig'indisi (NULL — hech bir asl bargda summa yo'q; 0 emas).
CREATE OR REPLACE VIEW public.t2_obyekt_jami AS
 SELECT o.id,
    o.nom,
    o.tur,
    COALESCE(a.qator_soni, 0::bigint) AS qator_soni,
    COALESCE(a.razdel, 0::bigint) AS razdel,
    COALESCE(a.ish, 0::bigint) AS ish,
    COALESCE(a.resurs, 0::bigint) AS resurs,
    a.barg_asl AS jami,
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
            sum(q.summa) FILTER (WHERE ch.ota_id IS NULL AND public.t2_qator_asl_v1(q.change_type, q.qoshimcha, q.zamena)) AS barg_asl,
            count(DISTINCT ROW(upper(btrim(COALESCE(q.nom, ''::text))), COALESCE(q.birlik, ''::text))) FILTER (WHERE (q.tur = ANY (ARRAY['rs'::text, 'mat'::text, 'ob'::text])) AND q.narx IS NULL AND COALESCE(q.nom, ''::text) !~* 'ЗАТРАТЫ\s+ТРУДА\s+МАШИНИСТ'::text) AS narxsiz,
            sum(q.summa) FILTER (WHERE (q.tur = ANY (ARRAY['rs'::text, 'mat'::text, 'ob'::text])) AND q.kat = 'ЧЕЛ'::text AND public.t2_qator_asl_v1(q.change_type, q.qoshimcha, q.zamena)) AS chel,
            sum(q.summa) FILTER (WHERE (q.tur = ANY (ARRAY['rs'::text, 'mat'::text, 'ob'::text])) AND q.kat = 'МАШ'::text AND public.t2_qator_asl_v1(q.change_type, q.qoshimcha, q.zamena)) AS mash,
            sum(q.summa) FILTER (WHERE (q.tur = ANY (ARRAY['rs'::text, 'mat'::text, 'ob'::text])) AND q.kat = 'МАТ'::text AND public.t2_qator_asl_v1(q.change_type, q.qoshimcha, q.zamena)) AS mat,
            sum(q.summa) FILTER (WHERE (q.tur = ANY (ARRAY['rs'::text, 'mat'::text, 'ob'::text])) AND q.kat = 'ОБ'::text AND public.t2_qator_asl_v1(q.change_type, q.qoshimcha, q.zamena)) AS ob
           FROM t2_qator q
             LEFT JOIN ( SELECT DISTINCT c.ota_id FROM t2_qator c WHERE c.obyekt_id = o.id AND c.ota_id IS NOT NULL) ch ON ch.ota_id = q.id
          WHERE q.obyekt_id = o.id AND q.versiya_holat = 'faol'::text) a ON true
  WHERE o.holat <> 'bekor'::text;

-- 2a) t2_mindmap_grafi va t2_ai_umumiy: smeta = shu qoida (matn bo'yicha almashtirish; langar topilmasa — xato, jim o'tmaydi).
DO $m$
DECLARE
  v text; v2 text;
  yangi constant text := '(SELECT sum(q.summa) FROM t2_qator q WHERE q.versiya_holat = ''faol'' AND q.obyekt_id = o.id /* hisob_yadro_v1 */ AND public.t2_qator_asl_v1(q.change_type, q.qoshimcha, q.zamena) AND NOT EXISTS (SELECT 1 FROM t2_qator c WHERE c.ota_id = q.id))';
BEGIN
  v := pg_get_functiondef('public.t2_mindmap_grafi(bigint)'::regprocedure);
  IF position('hisob_yadro_v1' in v) = 0 THEN
    v2 := regexp_replace(v,
      '\(SELECT sum\(q\.summa\) FROM t2_qator q\s+WHERE q\.versiya_holat = ''faol'' AND q\.obyekt_id = o\.id AND q\.tur = ''rz''\)(\s+AS smeta,)',
      replace(replace(yangi, '\', '\\'), '&', '\&') || '\1');
    IF v2 = v THEN RAISE EXCEPTION 'HISOB_YADRO_V1_ANCHOR_YOQ: t2_mindmap_grafi'; END IF;
    EXECUTE v2;
  END IF;

  v := pg_get_functiondef('public.t2_ai_umumiy(bigint)'::regprocedure);
  IF position('hisob_yadro_v1' in v) = 0 THEN
    v2 := regexp_replace(v,
      '\(select sum\(q\.summa\) from t2_qator q where q\.versiya_holat=''faol'' and q\.obyekt_id=o\.id and q\.tur=''rz''\)(\s+smeta,)',
      replace(replace(yangi, '\', '\\'), '&', '\&') || '\1');
    IF v2 = v THEN RAISE EXCEPTION 'HISOB_YADRO_V1_ANCHOR_YOQ: t2_ai_umumiy'; END IF;
    EXECUTE v2;
  END IF;
END
$m$;

-- 3) t2_bux_dashboard (/moliya «Bajarilgan (F2) / To'langan / Qarzdorlik»): bajarilgan = TASDIQLANGAN F2 (rahbar paneli va nakopitelniy
--    bilan bir xil ta'rif; qoralama kirmaydi) va faqat FAOL shartnoma–obyekt bog'lanishi. Ustunlar va tartib o'zgarmaydi.
CREATE OR REPLACE VIEW public.t2_bux_dashboard AS
 WITH baj AS (
         SELECT bog.shartnoma_id,
            sum(a.hujjat_jami) AS bajarilgan
           FROM t2_shartnoma_bog bog
             JOIN t2_akt a ON a.obyekt_id = bog.obyekt_id
          WHERE a.tur = 'f2'::text AND a.holat = 'tasdiqlangan'::text AND bog.holat = 'faol'::text
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

-- 4) t2_workbench_v1 (/hujjat-nazorat): `contractId` hech qachon berilmasdi — sahifa obyekt shartnomaga bog'langan bo'lsa ham
--    «Shartnoma: qayd etilmagan» ko'rsatardi. Endi obyektning faol (asosiy afzal) shartnomasi beriladi; bog'lanish yo'q — kalit yo'q.
DO $w$
DECLARE v text; v2 text;
  eski constant text := '''forma3_unresolved'', v_yakun->''forma3_unresolved'');';
  yangi constant text := '''forma3_unresolved'', v_yakun->''forma3_unresolved'',
    /* hisob_yadro_v1 */ ''contractId'', (select b.shartnoma_id::text from public.t2_shartnoma_bog b join public.t2_shartnoma s on s.id = b.shartnoma_id
                                       where b.obyekt_id = p_obyekt_id and b.holat = ''faol'' and s.holat <> ''bekor''
                                       order by s.asosiy desc nulls last, s.id limit 1));';
BEGIN
  v := pg_get_functiondef('public.t2_workbench_v1(bigint,bigint,date,integer)'::regprocedure);
  IF position('hisob_yadro_v1' in v) = 0 THEN
    IF position(eski in v) = 0 THEN RAISE EXCEPTION 'HISOB_YADRO_V1_ANCHOR_YOQ: t2_workbench_v1'; END IF;
    EXECUTE replace(v, eski, yangi);
  END IF;
END
$w$;