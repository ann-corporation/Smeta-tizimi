-- t2_hisob_yadro_v2 (2026-11-12): saqlangan jamlar yangilanadi; Nakopitelniy fakti ish darajasidagi faktni resurslarga ham beradi; agent smetasi barglardan.
-- Oldin: 20261212700000_t2_hisob_yadro_yagona_v1 (smeta jami = asl barg yig'indisi). Bu migratsiya YOZADI (1-band) — qo'llashdan oldin acceptance ni o'qing.
--
-- 1) Eskirgan bl/rz summalari (t2_rollup / qo'shimcha qatorlar kiritilgach yangilanmagan): faol qatorlar bo'yicha qayta yig'iladi.
--    Qoida t2_qator_ota_jami_yangila_v1 bilan bir xil, FAQAT narxli bargli bl lar (bolasiz bl tegilmaydi — o'z summasi saqlanadi, NULL qilinmaydi).
--    Idempotent: ikkinchi ishga tushishda 0 qator o'zgaradi. Vaqt chegarasi: statement_timeout 150 s (lokal).
-- 2) t2_nakopitelniy_v2: «fakt» t2_qator_holat (_t2_qator_holat_v2) dan — ish darajasida kiritilgan fakt resurslarga norma bo'yicha (BL_NORMA)
--    beriladi; jami fakt — faqat barglar. Avval faqat bevosita akt qatori olinardi: ish faktida resurslar 0 chiqib «FAKT JAMI 0» va yolg'on
--    «F2 fakt dan oshib ketgan» paydo bo'lardi.
-- 3) t2_agent_fakt_v1: smeta_jami_som — asl barglar yig'indisi (rz.summa emas).
-- Rollback: .rollback.sql (2-3 ta'riflar matni qaytadi; 1-band ma'lumoti qaytarilmaydi — eski qiymatlar eskirgan edi, qayta hisoblash t2_rollup bilan).

-- 1) Ma'lumotni yangilash.
DO $r$
DECLARE o record; n_bl integer := 0; n_rz integer := 0; k integer;
BEGIN
  PERFORM set_config('statement_timeout', '150s', true);
  PERFORM public.t2_manba_belgila('rollup');
  FOR o IN SELECT DISTINCT q.obyekt_id FROM public.t2_qator q WHERE q.tur = 'rz' AND q.versiya_holat = 'faol' LOOP
    -- bl: narxli (yoki narxsiz) rs/mat/ob bolalari bor bl = Σ faol bolalar.
    UPDATE public.t2_qator b SET summa = x.jami, yangilandi = now()
      FROM (SELECT c.ota_id AS id, sum(c.summa) AS jami
              FROM public.t2_qator c
             WHERE c.obyekt_id = o.obyekt_id AND c.versiya_holat = 'faol' AND c.tur IN ('rs', 'mat', 'ob') AND c.ota_id IS NOT NULL
             GROUP BY c.ota_id) x
     WHERE b.id = x.id AND b.tur = 'bl' AND b.versiya_holat = 'faol' AND b.summa IS DISTINCT FROM x.jami;
    GET DIAGNOSTICS k = ROW_COUNT; n_bl := n_bl + k;
    -- rz: Σ o'z faol bolalari (bl/mat/ob/rs); ichki rz kirmaydi; bolasi yo'q rz tegilmaydi.
    UPDATE public.t2_qator r SET summa = x.jami, yangilandi = now()
      FROM (SELECT c.ota_id AS id, sum(c.summa) AS jami
              FROM public.t2_qator c
             WHERE c.obyekt_id = o.obyekt_id AND c.versiya_holat = 'faol' AND c.tur IN ('bl', 'mat', 'ob', 'rs') AND c.ota_id IS NOT NULL
             GROUP BY c.ota_id) x
     WHERE r.id = x.id AND r.tur = 'rz' AND r.versiya_holat = 'faol' AND r.summa IS DISTINCT FROM x.jami;
    GET DIAGNOSTICS k = ROW_COUNT; n_rz := n_rz + k;
  END LOOP;
  RAISE NOTICE 'hisob_yadro_v2: yangilangan bl=%, rz=%', n_bl, n_rz;
END
$r$;

-- 2) + 3) Funksiya matnlarini almashtirish (langar topilmasa — xato, jim o'tmaydi).
DO $f$
DECLARE v text; v2 text; ls text;
BEGIN
  -- t2_nakopitelniy_v2
  v := pg_get_functiondef('public.t2_nakopitelniy_v2(bigint,bigint,date,integer,boolean,integer)'::regprocedure);
  IF position('hisob_yadro_v2' in v) = 0 THEN
    v2 := v;
    ls := '''fakt_hajm'', coalesce(p.fakt_hajm,0), ''fakt_summa'', coalesce(p.fakt_summa,0),';
    IF position(ls in v2) = 0 THEN RAISE EXCEPTION 'HISOB_YADRO_V2_ANCHOR_YOQ: nakopitelniy fakt'; END IF;
    v2 := replace(v2, ls, '/* hisob_yadro_v2 */ ''fakt_hajm'', coalesce(fh.fakt_hajm,0), ''fakt_summa'', coalesce(fh.fakt_summa,0),');
    ls := '''f2_mumkin_hajm'', coalesce(p.fakt_hajm,0) - (';
    IF position(ls in v2) = 0 THEN RAISE EXCEPTION 'HISOB_YADRO_V2_ANCHOR_YOQ: nakopitelniy f2_mumkin'; END IF;
    v2 := replace(v2, ls, '''f2_mumkin_hajm'', coalesce(fh.fakt_hajm,0) - (');
    v2 := replace(v2, 'coalesce(p.fakt_hajm,0) <> 0', 'coalesce(fh.fakt_hajm,0) <> 0');
    IF v2 !~ '\)\s+p on true' THEN RAISE EXCEPTION 'HISOB_YADRO_V2_ANCHOR_YOQ: nakopitelniy join'; END IF;
    v2 := regexp_replace(v2, '(\)\s+p on true)',
      '\1 left join (select h.qator_id, h.fakt_hajm, h.fakt_summa from public._t2_qator_holat_v2(array[p_obyekt_id]) h) fh on fh.qator_id = q.id');
    ls := 'coalesce(sum(x.fakt_summa),0) as fakt_summa,';
    IF position(ls in v2) = 0 THEN RAISE EXCEPTION 'HISOB_YADRO_V2_ANCHOR_YOQ: nakopitelniy jami'; END IF;
    v2 := replace(v2, ls, 'coalesce((select sum(h.fakt_summa) from public._t2_qator_holat_v2(array[p_obyekt_id]) h where not exists (select 1 from public.t2_qator c where c.ota_id = h.qator_id)),0) as fakt_summa,');
    EXECUTE v2;
  END IF;

  -- t2_agent_fakt_v1
  v := pg_get_functiondef('public.t2_agent_fakt_v1(bigint,bigint,text[],bigint)'::regprocedure);
  IF position('hisob_yadro_v2' in v) = 0 THEN
    ls := 'sum(q.summa) filter (where q.tur = ''rz'') smeta_rz,';
    IF position(ls in v) = 0 THEN RAISE EXCEPTION 'HISOB_YADRO_V2_ANCHOR_YOQ: agent_fakt'; END IF;
    EXECUTE replace(v, ls, 'sum(q.summa) filter (where public.t2_qator_asl_v1(q.change_type, q.qoshimcha, q.zamena) and not exists (select 1 from t2_qator c where c.ota_id = q.id)) /* hisob_yadro_v2 */ smeta_rz,');
  END IF;
END
$f$;
