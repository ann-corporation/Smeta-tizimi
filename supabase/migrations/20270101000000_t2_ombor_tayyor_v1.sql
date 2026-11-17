-- T2-OMBOR-TAYYOR v1 (2026-11-17): omborchi uchun markaziy ombor — noaniq material moslash, chiqim, tuzatish, birlashgan ostatka,
-- Google Sheets «Приход» ni idempotent sinxronlash. MAVJUD C11 modelini KENGAYTIRADI (t2_sklad_harakat / t2_sklad_mustaqil /
-- t2_material_alias); yangi jadval YO'Q. Faqat funksiyalar, 1 indeks va 1 view-yangilanish.
-- Migratsiya faylida begin/commit YO'Q. EGASI TASDIG'I KUTILADI — qo'llanmagan (prodga YOZILMAGAN).
--
-- Qoidalar:
--  * Jurnal append-only qoladi (t2_sklad_c11_append_only_guard_v1): tuzatish = teskari yozuv (storno) + yangi yozuv.
--  * Ostatka = prixod - rasxod; ombor manbalari: receipt/storno/berdim (mavjud) + ombor_* (shu migratsiya).
--  * Variantlar (Полиэтилен труба ф25 / ПЭ труба Д25 ...) t2_material_alias orqali TASDIQDAN KEYIN bitta guruh bo'ladi;
--    tasdiqlanmagan variantlar ham kalit (t2_ombor_kalit_v1) bo'yicha avtomatik guruhlanadi va qidiruvda topiladi.
--  * Yozuvlar operation_id bilan idempotent; har amal t2_audit_yoz ga yoziladi.

-- ═══ 1. Normallashtirish: nom kaliti (frontend/src/lib/ombor-moslash/moslash.ts bilan bir xil qoidalar) ═══
CREATE OR REPLACE FUNCTION public.t2_ombor_kalit_v1(p_matn text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE STRICT
SET search_path TO ''
AS $function$
DECLARE
  s text; w text; f text; m text; syn text; prev text := NULL;
  natija text[] := ARRAY[]::text[];
BEGIN
  s := pg_catalog.lower(normalize(p_matn, NFKC));
  s := pg_catalog.regexp_replace(s, '[ʻʼ’‘`´'']', '', 'g');
  s := pg_catalog.regexp_replace(s, '(\d),(\d)', '\1.\2', 'g');
  s := pg_catalog.regexp_replace(s, '[×*✕]', ' x ', 'g');
  s := pg_catalog.regexp_replace(s, '[ø⌀]', ' f ', 'g');
  s := pg_catalog.regexp_replace(s, '[^a-zа-яёўқғҳ0-9.]+', ' ', 'g');
  s := pg_catalog.regexp_replace(s, '(^|\s)\.+|\.+(\s|$)', ' ', 'g');
  s := pg_catalog.regexp_replace(s, '(\d)\.(\D|$)', '\1 \2', 'g');
  s := pg_catalog.regexp_replace(s, '(^|\D)\.(\d)', '\1 \2', 'g');
  FOREACH w IN ARRAY pg_catalog.regexp_split_to_array(pg_catalog.btrim(s), '\s+') LOOP
    CONTINUE WHEN w = '';
    IF w ~ '[а-яёўқғҳ]' THEN
      w := pg_catalog.translate(w, 'aeopcxykmhtb', 'аеорсхуктнтв');
    END IF;
    f := w;
    f := pg_catalog.replace(f, 'ч', 'ch'); f := pg_catalog.replace(f, 'ш', 'sh'); f := pg_catalog.replace(f, 'щ', 'sh');
    f := pg_catalog.replace(f, 'ю', 'yu');  f := pg_catalog.replace(f, 'я', 'ya');
    f := pg_catalog.replace(f, 'ъ', '');    f := pg_catalog.replace(f, 'ь', '');
    f := pg_catalog.replace(f, 'ё', 'e');   f := pg_catalog.replace(f, 'ж', 'j');  f := pg_catalog.replace(f, 'ц', 's');
    f := pg_catalog.translate(f, 'абвгдезийклмнопрстуфхыэўқғҳ', 'abvgdeziyklmnoprstufxieukgh');
    f := pg_catalog.replace(f, 'kh', 'x'); f := pg_catalog.replace(f, 'ts', 's');
    f := pg_catalog.regexp_replace(f, 'y[eo]', 'e', 'g');
    f := pg_catalog.regexp_replace(f, '([a-z])\1+', '\1', 'g');
    FOR m IN SELECT x[1] FROM pg_catalog.regexp_matches(f, '([0-9]+(?:\.[0-9]+)?|[a-z]+)', 'g') AS x LOOP
      syn := CASE m
        WHEN 'quvur' THEN 'truba' WHEN 'trubka' THEN 'truba' WHEN 'trubi' THEN 'truba' WHEN 'trubalar' THEN 'truba'
        WHEN 'polietilen' THEN 'pe' WHEN 'polietilenovaya' THEN 'pe' WHEN 'polietilenovyi' THEN 'pe'
        WHEN 'polietilenovoi' THEN 'pe' WHEN 'polietilenli' THEN 'pe' WHEN 'plastik' THEN 'pe'
        WHEN 'sement' THEN 'cement' WHEN 'tsement' THEN 'cement' WHEN 'sementi' THEN 'cement'
        WHEN 'qum' THEN 'pesok' WHEN 'shebin' THEN 'shebyon' WHEN 'shaggal' THEN 'shebyon'
        WHEN 'armatur' THEN 'armatura' WHEN 'kabil' THEN 'kabel'
        WHEN 'diametr' THEN 'f' WHEN 'diametri' THEN 'f' WHEN 'dia' THEN 'f' WHEN 'd' THEN 'f' WHEN 'dn' THEN 'f'
        ELSE m END;
      IF prev IS DISTINCT FROM syn THEN natija := pg_catalog.array_append(natija, syn); END IF;
      prev := syn;
    END LOOP;
  END LOOP;
  RETURN pg_catalog.array_to_string(natija, ' ');
END
$function$;

CREATE OR REPLACE FUNCTION public.t2_ombor_birlik_v1(p_birlik text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE STRICT
SET search_path TO ''
AS $function$
DECLARE b text; f text;
BEGIN
  b := pg_catalog.regexp_replace(pg_catalog.lower(normalize(p_birlik, NFKC)), '[\s.ʻʼ’‘`´'']+', '', 'g');
  IF b ~ '[а-яёўқғҳ]' THEN b := pg_catalog.translate(b, 'aeopcxykmhtb', 'аеорсхуктнтв'); END IF;
  f := b;
  f := pg_catalog.replace(f, 'ч', 'ch'); f := pg_catalog.replace(f, 'ш', 'sh'); f := pg_catalog.replace(f, 'щ', 'sh');
  f := pg_catalog.replace(f, 'ю', 'yu');  f := pg_catalog.replace(f, 'я', 'ya');
  f := pg_catalog.replace(f, 'ъ', '');    f := pg_catalog.replace(f, 'ь', '');
  f := pg_catalog.replace(f, 'ё', 'e');   f := pg_catalog.replace(f, 'ж', 'j');  f := pg_catalog.replace(f, 'ц', 's');
  f := pg_catalog.translate(f, 'абвгдезийклмнопрстуфхыэўқғҳ', 'abvgdeziyklmnoprstufxieukgh');
  f := pg_catalog.replace(f, 'kh', 'x'); f := pg_catalog.replace(f, 'ts', 's');
  f := pg_catalog.regexp_replace(f, 'y[eo]', 'e', 'g');
  f := pg_catalog.regexp_replace(f, '([a-z])\1+', '\1', 'g');
  RETURN CASE f
    WHEN 'sht' THEN 'sht' WHEN 'shtuk' THEN 'sht' WHEN 'shtuka' THEN 'sht' WHEN 'dona' THEN 'sht' WHEN 'dn' THEN 'sht' WHEN 'pcs' THEN 'sht'
    WHEN 'komplekt' THEN 'komplekt' WHEN 'kmpl' THEN 'komplekt' WHEN 'komp' THEN 'komplekt'
    WHEN 'm' THEN 'm' WHEN 'metr' THEN 'm' WHEN 'metir' THEN 'm' WHEN 'pm' THEN 'm' WHEN 'pogm' THEN 'm' WHEN 'mp' THEN 'm'
    WHEN 'm2' THEN 'm2' WHEN 'm^2' THEN 'm2' WHEN 'kvm' THEN 'm2' WHEN 'kvadrat' THEN 'm2'
    WHEN 'm3' THEN 'm3' WHEN 'm^3' THEN 'm3' WHEN 'kub' THEN 'm3' WHEN 'kubm' THEN 'm3'
    WHEN 'kg' THEN 'kg' WHEN 'kilogram' THEN 'kg' WHEN 'kgr' THEN 'kg'
    WHEN 'tn' THEN 'tn' WHEN 't' THEN 'tn' WHEN 'tonna' THEN 'tn' WHEN 'tonn' THEN 'tn'
    WHEN 'l' THEN 'l' WHEN 'litr' THEN 'l' WHEN 'lit' THEN 'l'
    WHEN 'rulon' THEN 'rulon' WHEN 'rul' THEN 'rulon' WHEN 'rulonlar' THEN 'rulon'
    WHEN 'upak' THEN 'upak' WHEN 'upakovka' THEN 'upak' WHEN 'pachka' THEN 'pachka' WHEN 'pochka' THEN 'pachka'
    WHEN 'paket' THEN 'paket' WHEN 'meshok' THEN 'meshok' WHEN 'qop' THEN 'meshok' WHEN 'mesh' THEN 'meshok'
    ELSE f END;
END
$function$;

-- Qidiruv balli (0..1): so'rov tokenlari guruh tokenlariga teng / prefiks / pg_trgm yaqin bo'lsa. IMMUTABLE emas (pg_trgm sxemasi).
CREATE OR REPLACE FUNCTION public.t2_ombor_moslik_v1(p_sorov_kalit text, p_nom_kalit text)
RETURNS numeric
LANGUAGE plpgsql STABLE
SET search_path TO ''
AS $function$
DECLARE q text; t text[]; yig numeric := 0; n integer := 0; eng numeric; y text; bal numeric; qs text[];
BEGIN
  IF coalesce(p_sorov_kalit,'') = '' OR coalesce(p_nom_kalit,'') = '' THEN RETURN 0; END IF;
  qs := pg_catalog.string_to_array(p_sorov_kalit, ' ');
  t := pg_catalog.string_to_array(p_nom_kalit, ' ');
  FOREACH q IN ARRAY qs LOOP
    n := n + 1; eng := 0;
    FOREACH y IN ARRAY t LOOP
      IF q = y THEN bal := 1;
      ELSIF q ~ '^[0-9.]+$' OR y ~ '^[0-9.]+$' THEN bal := CASE WHEN pg_catalog.starts_with(y, q) THEN 0.7 ELSE 0 END;
      ELSIF pg_catalog.length(q) >= 2 AND pg_catalog.starts_with(y, q) THEN bal := 0.9;
      ELSE bal := extensions.similarity(q, y); IF bal < 0.5 THEN bal := 0; END IF;
      END IF;
      IF bal > eng THEN eng := bal; END IF;
      EXIT WHEN eng = 1;
    END LOOP;
    yig := yig + eng;
  END LOOP;
  IF n = 0 OR yig = 0 THEN RETURN 0; END IF;
  RETURN pg_catalog.round((0.75 * (yig / n) + 0.25 * extensions.similarity(p_sorov_kalit, p_nom_kalit))::numeric, 3);
END
$function$;

-- Guruh kaliti: tasdiqlangan alias bo'lsa kanonik nomning kaliti, aks holda o'z kaliti.
CREATE OR REPLACE FUNCTION public.t2_ombor_guruh_kaliti_v1(p_kompaniya_id bigint, p_nomi text)
RETURNS text
LANGUAGE sql STABLE
SET search_path TO ''
AS $function$
  SELECT coalesce(
    (SELECT public.t2_ombor_kalit_v1(a.kanonik_nom_key)
       FROM public.t2_material_alias a
      WHERE a.holat = 'faol' AND (a.kompaniya_id IS NULL OR a.kompaniya_id = p_kompaniya_id)
        AND pg_catalog.upper(pg_catalog.btrim(a.alias_nom)) = pg_catalog.upper(pg_catalog.btrim(p_nomi))
      ORDER BY a.kompaniya_id NULLS LAST, a.id DESC LIMIT 1),
    public.t2_ombor_kalit_v1(p_nomi));
$function$;

-- ═══ 2. Ostatka ko'rinishi ombor manbalarini ham qamrasin (ustunlar o'zgarmaydi) ═══
CREATE OR REPLACE VIEW public.t2_sklad_ombor_qoldiq_v1 AS
 SELECT h.kompaniya_id,
    h.c11_sklad_id AS sklad_id,
    s.nomi AS sklad_nomi,
    h.nomi AS material_nomi,
    h.birligi,
    sum(
        CASE
            WHEN (h.operatsiya = 'prixod'::text) THEN h.obyomi
            WHEN (h.operatsiya = 'rasxod'::text) THEN (- h.obyomi)
            ELSE (0)::numeric
        END) AS qoldiq
   FROM (public.t2_sklad_harakat h
     JOIN public.t2_sklad_mustaqil s ON (((s.id = h.c11_sklad_id) AND (s.kompaniya_id = h.kompaniya_id))))
  WHERE ((h.c11_sklad_id IS NOT NULL) AND (h.holat = 'faol'::text)
    AND (h.manba = ANY (ARRAY['c11_warehouse_receipt_v1'::text, 'c11_warehouse_storno_v1'::text, 'c11_warehouse_berdim_v1'::text,
      'ombor_prixod_v1'::text, 'ombor_prixod_sinxron_v1'::text, 'ombor_chiqim_v1'::text, 'ombor_chiqim_qaytarish_v1'::text, 'ombor_tuzat_storno_v1'::text])))
  GROUP BY h.kompaniya_id, h.c11_sklad_id, s.nomi, h.nomi, h.birligi;

CREATE INDEX IF NOT EXISTS t2_sklad_harakat_ombor_sana_idx
  ON public.t2_sklad_harakat (kompaniya_id, c11_sklad_id, sana) WHERE c11_sklad_id IS NOT NULL;
-- Bir yozuv faqat bir marta teskari qilinadi.
CREATE UNIQUE INDEX IF NOT EXISTS t2_sklad_harakat_ombor_tuzat_once_uq
  ON public.t2_sklad_harakat (kompaniya_id, c11_juft_id) WHERE manba = 'ombor_tuzat_storno_v1';

-- ═══ 3. Ichki yordamchi: ruxsat + ombor tekshiruvi ═══
CREATE OR REPLACE FUNCTION public.t2_ombor_kirish_v1(p_actor_id bigint, p_kompaniya_id bigint, p_sklad_id bigint, p_yozish boolean)
RETURNS text
LANGUAGE plpgsql STABLE
SET search_path TO ''
AS $function$
DECLARE v_role text;
BEGIN
  IF p_actor_id IS NULL OR p_kompaniya_id IS NULL OR p_sklad_id IS NULL THEN RETURN 'REQUIRED_FIELD'; END IF;
  v_role := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  IF p_yozish THEN
    IF NOT (public.t2_permission_allowed_v2(p_kompaniya_id, p_actor_id, 'warehouse.write')
            OR public.t2_permission_allowed_v2(p_kompaniya_id, p_actor_id, 'document.write')) THEN
      RAISE EXCEPTION 'PERMISSION_DENIED' USING errcode = '42501';
    END IF;
  ELSE
    IF NOT (public.t2_permission_allowed_v2(p_kompaniya_id, p_actor_id, 'warehouse.read')
            OR public.t2_permission_allowed_v2(p_kompaniya_id, p_actor_id, 'warehouse.write')
            OR public.t2_permission_allowed_v2(p_kompaniya_id, p_actor_id, 'document.read')) THEN
      RAISE EXCEPTION 'PERMISSION_DENIED' USING errcode = '42501';
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.t2_sklad_mustaqil s WHERE s.id = p_sklad_id AND s.kompaniya_id = p_kompaniya_id AND s.holat = 'faol') THEN
    RETURN 'WAREHOUSE_SCOPE_MISMATCH';
  END IF;
  RETURN 'OK';
END
$function$;

-- ═══ 4. O'qish: birlashgan ostatka (variantlar bitta guruhda, noaniq qidiruv) ═══
-- p_filtr: {qidir, birlik, tur, musbat:'1'|'0', tartib:'nom'|'qoldiq'}
CREATE OR REPLACE FUNCTION public.t2_ombor_qoldiq_v2(
  p_actor_id bigint, p_kompaniya_id bigint, p_sklad_id bigint, p_filtr jsonb DEFAULT '{}'::jsonb,
  p_limit integer DEFAULT 50, p_offset integer DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_k text; v_f jsonb := coalesce(p_filtr, '{}'::jsonb);
  v_q text; v_bk text; v_tur text; v_musbat boolean; v_tartib text; v_natija jsonb;
BEGIN
  v_k := public.t2_ombor_kirish_v1(p_actor_id, p_kompaniya_id, p_sklad_id, false);
  IF v_k <> 'OK' THEN RETURN pg_catalog.jsonb_build_object('ok', false, 'code', v_k); END IF;
  IF p_limit < 1 OR p_limit > 500 OR p_offset < 0 OR pg_catalog.jsonb_typeof(v_f) <> 'object' THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'FILTER_INVALID');
  END IF;
  v_q := public.t2_ombor_kalit_v1(nullif(pg_catalog.btrim(coalesce(v_f->>'qidir','')), ''));
  v_bk := public.t2_ombor_birlik_v1(nullif(pg_catalog.btrim(coalesce(v_f->>'birlik','')), ''));
  v_tur := nullif(pg_catalog.btrim(coalesce(v_f->>'tur','')), '');
  v_musbat := coalesce(v_f->>'musbat', '1') <> '0';
  v_tartib := CASE WHEN v_f->>'tartib' = 'qoldiq' THEN 'qoldiq' ELSE 'nom' END;

  WITH harakat AS MATERIALIZED (
    SELECT h.nomi, h.birligi, coalesce(h.c11_manba_turi, '') AS tur,
           sum(CASE WHEN h.operatsiya = 'prixod' THEN h.obyomi ELSE 0 END) AS kirim,
           sum(CASE WHEN h.operatsiya = 'rasxod' THEN h.obyomi ELSE 0 END) AS chiqim,
           count(*) AS soni, max(h.sana) AS oxirgi
      FROM public.t2_sklad_harakat h
     WHERE h.kompaniya_id = p_kompaniya_id AND h.c11_sklad_id = p_sklad_id AND h.holat = 'faol'
       AND h.manba = ANY (ARRAY['c11_warehouse_receipt_v1','c11_warehouse_storno_v1','c11_warehouse_berdim_v1',
         'ombor_prixod_v1','ombor_prixod_sinxron_v1','ombor_chiqim_v1','ombor_chiqim_qaytarish_v1','ombor_tuzat_storno_v1'])
     GROUP BY h.nomi, h.birligi, coalesce(h.c11_manba_turi, '')
  ), kalitli AS (
    SELECT x.*, public.t2_ombor_guruh_kaliti_v1(p_kompaniya_id, x.nomi) AS gk, public.t2_ombor_birlik_v1(x.birligi) AS bk
      FROM harakat x
  ), guruh AS (
    SELECT gk, bk,
           (array_agg(nomi ORDER BY soni DESC, nomi))[1] AS nomi,
           (array_agg(birligi ORDER BY soni DESC, birligi))[1] AS birligi,
           (array_agg(tur ORDER BY soni DESC, tur) FILTER (WHERE tur <> ''))[1] AS tur,
           sum(kirim) AS kirim, sum(chiqim) AS chiqim, sum(kirim) - sum(chiqim) AS qoldiq,
           count(*) AS variantlar_soni, sum(soni) AS harakatlar, max(oxirgi) AS oxirgi_sana,
           CASE WHEN v_q IS NULL THEN 1 ELSE public.t2_ombor_moslik_v1(v_q, gk) END AS ball
      FROM kalitli GROUP BY gk, bk
  ), filtr AS (
    SELECT g.* FROM guruh g
     WHERE (v_q IS NULL OR g.ball >= 0.45)
       AND (v_bk IS NULL OR g.bk = v_bk)
       AND (v_tur IS NULL OR g.tur = v_tur)
       AND (NOT v_musbat OR g.qoldiq > 0 OR v_q IS NOT NULL)
  ), sahifa AS (
    SELECT * FROM filtr
     ORDER BY (CASE WHEN v_q IS NOT NULL THEN ball END) DESC NULLS LAST,
              (CASE WHEN v_tartib = 'qoldiq' THEN qoldiq END) DESC NULLS LAST, nomi
     LIMIT p_limit OFFSET p_offset
  )
  SELECT pg_catalog.jsonb_build_object('ok', true,
      'jami', (SELECT count(*) FROM filtr), 'limit', p_limit, 'offset', p_offset,
      'turlar', coalesce((SELECT pg_catalog.jsonb_agg(DISTINCT g.tur) FROM guruh g WHERE g.tur IS NOT NULL), '[]'::jsonb),
      'qatorlar', coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'kalit', s.gk, 'nomi', s.nomi, 'birligi', s.birligi, 'tur', s.tur, 'kirim', s.kirim, 'chiqim', s.chiqim,
          'qoldiq', s.qoldiq, 'variantlar_soni', s.variantlar_soni, 'harakatlar', s.harakatlar,
          'oxirgi_sana', s.oxirgi_sana, 'ball', s.ball)
        ORDER BY (CASE WHEN v_q IS NOT NULL THEN s.ball END) DESC NULLS LAST,
                 (CASE WHEN v_tartib = 'qoldiq' THEN s.qoldiq END) DESC NULLS LAST, s.nomi) FROM sahifa s), '[]'::jsonb))
    INTO v_natija;
  RETURN v_natija;
END
$function$;

-- ═══ 5. O'qish: material kartasi (bitta guruh tarixi) va umumiy harakatlar ro'yxati ═══
-- p_kalit — t2_ombor_qoldiq_v2 qaytargan `kalit`; p_birlik — shu guruhning birligi.
CREATE OR REPLACE FUNCTION public.t2_ombor_tarix_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_sklad_id bigint, p_kalit text, p_birlik text,
  p_limit integer DEFAULT 100, p_offset integer DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_k text; v_bk text := public.t2_ombor_birlik_v1(coalesce(p_birlik, '')); v_natija jsonb;
BEGIN
  v_k := public.t2_ombor_kirish_v1(p_actor_id, p_kompaniya_id, p_sklad_id, false);
  IF v_k <> 'OK' THEN RETURN pg_catalog.jsonb_build_object('ok', false, 'code', v_k); END IF;
  IF coalesce(p_kalit, '') = '' OR p_limit < 1 OR p_limit > 500 OR p_offset < 0 THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'FILTER_INVALID');
  END IF;
  WITH nom AS MATERIALIZED (
    SELECT DISTINCT h.nomi, h.birligi FROM public.t2_sklad_harakat h
     WHERE h.kompaniya_id = p_kompaniya_id AND h.c11_sklad_id = p_sklad_id
  ), mos AS (
    SELECT n.nomi, n.birligi FROM nom n
     WHERE public.t2_ombor_guruh_kaliti_v1(p_kompaniya_id, n.nomi) = p_kalit AND public.t2_ombor_birlik_v1(n.birligi) = v_bk
  ), h AS (
    SELECT x.*, r.id AS teskari_id FROM public.t2_sklad_harakat x
      JOIN mos m ON m.nomi = x.nomi AND m.birligi = x.birligi
      LEFT JOIN public.t2_sklad_harakat r ON r.kompaniya_id = x.kompaniya_id AND r.c11_juft_id = x.id AND r.manba = 'ombor_tuzat_storno_v1'
     WHERE x.kompaniya_id = p_kompaniya_id AND x.c11_sklad_id = p_sklad_id AND x.holat = 'faol'
  ), sah AS (SELECT * FROM h ORDER BY sana DESC, id DESC LIMIT p_limit OFFSET p_offset)
  SELECT pg_catalog.jsonb_build_object('ok', true, 'jami', (SELECT count(*) FROM h),
    'kirim', coalesce((SELECT sum(obyomi) FROM h WHERE operatsiya = 'prixod'), 0),
    'chiqim', coalesce((SELECT sum(obyomi) FROM h WHERE operatsiya = 'rasxod'), 0),
    'qatorlar', coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', s.id, 'sana', s.sana, 'operatsiya', s.operatsiya, 'nomi', s.nomi, 'birligi', s.birligi, 'obyomi', s.obyomi,
      'postavshik', s.postavshik, 'qabul_qiluvchi', s.qabul_qiluvchi, 'qabul_turi', s.qabul_turi, 'izoh', s.izoh, 'tur', s.c11_manba_turi,
      'sf_tasdiq', s.c11_sf_tasdiq, 'manba', s.manba, 'teskari', s.teskari_id IS NOT NULL, 'yaratildi', s.yaratildi)
      ORDER BY s.sana DESC, s.id DESC) FROM sah s), '[]'::jsonb)) INTO v_natija;
  RETURN v_natija;
END
$function$;

-- p_filtr: {dan, gacha, qidir, operatsiya:'prixod'|'rasxod', yetkazuvchi, qabul}
CREATE OR REPLACE FUNCTION public.t2_ombor_harakat_royxat_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_sklad_id bigint, p_filtr jsonb DEFAULT '{}'::jsonb,
  p_limit integer DEFAULT 50, p_offset integer DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_k text; v_f jsonb := coalesce(p_filtr, '{}'::jsonb); v_dan date; v_gacha date; v_op text;
  v_q text := public.t2_ombor_kalit_v1(nullif(pg_catalog.btrim(coalesce(p_filtr->>'qidir','')), ''));
  v_yet text := public.t2_ombor_kalit_v1(nullif(pg_catalog.btrim(coalesce(p_filtr->>'yetkazuvchi','')), ''));
  v_natija jsonb;
BEGIN
  v_k := public.t2_ombor_kirish_v1(p_actor_id, p_kompaniya_id, p_sklad_id, false);
  IF v_k <> 'OK' THEN RETURN pg_catalog.jsonb_build_object('ok', false, 'code', v_k); END IF;
  IF p_limit < 1 OR p_limit > 500 OR p_offset < 0 OR pg_catalog.jsonb_typeof(v_f) <> 'object' THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'FILTER_INVALID');
  END IF;
  BEGIN
    IF nullif(v_f->>'dan','') IS NOT NULL THEN v_dan := (v_f->>'dan')::date; END IF;
    IF nullif(v_f->>'gacha','') IS NOT NULL THEN v_gacha := (v_f->>'gacha')::date; END IF;
  EXCEPTION WHEN OTHERS THEN RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'FILTER_INVALID');
  END;
  v_op := nullif(v_f->>'operatsiya', '');
  IF v_op IS NOT NULL AND v_op NOT IN ('prixod', 'rasxod') THEN RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'FILTER_INVALID'); END IF;
  WITH nom AS MATERIALIZED (
    SELECT n.nomi, public.t2_ombor_guruh_kaliti_v1(p_kompaniya_id, n.nomi) AS gk
      FROM (SELECT DISTINCT h.nomi FROM public.t2_sklad_harakat h WHERE h.kompaniya_id = p_kompaniya_id AND h.c11_sklad_id = p_sklad_id) n
  ), h AS (
    SELECT x.*, r.id AS teskari_id
      FROM public.t2_sklad_harakat x JOIN nom ON nom.nomi = x.nomi
      LEFT JOIN public.t2_sklad_harakat r ON r.kompaniya_id = x.kompaniya_id AND r.c11_juft_id = x.id AND r.manba = 'ombor_tuzat_storno_v1'
     WHERE x.kompaniya_id = p_kompaniya_id AND x.c11_sklad_id = p_sklad_id AND x.holat = 'faol'
       AND x.manba <> 'ombor_tuzat_storno_v1'
       AND (v_dan IS NULL OR x.sana >= v_dan) AND (v_gacha IS NULL OR x.sana <= v_gacha)
       AND (v_op IS NULL OR x.operatsiya = v_op)
       AND (v_q IS NULL OR public.t2_ombor_moslik_v1(v_q, nom.gk) >= 0.45)
       AND (v_yet IS NULL OR pg_catalog.strpos(public.t2_ombor_kalit_v1(coalesce(x.postavshik, '')), v_yet) > 0)
  ), sah AS (SELECT * FROM h ORDER BY sana DESC, id DESC LIMIT p_limit OFFSET p_offset)
  SELECT pg_catalog.jsonb_build_object('ok', true, 'jami', (SELECT count(*) FROM h), 'limit', p_limit, 'offset', p_offset,
    'qatorlar', coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', s.id, 'sana', s.sana, 'operatsiya', s.operatsiya, 'nomi', s.nomi, 'birligi', s.birligi, 'obyomi', s.obyomi,
      'postavshik', s.postavshik, 'qabul_qiluvchi', s.qabul_qiluvchi, 'qabul_turi', s.qabul_turi, 'izoh', s.izoh,
      'tur', s.c11_manba_turi, 'sf_tasdiq', s.c11_sf_tasdiq, 'manba', s.manba, 'obyekt_id', s.c11_hedef_obyekt_id,
      'teskari', s.teskari_id IS NOT NULL, 'yaratildi', s.yaratildi) ORDER BY s.sana DESC, s.id DESC) FROM sah s), '[]'::jsonb)) INTO v_natija;
  RETURN v_natija;
END
$function$;

-- ═══ 6. Yozish: prixod / chiqim (idempotent, audit, ostatka tekshiruvi) ═══
CREATE OR REPLACE FUNCTION public.t2_ombor_guruh_qoldiq_v1(p_kompaniya_id bigint, p_sklad_id bigint, p_nomi text, p_birligi text)
RETURNS numeric
LANGUAGE sql STABLE
SET search_path TO ''
AS $function$
  WITH p AS (
    SELECT h.nomi, h.birligi,
           sum(CASE WHEN h.operatsiya = 'prixod' THEN h.obyomi ELSE -h.obyomi END) AS s
      FROM public.t2_sklad_harakat h
     WHERE h.kompaniya_id = p_kompaniya_id AND h.c11_sklad_id = p_sklad_id AND h.holat = 'faol'
       AND h.manba = ANY (ARRAY['c11_warehouse_receipt_v1','c11_warehouse_storno_v1','c11_warehouse_berdim_v1',
         'ombor_prixod_v1','ombor_prixod_sinxron_v1','ombor_chiqim_v1','ombor_chiqim_qaytarish_v1','ombor_tuzat_storno_v1'])
     GROUP BY h.nomi, h.birligi
  )
  SELECT coalesce(sum(p.s), 0) FROM p
   WHERE public.t2_ombor_birlik_v1(p.birligi) = public.t2_ombor_birlik_v1(p_birligi)
     AND public.t2_ombor_guruh_kaliti_v1(p_kompaniya_id, p.nomi) = public.t2_ombor_guruh_kaliti_v1(p_kompaniya_id, p_nomi);
$function$;

CREATE OR REPLACE FUNCTION public.t2_ombor_yozuv_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_sklad_id bigint, p_operatsiya text, p_nomi text, p_birligi text, p_miqdor numeric,
  p_sana date, p_kontragent text, p_tur text, p_izoh text, p_sf text, p_obyekt_id bigint, p_qabul_turi text,
  p_operation_id uuid, p_manfiy_ruxsat boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_k text; v_nomi text := nullif(pg_catalog.btrim(coalesce(p_nomi,'')), ''); v_birligi text := nullif(pg_catalog.btrim(coalesce(p_birligi,'')), '');
  v_sana date := coalesce(p_sana, (pg_catalog.now() AT TIME ZONE 'Asia/Tashkent')::date);
  v_kont text := nullif(pg_catalog.btrim(coalesce(p_kontragent,'')), ''); v_manba text; v_hash text;
  v_mavjud public.t2_sklad_harakat%ROWTYPE; v_qoldiq numeric; v_id bigint; v_qrole text;
BEGIN
  IF p_operation_id IS NULL OR v_nomi IS NULL OR v_birligi IS NULL OR p_miqdor IS NULL OR p_operatsiya NOT IN ('prixod','rasxod') THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'REQUIRED_FIELD');
  END IF;
  IF p_miqdor <= 0 OR p_miqdor > 1000000000 OR pg_catalog.length(v_nomi) > 500 OR pg_catalog.length(v_birligi) > 100
     OR pg_catalog.length(coalesce(v_kont,'')) > 500 OR pg_catalog.length(coalesce(p_izoh,'')) > 1000 THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'INVALID_INPUT');
  END IF;
  IF v_sana > (pg_catalog.now() AT TIME ZONE 'Asia/Tashkent')::date + 1 THEN RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'DATE_IN_FUTURE'); END IF;
  v_k := public.t2_ombor_kirish_v1(p_actor_id, p_kompaniya_id, p_sklad_id, true);
  IF v_k <> 'OK' THEN RETURN pg_catalog.jsonb_build_object('ok', false, 'code', v_k); END IF;
  IF p_obyekt_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.t2_obyekt o WHERE o.id = p_obyekt_id AND o.kompaniya_id = p_kompaniya_id) THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'OBJECT_SCOPE_MISMATCH');
  END IF;
  v_manba := CASE p_operatsiya WHEN 'prixod' THEN 'ombor_prixod_v1' ELSE 'ombor_chiqim_v1' END;
  v_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_object(
    'a', p_actor_id, 'k', p_kompaniya_id, 's', p_sklad_id, 'o', p_operatsiya, 'n', v_nomi, 'b', v_birligi, 'm', p_miqdor::text, 'd', v_sana,
    'c', v_kont, 't', p_tur, 'i', p_izoh, 'f', p_sf, 'y', p_obyekt_id, 'q', p_qabul_turi)::text, 'UTF8')), 'hex');
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ombor:' || p_kompaniya_id::text || ':' || p_sklad_id::text, 0));
  SELECT h.* INTO v_mavjud FROM public.t2_sklad_harakat h
   WHERE h.kompaniya_id = p_kompaniya_id AND h.c11_operation_id = p_operation_id AND h.manba = v_manba LIMIT 1;
  IF FOUND THEN
    IF v_mavjud.c11_request_hash IS DISTINCT FROM v_hash THEN RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'OPERATION_ID_CONFLICT'); END IF;
    RETURN pg_catalog.jsonb_build_object('ok', true, 'takror', true, 'harakat_id', v_mavjud.id);
  END IF;
  v_qoldiq := public.t2_ombor_guruh_qoldiq_v1(p_kompaniya_id, p_sklad_id, v_nomi, v_birligi);
  IF p_operatsiya = 'rasxod' AND v_qoldiq - p_miqdor < 0 AND NOT coalesce(p_manfiy_ruxsat, false) THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'QOLDIQ_YETMAYDI', 'qoldiq', v_qoldiq, 'so_ralgan', p_miqdor);
  END IF;
  INSERT INTO public.t2_sklad_harakat (
    kompaniya_id, obyekt_id, operatsiya, turi, sana, nomi, birligi, obyomi, postavshik, qabul_qiluvchi, qabul_turi, izoh, holat, manba, kim,
    c11_sklad_id, c11_operation_id, c11_request_hash, c11_actor_id, c11_manba_turi, c11_sf_tasdiq, c11_hedef_obyekt_id
  ) VALUES (
    p_kompaniya_id, NULL, p_operatsiya, 'mat', v_sana, v_nomi, v_birligi, p_miqdor,
    CASE WHEN p_operatsiya = 'prixod' THEN v_kont END, CASE WHEN p_operatsiya = 'rasxod' THEN v_kont END,
    nullif(pg_catalog.btrim(coalesce(p_qabul_turi,'')), ''), nullif(pg_catalog.btrim(coalesce(p_izoh,'')), ''), 'faol', v_manba, 'actor:' || p_actor_id::text,
    p_sklad_id, p_operation_id, v_hash, p_actor_id, nullif(pg_catalog.btrim(coalesce(p_tur,'')), ''), nullif(pg_catalog.btrim(coalesce(p_sf,'')), ''), p_obyekt_id
  ) RETURNING id INTO v_id;
  PERFORM public.t2_audit_yoz(p_kompaniya_id, 'ombor_' || p_operatsiya || '_yozildi', 'sklad', NULL::bigint,
    pg_catalog.format('sklad_id=' || p_sklad_id::text || '; ' || 'harakat_id=%s; miqdor=%s; birlik=%s; operation_id=%s', v_id, p_miqdor, v_birligi, p_operation_id),
    'actor:' || p_actor_id::text, NULL);
  RETURN pg_catalog.jsonb_build_object('ok', true, 'takror', false, 'harakat_id', v_id, 'qoldiq_keyin',
    CASE WHEN p_operatsiya = 'prixod' THEN v_qoldiq + p_miqdor ELSE v_qoldiq - p_miqdor END);
END
$function$;

CREATE OR REPLACE FUNCTION public.t2_ombor_prixod_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_sklad_id bigint, p_nomi text, p_birligi text, p_miqdor numeric, p_sana date,
  p_postavshik text, p_tur text, p_izoh text, p_sf text, p_operation_id uuid
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT public.t2_ombor_yozuv_v1(p_actor_id, p_kompaniya_id, p_sklad_id, 'prixod', p_nomi, p_birligi, p_miqdor, p_sana,
    p_postavshik, p_tur, p_izoh, p_sf, NULL, NULL, p_operation_id, false);
$function$;

CREATE OR REPLACE FUNCTION public.t2_ombor_chiqim_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_sklad_id bigint, p_nomi text, p_birligi text, p_miqdor numeric, p_sana date,
  p_qabul_qiluvchi text, p_qabul_turi text, p_obyekt_id bigint, p_izoh text, p_operation_id uuid, p_manfiy_ruxsat boolean DEFAULT false
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT public.t2_ombor_yozuv_v1(p_actor_id, p_kompaniya_id, p_sklad_id, 'rasxod', p_nomi, p_birligi, p_miqdor, p_sana,
    p_qabul_qiluvchi, NULL, p_izoh, NULL, p_obyekt_id, p_qabul_turi, p_operation_id, p_manfiy_ruxsat);
$function$;

-- ═══ 7. Tuzatish: aniq yozuvga havola. p_yangi {miqdor, sana, nomi, birligi, kontragent, izoh} (null/{} = faqat bekor) ═══
CREATE OR REPLACE FUNCTION public.t2_ombor_tuzat_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_sklad_id bigint, p_harakat_id bigint, p_yangi jsonb, p_sabab text, p_operation_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_k text; o public.t2_sklad_harakat%ROWTYPE; v_y jsonb := coalesce(p_yangi, '{}'::jsonb); v_sabab text := nullif(pg_catalog.btrim(coalesce(p_sabab,'')), '');
  v_mavjud bigint; v_manba text; v_nomi text; v_birligi text; v_miqdor numeric; v_sana date; v_kont text; v_izoh text; v_qold numeric;
  v_teskari bigint; v_yangi bigint; v_hash text; v_yangimi boolean; v_pre numeric;
BEGIN
  IF p_harakat_id IS NULL OR p_operation_id IS NULL OR v_sabab IS NULL OR pg_catalog.length(v_sabab) > 500
     OR pg_catalog.jsonb_typeof(v_y) <> 'object' THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'REQUIRED_FIELD');
  END IF;
  v_k := public.t2_ombor_kirish_v1(p_actor_id, p_kompaniya_id, p_sklad_id, true);
  IF v_k <> 'OK' THEN RETURN pg_catalog.jsonb_build_object('ok', false, 'code', v_k); END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ombor:' || p_kompaniya_id::text || ':' || p_sklad_id::text, 0));
  SELECT h.id INTO v_mavjud FROM public.t2_sklad_harakat h
   WHERE h.kompaniya_id = p_kompaniya_id AND h.c11_operation_id = p_operation_id AND h.manba = 'ombor_tuzat_storno_v1' LIMIT 1;
  IF FOUND THEN RETURN pg_catalog.jsonb_build_object('ok', true, 'takror', true, 'teskari_id', v_mavjud); END IF;
  SELECT h.* INTO o FROM public.t2_sklad_harakat h
   WHERE h.id = p_harakat_id AND h.kompaniya_id = p_kompaniya_id AND h.c11_sklad_id = p_sklad_id AND h.holat = 'faol';
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'MOVEMENT_NOT_FOUND'); END IF;
  IF o.manba NOT IN ('ombor_prixod_v1', 'ombor_chiqim_v1', 'ombor_prixod_sinxron_v1', 'c11_warehouse_receipt_v1') THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'MOVEMENT_NOT_CORRECTABLE', 'manba', o.manba);
  END IF;
  IF EXISTS (SELECT 1 FROM public.t2_sklad_harakat r WHERE r.kompaniya_id = p_kompaniya_id AND r.c11_juft_id = o.id AND r.manba = 'ombor_tuzat_storno_v1')
     OR EXISTS (SELECT 1 FROM public.t2_sklad_harakat r WHERE r.kompaniya_id = p_kompaniya_id AND r.c11_storno_of_id = o.id) THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'ALREADY_REVERSED');
  END IF;
  v_yangimi := v_y <> '{}'::jsonb;
  v_nomi := coalesce(nullif(pg_catalog.btrim(coalesce(v_y->>'nomi','')), ''), o.nomi);
  v_birligi := coalesce(nullif(pg_catalog.btrim(coalesce(v_y->>'birligi','')), ''), o.birligi);
  v_kont := coalesce(nullif(pg_catalog.btrim(coalesce(v_y->>'kontragent','')), ''), CASE o.operatsiya WHEN 'prixod' THEN o.postavshik ELSE o.qabul_qiluvchi END);
  v_izoh := coalesce(nullif(pg_catalog.btrim(coalesce(v_y->>'izoh','')), ''), o.izoh);
  BEGIN
    v_miqdor := coalesce(nullif(v_y->>'miqdor','')::numeric, o.obyomi);
    v_sana := coalesce(nullif(v_y->>'sana','')::date, o.sana);
  EXCEPTION WHEN OTHERS THEN RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'INVALID_INPUT'); END;
  IF v_miqdor <= 0 OR v_miqdor > 1000000000 OR pg_catalog.length(v_nomi) > 500 OR pg_catalog.length(v_birligi) > 100 THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'INVALID_INPUT');
  END IF;
  v_pre := public.t2_ombor_guruh_qoldiq_v1(p_kompaniya_id, p_sklad_id, o.nomi, o.birligi);
  -- Teskari yozuv: asl yozuvning ta'sirini bekor qiladi (qarama-qarshi yo'nalish).
  v_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_object(
    'a', p_actor_id, 'h', p_harakat_id, 'y', v_y, 's', v_sabab)::text, 'UTF8')), 'hex');
  INSERT INTO public.t2_sklad_harakat (kompaniya_id, obyekt_id, operatsiya, turi, sana, nomi, birligi, obyomi, postavshik, qabul_qiluvchi, izoh,
      holat, manba, kim, c11_sklad_id, c11_operation_id, c11_request_hash, c11_actor_id, c11_juft_id, c11_manba_turi)
  VALUES (p_kompaniya_id, NULL, CASE o.operatsiya WHEN 'prixod' THEN 'rasxod' ELSE 'prixod' END, 'mat', o.sana, o.nomi, o.birligi, o.obyomi,
      NULL, NULL, 'Tuzatish #' || o.id::text || ': ' || v_sabab, 'faol', 'ombor_tuzat_storno_v1', 'actor:' || p_actor_id::text,
      p_sklad_id, p_operation_id, v_hash, p_actor_id, o.id, o.c11_manba_turi)
  RETURNING id INTO v_teskari;
  IF v_yangimi THEN
    INSERT INTO public.t2_sklad_harakat (kompaniya_id, obyekt_id, operatsiya, turi, sana, nomi, birligi, obyomi, postavshik, qabul_qiluvchi, qabul_turi, izoh,
        holat, manba, kim, c11_sklad_id, c11_operation_id, c11_request_hash, c11_actor_id, c11_juft_id, c11_manba_turi, c11_sf_tasdiq, c11_hedef_obyekt_id)
    VALUES (p_kompaniya_id, NULL, o.operatsiya, 'mat', v_sana, v_nomi, v_birligi, v_miqdor,
        CASE o.operatsiya WHEN 'prixod' THEN v_kont END, CASE o.operatsiya WHEN 'rasxod' THEN v_kont END, o.qabul_turi, v_izoh, 'faol',
        CASE o.operatsiya WHEN 'prixod' THEN 'ombor_prixod_v1' ELSE 'ombor_chiqim_v1' END, 'actor:' || p_actor_id::text,
        p_sklad_id, p_operation_id, v_hash, p_actor_id, o.id, o.c11_manba_turi, o.c11_sf_tasdiq, o.c11_hedef_obyekt_id)
    RETURNING id INTO v_yangi;
  END IF;
  -- Natijada ostatka manfiyga tushmasin (tuzatishdan oldin ham manfiy bo'lsa — yomonlashmasligi yetarli).
  v_qold := public.t2_ombor_guruh_qoldiq_v1(p_kompaniya_id, p_sklad_id, o.nomi, o.birligi);
  IF v_qold < 0 AND v_qold < v_pre THEN
    RAISE EXCEPTION 'QOLDIQ_YETMAYDI' USING errcode = 'P0001', detail = v_qold::text;
  END IF;
  PERFORM public.t2_audit_yoz(p_kompaniya_id, 'ombor_tuzatildi', 'sklad', NULL::bigint,
    pg_catalog.format('sklad_id=' || p_sklad_id::text || '; ' || 'harakat_id=%s; teskari=%s; yangi=%s; sabab=%s; operation_id=%s', o.id, v_teskari, coalesce(v_yangi::text, '-'), v_sabab, p_operation_id),
    'actor:' || p_actor_id::text, NULL);
  RETURN pg_catalog.jsonb_build_object('ok', true, 'takror', false, 'teskari_id', v_teskari, 'yangi_id', v_yangi, 'qoldiq_keyin', v_qold);
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  IF SQLERRM = 'QOLDIQ_YETMAYDI' THEN RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'QOLDIQ_YETMAYDI'); END IF;
  RAISE;
END
$function$;

-- ═══ 8. Variantlarni tasdiqlash (mavjud t2_material_alias ga yozadi; faqat egasi/omborchi tasdig'idan keyin) ═══
CREATE OR REPLACE FUNCTION public.t2_ombor_alias_tasdiq_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_sklad_id bigint, p_kanonik_nom text, p_variantlar jsonb, p_operation_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_k text; v_v text; v_son integer := 0; v_kan text := nullif(pg_catalog.btrim(coalesce(p_kanonik_nom,'')), '');
BEGIN
  v_k := public.t2_ombor_kirish_v1(p_actor_id, p_kompaniya_id, p_sklad_id, true);
  IF v_k <> 'OK' THEN RETURN pg_catalog.jsonb_build_object('ok', false, 'code', v_k); END IF;
  IF v_kan IS NULL OR p_operation_id IS NULL OR pg_catalog.jsonb_typeof(p_variantlar) IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_array_length(p_variantlar) NOT BETWEEN 1 AND 200 THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'REQUIRED_FIELD');
  END IF;
  FOR v_v IN SELECT e FROM pg_catalog.jsonb_array_elements_text(p_variantlar) AS e LOOP
    CONTINUE WHEN nullif(pg_catalog.btrim(v_v), '') IS NULL OR pg_catalog.upper(pg_catalog.btrim(v_v)) = pg_catalog.upper(v_kan);
    PERFORM public.t2_material_alias_yoz(pg_catalog.btrim(v_v), v_kan, NULL, p_kompaniya_id);
    v_son := v_son + 1;
  END LOOP;
  -- kanonik nomning o'zi ham o'ziga alias (guruh kaliti kanonik nomdan olinadi)
  PERFORM public.t2_material_alias_yoz(v_kan, v_kan, NULL, p_kompaniya_id);
  PERFORM public.t2_audit_yoz(p_kompaniya_id, 'ombor_alias_tasdiqlandi', 'sklad', NULL::bigint,
    pg_catalog.format('sklad_id=' || p_sklad_id::text || '; ' || 'kanonik_uzunlik=%s; variantlar=%s; operation_id=%s', pg_catalog.length(v_kan), v_son, p_operation_id), 'actor:' || p_actor_id::text, NULL);
  RETURN pg_catalog.jsonb_build_object('ok', true, 'variantlar', v_son);
END
$function$;

-- ═══ 9. «Приход» ni idempotent sinxronlash (mazmun kaliti: sana|nom|birlik|miqdor; ketma-ket raqam `ord`) ═══
-- Mavjud sheet-yozuvlar (c11_warehouse_receipt_v1 + ombor_prixod_sinxron_v1) soni ord dan kam bo'lsagina yangisi qo'shiladi:
-- qayta ishga tushirish takror yaratmaydi; sheet qatorlari siljisa ham buzilmaydi. DB da ortiqcha qolganlar — kalitlar RPC orqali hisobot.
CREATE OR REPLACE FUNCTION public.t2_ombor_prixod_kalitlar_v1(p_actor_id bigint, p_kompaniya_id bigint, p_sklad_id bigint)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_k text;
BEGIN
  v_k := public.t2_ombor_kirish_v1(p_actor_id, p_kompaniya_id, p_sklad_id, false);
  IF v_k <> 'OK' THEN RETURN pg_catalog.jsonb_build_object('ok', false, 'code', v_k); END IF;
  RETURN pg_catalog.jsonb_build_object('ok', true, 'kalitlar', coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('k', x.k, 'n', x.n)) FROM (
    SELECT h.sana::text || '|' || pg_catalog.btrim(h.nomi) || '|' || pg_catalog.btrim(h.birligi) || '|' || pg_catalog.trim_scale(pg_catalog.round(h.obyomi, 4))::text AS k, count(*) AS n
      FROM public.t2_sklad_harakat h
     WHERE h.kompaniya_id = p_kompaniya_id AND h.c11_sklad_id = p_sklad_id AND h.holat = 'faol'
       AND h.manba IN ('c11_warehouse_receipt_v1', 'ombor_prixod_sinxron_v1')
     GROUP BY 1) x), '[]'::jsonb));
END
$function$;

CREATE OR REPLACE FUNCTION public.t2_ombor_prixod_sinxron_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_sklad_id bigint, p_qatorlar jsonb, p_operation_id uuid, p_dry_run boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_k text; e jsonb; v_sana date; v_nomi text; v_birligi text; v_miqdor numeric; v_ord integer; v_row integer; v_mavjud integer;
  v_yangi integer := 0; v_bor integer := 0; v_hash text; v_xato jsonb := '[]'::jsonb; v_post text;
BEGIN
  v_k := public.t2_ombor_kirish_v1(p_actor_id, p_kompaniya_id, p_sklad_id, true);
  IF v_k <> 'OK' THEN RETURN pg_catalog.jsonb_build_object('ok', false, 'code', v_k); END IF;
  IF p_operation_id IS NULL OR pg_catalog.jsonb_typeof(p_qatorlar) IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_array_length(p_qatorlar) NOT BETWEEN 1 AND 1000 THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'BATCH_INVALID', 'max_rows', 1000);
  END IF;
  v_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_qatorlar::text, 'UTF8')), 'hex');
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ombor:' || p_kompaniya_id::text || ':' || p_sklad_id::text, 0));
  FOR e IN SELECT x FROM pg_catalog.jsonb_array_elements(p_qatorlar) AS x ORDER BY (x->>'row')::integer NULLS LAST, (x->>'ord')::integer LOOP
    BEGIN
      v_row := (e->>'row')::integer; v_ord := coalesce((e->>'ord')::integer, 1);
      v_sana := (e->>'sana')::date; v_nomi := pg_catalog.btrim(e->>'nomi'); v_birligi := pg_catalog.btrim(e->>'birligi');
      v_miqdor := pg_catalog.round((e->>'obyomi')::numeric, 4);
      IF v_row < 1 OR v_ord < 1 OR v_nomi IS NULL OR v_nomi = '' OR v_birligi IS NULL OR v_birligi = '' OR v_miqdor <= 0
         OR pg_catalog.length(v_nomi) > 500 OR pg_catalog.length(v_birligi) > 100 THEN RAISE EXCEPTION 'SOURCE_ROW_INVALID'; END IF;
    EXCEPTION WHEN OTHERS THEN
      v_xato := v_xato || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('row', e->>'row', 'code', 'SOURCE_ROW_INVALID'));
      CONTINUE;
    END;
    SELECT count(*) INTO v_mavjud FROM public.t2_sklad_harakat h
     WHERE h.kompaniya_id = p_kompaniya_id AND h.c11_sklad_id = p_sklad_id AND h.holat = 'faol' AND h.sana = v_sana
       AND pg_catalog.btrim(h.nomi) = v_nomi AND pg_catalog.btrim(h.birligi) = v_birligi AND pg_catalog.round(h.obyomi, 4) = v_miqdor
       AND h.manba IN ('c11_warehouse_receipt_v1', 'ombor_prixod_sinxron_v1');
    IF v_mavjud >= v_ord THEN v_bor := v_bor + 1; CONTINUE; END IF;
    v_yangi := v_yangi + 1;
    IF NOT p_dry_run THEN
      v_post := nullif(pg_catalog.btrim(coalesce(e->>'postavshik','')), '');
      INSERT INTO public.t2_sklad_harakat (kompaniya_id, obyekt_id, operatsiya, turi, sana, nomi, birligi, obyomi, postavshik, holat, manba, kim,
          c11_sklad_id, c11_source_sheet, c11_source_row, c11_operation_id, c11_request_hash, c11_actor_id, c11_manba_turi, c11_sf_tasdiq)
      VALUES (p_kompaniya_id, NULL, 'prixod', 'mat', v_sana, v_nomi, v_birligi, v_miqdor, v_post, 'faol', 'ombor_prixod_sinxron_v1', 'actor:' || p_actor_id::text,
          p_sklad_id, 'Приход', v_row, p_operation_id, v_hash, p_actor_id, nullif(pg_catalog.btrim(coalesce(e->>'tur','')), ''), nullif(pg_catalog.btrim(coalesce(e->>'sf','')), ''));
    END IF;
  END LOOP;
  IF pg_catalog.jsonb_array_length(v_xato) > 0 AND NOT p_dry_run THEN
    RAISE EXCEPTION 'SOURCE_ROW_INVALID' USING errcode = 'P0001', detail = v_xato::text;
  END IF;
  IF NOT p_dry_run AND v_yangi > 0 THEN
    PERFORM public.t2_audit_yoz(p_kompaniya_id, 'ombor_prixod_sinxronlandi', 'sklad', NULL::bigint,
      pg_catalog.format('sklad_id=' || p_sklad_id::text || '; ' || 'yangi=%s; mavjud=%s; operation_id=%s', v_yangi, v_bor, p_operation_id), 'actor:' || p_actor_id::text, NULL);
  END IF;
  RETURN pg_catalog.jsonb_build_object('ok', true, 'dry_run', p_dry_run, 'yangi', v_yangi, 'mavjud', v_bor, 'xato', v_xato);
END
$function$;

-- ═══ 10. Ruxsatlar: faqat service_role (gateway orqali; a'zolik/ruxsat RPC ichida tekshiriladi) ═══
DO $g$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_catalog.pg_proc p
            WHERE p.pronamespace = 'public'::regnamespace
              AND p.proname IN ('t2_ombor_kalit_v1','t2_ombor_birlik_v1','t2_ombor_moslik_v1','t2_ombor_guruh_kaliti_v1','t2_ombor_kirish_v1',
                't2_ombor_qoldiq_v2','t2_ombor_tarix_v1','t2_ombor_harakat_royxat_v1','t2_ombor_guruh_qoldiq_v1','t2_ombor_yozuv_v1','t2_ombor_prixod_v1',
                't2_ombor_chiqim_v1','t2_ombor_tuzat_v1','t2_ombor_alias_tasdiq_v1','t2_ombor_prixod_kalitlar_v1','t2_ombor_prixod_sinxron_v1')
  LOOP
    EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE pg_catalog.format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END
$g$;
