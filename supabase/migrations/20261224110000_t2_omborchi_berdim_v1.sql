-- T2-OMBORCHI-YOZISH (2026-11-15): omborchi (warehouse.write) markaziy ombordan obyektga BERDIM qila oladi.
-- Faqat t2_sklad_markaziy_berdim_v1 dagi ruxsat tekshiruvi o'zgaradi: warehouse.write YOKI document.write (avval faqat document.write).
-- Boshqa hamma mantiq 20261211110000_c11_markaziy_berdim_v1.sql bilan bir xil. Gateway: frontend/functions/_shared/write-command-policy.ts.
-- Migratsiya faylida begin/commit YO'Q. EGASI TASDIG'I KUTILADI - qo'llanmagan.
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
  IF NOT (public.t2_permission_allowed_v2(p_kompaniya_id, p_actor_id, 'warehouse.write')
          OR public.t2_permission_allowed_v2(p_kompaniya_id, p_actor_id, 'document.write')) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING errcode = '42501';
  END IF;

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

NOTIFY pgrst, 'reload schema';
