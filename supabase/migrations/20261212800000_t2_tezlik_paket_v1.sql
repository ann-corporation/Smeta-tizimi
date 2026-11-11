-- t2_tezlik_paket_v1 (2026-11-11): tezlik, ikkinchi bosqich. Natijalar AYNAN bir xil.
--  1) t2_obyekt_nakrutka_paket_v1(actor, juftlar): bir nechta (obyekt, shartnoma) uchun t2_obyekt_nakrutka_v1 natijasi BITTA chaqiruvda.
--     Obyektlar ro'yxati / F2 reestri 14-33 ta alohida so'rov berardi; o'lchov: butun kompaniya (35 obyekt) bazada ~1,1 s, vaqtning
--     asosi HTTP/shlyuzda edi. Har juftlik uchun t2_obyekt_nakrutka_v1 ning O'ZI chaqiriladi (formula ikkinchi marta yozilmagan);
--     a'zolik tekshiruvi har obyektda RPC ichida qayta bajariladi; bitta juftlik xatosi qolganlarni to'smaydi.
--  2) _t2_ortiqcha_olchov_v1(bigint[]): t2_mindmap_grafi dagi `ort` (F2 fakt/smetadan oshgan qatorlar soni) faqat smeta_hajm, fakt_hajm,
--     f2_hajm ni kerak qiladi; _t2_qator_holat_v2 esa qoldiq/almashtirilgan ustunlarini ham hisoblardi (t2_almashtirilgan_hajm 1800+ marta,
--     har qatorga EXISTS — 831k buffer, temp spill). Yangisi shu uchta ustunni AYNAN shu formula bilan beradi: EXISTS -> bir martalik hashed IN,
--     t2_akt_qator agregati bir marta (dd va bla birlashtirilgan). Buffer ~5x kam. t2_mindmap_grafi (matn bo'yicha, anchor bilan) shuni ishlatadi.
-- Funksiya matni almashtirish: anchor topilmasa - xato (drift himoyasi).
-- versiya: tarix (t2_qator holat funksiyasi kabi barcha versiyani o'qiydi).

CREATE OR REPLACE FUNCTION public.t2_obyekt_nakrutka_paket_v1(p_actor_id bigint, p_juftlar jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_j jsonb; v_oid bigint; v_sid bigint; v_r jsonb; v_out jsonb := '[]'::jsonb;
begin
  if p_actor_id is null or p_actor_id <= 0 then
    raise exception 'REQUEST_INVALID' using errcode = '22023';
  end if;
  if p_juftlar is null or jsonb_typeof(p_juftlar) <> 'array' or jsonb_array_length(p_juftlar) < 1 or jsonb_array_length(p_juftlar) > 100 then
    return jsonb_build_object('ok', false, 'code', 'JUFTLAR_NOTOGRI');
  end if;
  for v_j in select e.value from jsonb_array_elements(p_juftlar) e loop
    v_oid := nullif(v_j->>'obyekt_id', '')::bigint;
    v_sid := nullif(v_j->>'shartnoma_id', '')::bigint;
    begin
      v_r := public.t2_obyekt_nakrutka_v1(v_oid, p_actor_id, v_sid);
    exception when others then
      v_r := jsonb_build_object('ok', false, 'code', 'NAKRUTKA_OQILMADI');
    end;
    v_out := v_out || jsonb_build_array(jsonb_build_object('obyekt_id', v_oid, 'shartnoma_id', v_sid, 'natija', v_r));
  end loop;
  return jsonb_build_object('ok', true, 'natijalar', v_out);
end
$function$;
REVOKE ALL ON FUNCTION public.t2_obyekt_nakrutka_paket_v1(bigint, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.t2_obyekt_nakrutka_paket_v1(bigint, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public._t2_ortiqcha_olchov_v1(p_obyekt_ids bigint[])
RETURNS TABLE(obyekt_id bigint, smeta_hajm numeric, fakt_hajm numeric, f2_hajm numeric)
LANGUAGE sql
STABLE
AS $fn$
 WITH agg AS MATERIALIZED (
   SELECT aq.qator_id,
          count(*) AS n,
          sum(aq.hajm) FILTER (WHERE a.tur = 'fakt' AND a.holat <> 'bekor') AS direct_fakt_hajm,
          sum(COALESCE(aq.certified_quantity, aq.hajm)) FILTER (WHERE a.tur = 'f2' AND a.holat = 'tasdiqlangan') AS f2_hajm,
          sum(aq.hajm) FILTER (WHERE a.tur = 'fakt' AND a.holat <> 'bekor' AND aq.narx_manba = 'f2_sertifikat') AS f2s_hajm
     FROM public.t2_akt_qator aq
     LEFT JOIN public.t2_akt a ON a.id = aq.akt_id
    WHERE aq.qator_id IN (SELECT q2.id FROM public.t2_qator q2 WHERE q2.obyekt_id = ANY(p_obyekt_ids))
    GROUP BY aq.qator_id
 )
 SELECT q.obyekt_id,
    CASE
        WHEN (q.versiya_holat = 'almashtirilgan'::text) THEN (0)::numeric
        ELSE COALESCE(zr.v, q.hajm)
    END AS smeta_hajm,
    e.fakt_hajm,
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
            COALESCE(dd.f2_hajm, (0)::numeric) AS f2_hajm) d
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
                END AS fakt_hajm) e
   WHERE q.obyekt_id = ANY(p_obyekt_ids)
$fn$;
REVOKE ALL ON FUNCTION public._t2_ortiqcha_olchov_v1(bigint[]) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._t2_ortiqcha_olchov_v1(bigint[]) TO service_role;
COMMENT ON FUNCTION public._t2_ortiqcha_olchov_v1(bigint[]) IS '_t2_qator_holat_v2 ning smeta_hajm/fakt_hajm/f2_hajm ustunlari bilan bir xil, faqat shu uchtasi (tezlik_v2). Acceptance solishtiradi.';

DO $m$
DECLARE v text; v2 text;
BEGIN
  v := pg_get_functiondef('public.t2_mindmap_grafi(bigint)'::regprocedure);
  IF position('tezlik_v2' in v) = 0 THEN
    IF position('tezlik_v1' in v) = 0 THEN RAISE EXCEPTION 'TEZLIK_V2_ANCHOR_YOQ: t2_mindmap_grafi tezlik_v1 emas (20261212300000 qo''llanmagan?)'; END IF;
    v2 := regexp_replace(v, 'public\._t2_qator_holat_v2\(ARRAY\(SELECT o0\.id FROM public\.t2_obyekt o0 WHERE o0\.kompaniya_id = p_kompaniya_id\)\) qh',
      'public._t2_ortiqcha_olchov_v1(ARRAY(SELECT o0.id FROM public.t2_obyekt o0 WHERE o0.kompaniya_id = p_kompaniya_id)) qh /* tezlik_v2 */');
    IF v2 = v THEN RAISE EXCEPTION 'TEZLIK_V2_ANCHOR_YOQ: t2_mindmap_grafi'; END IF;
    EXECUTE v2;
  END IF;
END $m$;
