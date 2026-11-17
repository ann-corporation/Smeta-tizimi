-- T2-OMBOR narx KEYIN: kirim narxsiz yozilgan bo'lsa, narx keyin qo'yiladi. t2_sklad_harakat append-only (UPDATE taqiqlangan) — shuning uchun alohida jadval.
-- Hisobot/takliflar narxni shu jadvaldan (harakat_id bo'yicha) qo'shib o'qiydi. Narx QQS siz, birlik uchun. Faqat service_role (gateway orqali).
CREATE TABLE IF NOT EXISTS public.t2_ombor_narx_keyin (
  kompaniya_id bigint NOT NULL,
  harakat_id bigint NOT NULL,
  narx numeric NOT NULL CHECK (narx > 0 AND narx <= 1000000000000),
  kim text NOT NULL,
  yaratildi timestamptz NOT NULL DEFAULT pg_catalog.now(),
  yangilandi timestamptz NOT NULL DEFAULT pg_catalog.now(),
  PRIMARY KEY (kompaniya_id, harakat_id)
);
ALTER TABLE public.t2_ombor_narx_keyin ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.t2_ombor_narx_keyin FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.t2_ombor_narx_keyin TO service_role;

CREATE OR REPLACE FUNCTION public.t2_ombor_narx_qoy_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_sklad_id bigint, p_harakat_id bigint, p_narx numeric
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_k text; v_h public.t2_sklad_harakat%ROWTYPE;
BEGIN
  IF p_harakat_id IS NULL OR p_narx IS NULL OR p_narx <= 0 OR p_narx > 1000000000000 THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'INVALID_INPUT');
  END IF;
  v_k := public.t2_ombor_kirish_v1(p_actor_id, p_kompaniya_id, p_sklad_id, true);
  IF v_k <> 'OK' THEN RETURN pg_catalog.jsonb_build_object('ok', false, 'code', v_k); END IF;
  SELECT h.* INTO v_h FROM public.t2_sklad_harakat h
   WHERE h.id = p_harakat_id AND h.kompaniya_id = p_kompaniya_id AND h.c11_sklad_id = p_sklad_id AND h.holat = 'faol';
  IF NOT FOUND OR v_h.operatsiya <> 'prixod' THEN RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'MOVEMENT_NOT_FOUND'); END IF;
  INSERT INTO public.t2_ombor_narx_keyin (kompaniya_id, harakat_id, narx, kim)
  VALUES (p_kompaniya_id, p_harakat_id, p_narx, 'actor:' || p_actor_id::text)
  ON CONFLICT (kompaniya_id, harakat_id) DO UPDATE SET narx = EXCLUDED.narx, kim = EXCLUDED.kim, yangilandi = pg_catalog.now();
  PERFORM public.t2_audit_yoz(p_kompaniya_id, 'ombor_narx_qoyildi', 'sklad', NULL::bigint,
    pg_catalog.format('sklad_id=%s; harakat_id=%s; narx=%s', p_sklad_id, p_harakat_id, p_narx), 'actor:' || p_actor_id::text, NULL);
  RETURN pg_catalog.jsonb_build_object('ok', true, 'harakat_id', p_harakat_id, 'narx', p_narx);
END
$function$;

REVOKE ALL ON FUNCTION public.t2_ombor_narx_qoy_v1(bigint, bigint, bigint, bigint, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.t2_ombor_narx_qoy_v1(bigint, bigint, bigint, bigint, numeric) TO service_role;