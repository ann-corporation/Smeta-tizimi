-- ROLLBACK 20261111600000_t2_mindmap_grafi_v3: joriy (v2 kontrakt) tanalarini tiklaydi.
-- Manba: 20260830020000_t2_mindmap_grafi_contract.sql va 20260829051320_t2_mindmap_command_contract_hardening.sql.

CREATE OR REPLACE FUNCTION public.t2_mindmap_grafi(p_kompaniya_id bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
WITH
/* ── Obyekt bo'yicha o'lchovlar (bir marta hisoblanadi) ── */
ob_olchov AS (
  SELECT o.id,
         (SELECT sum(q.summa) FROM t2_qator q
           WHERE q.obyekt_id = o.id AND q.tur = 'rz')                      AS smeta,
         (SELECT count(*) FROM t2_qator q
           WHERE q.obyekt_id = o.id AND q.tur IN ('rs','mat','ob'))        AS resurs,
         (SELECT count(*) FROM t2_qator q
           WHERE q.obyekt_id = o.id AND q.tur IN ('rs','mat','ob')
             AND q.narx IS NULL)                                           AS narxsiz,
         (SELECT coalesce(sum(aq.summa),0) FROM t2_akt_qator aq
            JOIN t2_akt a ON a.id = aq.akt_id AND a.holat <> 'bekor'
           WHERE aq.obyekt_id = o.id AND a.tur = 'fakt')                   AS fakt,
         (SELECT coalesce(sum(aq.summa),0) FROM t2_akt_qator aq
            JOIN t2_akt a ON a.id = aq.akt_id AND a.holat <> 'bekor'
           WHERE aq.obyekt_id = o.id AND a.tur = 'f2')                     AS f2,
         (SELECT count(*) FROM t2_erp_taminot z
           WHERE z.obyekt_id = o.id AND z.status IN ('submitted','approved','procurement','ordered','partially_delivered'))            AS zayavka,
         (SELECT k.holat FROM t2_kozgu k WHERE k.obyekt_id = o.id)         AS kozgu
    FROM t2_obyekt o
   WHERE o.kompaniya_id = p_kompaniya_id AND o.holat <> 'bekor'
),
t AS (
      SELECT 'kompaniya:' || k.id AS id, 'kompaniya' AS tur, k.nom, NULL::jsonb AS meta
        FROM t2_kompaniya k WHERE k.id = p_kompaniya_id
      UNION ALL
      /* LOYIHA: ostidagi obyektlar jamlanmasi — rahbar loyiha darajasida ham ko'rsin */
      SELECT 'loyiha:' || l.id, 'loyiha', l.nom,
             jsonb_build_object(
               'byudjet', l.byudjet, 'holat', l.holat, 'versiya', l.versiya,
               'obyekt_soni', (SELECT count(*) FROM t2_obyekt o2
                                WHERE o2.loyiha_id = l.id AND o2.holat <> 'bekor'),
               'smeta_jami',  (SELECT sum(x.smeta) FROM ob_olchov x
                                JOIN t2_obyekt o3 ON o3.id = x.id
                               WHERE o3.loyiha_id = l.id),
               'zayavka',     (SELECT coalesce(sum(x.zayavka),0) FROM ob_olchov x
                                JOIN t2_obyekt o4 ON o4.id = x.id
                               WHERE o4.loyiha_id = l.id),
               'belgi', (
                 SELECT coalesce(jsonb_agg(b), '[]'::jsonb) FROM (
                   SELECT jsonb_build_object('tur','zayavka','daraja','info',
                            'soni', z.n, 'matn', z.n || ' ta zayavka kutilmoqda') AS b
                     FROM (SELECT coalesce(sum(x.zayavka),0) n FROM ob_olchov x
                             JOIN t2_obyekt o5 ON o5.id = x.id
                            WHERE o5.loyiha_id = l.id) z
                    WHERE z.n > 0
                 ) q))
        FROM t2_loyiha l WHERE l.kompaniya_id = p_kompaniya_id AND l.holat <> 'bekor'
      UNION ALL
      /* OBYEKT: to'liq holat + belgilar */
      SELECT 'obyekt:' || o.id, 'obyekt', o.nom,
             jsonb_build_object(
               'lat', o.lat, 'lng', o.lng, 'versiya', o.versiya, 'loyiha_id', o.loyiha_id,
               'smeta', m.smeta,
               'resurs_qatori', m.resurs,
               'narxsiz', m.narxsiz,
               'toliq', (m.narxsiz = 0 AND m.resurs > 0),
               'fakt', m.fakt,
               'f2', m.f2,
               /* Foiz faqat smeta > 0 bo'lsa — yolg'on «0%» ko'rsatilmaydi */
               'fakt_foiz', CASE WHEN m.smeta > 0 THEN round(m.fakt / m.smeta * 100, 1) END,
               'f2_foiz',   CASE WHEN m.smeta > 0 THEN round(m.f2   / m.smeta * 100, 1) END,
               'zayavka', m.zayavka, 'signal_count', COALESCE((SELECT s.signal_count FROM public.t2_mindmap_signal_summary s WHERE s.kompaniya_id=p_kompaniya_id AND s.obyekt_id=(o.id)::text),0), 'critical_count', COALESCE((SELECT s.critical_count FROM public.t2_mindmap_signal_summary s WHERE s.kompaniya_id=p_kompaniya_id AND s.obyekt_id=(o.id)::text),0),
               'kozgu', m.kozgu,
               'belgi', (
                 SELECT coalesce(jsonb_agg(b ORDER BY t_), '[]'::jsonb) FROM (
                   SELECT 1 t_, jsonb_build_object('tur','zayavka','daraja','info',
                            'soni', m.zayavka,
                            'matn', m.zayavka || ' ta zayavka kutilmoqda') b
                    WHERE m.zayavka > 0
                   UNION ALL
                   SELECT 2, jsonb_build_object('tur','narx_yoq','daraja','ogoh',
                            'soni', m.narxsiz,
                            'matn', m.narxsiz || ' qatorda narx yo''q — jami to''liq emas')
                    WHERE m.narxsiz > 0
                   UNION ALL
                   SELECT 3, jsonb_build_object('tur','kozgu','daraja','ogoh',
                            'matn','Sheets ko''zgusi bazadan orqada')
                    WHERE m.kozgu = 'farqli'
                   UNION ALL
                   SELECT 4, jsonb_build_object('tur','smeta_yoq','daraja','ogoh',
                            'matn','Smeta yuklanmagan')
                    WHERE m.resurs = 0
                 ) q))
        FROM t2_obyekt o
        JOIN ob_olchov m ON m.id = o.id
       WHERE o.kompaniya_id = p_kompaniya_id AND o.holat <> 'bekor'
      UNION ALL
      SELECT 'shartnoma:' || s.id, 'shartnoma', COALESCE(NULLIF(s.raqam,''), s.nom, 'Shartnoma'),
             jsonb_build_object('nom', s.nom, 'taraf', s.taraf, 'summa', s.jami_nds_bilan, 'versiya', s.versiya)
        FROM t2_shartnoma s WHERE s.kompaniya_id = p_kompaniya_id AND s.holat <> 'bekor'
      UNION ALL
      SELECT 'sklad:' || sm.id, 'sklad', sm.nomi,
             jsonb_build_object('manzil', sm.manzil, 'masul', sm.masul_shaxs, 'versiya', sm.versiya,
               'obyekt_soni', (SELECT count(*) FROM t2_sklad_bog sb
                                WHERE sb.sklad_id = sm.id AND sb.holat = 'faol'))
        FROM t2_sklad_mustaqil sm WHERE sm.kompaniya_id = p_kompaniya_id AND sm.holat = 'faol'
      UNION ALL
      SELECT 'texnika:' || tx.id, 'texnika', tx.nomi,
             jsonb_build_object('davlat_raqami', tx.davlat_raqami, 'versiya', tx.versiya)
        FROM t2_texnika_mustaqil tx WHERE tx.kompaniya_id = p_kompaniya_id AND tx.holat = 'faol'
      UNION ALL
      SELECT 'kadr:' || kd.id, 'kadr', kd.ism_sharif,
             jsonb_build_object('lavozim', kd.lavozim, 'versiya', kd.versiya)
        FROM t2_kadr_mustaqil kd WHERE kd.kompaniya_id = p_kompaniya_id AND kd.holat = 'faol'
      UNION ALL
      SELECT 'kontragent:' || kn.id, 'kontragent', kn.nom,
             jsonb_build_object('inn', kn.inn, 'mavqe', kn.mavqe, 'versiya', kn.versiya)
        FROM t2_kontragent kn WHERE kn.kompaniya_id = p_kompaniya_id AND kn.holat = 'faol'
)
SELECT jsonb_build_object(
  'tugunlar', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', t.id, 'tur', t.tur, 'nom', t.nom, 'meta', t.meta,
      'x', j.x, 'y', j.y          -- NULL bo'lsa frontend avtomatik joylaydi
    ))
    FROM t LEFT JOIN t2_mindmap_joylashuv j
      ON j.kompaniya_id = p_kompaniya_id AND j.tugun_id = t.id
  ), '[]'::jsonb),
  /* Butun tashkilot bo'yicha jamlanma — rahbar birinchi qarashda ko'rsin */
  'jamlanma', (
    SELECT jsonb_build_object(
      'obyekt_soni', count(*),
      'smeta_jami', sum(smeta),
      'fakt_jami', sum(fakt),
      'f2_jami', sum(f2),
      'zayavka_kutilmoqda', sum(zayavka),
      'narxsiz_obyekt', count(*) FILTER (WHERE narxsiz > 0),
      'smetasiz_obyekt', count(*) FILTER (WHERE resurs = 0),
      'kozgu_eskirgan', count(*) FILTER (WHERE kozgu = 'farqli'))
    FROM ob_olchov),
  'bogichlar', COALESCE((
    SELECT jsonb_agg(b) FROM (
      SELECT 'kompaniya:' || l.kompaniya_id AS manba, 'loyiha:' || l.id AS maqsad,
             'loyiha_kompaniya' AS tur, false AS uzsa_boladi
        FROM t2_loyiha l WHERE l.kompaniya_id = p_kompaniya_id AND l.holat <> 'bekor'
      UNION ALL
      SELECT 'loyiha:' || o.loyiha_id, 'obyekt:' || o.id, 'obyekt_loyiha', true
        FROM t2_obyekt o WHERE o.kompaniya_id = p_kompaniya_id AND o.holat <> 'bekor' AND o.loyiha_id IS NOT NULL
      UNION ALL
      SELECT 'loyiha:' || s.loyiha_id, 'shartnoma:' || s.id, 'shartnoma_loyiha', true
        FROM t2_shartnoma s WHERE s.kompaniya_id = p_kompaniya_id AND s.holat <> 'bekor' AND s.loyiha_id IS NOT NULL
      UNION ALL
      SELECT 'shartnoma:' || sb.shartnoma_id, 'obyekt:' || sb.obyekt_id, 'shartnoma_obyekt', true
        FROM t2_shartnoma_bog sb
        JOIN t2_obyekt o ON o.id = sb.obyekt_id AND o.kompaniya_id = p_kompaniya_id
        WHERE sb.holat = 'faol'
      UNION ALL
      SELECT 'sklad:' || sb.sklad_id, 'obyekt:' || sb.obyekt_id, 'sklad_obyekt', true
        FROM t2_sklad_bog sb
        JOIN t2_obyekt o ON o.id = sb.obyekt_id AND o.kompaniya_id = p_kompaniya_id
        WHERE sb.holat = 'faol'
      UNION ALL
      SELECT 'texnika:' || tb.texnika_id, 'obyekt:' || tb.obyekt_id, 'texnika_obyekt', true
        FROM t2_texnika_bog tb
        JOIN t2_obyekt o ON o.id = tb.obyekt_id AND o.kompaniya_id = p_kompaniya_id
        WHERE tb.holat = 'faol'
      UNION ALL
      SELECT 'kadr:' || kb.kadr_id, 'obyekt:' || kb.obyekt_id, 'kadr_obyekt', true
        FROM t2_kadr_bog kb
        JOIN t2_obyekt o ON o.id = kb.obyekt_id AND o.kompaniya_id = p_kompaniya_id
        WHERE kb.holat = 'faol'
      UNION ALL
      SELECT 'kontragent:' || q.kontragent_id, 'loyiha:' || q.loyiha_id, 'qatnashchi', true
        FROM t2_loyiha_qatnashchi q
        JOIN t2_loyiha l ON l.id = q.loyiha_id AND l.kompaniya_id = p_kompaniya_id
        WHERE q.holat = 'faol' AND q.kontragent_id IS NOT NULL
    ) b), '[]'::jsonb)
);
$function$;

create or replace function public.t2_mindmap_joylashuv_saqla_v2(
  p_kompaniya_id bigint, p_actor_id bigint, p_joylar jsonb, p_operation_id uuid,
  p_actor_label text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $function$
declare v_rol text; v_old jsonb; v_j jsonb; v_result jsonb; v_node text;
begin
  v_rol:=t2_mindmap_actor_tekshir(p_kompaniya_id,p_actor_id);
  if jsonb_typeof(p_joylar)<>'array' or jsonb_array_length(p_joylar)=0 or jsonb_array_length(p_joylar)>500 then raise exception 'joylar 1..500 elementli massiv bolishi kerak' using errcode='22023'; end if;
  v_old:=t2_mindmap_command_boshlash(p_kompaniya_id,p_operation_id,'joylashuv',p_actor_id,jsonb_build_object('joylar',p_joylar));
  if v_old is not null then return v_old; end if;
  for v_j in select value from jsonb_array_elements(p_joylar) loop
    v_node:=v_j->>'tugun_id';
    if v_node !~ '^(kompaniya|loyiha|obyekt|shartnoma|sklad|texnika|kadr|kontragent):[0-9]+$'
       or jsonb_typeof(v_j->'x') not in ('number') or jsonb_typeof(v_j->'y') not in ('number') then
      raise exception 'joylashuv elementi yaroqsiz' using errcode='22023';
    end if;
    if not exists(select 1 from jsonb_array_elements(t2_mindmap_grafi(p_kompaniya_id)->'tugunlar') n where n->>'id'=v_node) then
      raise exception 'tugun boshqa tenantga tegishli yoki mavjud emas: %',v_node using errcode='42501';
    end if;
  end loop;
  insert into t2_mindmap_joylashuv(kompaniya_id,tugun_id,x,y)
    select p_kompaniya_id,j->>'tugun_id',(j->>'x')::numeric,(j->>'y')::numeric from jsonb_array_elements(p_joylar) j
  on conflict(kompaniya_id,tugun_id) do update set x=excluded.x,y=excluded.y,yangilandi=now();
  perform t2_audit_yoz(p_kompaniya_id,'mindmap_joylashuv','mindmap',null,format('actor_id=%s; rol=%s; count=%s',p_actor_id,v_rol,jsonb_array_length(p_joylar)),coalesce(p_actor_label,'actor:'||p_actor_id),null);
  v_result:=jsonb_build_object('ok',true,'saqlandi',jsonb_array_length(p_joylar));
  return t2_mindmap_command_yakunla(p_kompaniya_id,p_operation_id,v_result);
end;
$function$;
