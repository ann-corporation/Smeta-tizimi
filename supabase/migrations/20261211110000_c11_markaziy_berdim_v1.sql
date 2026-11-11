-- C11 BERDIM: markaziy ombordan obyektga berish (transfer).
-- Additive. Source only: AVVAL prodda (acceptance BEGIN..ROLLBACK bilan), KEYIN PR merge (egasi qoidasi).
--
-- Muammo: markaziy omborda c11 kirim bor (t2_sklad_harakat, obyekt_id NULL, narxsiz), obyekt qoldig'i
-- t2_sklad_qoldiq esa bo'sh -> M-29 (t2_m29_bajar_v1, faqat t2_sklad_qoldiq dan yechadi) doim QOLDIQ_YETMAYDI.
-- Yechim: BERDIM = bitta tranzaksiyada (a) markaziy rasxod qatori (manba c11_warehouse_berdim_v1, c11_sklad_id) va
-- (b) obyekt prixodi MAVJUD t2_skladga_yozish yo'li bilan (t2_sklad_qoldiq + t2_sklad_harakat). Logika takrorlanmaydi.
-- Takroriy hisob yo'q: obyekt tomoni manba 'c11_berdim_obyekt_v1' (buyurtma_qabul_v1 dan alohida), markaziy tomon
-- t2_sklad_ombor_qoldiq_v1 ga faqat rasxod sifatida kiradi; obyekt tomoni c11_sklad_id=NULL, shuning uchun
-- markaziy ko'rinishga prixod bo'lib tushmaydi.
-- Pul: narx umuman yo'q (NULL = noma'lum, 0 emas).

DO $pre$
BEGIN
  IF to_regclass('public.t2_sklad_harakat') IS NULL OR to_regclass('public.t2_sklad_ombor_qoldiq_v1') IS NULL
     OR to_regclass('public.t2_obyekt') IS NULL
     OR to_regprocedure('public.t2_skladga_yozish(bigint,text,bigint,text,date,text,text,numeric,text,text,text,text,uuid,text,text)') IS NULL
     OR to_regprocedure('public.t2_actor_kompaniya_azo_tekshir(bigint,bigint)') IS NULL
     OR to_regprocedure('public.t2_require_permission_v2(bigint,bigint,text)') IS NULL
     OR to_regprocedure('public.t2_sklad_c11_qidiruv_kaliti_v1(text)') IS NULL THEN
    RAISE EXCEPTION 'C11 BERDIM prerequisites missing; reconcile schema before applying';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='t2_sklad_harakat'
              AND column_name IN ('c11_hedef_obyekt_id','c11_juft_id')) THEN
    RAISE EXCEPTION 'C11 BERDIM columns already exist; review partial migration';
  END IF;
END
$pre$;

ALTER TABLE public.t2_sklad_harakat
  ADD COLUMN c11_hedef_obyekt_id bigint,
  ADD COLUMN c11_juft_id bigint;

ALTER TABLE public.t2_sklad_harakat
  ADD CONSTRAINT t2_sklad_harakat_c11_hedef_obyekt_fk
    FOREIGN KEY (c11_hedef_obyekt_id) REFERENCES public.t2_obyekt (id) ON DELETE RESTRICT NOT VALID,
  ADD CONSTRAINT t2_sklad_harakat_c11_juft_fk
    FOREIGN KEY (c11_juft_id) REFERENCES public.t2_sklad_harakat (id) ON DELETE RESTRICT NOT VALID,
  ADD CONSTRAINT t2_sklad_harakat_c11_berdim_shape
    CHECK (
      manba IS DISTINCT FROM 'c11_warehouse_berdim_v1'
      OR (operatsiya = 'rasxod'
          AND obyekt_id IS NULL
          AND c11_sklad_id IS NOT NULL
          AND c11_hedef_obyekt_id IS NOT NULL
          AND c11_juft_id IS NOT NULL
          AND c11_operation_id IS NOT NULL
          AND c11_request_hash IS NOT NULL
          AND c11_actor_id IS NOT NULL)
    ) NOT VALID;

ALTER TABLE public.t2_sklad_harakat
  VALIDATE CONSTRAINT t2_sklad_harakat_c11_hedef_obyekt_fk,
  VALIDATE CONSTRAINT t2_sklad_harakat_c11_juft_fk,
  VALIDATE CONSTRAINT t2_sklad_harakat_c11_berdim_shape;

-- Bir BERDIM = bir markaziy qator (tenant + operatsiya); qayta chaqirish ikkinchi qator yaratmaydi.
CREATE UNIQUE INDEX t2_sklad_harakat_c11_berdim_op_uq
  ON public.t2_sklad_harakat (kompaniya_id, c11_operation_id)
  WHERE manba = 'c11_warehouse_berdim_v1';
CREATE UNIQUE INDEX t2_sklad_harakat_c11_berdim_juft_uq
  ON public.t2_sklad_harakat (c11_juft_id)
  WHERE manba = 'c11_warehouse_berdim_v1';

-- Markaziy qoldiq = kirim - storno - berdim. Ustunlar o'zgarmaydi (CREATE OR REPLACE ruxsat), faqat manba ro'yxati kengayadi.
-- Append-only trigger (t2_sklad_c11_append_only_guard_v1) c11_sklad_id IS NOT NULL qatorlarni allaqachon himoyalaydi.
CREATE OR REPLACE VIEW public.t2_sklad_ombor_qoldiq_v1
  WITH (security_invoker = true)
AS
SELECT h.kompaniya_id,
       h.c11_sklad_id AS sklad_id,
       s.nomi AS sklad_nomi,
       h.nomi AS material_nomi,
       h.birligi,
       sum(CASE WHEN h.operatsiya = 'prixod' THEN h.obyomi
                WHEN h.operatsiya = 'rasxod' THEN -h.obyomi
                ELSE 0::numeric END) AS qoldiq
  FROM public.t2_sklad_harakat AS h
  JOIN public.t2_sklad_mustaqil AS s
    ON s.id = h.c11_sklad_id AND s.kompaniya_id = h.kompaniya_id
 WHERE h.c11_sklad_id IS NOT NULL
   AND h.holat = 'faol'
   AND h.manba IN ('c11_warehouse_receipt_v1','c11_warehouse_storno_v1','c11_warehouse_berdim_v1')
 GROUP BY h.kompaniya_id, h.c11_sklad_id, s.nomi, h.nomi, h.birligi;

REVOKE ALL ON public.t2_sklad_ombor_qoldiq_v1 FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.t2_sklad_ombor_qoldiq_v1 TO service_role;

-- ───────────── Yozish: BERDIM ─────────────
CREATE OR REPLACE FUNCTION public.t2_sklad_markaziy_berdim_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_sklad_id bigint, p_obyekt_id bigint,
  p_nomi text, p_birligi text, p_miqdor numeric, p_sana date, p_qabul_qiluvchi text,
  p_izoh text, p_operation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_nomi text := nullif(pg_catalog.btrim(coalesce(p_nomi,'')),'');
  v_birligi text := nullif(pg_catalog.btrim(coalesce(p_birligi,'')),'');
  v_qabul text := nullif(pg_catalog.btrim(coalesce(p_qabul_qiluvchi,'')),'');
  v_izoh text := nullif(pg_catalog.btrim(coalesce(p_izoh,'')),'');
  v_sana date := coalesce(p_sana, (pg_catalog.now() AT TIME ZONE 'Asia/Tashkent')::date);
  v_hash text; v_role text; v_qoldiq numeric; v_existing public.t2_sklad_harakat%ROWTYPE;
  v_r jsonb; v_obyekt_harakat bigint; v_markaz_harakat bigint; v_nom_obyekt text;
BEGIN
  IF p_actor_id IS NULL OR p_kompaniya_id IS NULL OR p_sklad_id IS NULL OR p_obyekt_id IS NULL
     OR p_operation_id IS NULL OR v_nomi IS NULL OR v_birligi IS NULL OR p_miqdor IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'REQUIRED_FIELD');
  END IF;
  IF p_miqdor <= 0 OR pg_catalog.length(v_nomi) > 500 OR pg_catalog.length(v_birligi) > 100
     OR pg_catalog.length(coalesce(v_qabul,'')) > 300 OR pg_catalog.length(coalesce(v_izoh,'')) > 1000 THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'BERDIM_INVALID');
  END IF;

  v_role := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  PERFORM public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'document.write');

  v_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_object(
    'actor_id', p_actor_id, 'kompaniya_id', p_kompaniya_id, 'sklad_id', p_sklad_id, 'obyekt_id', p_obyekt_id,
    'nomi', v_nomi, 'birligi', v_birligi, 'miqdor', p_miqdor::text, 'sana', v_sana, 'qabul', v_qabul, 'izoh', v_izoh
  )::text, 'UTF8')), 'hex');

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('c11-warehouse:' || p_kompaniya_id::text || ':' || p_operation_id::text, 0));

  SELECT h.* INTO v_existing FROM public.t2_sklad_harakat h
   WHERE h.kompaniya_id = p_kompaniya_id AND h.c11_operation_id = p_operation_id AND h.manba = 'c11_warehouse_berdim_v1';
  IF FOUND THEN
    IF v_existing.c11_request_hash IS DISTINCT FROM v_hash THEN
      RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'OPERATION_ID_CONFLICT');
    END IF;
    RETURN pg_catalog.jsonb_build_object('ok', true, 'takror', true, 'markaz_harakat_id', v_existing.id,
                                         'obyekt_harakat_id', v_existing.c11_juft_id);
  END IF;
  IF EXISTS (SELECT 1 FROM public.t2_sklad_harakat h WHERE h.kompaniya_id = p_kompaniya_id AND h.c11_operation_id = p_operation_id) THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'OPERATION_ID_CONFLICT');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.t2_sklad_mustaqil s WHERE s.id = p_sklad_id AND s.kompaniya_id = p_kompaniya_id AND s.holat = 'faol') THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'WAREHOUSE_SCOPE_MISMATCH');
  END IF;
  SELECT o.nom INTO v_nom_obyekt FROM public.t2_obyekt o WHERE o.id = p_obyekt_id AND o.kompaniya_id = p_kompaniya_id;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'OBJECT_SCOPE_MISMATCH');
  END IF;

  -- Bir xil material bo'yicha parallel BERDIM lar ketma-ket (qoldiq ikki marta "yetarli" bo'lmasin).
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'c11-stock:' || p_kompaniya_id::text || ':' || p_sklad_id::text || ':' || v_nomi || ':' || v_birligi, 0));
  SELECT coalesce(sum(CASE WHEN h.operatsiya = 'prixod' THEN h.obyomi ELSE -h.obyomi END), 0) INTO v_qoldiq
    FROM public.t2_sklad_harakat h
   WHERE h.kompaniya_id = p_kompaniya_id AND h.c11_sklad_id = p_sklad_id AND h.nomi = v_nomi AND h.birligi = v_birligi
     AND h.holat = 'faol'
     AND h.manba IN ('c11_warehouse_receipt_v1','c11_warehouse_storno_v1','c11_warehouse_berdim_v1');
  IF v_qoldiq < p_miqdor THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'QOLDIQ_YETMAYDI', 'qoldiq', v_qoldiq);
  END IF;

  -- (b) obyekt tomoni: MAVJUD yo'l (t2_sklad_qoldiq + t2_sklad_harakat); M-29 shu qoldiqdan yechadi.
  v_r := public.t2_skladga_yozish(p_kompaniya_id, 'prixod', p_obyekt_id, 'mat', v_sana, v_nomi, v_birligi, p_miqdor,
           'Markaziy ombor #' || p_sklad_id::text, v_qabul, 'markaziy_ombor',
           pg_catalog.left('BERDIM markaziy ombor #' || p_sklad_id::text || coalesce(': ' || v_izoh, ''), 1000),
           pg_catalog.md5('c11_berdim_obyekt:' || p_kompaniya_id::text || ':' || p_operation_id::text)::uuid,
           'c11_berdim_obyekt_v1', 'actor:' || p_actor_id::text);
  IF coalesce(v_r->>'ok','false') <> 'true' THEN
    RAISE EXCEPTION 'BERDIM_OBYEKT_YOZISH_RAD: %', v_r::text USING ERRCODE = 'P0001';   -- butun RPC qaytadi
  END IF;
  v_obyekt_harakat := (v_r->>'harakat_id')::bigint;

  -- (a) markaziy tomon: rasxod, obyekt NULL; hedef obyekt va juft qator bilan bog'langan (izlash mumkin).
  INSERT INTO public.t2_sklad_harakat (
    kompaniya_id, obyekt_id, operatsiya, turi, sana, nomi, birligi, obyomi,
    qabul_qiluvchi, qabul_turi, izoh, holat, operation_id, manba, kim,
    c11_sklad_id, c11_operation_id, c11_request_hash, c11_actor_id, c11_hedef_obyekt_id, c11_juft_id
  ) VALUES (
    p_kompaniya_id, NULL, 'rasxod', 'mat', v_sana, v_nomi, v_birligi, p_miqdor,
    v_qabul, 'obyekt', pg_catalog.left('BERDIM obyektga #' || p_obyekt_id::text || coalesce(': ' || v_izoh, ''), 1000),
    'faol', pg_catalog.md5('c11_berdim_markaz:' || p_kompaniya_id::text || ':' || p_operation_id::text)::uuid,
    'c11_warehouse_berdim_v1', 'actor:' || p_actor_id::text,
    p_sklad_id, p_operation_id, v_hash, p_actor_id, p_obyekt_id, v_obyekt_harakat
  ) RETURNING id INTO v_markaz_harakat;

  PERFORM public.t2_audit_yoz(p_kompaniya_id, 'c11_warehouse_berdim_posted', 'sklad', p_obyekt_id,
    pg_catalog.format('sklad_id=%s; obyekt_id=%s; markaz=%s; obyekt_harakat=%s; actor_role=%s; operation_id=%s',
      p_sklad_id, p_obyekt_id, v_markaz_harakat, v_obyekt_harakat, v_role, p_operation_id),
    'actor:' || p_actor_id::text, NULL);

  RETURN pg_catalog.jsonb_build_object('ok', true, 'takror', false, 'markaz_harakat_id', v_markaz_harakat,
    'obyekt_harakat_id', v_obyekt_harakat, 'qoldiq_keyin', v_qoldiq - p_miqdor, 'obyekt_nomi', v_nom_obyekt);
END
$function$;

REVOKE ALL ON FUNCTION public.t2_sklad_markaziy_berdim_v1(bigint,bigint,bigint,bigint,text,text,numeric,date,text,text,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.t2_sklad_markaziy_berdim_v1(bigint,bigint,bigint,bigint,text,text,numeric,date,text,text,uuid)
  TO service_role;

-- ───────────── O'qish: markaziy qoldiq (BERDIM tanlovi uchun), STABLE ─────────────
CREATE OR REPLACE FUNCTION public.t2_sklad_markaziy_qoldiq_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_sklad_id bigint,
  p_qidir text DEFAULT NULL, p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_q text := public.t2_sklad_c11_qidiruv_kaliti_v1(nullif(pg_catalog.btrim(coalesce(p_qidir,'')),''));
  v_limit integer := coalesce(p_limit, 50);
BEGIN
  PERFORM public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  PERFORM public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'document.read');
  IF p_sklad_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.t2_sklad_mustaqil s
       WHERE s.id = p_sklad_id AND s.kompaniya_id = p_kompaniya_id AND s.holat = 'faol') THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'WAREHOUSE_SCOPE_MISMATCH');
  END IF;
  IF v_limit < 1 OR v_limit > 200 OR pg_catalog.length(coalesce(v_q,'')) > 500 THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'FILTER_INVALID');
  END IF;
  RETURN pg_catalog.jsonb_build_object('ok', true, 'qatorlar', coalesce((
    SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('nomi', x.material_nomi, 'birligi', x.birligi, 'qoldiq', x.qoldiq)
                                ORDER BY x.material_nomi, x.birligi)
      FROM (SELECT v.material_nomi, v.birligi, v.qoldiq
              FROM public.t2_sklad_ombor_qoldiq_v1 v
             WHERE v.kompaniya_id = p_kompaniya_id AND v.sklad_id = p_sklad_id AND v.qoldiq > 0
               AND (v_q IS NULL OR pg_catalog.strpos(public.t2_sklad_c11_qidiruv_kaliti_v1(v.material_nomi), v_q) > 0)
             ORDER BY v.material_nomi, v.birligi LIMIT v_limit) x), '[]'::jsonb));
END
$function$;

REVOKE ALL ON FUNCTION public.t2_sklad_markaziy_qoldiq_v1(bigint,bigint,bigint,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.t2_sklad_markaziy_qoldiq_v1(bigint,bigint,bigint,text,integer) TO service_role;

