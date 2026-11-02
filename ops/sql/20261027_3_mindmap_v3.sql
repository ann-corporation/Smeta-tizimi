-- 3/4: Mindmap v3 (F2 faqat tasdiqlangan, signallar, shartnoma ma'lumoti). Migratsiya 20261111600000.
set lock_timeout = '15s';
begin;
-- T2 mindmap grafi v3 (PHASE 1 — ishonchli signal/asos):
--  1) f2 = faqat tasdiqlangan akt; f2_qoralama alohida;
--  2) qatnashchi chiziqlari `rol` va `id` bilan (uzish uchun);
--  3) shartnoma tugunlari: holat, summa_bez_nds, loyiha_id, obyekt_soni/obyekt_idlar, tomonlar;
--  4) smeta_yoq / resurs_yoq / smetasiz_obyekt bitta qoida;
--  5) top_signals (3 tagacha); 6) `ortiqcha` belgi t2_overbilling_radar dan;
--  + t2_mindmap_joylashuv_saqla_v2: bitta graf o'qish, zayavka: tugunlari o'tkazib yuboriladi.
-- Imzolar O'ZGARMAGAN (create or replace); t2_mindmap_grafi_v2 shu funksiyani o'raydi — ishlayveradi.
-- Rollback: 20261111600000_t2_mindmap_grafi_v3.rollback.sql.

CREATE OR REPLACE FUNCTION public.t2_mindmap_grafi(p_kompaniya_id bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
/* v3 (2026-11-11) qarorlari:
 *  - F2 = FAQAT t2_akt.holat='tasdiqlangan' (t2_qator_holat / LRV approved-only qoidasi bilan bir xil).
 *    Qoralama F2 alohida `f2_qoralama` — f2, foiz va jamlanmaga KIRMAYDI.
 *  - FAKT: tur='fakt' uchun holat<>'bekor' saqlandi (t2_qator_holat fakt qoidasi ham o'zgarmagan:
 *    20260906130000 "Fakt aggregation remains exactly as before"); fakt tasdiq jarayoniga ega emas.
 *  - Smeta qoidasi: smeta = rz qatorlar yig'indisi (rz yo'q => NULL). `smeta_yoq` = rz qatori ham,
 *    resurs qatori ham yo'q. rz bor, resurs yo'q => `resurs_yoq` (alohida belgi). smetasiz_obyekt shu
 *    qoidaga mos (rz_soni=0 AND resurs=0).
 *  - Belgi darajalari: smeta_yoq = 'ogoh' (xavf); resurs_yoq va ortiqcha = 'info' (e'tibor) — frontend holat qoidasi shunga tayanadi.
 *  - `ortiqcha` belgi t2_overbilling_radar dan (f2 > fakt yoki f2 > smeta bo'lgan qatorlar soni);
 *    ESLATMA: radar ko'rinishi o'z f2 asosini o'zi belgilaydi (bu migratsiya uni o'zgartirmaydi).
 */
WITH
/* ── Obyekt bo'yicha o'lchovlar (bir marta hisoblanadi) ── */
ob_olchov AS (
  SELECT o.id,
         (SELECT sum(q.summa) FROM t2_qator q
           WHERE q.obyekt_id = o.id AND q.tur = 'rz')                      AS smeta,
         (SELECT count(*) FROM t2_qator q
           WHERE q.obyekt_id = o.id AND q.tur = 'rz')                      AS rz_soni,
         (SELECT count(*) FROM t2_qator q
           WHERE q.obyekt_id = o.id AND q.tur IN ('rs','mat','ob'))        AS resurs,
         (SELECT count(*) FROM t2_qator q
           WHERE q.obyekt_id = o.id AND q.tur IN ('rs','mat','ob')
             AND q.narx IS NULL)                                           AS narxsiz,
         (SELECT coalesce(sum(aq.summa),0) FROM t2_akt_qator aq
            JOIN t2_akt a ON a.id = aq.akt_id AND a.holat <> 'bekor'
           WHERE aq.obyekt_id = o.id AND a.tur = 'fakt')                   AS fakt,
         (SELECT coalesce(sum(aq.summa),0) FROM t2_akt_qator aq
            JOIN t2_akt a ON a.id = aq.akt_id AND a.holat = 'tasdiqlangan'
           WHERE aq.obyekt_id = o.id AND a.tur = 'f2')                     AS f2,
         /* F2 qoralamalari ALOHIDA (tasdiqlanmagan; f2 ga kirmaydi) */
         (SELECT coalesce(sum(aq.summa),0) FROM t2_akt_qator aq
            JOIN t2_akt a ON a.id = aq.akt_id AND a.holat NOT IN ('tasdiqlangan','bekor')
           WHERE aq.obyekt_id = o.id AND a.tur = 'f2')                     AS f2_qoralama,
         (SELECT count(*) FROM t2_erp_taminot z
           WHERE z.obyekt_id = o.id AND z.status IN ('submitted','approved','procurement','ordered','partially_delivered'))            AS zayavka,
         (SELECT k.holat FROM t2_kozgu k WHERE k.obyekt_id = o.id)         AS kozgu
    FROM t2_obyekt o
   WHERE o.kompaniya_id = p_kompaniya_id AND o.holat <> 'bekor'
),
/* Ochiq signallar: eng og'ir 3 tasi (t2_mindmap_signal_summary.top_signals allaqachon tartiblangan) */
sig AS (
  SELECT s.obyekt_id,
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object('title', x.e->>'title', 'severity', x.e->>'severity', 'type', x.e->>'type') ORDER BY x.ord)
             FROM (SELECT e, ord FROM jsonb_array_elements(s.top_signals) WITH ORDINALITY AS z(e, ord)
                    ORDER BY ord LIMIT 3) x
         ), '[]'::jsonb) AS top3
    FROM public.t2_mindmap_signal_summary s
   WHERE s.kompaniya_id = p_kompaniya_id
),
/* Overbilling: f2 > fakt yoki f2 > smeta bo'lgan qatorlar (NULL ortiqcha — hisoblanmaydi, 0 emas) */
ort AS (
  SELECT r.obyekt_id, count(*)::integer AS n
    FROM public.t2_overbilling_radar r
   WHERE r.kompaniya_id = p_kompaniya_id
     AND (r.f2_fakt_ortiqcha > 0 OR r.f2_smeta_ortiqcha > 0)
   GROUP BY r.obyekt_id
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
               'rz_qatori', m.rz_soni,
               'fakt', m.fakt,
               'f2', m.f2,
               'f2_asos', 'tasdiqlangan',
               'f2_qoralama', m.f2_qoralama,
               /* Foiz faqat smeta > 0 bo'lsa — yolg'on «0%» ko'rsatilmaydi */
               'fakt_foiz', CASE WHEN m.smeta > 0 THEN round(m.fakt / m.smeta * 100, 1) END,
               'f2_foiz',   CASE WHEN m.smeta > 0 THEN round(m.f2   / m.smeta * 100, 1) END,
               'zayavka', m.zayavka, 'signal_count', COALESCE((SELECT s.signal_count FROM public.t2_mindmap_signal_summary s WHERE s.kompaniya_id=p_kompaniya_id AND s.obyekt_id=(o.id)::text),0), 'critical_count', COALESCE((SELECT s.critical_count FROM public.t2_mindmap_signal_summary s WHERE s.kompaniya_id=p_kompaniya_id AND s.obyekt_id=(o.id)::text),0),
               'top_signals', COALESCE(sg.top3, '[]'::jsonb),
               'ortiqcha_soni', COALESCE(ort.n, 0),
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
                    WHERE m.rz_soni = 0 AND m.resurs = 0
                   UNION ALL
                   SELECT 5, jsonb_build_object('tur','resurs_yoq','daraja','info',
                            'matn','Smeta bor, lekin resurs qatorlari yo''q')
                    WHERE m.rz_soni > 0 AND m.resurs = 0
                   UNION ALL
                   SELECT 6, jsonb_build_object('tur','ortiqcha','daraja','info',
                            'soni', COALESCE(ort.n, 0),
                            'matn', COALESCE(ort.n, 0) || ' qatorda F2 fakt yoki smetadan oshgan')
                    WHERE COALESCE(ort.n, 0) > 0
                 ) q))
        FROM t2_obyekt o
        JOIN ob_olchov m ON m.id = o.id
        LEFT JOIN sig sg ON sg.obyekt_id = o.id::text
        LEFT JOIN ort ON ort.obyekt_id = o.id
       WHERE o.kompaniya_id = p_kompaniya_id AND o.holat <> 'bekor'
      UNION ALL
      SELECT 'shartnoma:' || s.id, 'shartnoma', COALESCE(NULLIF(s.raqam,''), s.nom, 'Shartnoma'),
             jsonb_build_object('nom', s.nom, 'taraf', s.taraf, 'summa', s.jami_nds_bilan, 'versiya', s.versiya,
               'holat', s.holat, 'summa_bez_nds', s.summa_bez_nds, 'loyiha_id', s.loyiha_id,
               'obyekt_soni', (SELECT count(*) FROM t2_shartnoma_bog sb
                                 JOIN t2_obyekt ob ON ob.id = sb.obyekt_id
                                  AND ob.kompaniya_id = p_kompaniya_id AND ob.holat <> 'bekor'
                                WHERE sb.shartnoma_id = s.id AND sb.holat = 'faol'),
               'obyekt_idlar', COALESCE((SELECT jsonb_agg(sb.obyekt_id ORDER BY sb.obyekt_id)
                                 FROM t2_shartnoma_bog sb
                                 JOIN t2_obyekt ob ON ob.id = sb.obyekt_id
                                  AND ob.kompaniya_id = p_kompaniya_id AND ob.holat <> 'bekor'
                                WHERE sb.shartnoma_id = s.id AND sb.holat = 'faol'), '[]'::jsonb),
               'tomonlar', COALESCE((SELECT jsonb_agg(jsonb_build_object('rol', tm.rol, 'nom', tm.nom,
                                        'kontragent_id', tm.kontragent_id) ORDER BY tm.tartib, tm.id)
                                 FROM t2_shartnoma_tomon tm
                                WHERE tm.shartnoma_id = s.id AND tm.kompaniya_id = p_kompaniya_id), '[]'::jsonb))
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
      'f2_asos', 'tasdiqlangan',
      'f2_qoralama_jami', sum(f2_qoralama),
      'zayavka_kutilmoqda', sum(zayavka),
      'narxsiz_obyekt', count(*) FILTER (WHERE narxsiz > 0),
      'smetasiz_obyekt', count(*) FILTER (WHERE rz_soni = 0 AND resurs = 0),
      'resurssiz_obyekt', count(*) FILTER (WHERE rz_soni > 0 AND resurs = 0),
      'ortiqcha_obyekt', (SELECT count(*) FROM ort WHERE ort.obyekt_id IN (SELECT x.id FROM ob_olchov x)),
      'kozgu_eskirgan', count(*) FILTER (WHERE kozgu = 'farqli'))
    FROM ob_olchov),
  'bogichlar', COALESCE((
    SELECT jsonb_agg(jsonb_strip_nulls(to_jsonb(b))) FROM (
      SELECT 'kompaniya:' || l.kompaniya_id AS manba, 'loyiha:' || l.id AS maqsad,
             'loyiha_kompaniya' AS tur, false AS uzsa_boladi,
             NULL::text AS rol, NULL::bigint AS id
        FROM t2_loyiha l WHERE l.kompaniya_id = p_kompaniya_id AND l.holat <> 'bekor'
      UNION ALL
      SELECT 'loyiha:' || o.loyiha_id, 'obyekt:' || o.id, 'obyekt_loyiha', true, NULL, NULL
        FROM t2_obyekt o WHERE o.kompaniya_id = p_kompaniya_id AND o.holat <> 'bekor' AND o.loyiha_id IS NOT NULL
      UNION ALL
      SELECT 'loyiha:' || s.loyiha_id, 'shartnoma:' || s.id, 'shartnoma_loyiha', true, NULL, NULL
        FROM t2_shartnoma s WHERE s.kompaniya_id = p_kompaniya_id AND s.holat <> 'bekor' AND s.loyiha_id IS NOT NULL
      UNION ALL
      SELECT 'shartnoma:' || sb.shartnoma_id, 'obyekt:' || sb.obyekt_id, 'shartnoma_obyekt', true, NULL, NULL
        FROM t2_shartnoma_bog sb
        JOIN t2_obyekt o ON o.id = sb.obyekt_id AND o.kompaniya_id = p_kompaniya_id
        WHERE sb.holat = 'faol'
      UNION ALL
      SELECT 'sklad:' || sb.sklad_id, 'obyekt:' || sb.obyekt_id, 'sklad_obyekt', true, NULL, NULL
        FROM t2_sklad_bog sb
        JOIN t2_obyekt o ON o.id = sb.obyekt_id AND o.kompaniya_id = p_kompaniya_id
        WHERE sb.holat = 'faol'
      UNION ALL
      SELECT 'texnika:' || tb.texnika_id, 'obyekt:' || tb.obyekt_id, 'texnika_obyekt', true, NULL, NULL
        FROM t2_texnika_bog tb
        JOIN t2_obyekt o ON o.id = tb.obyekt_id AND o.kompaniya_id = p_kompaniya_id
        WHERE tb.holat = 'faol'
      UNION ALL
      SELECT 'kadr:' || kb.kadr_id, 'obyekt:' || kb.obyekt_id, 'kadr_obyekt', true, NULL, NULL
        FROM t2_kadr_bog kb
        JOIN t2_obyekt o ON o.id = kb.obyekt_id AND o.kompaniya_id = p_kompaniya_id
        WHERE kb.holat = 'faol'
      UNION ALL
      SELECT 'kontragent:' || q.kontragent_id, 'loyiha:' || q.loyiha_id, 'qatnashchi', true, q.rol, q.id
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
declare v_rol text; v_old jsonb; v_j jsonb; v_result jsonb; v_node text; v_ids text[]; v_saqlandi integer;
begin
  v_rol:=t2_mindmap_actor_tekshir(p_kompaniya_id,p_actor_id);
  if jsonb_typeof(p_joylar)<>'array' or jsonb_array_length(p_joylar)=0 or jsonb_array_length(p_joylar)>500 then raise exception 'joylar 1..500 elementli massiv bolishi kerak' using errcode='22023'; end if;
  v_old:=t2_mindmap_command_boshlash(p_kompaniya_id,p_operation_id,'joylashuv',p_actor_id,jsonb_build_object('joylar',p_joylar));
  if v_old is not null then return v_old; end if;
  -- Graf BIR marta o'qiladi (avval har tugun uchun alohida o'qilardi).
  select coalesce(array_agg(n->>'id'),'{}'::text[]) into v_ids
    from jsonb_array_elements(coalesce(t2_mindmap_grafi(p_kompaniya_id)->'tugunlar','[]'::jsonb)) n;
  for v_j in select value from jsonb_array_elements(p_joylar) loop
    v_node:=v_j->>'tugun_id';
    -- zayavka:<id> — vaqtinchalik drilldown tugunlari: tekshiruvdan o'tkaziladi, lekin SAQLANMAYDI.
    if v_node ~ '^zayavka:[0-9]+$' and jsonb_typeof(v_j->'x')='number' and jsonb_typeof(v_j->'y')='number' then
      continue;
    end if;
    if v_node is null or v_node !~ '^(kompaniya|loyiha|obyekt|shartnoma|sklad|texnika|kadr|kontragent):[0-9]+$'
       or jsonb_typeof(v_j->'x') not in ('number') or jsonb_typeof(v_j->'y') not in ('number') then
      raise exception 'joylashuv elementi yaroqsiz' using errcode='22023';
    end if;
    if not (v_node = any(v_ids)) then
      raise exception 'tugun boshqa tenantga tegishli yoki mavjud emas: %',v_node using errcode='42501';
    end if;
  end loop;
  insert into t2_mindmap_joylashuv(kompaniya_id,tugun_id,x,y)
    select p_kompaniya_id,j->>'tugun_id',(j->>'x')::numeric,(j->>'y')::numeric from jsonb_array_elements(p_joylar) j
     where (j->>'tugun_id') !~ '^zayavka:'
  on conflict(kompaniya_id,tugun_id) do update set x=excluded.x,y=excluded.y,yangilandi=now();
  select count(*) into v_saqlandi from jsonb_array_elements(p_joylar) j where (j->>'tugun_id') !~ '^zayavka:';
  perform t2_audit_yoz(p_kompaniya_id,'mindmap_joylashuv','mindmap',null,format('actor_id=%s; rol=%s; count=%s',p_actor_id,v_rol,v_saqlandi),coalesce(p_actor_label,'actor:'||p_actor_id),null);
  v_result:=jsonb_build_object('ok',true,'saqlandi',v_saqlandi);
  return t2_mindmap_command_yakunla(p_kompaniya_id,p_operation_id,v_result);
end;
$function$;
commit;
select position('f2_qoralama' in pg_get_functiondef('public.t2_mindmap_grafi(bigint)'::regprocedure))>0 as yangilandi;  -- true
