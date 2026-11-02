-- 20261114900000_t2_versiya_tizim_darajasi_v1 ROLLBACK — aynan oldingi (prod 2026-10-29) ta'riflar; qo'riqchi obyektlari olib tashlanadi.
begin;
set local lock_timeout = '8s';
drop function if exists public.t2_versiya_xabardorlik_signal_v1(bigint);
drop function if exists public.t2_versiya_xabardorlik_audit_v1();
drop table if exists public.t2_versiya_xabardorlik_ruxsat;

create or replace view public.t2_narx_dalil_holat as
SELECT d.id,
    d.kompaniya_id,
    d.obyekt_id,
    d.qator_id,
    q.tur,
    q.kat,
    q.kod,
    q.nom,
    q.birlik,
    q.hajm,
    q.narx AS hozirgi_narx,
    d.smeta_narx,
    d.manba_narx,
    d.izoh,
    d.kim,
    d.vaqt,
    m.id AS manba_id,
    m.tur AS manba_tur,
    m.nom AS manba_nom,
    m.raqam AS manba_raqam,
    m.sana AS manba_sana,
    COALESCE(mq.yil, (d.katalog_qator ->> 'yil'::text)::smallint, m.yil) AS yil,
    COALESCE(mq.kvartal, (d.katalog_qator ->> 'kvartal'::text)::smallint, m.kvartal) AS kvartal,
    COALESCE(mq.hudud, d.katalog_qator ->> 'hudud'::text, m.region) AS region,
    m.yetkazuvchi,
    m.yetkazuvchi_inn,
    COALESCE(mq.nds_holati, d.katalog_qator ->> 'nds_holati'::text, m.nds_holati) AS nds_holati,
    m.fayl_document_id,
    COALESCE(mq.kod, d.katalog_qator ->> 'kod'::text) AS manba_kod,
    COALESCE(mq.nom, d.katalog_qator ->> 'nom'::text) AS manba_nom_qator,
    COALESCE(mq.birlik, d.katalog_qator ->> 'birlik'::text) AS manba_birlik,
    COALESCE(mq.ishlab_chiqaruvchi, d.katalog_qator ->> 'ishlab_chiqaruvchi'::text) AS ishlab_chiqaruvchi,
    COALESCE(mq.nds_izoh, d.katalog_qator ->> 'nds_izoh'::text) AS nds_izoh,
    COALESCE(mq.narx_varianti, d.katalog_qator ->> 'narx_varianti'::text) AS narx_varianti,
    COALESCE(mq.guruh, d.katalog_qator ->> 'guruh'::text) AS manba_guruh,
    m.kompaniya_id IS NULL AS platforma
   FROM t2_narx_dalil d
     JOIN t2_qator q ON q.id = d.qator_id
     JOIN t2_narx_manba m ON m.id = d.manba_id
     LEFT JOIN t2_narx_manba_qator mq ON mq.id = d.manba_qator_id
  WHERE d.holat = 'faol'::text AND (mq.id IS NOT NULL OR d.katalog_qator IS NOT NULL);

create or replace view public.t2_narx_markaz with (security_invoker = true) as
WITH obyekt_narx AS (
         SELECT n.kompaniya_id,
            n.nom_key,
            n.birlik_key,
            max(n.nom) AS nom,
            max(n.birlik) AS birlik,
            count(DISTINCT n.obyekt_id) AS obyekt_soni,
            max(n.narx) AS smeta_max,
            min(n.narx) FILTER (WHERE n.narx > 0::numeric) AS smeta_min,
            jsonb_object_agg(COALESCE(o.nom, '?'::text), n.narx) AS obyektlar
           FROM t2_narx n
             LEFT JOIN t2_obyekt o ON o.id = n.obyekt_id
          WHERE n.obyekt_id IS NOT NULL AND n.narx IS NOT NULL
          GROUP BY n.kompaniya_id, n.nom_key, n.birlik_key
        ), registr AS (
         SELECT t2_narx.kompaniya_id,
            t2_narx.nom_key,
            t2_narx.birlik_key,
            max(t2_narx.nom) AS nom,
            max(t2_narx.birlik) AS birlik,
            max(t2_narx.kat) AS kat,
            max(t2_narx.narx) FILTER (WHERE t2_narx.belgilangan) AS belgilangan_narx,
            bool_or(t2_narx.belgilangan) AS belgilangan_mi
           FROM t2_narx
          WHERE t2_narx.obyekt_id IS NULL
          GROUP BY t2_narx.kompaniya_id, t2_narx.nom_key, t2_narx.birlik_key
        ), sana AS (
         SELECT DISTINCT ON (t2_narx_sana.kompaniya_id, t2_narx_sana.nom_key, t2_narx_sana.birlik_key) t2_narx_sana.kompaniya_id,
            t2_narx_sana.nom_key,
            t2_narx_sana.birlik_key,
            t2_narx_sana.narx AS sana_narx,
            t2_narx_sana.sana AS sana_kuni
           FROM t2_narx_sana
          ORDER BY t2_narx_sana.kompaniya_id, t2_narx_sana.nom_key, t2_narx_sana.birlik_key, t2_narx_sana.sana DESC, t2_narx_sana.narx DESC
        ), sana_max AS (
         SELECT t2_narx_sana.kompaniya_id,
            t2_narx_sana.nom_key,
            t2_narx_sana.birlik_key,
            max(t2_narx_sana.narx) AS sana_max_narx
           FROM t2_narx_sana
          GROUP BY t2_narx_sana.kompaniya_id, t2_narx_sana.nom_key, t2_narx_sana.birlik_key
        ), ishlatilgan AS (
         SELECT t2_qator.kompaniya_id,
            t2_qator.nom_key,
            t2_qator.birlik_key,
            count(*) AS qator_soni
           FROM t2_qator
          WHERE t2_qator.tur = ANY (ARRAY['rs'::text, 'mat'::text, 'ob'::text])
          GROUP BY t2_qator.kompaniya_id, t2_qator.nom_key, t2_qator.birlik_key
        ), b AS (
         SELECT COALESCE(o.kompaniya_id, r.kompaniya_id, s.kompaniya_id) AS kompaniya_id,
            COALESCE(o.nom_key, r.nom_key, s.nom_key) AS nom_key,
            COALESCE(o.birlik_key, r.birlik_key, s.birlik_key) AS birlik_key,
            COALESCE(o.nom, r.nom) AS nom,
            COALESCE(o.birlik, r.birlik) AS birlik,
            r.kat,
            COALESCE(o.obyekt_soni, 0::bigint) AS obyekt_soni,
            o.obyektlar,
            o.smeta_max,
            o.smeta_min,
            r.belgilangan_narx,
            COALESCE(r.belgilangan_mi, false) AS belgilangan_mi,
            sm.sana_max_narx,
            s.sana_narx AS oxirgi_sana_narx,
            s.sana_kuni AS oxirgi_sana
           FROM obyekt_narx o
             FULL JOIN registr r ON r.kompaniya_id = o.kompaniya_id AND r.nom_key = o.nom_key AND r.birlik_key = o.birlik_key
             FULL JOIN sana s ON s.kompaniya_id = COALESCE(o.kompaniya_id, r.kompaniya_id) AND s.nom_key = COALESCE(o.nom_key, r.nom_key) AND s.birlik_key = COALESCE(o.birlik_key, r.birlik_key)
             LEFT JOIN sana_max sm ON sm.kompaniya_id = s.kompaniya_id AND sm.nom_key = s.nom_key AND sm.birlik_key = s.birlik_key
        )
 SELECT b.kompaniya_id,
    b.nom_key,
    b.birlik_key,
    b.nom,
    b.birlik,
    b.kat,
    b.obyekt_soni,
    b.obyektlar,
    b.smeta_max,
    b.smeta_min,
    b.belgilangan_narx,
    b.belgilangan_mi,
    b.sana_max_narx,
    b.oxirgi_sana_narx,
    b.oxirgi_sana,
    COALESCE(i.qator_soni, 0::bigint) AS qator_soni,
    GREATEST(b.belgilangan_narx, b.smeta_max, b.sana_max_narx) AS natija,
        CASE
            WHEN b.belgilangan_narx IS NOT NULL AND b.belgilangan_narx >= COALESCE(b.smeta_max, 0::numeric) AND b.belgilangan_narx >= COALESCE(b.sana_max_narx, 0::numeric) THEN 'belgilangan'::text
            WHEN b.sana_max_narx IS NOT NULL AND b.sana_max_narx >= COALESCE(b.smeta_max, 0::numeric) THEN 'sana'::text
            WHEN b.smeta_max IS NOT NULL THEN 'smeta'::text
            ELSE NULL::text
        END AS manba,
    b.obyekt_soni > 1 AND b.smeta_min > 0::numeric AND (b.smeta_max / b.smeta_min) > 1.05 AS xavf,
        CASE
            WHEN b.obyekt_soni > 1 AND b.smeta_min > 0::numeric THEN round(b.smeta_max / b.smeta_min, 2)
            ELSE NULL::numeric
        END AS farq_koef
   FROM b
     LEFT JOIN ishlatilgan i ON i.kompaniya_id = b.kompaniya_id AND i.nom_key = b.nom_key AND i.birlik_key = b.birlik_key
  WHERE b.nom IS NOT NULL;

create or replace view public.t2_narx_qol_xavf as
SELECT q.id AS qator_id,
    q.obyekt_id,
    o.nom AS obyekt,
    q.nom,
    q.birlik,
    q.narx AS hozirgi_narx,
    q.narx_usul,
    z.yangi AS qolda_yozilgan,
    z.vaqt AS tahrir_vaqti,
    z.kim,
    z.manba,
    q.narx IS DISTINCT FROM z.yangi::numeric AS narx_yoqolgan,
    q.kompaniya_id
   FROM t2_ozgarish z
     JOIN t2_qator q ON q.id = z.qator_id
     JOIN t2_obyekt o ON o.id = q.obyekt_id
  WHERE z.maydon = 'narx'::text AND z.amal = 'tahrir'::text AND (z.manba = ANY (ARRAY['frontend'::text, 'sheets'::text])) AND q.narx_usul IS DISTINCT FROM 'QOL'::text;

create or replace view public.t2_narx_taklif as
WITH juft AS NOT MATERIALIZED (
         SELECT q_1.kompaniya_id,
            q_1.obyekt_id,
            q_1.id AS qator_id,
            mq_1.id AS mq_id,
            'kod'::text AS moslik
           FROM t2_qator q_1
             JOIN t2_narx_manba_qator mq_1 ON mq_1.kod_key = t2_resurs_nom_kalit(q_1.kod) AND mq_1.kod_key IS NOT NULL AND mq_1.kod_key <> ''::text AND NOT mq_1.sarlavha AND mq_1.narx IS NOT NULL AND (mq_1.kompaniya_id = q_1.kompaniya_id OR mq_1.kompaniya_id IS NULL)
          WHERE (q_1.tur = ANY (ARRAY['rs'::text, 'mat'::text, 'ob'::text])) AND q_1.kod IS NOT NULL
        UNION ALL
         SELECT q_1.kompaniya_id,
            q_1.obyekt_id,
            q_1.id,
            mq_1.id,
            'nom_birlik'::text AS text
           FROM t2_qator q_1
             JOIN t2_narx_manba_qator mq_1 ON mq_1.nom_key = q_1.nom_key AND NOT mq_1.birlik_key IS DISTINCT FROM q_1.birlik_key AND NOT mq_1.sarlavha AND mq_1.narx IS NOT NULL AND (mq_1.kompaniya_id = q_1.kompaniya_id OR mq_1.kompaniya_id IS NULL)
          WHERE (q_1.tur = ANY (ARRAY['rs'::text, 'mat'::text, 'ob'::text])) AND NOT (mq_1.kod_key IS NOT NULL AND mq_1.kod_key <> ''::text AND mq_1.kod_key = t2_resurs_nom_kalit(q_1.kod))
        UNION ALL
         SELECT q_1.kompaniya_id,
            q_1.obyekt_id,
            q_1.id,
            mq_1.id,
            'hudud'::text AS text
           FROM t2_qator q_1
             JOIN t2_obyekt o ON o.id = q_1.obyekt_id AND o.hudud IS NOT NULL
             JOIN t2_narx_manba_qator mq_1 ON t2_hudud_kalit(mq_1.hudud) = o.hudud AND NOT mq_1.sarlavha AND mq_1.narx IS NOT NULL AND (mq_1.kompaniya_id = q_1.kompaniya_id OR mq_1.kompaniya_id IS NULL)
             JOIN t2_narx_manba m2 ON m2.id = mq_1.manba_id AND m2.tur = 'chel_chas'::text AND m2.holat = 'faol'::text
          WHERE (q_1.tur = ANY (ARRAY['rs'::text, 'mat'::text, 'ob'::text])) AND upper(btrim(COALESCE(q_1.kat, ''::text))) = 'ЧЕЛ'::text AND (COALESCE(mq_1.yil::integer, m2.yil::integer, 0) * 10 + COALESCE(mq_1.kvartal::integer, m2.kvartal::integer, 0)) = (( SELECT max(COALESCE(x.yil::integer, xm.yil::integer, 0) * 10 + COALESCE(x.kvartal::integer, xm.kvartal::integer, 0)) AS max
                   FROM t2_narx_manba_qator x
                     JOIN t2_narx_manba xm ON xm.id = x.manba_id AND xm.tur = 'chel_chas'::text AND xm.holat = 'faol'::text
                  WHERE t2_hudud_kalit(x.hudud) = o.hudud AND NOT x.sarlavha AND x.narx IS NOT NULL AND (x.kompaniya_id = q_1.kompaniya_id OR x.kompaniya_id IS NULL)))
        )
 SELECT j.kompaniya_id,
    j.obyekt_id,
    q.id AS qator_id,
    q.tur,
    q.kat,
    q.kod,
    q.nom,
    q.birlik,
    q.narx AS smeta_narx,
    mq.id AS manba_qator_id,
    mq.manba_id,
    m.tur AS manba_tur,
    m.nom AS manba_nom,
    m.raqam AS manba_raqam,
    m.sana AS manba_sana,
    COALESCE(mq.yil, m.yil) AS yil,
    COALESCE(mq.kvartal, m.kvartal) AS kvartal,
    COALESCE(mq.hudud, m.region) AS region,
    m.yetkazuvchi,
    COALESCE(mq.nds_holati, m.nds_holati) AS nds_holati,
    mq.kod AS manba_kod,
    mq.nom AS manba_nom_qator,
    mq.birlik AS manba_birlik,
    mq.narx AS manba_narx,
    j.moslik,
    mq.ishlab_chiqaruvchi,
    mq.nds_izoh,
    mq.narx_varianti,
    mq.guruh AS manba_guruh,
    m.kompaniya_id IS NULL AS platforma
   FROM juft j
     JOIN t2_qator q ON q.id = j.qator_id
     JOIN t2_narx_manba_qator mq ON mq.id = j.mq_id
     JOIN t2_narx_manba m ON m.id = mq.manba_id AND m.holat = 'faol'::text;

create or replace view public.t2_topilmaganlar with (security_invoker = true) as
SELECT q.obyekt_id,
    o.nom AS obyekt,
    q.kompaniya_id,
    q.nom_key,
    q.birlik_key,
    max(q.nom) AS nom,
    max(q.birlik) AS birlik,
    max(q.kat) AS kat,
    count(*) AS qator_soni,
    sum(q.hajm) AS jami_hajm,
    m.smeta_max AS boshqa_obyektda_narx,
    m.obyekt_soni AS boshqa_obyekt_soni,
    m.obyektlar,
        CASE
            WHEN m.smeta_max IS NOT NULL THEN round(sum(q.hajm) * m.smeta_max, 2)
            ELSE NULL::numeric
        END AS taxminiy_summa
   FROM t2_qator q
     JOIN t2_obyekt o ON o.id = q.obyekt_id
     LEFT JOIN t2_narx_markaz m ON m.kompaniya_id = q.kompaniya_id AND m.nom_key = q.nom_key AND m.birlik_key = q.birlik_key
  WHERE (q.tur = ANY (ARRAY['rs'::text, 'mat'::text, 'ob'::text])) AND q.narx IS NULL
  GROUP BY q.obyekt_id, o.nom, q.kompaniya_id, q.nom_key, q.birlik_key, m.smeta_max, m.obyekt_soni, m.obyektlar;

create or replace view public.v_sklad_nomlar as
SELECT DISTINCT nomi,
    birligi,
    turi
   FROM ( SELECT t2_sklad_qoldiq.nomi,
            t2_sklad_qoldiq.birligi,
            t2_sklad_qoldiq.turi
           FROM t2_sklad_qoldiq
        UNION
         SELECT t2_qator.nom AS nomi,
            t2_qator.birlik AS birligi,
            'mat'::text AS turi
           FROM t2_qator
          WHERE t2_qator.kat = 'МАТ'::text) s;

CREATE OR REPLACE FUNCTION public.t2_agent_fakt_v1(p_actor_id bigint, p_kompaniya_id bigint, p_kategoriyalar text[], p_obyekt_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare g jsonb; k public.t2_agent_kasb%rowtype; v_ruxsat text[]; v_so text[]; v_rad text[]; r jsonb := '{}'::jsonb; x jsonb;
  v_ob bigint[];
begin
  if p_kompaniya_id is null then return jsonb_build_object('ok', false, 'code', 'KOMPANIYA_KERAK'); end if;
  g := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not (g->>'ok')::boolean then return g; end if;
  select * into k from t2_agent_kasb where rol = g->>'rol';
  v_ruxsat := coalesce(k.kategoriyalar, array['obyektlar']);
  v_so := coalesce(p_kategoriyalar, array['obyektlar']);
  select coalesce(array_agg(c order by c), '{}') into v_rad from unnest(v_so) c where not (c = any(v_ruxsat));
  v_so := array(select c from unnest(v_so) c where c = any(v_ruxsat));
  if p_obyekt_id is not null and not exists (select 1 from t2_obyekt where id = p_obyekt_id and kompaniya_id = p_kompaniya_id) then return jsonb_build_object('ok', false, 'code', 'OBYEKT_BEGONA'); end if;
  select coalesce(array_agg(id), '{}') into v_ob from (select id from t2_obyekt where kompaniya_id = p_kompaniya_id and holat = 'faol' and (p_obyekt_id is null or id = p_obyekt_id) order by yangilandi desc nulls last limit 15) z;

  r := jsonb_build_object('bugun', current_date, 'kompaniya', (select nom from t2_kompaniya where id = p_kompaniya_id));

  if 'obyektlar' = any(v_so) then
    select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'nom', o.nom, 'hudud', o.hudud, 'loyiha', (select l.nom from t2_loyiha l where l.id = o.loyiha_id)) order by o.nom), '[]') into x
      from t2_obyekt o where o.id = any(v_ob);
    r := r || jsonb_build_object('obyektlar', x);
  end if;

  if 'smeta_pul' = any(v_so) or 'f2_fakt_pul' = any(v_so) or 'hajm' = any(v_so) then
    select coalesce(jsonb_agg(t.j order by t.nom), '[]') into x from (
      select o.nom,
        jsonb_strip_nulls(jsonb_build_object('obyekt', o.nom)
          || case when 'smeta_pul' = any(v_so) then jsonb_build_object('smeta_jami_som', round(coalesce(b.smeta_rz, 0)),
               'narxsiz_qatorlar', b.narxsiz) else '{}'::jsonb end
          || case when 'f2_fakt_pul' = any(v_so) then jsonb_build_object('fakt_som', round(coalesce(a.fakt, 0)), 'f2_som', round(coalesce(a.f2, 0))) else '{}'::jsonb end
          || case when 'hajm' = any(v_so) then jsonb_build_object('bajarilish_foiz_fakt', round(coalesce(a.fakt_rs * 100.0 / nullif(b.smeta_rs, 0), 0), 1),
               'bajarilish_foiz_f2', round(coalesce(a.f2_rs * 100.0 / nullif(b.smeta_rs, 0), 0), 1)) else '{}'::jsonb end) j
      from t2_obyekt o
      join (select q.obyekt_id, sum(q.summa) filter (where q.tur = 'rz') smeta_rz,
                   count(*) filter (where q.tur in ('rs','mat','ob') and q.narx is null) narxsiz,
                   sum(q.summa) filter (where q.tur = 'rs') smeta_rs
              from t2_qator q where q.obyekt_id = any(v_ob) group by q.obyekt_id) b on b.obyekt_id = o.id
      -- fakt/F2 faqat akt qatori bor qatorlarda va ularning rs bolalarida (BL_NORMA) noldan farq qiladi.
      left join (select h.obyekt_id, sum(h.fakt_summa) fakt, sum(h.f2_summa) f2,
                        sum(h.fakt_summa) filter (where h.tur = 'rs') fakt_rs, sum(h.f2_summa) filter (where h.tur = 'rs') f2_rs
                   from t2_qator_holat h
                  where h.qator_id in (
                    select aq.qator_id from t2_akt_qator aq join t2_qator q on q.id = aq.qator_id where q.obyekt_id = any(v_ob)
                    union
                    select c.id from t2_qator c where c.obyekt_id = any(v_ob) and c.tur = 'rs' and c.ota_id in (
                      select aq.qator_id from t2_akt_qator aq join t2_qator q on q.id = aq.qator_id where q.obyekt_id = any(v_ob)))
                  group by h.obyekt_id) a on a.obyekt_id = o.id
     where o.id = any(v_ob)) t;
    r := r || jsonb_build_object('obyekt_korsatkichlari', x);
  end if;

  if 'f2_fakt_pul' = any(v_so) then
    select coalesce(jsonb_object_agg(coalesce(lifecycle_status, 'noma''lum'), n), '{}') into x from (
      select lifecycle_status, count(*) n from t2_akt where kompaniya_id = p_kompaniya_id and (p_obyekt_id is null or obyekt_id = p_obyekt_id) group by 1) a;
    r := r || jsonb_build_object('f2_aktlar_holati', x);
  end if;

  if 'grafik' = any(v_so) then
    select coalesce(jsonb_agg(z.j), '[]') into x from (
      select jsonb_build_object('id', gq.id, 'versiya', gq.versiya, 'obyekt', o.nom, 'ish', gq.nom, 'boshlanish', gq.boshlanish_sana, 'tugash', gq.tugash_sana, 'foiz', gq.foiz,
               'kechikkan', (gq.tugash_sana < current_date and coalesce(gq.foiz, 0) < 100)) j
        from t2_grafik_qator gq join t2_obyekt o on o.id = gq.obyekt_id
       where gq.kompaniya_id = p_kompaniya_id and coalesce(gq.faol, true) and gq.obyekt_id = any(v_ob)
       order by (gq.tugash_sana < current_date and coalesce(gq.foiz, 0) < 100) desc, gq.tugash_sana asc nulls last limit 30) z;
    r := r || jsonb_build_object('grafik', x);
  end if;

  if 'moliya' = any(v_so) then
    r := r || jsonb_build_object('moliya', jsonb_build_object(
      'tolov_jami_som', (select round(coalesce(sum(summa), 0)) from t2_tolov where kompaniya_id = p_kompaniya_id and coalesce(holat, 'faol') <> 'bekor'),
      'tolov_shu_oy_som', (select round(coalesce(sum(summa), 0)) from t2_tolov where kompaniya_id = p_kompaniya_id and coalesce(holat, 'faol') <> 'bekor' and sana >= date_trunc('month', current_date)),
      'xarajat_jami_som', (select round(coalesce(sum(summa), 0)) from t2_xarajat where kompaniya_id = p_kompaniya_id and coalesce(holat, 'faol') <> 'bekor'),
      'xarajat_shu_oy_som', (select round(coalesce(sum(summa), 0)) from t2_xarajat where kompaniya_id = p_kompaniya_id and coalesce(holat, 'faol') <> 'bekor' and sana >= date_trunc('month', current_date)),
      'xarajat_toifalar', (select coalesce(jsonb_agg(jsonb_build_object('toifa', toifa, 'som', s) order by s desc), '[]') from (select coalesce(toifa, 'boshqa') toifa, round(sum(summa)) s from t2_xarajat where kompaniya_id = p_kompaniya_id and coalesce(holat, 'faol') <> 'bekor' group by 1 order by 2 desc limit 8) q),
      'faktura_soni', (select count(*) from t2_faktura where kompaniya_id = p_kompaniya_id),
      'faktura_jami_som', (select round(coalesce(sum(summa), 0)) from t2_faktura where kompaniya_id = p_kompaniya_id),
      'shartnomalar', (select coalesce(jsonb_agg(jsonb_build_object('raqam', raqam, 'taraf', taraf, 'holat', holat, 'jami_nds_bilan_som', round(jami_nds_bilan)) order by yangilandi desc), '[]') from (select * from t2_shartnoma where kompaniya_id = p_kompaniya_id and coalesce(holat, 'faol') <> 'bekor' order by yangilandi desc limit 10) s)));
  end if;

  if 'ombor' = any(v_so) then
    select coalesce(jsonb_agg(jsonb_build_object('nomi', nomi, 'birlik', birligi, 'qoldiq', q) order by q desc), '[]') into x from (
      select nomi, birligi, round(sum(case when operatsiya = 'prixod' then obyomi else -obyomi end), 2) q from t2_sklad_harakat
       where kompaniya_id = p_kompaniya_id and coalesce(holat, 'faol') <> 'bekor' and (p_obyekt_id is null or obyekt_id = p_obyekt_id) group by 1, 2
       having sum(case when operatsiya = 'prixod' then obyomi else -obyomi end) <> 0 order by 3 desc limit 25) m;
    r := r || jsonb_build_object('ombor_qoldiq', x);
    select coalesce(jsonb_agg(jsonb_build_object('sana', sana, 'amal', operatsiya, 'nomi', nomi, 'birlik', birligi, 'miqdor', obyomi) order by sana desc, id desc), '[]') into x from (
      select * from t2_sklad_harakat where kompaniya_id = p_kompaniya_id and coalesce(holat, 'faol') <> 'bekor' and (p_obyekt_id is null or obyekt_id = p_obyekt_id) order by sana desc, id desc limit 12) h;
    r := r || jsonb_build_object('ombor_oxirgi_harakatlar', x);
  end if;

  if 'sifat' = any(v_so) then
    r := r || jsonb_build_object('sifat', jsonb_build_object(
      'aosr_jami', (select count(*) from t2_aosr where kompaniya_id = p_kompaniya_id and (p_obyekt_id is null or obyekt_id = p_obyekt_id)),
      'aosr_holati', (select coalesce(jsonb_object_agg(coalesce(holat, 'noma''lum'), n), '{}') from (select holat, count(*) n from t2_aosr where kompaniya_id = p_kompaniya_id and (p_obyekt_id is null or obyekt_id = p_obyekt_id) group by 1) a),
      'aosr_oxirgi', (select coalesce(jsonb_agg(jsonb_build_object('raqam', raqam, 'ish', ish_nomi, 'sana', sana, 'holat', holat) order by id desc), '[]') from (select * from t2_aosr where kompaniya_id = p_kompaniya_id and (p_obyekt_id is null or obyekt_id = p_obyekt_id) order by id desc limit 8) a),
      'laboratoriya_jami', (select count(*) from t2_lab_protokol where kompaniya_id = p_kompaniya_id and (p_obyekt_id is null or obyekt_id = p_obyekt_id)),
      'laboratoriya_oxirgi', (select coalesce(jsonb_agg(jsonb_build_object('sana', sana, 'sinov', sinov_turi, 'marka', marka, 'natija', natija) order by sana desc nulls last), '[]') from (select * from t2_lab_protokol where kompaniya_id = p_kompaniya_id and (p_obyekt_id is null or obyekt_id = p_obyekt_id) order by sana desc nulls last limit 8) l)));
  end if;

  if 'kadr' = any(v_so) then
    select coalesce(jsonb_agg(jsonb_build_object('ism', ism_sharif, 'lavozim', lavozim, 'oylik', oylik_maosh, 'valyuta', valyuta) order by ism_sharif), '[]') into x from (
      select * from t2_kadr_mustaqil where kompaniya_id = p_kompaniya_id and coalesce(holat, 'faol') <> 'bekor' order by ism_sharif limit 40) kd;
    r := r || jsonb_build_object('xodimlar', x);
  end if;

  if 'texnika' = any(v_so) then
    select coalesce(jsonb_agg(jsonb_build_object('nomi', nomi, 'davlat_raqami', davlat_raqami) order by nomi), '[]') into x from (
      select * from t2_texnika_mustaqil where kompaniya_id = p_kompaniya_id and coalesce(holat, 'faol') <> 'bekor' order by nomi limit 25) tx;
    r := r || jsonb_build_object('texnika', x);
  end if;

  return jsonb_build_object('ok', true, 'rol', g->>'rol', 'ishlatilgan', to_jsonb(v_so), 'taqiqlangan', to_jsonb(v_rad), 'fakt', r);
end $function$;

CREATE OR REPLACE FUNCTION public.t2_agent_qidiruv_v1(p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_sozlar text[], p_resurs_sozlar text[], p_obyekt_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare g jsonb; k public.t2_agent_kasb%rowtype; v_pul boolean; v_hajm boolean; v_osz text[]; v_rsz text[]; v_ob bigint[]; v_obj jsonb; v_rows jsonb;
begin
  if p_kompaniya_id is null then return jsonb_build_object('ok', false, 'code', 'KOMPANIYA_KERAK'); end if;
  g := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not (g->>'ok')::boolean then return g; end if;
  select * into k from t2_agent_kasb where rol = g->>'rol';
  v_pul := 'smeta_pul' = any(coalesce(k.kategoriyalar, '{}'));
  v_hajm := v_pul or 'hajm' = any(coalesce(k.kategoriyalar, '{}'));
  v_osz := array(select distinct lower(x) from unnest(coalesce(p_obyekt_sozlar, '{}')) x where length(x) between 3 and 20 and x ~ '^[[:alnum:]]+$' limit 8);
  v_rsz := array(select distinct upper(x) from unnest(coalesce(p_resurs_sozlar, '{}')) x where length(x) between 2 and 20 and x ~ '^[[:alnum:]]+$' limit 6);
  if p_obyekt_id is not null then
    if not exists (select 1 from t2_obyekt where id = p_obyekt_id and kompaniya_id = p_kompaniya_id) then return jsonb_build_object('ok', false, 'code', 'OBYEKT_BEGONA'); end if;
    v_ob := array[p_obyekt_id];
  else
    v_ob := array(select id from t2_obyekt o where o.kompaniya_id = p_kompaniya_id and cardinality(v_osz) > 0
                    and exists (select 1 from unnest(v_osz) w where lower(o.nom) like '%' || w || '%') order by o.yangilandi desc nulls last limit 5);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nom', nom)), '[]') into v_obj from t2_obyekt where id = any(v_ob);
  if not v_hajm or cardinality(v_rsz) = 0 then
    return jsonb_build_object('ok', true, 'obyektlar', v_obj, 'qatorlar', '[]'::jsonb, 'ruxsat', v_hajm, 'narx_ruxsat', v_pul);
  end if;
  with q as (
    select q.obyekt_id, q.nom, q.birlik, q.tur, q.hajm, q.narx, q.summa,
           (select count(*) from unnest(v_rsz) w where upper(q.nom) like '%' || w || '%') m
      from t2_qator q
     where q.kompaniya_id = p_kompaniya_id and q.tur in ('rs', 'mat', 'ob', 'bl')
       and (cardinality(v_ob) = 0 or q.obyekt_id = any(v_ob))
       and upper(q.nom) like any (array(select '%' || w || '%' from unnest(v_rsz) w))
  ), eng as (select max(m) mm from q)
  select coalesce(jsonb_agg(z.j), '[]') into v_rows from (
    select jsonb_strip_nulls(jsonb_build_object('obyekt', (select o.nom from t2_obyekt o where o.id = q.obyekt_id), 'nom', left(q.nom, 200), 'birlik', q.birlik,
             'tur', q.tur, 'qator_soni', count(*), 'hajm', round(sum(q.hajm), 4),
             'narx_min', case when v_pul then min(q.narx) filter (where q.narx is not null) end, 'narx_max', case when v_pul then max(q.narx) filter (where q.narx is not null) end,
             'narxsiz_qator', count(*) filter (where q.narx is null), 'summa', case when v_pul then round(sum(q.summa)) end)) j
      from q, eng where q.m = eng.mm
     group by q.obyekt_id, q.nom, q.birlik, q.tur order by count(*) desc, q.nom limit 15) z;
  return jsonb_build_object('ok', true, 'obyektlar', v_obj, 'qatorlar', v_rows, 'ruxsat', true, 'narx_ruxsat', v_pul, 'sozlar', to_jsonb(v_rsz));
end $function$;

CREATE OR REPLACE FUNCTION public.t2_ai_kontekst(p_obyekt_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  v_ob record; v_r jsonb;
  v_smeta numeric; v_qator int; v_narxsiz int;
  v_fakt numeric; v_f2 numeric; v_mumkin numeric;
  v_ogoh jsonb := '[]'::jsonb;
  v_f2buz int; v_kozgu text; v_kozgu_vaqt timestamptz;
begin
  select o.id, o.nom, o.holat, k.nom kompaniya, l.nom loyiha
    into v_ob
  from t2_obyekt o
  join t2_kompaniya k on k.id = o.kompaniya_id
  left join t2_loyiha l on l.id = o.loyiha_id
  where o.id = p_obyekt_id;

  if not found then
    return jsonb_build_object('ok', false, 'xabar', 'Obyekt topilmadi: ' || p_obyekt_id);
  end if;

  /* ── SMETA: rz darajasidan (takror-hisob bo'lmasin) ───────────────────
     ⚠️ bl va uning rs bolalarini BIRGA qo'shish taqiqlanadi — bitta ish
     ikki marta sanaladi. Shu xato Tizim_01 da 7.72 → 10.99 mlrd bergan. */
  select coalesce(sum(summa), 0) into v_smeta
  from t2_qator where obyekt_id = p_obyekt_id and tur = 'rz';

  select count(*), count(*) filter (where narx is null)
    into v_qator, v_narxsiz
  from t2_qator
  where obyekt_id = p_obyekt_id and tur in ('rs','mat','ob');

  /* ── BAJARISH ─────────────────────────────────────────────────────── */
  select coalesce(sum(fakt_summa),0), coalesce(sum(f2_summa),0),
         coalesce(sum(f2_mumkin_summa),0)
    into v_fakt, v_f2, v_mumkin
  from t2_qator_holat where obyekt_id = p_obyekt_id;

  /* ── OGOHLANTIRISHLAR — AI bularni AYTISHI shart ──────────────────── */
  if v_narxsiz > 0 then
    v_ogoh := v_ogoh || jsonb_build_object(
      'tur','narx_yoq', 'soni',v_narxsiz,
      'matn', v_narxsiz || ' qatorda narx topilmagan — JAMI TO''LIQ EMAS, ' ||
              'bu raqam ustida moliyaviy qaror qabul qilmang');
  end if;

  select count(*) into v_f2buz from t2_qator_holat
  where obyekt_id = p_obyekt_id and f2_hajm > fakt_hajm + 0.001;
  if v_f2buz > 0 then
    v_ogoh := v_ogoh || jsonb_build_object(
      'tur','f2_faktdan_oshdi', 'soni',v_f2buz,
      'matn', v_f2buz || ' qatorda Ф2 ФАКТдан oshadi. Bu taqiqlanmagan ' ||
              '(Ф2 fakt kiritilmasdan ham yozilishi mumkin), lekin tekshirish kerak');
  end if;

  select holat, oxirgi_yozish into v_kozgu, v_kozgu_vaqt
  from t2_kozgu where obyekt_id = p_obyekt_id;
  if v_kozgu = 'farqli' then
    v_ogoh := v_ogoh || jsonb_build_object(
      'tur','kozgu_eskirgan',
      'matn','Google Sheets ko''zgusi bazadan orqada — varaqdagi raqamlar eski bo''lishi mumkin');
  end if;

  v_r := jsonb_build_object(
    'ok', true,
    'obyekt', jsonb_build_object('id',v_ob.id,'nom',v_ob.nom,
                'kompaniya',v_ob.kompaniya,'loyiha',v_ob.loyiha),

    'smeta', jsonb_build_object(
       'jami', v_smeta,
       'resurs_qatori', v_qator,
       'narxsiz_qator', v_narxsiz,
       'toliq', (v_narxsiz = 0)),

    /* Kategoriya kesimi — faqat barg qatorlardan (rs/mat/ob) */
    'kategoriya', (
       select coalesce(jsonb_object_agg(kat, jsonb_build_object(
                'summa', s, 'qator', n)), '{}'::jsonb)
       from (select coalesce(kat,'(belgilanmagan)') kat,
                    sum(summa) s, count(*) n
             from t2_qator
             where obyekt_id = p_obyekt_id and tur in ('rs','mat','ob')
             group by 1) x),

    'bajarish', jsonb_build_object(
       'fakt_summa', v_fakt,
       'f2_summa', v_f2,
       'f2_mumkin_summa', v_mumkin,
       /* Foiz faqat smeta > 0 bo'lsa — 0 ga bo'lish yoki yolg'on 0% yo'q */
       'fakt_foiz', case when v_smeta > 0 then round(v_fakt / v_smeta * 100, 2) end,
       'f2_foiz',   case when v_smeta > 0 then round(v_f2 / v_smeta * 100, 2) end),

    /* Eng qimmat 10 resurs — «nima ko'p pul yeyapti» savoliga */
    'eng_qimmat', (
       select coalesce(jsonb_agg(jsonb_build_object(
                'nom', nom, 'birlik', birlik, 'kat', kat,
                'hajm', hajm, 'narx', narx, 'summa', summa) order by summa desc), '[]'::jsonb)
       from (select nom, birlik, kat, hajm, narx, summa
             from t2_qator
             where obyekt_id = p_obyekt_id and tur in ('rs','mat','ob')
               and summa is not null
             order by summa desc limit 10) y),

    /* Narx topilmaganlar — AI «nega jami to'liq emas» ga javob bersin */
    'narxsiz_royxat', (
       select coalesce(jsonb_agg(jsonb_build_object(
                'nom', nom, 'birlik', birlik, 'hajm', hajm)), '[]'::jsonb)
       from (select nom, birlik, hajm from t2_qator
             where obyekt_id = p_obyekt_id and tur in ('rs','mat','ob')
               and narx is null
             order by hajm desc nulls last limit 20) z),

    'kozgu', jsonb_build_object('holat', v_kozgu, 'oxirgi_yozish', v_kozgu_vaqt),
    'ogohlantirish', v_ogoh,

    'izoh', case when v_narxsiz > 0
      then 'DIQQAT: jami to''liq emas (' || v_narxsiz || ' qatorda narx yo''q). ' ||
           'Javobda buni albatta ayting.'
      else 'Barcha resurs narxlangan — jami to''liq.' end
  );

  return v_r;
end $function$;

CREATE OR REPLACE FUNCTION public.t2_ai_umumiy(p_kompaniya_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
begin
  return jsonb_build_object(
    'ok', true,
    'obyektlar', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'nom', t.nom,
        'smeta', t.smeta, 'narxsiz', t.narxsiz, 'toliq', (t.narxsiz = 0),
        'fakt', t.fakt, 'f2', t.f2) order by t.smeta desc nulls last), '[]'::jsonb)
      from (
        select o.id, o.nom,
          (select sum(q.summa) from t2_qator q where q.obyekt_id=o.id and q.tur='rz') smeta,
          (select count(*) from t2_qator q where q.obyekt_id=o.id
             and q.tur in ('rs','mat','ob') and q.narx is null) narxsiz,
          (select coalesce(sum(h.fakt_summa),0) from t2_qator_holat h where h.obyekt_id=o.id) fakt,
          (select coalesce(sum(h.f2_summa),0) from t2_qator_holat h where h.obyekt_id=o.id) f2
        from t2_obyekt o
        where o.holat='faol'
          and (p_kompaniya_id is null or o.kompaniya_id = p_kompaniya_id)
      ) t),
    'izoh', 'Obyekt jami — rz darajasidan (takror-hisobsiz). narxsiz>0 bo''lgan obyektning jami TO''LIQ EMAS.');
end $function$;

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

CREATE OR REPLACE FUNCTION public.t2_agent_ishchi_narx_audit_v1(p_actor_id bigint, p_run_id bigint, p_expected_version integer, p_operation_id uuid, p_ogish_foiz numeric DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_prev jsonb; v_run public.t2_agent_run%rowtype; v_guard jsonb; v_natija jsonb; v_res jsonb;
  v_jami int; v_narxsiz int; v_dalilli int; v_ogish jsonb; v_taklif_bor jsonb; v_dalilsiz_top jsonb; v_xulosa text;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_agent_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  select * into v_run from public.t2_agent_run where id = p_run_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'RUN_NOT_FOUND'); end if;
  if v_run.agent_kod <> 'pto_smeta' or v_run.command_kod <> 'price.evidence.audit' then
    return jsonb_build_object('ok', false, 'code', 'WORKER_MISMATCH');
  end if;
  if v_run.obyekt_id is null then return jsonb_build_object('ok', false, 'code', 'OBJECT_SCOPE_REQUIRED'); end if;
  v_guard := public.t2_agent_scope_guard_v1(p_actor_id, v_run.kompaniya_id, v_run.loyiha_id, v_run.obyekt_id);
  if coalesce((v_guard->>'ok')::boolean, false) is not true then return v_guard; end if;
  if p_expected_version is null or p_expected_version <> v_run.versiya then
    return jsonb_build_object('ok', false, 'code', 'STALE_VERSION', 'versiya', v_run.versiya);
  end if;
  if v_run.holat <> 'queued' then return jsonb_build_object('ok', false, 'code', 'RUN_NOT_QUEUED', 'holat', v_run.holat); end if;

  select count(*), count(*) filter (where q.narx is null), count(*) filter (where d.qator_id is not null)
    into v_jami, v_narxsiz, v_dalilli
  from public.t2_qator q
  left join public.t2_narx_dalil d on d.qator_id = q.id and d.holat = 'faol'
  where q.obyekt_id = v_run.obyekt_id and q.tur in ('rs', 'mat', 'ob');

  select coalesce(jsonb_agg(x order by abs((x->>'ogish_foiz')::numeric) desc), '[]'::jsonb) into v_ogish from (
    select jsonb_build_object('qator_id', h.qator_id, 'nom', h.nom, 'birlik', h.birlik, 'smeta_narx', h.hozirgi_narx,
             'manba_narx', h.manba_narx, 'manba', h.manba_nom,
             'ogish_foiz', round((h.manba_narx - h.hozirgi_narx) / h.hozirgi_narx * 100, 2)) x
    from public.t2_narx_dalil_holat h
    where h.obyekt_id = v_run.obyekt_id and h.hozirgi_narx is not null and h.hozirgi_narx <> 0 and h.manba_narx is not null
      and abs((h.manba_narx - h.hozirgi_narx) / h.hozirgi_narx * 100) > coalesce(p_ogish_foiz, 10)
    limit 200) s;

  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_taklif_bor from (
    select jsonb_build_object('qator_id', t.qator_id, 'nom', min(t.nom), 'nomzodlar', count(*)) x
    from public.t2_narx_taklif t
    where t.obyekt_id = v_run.obyekt_id
      and not exists (select 1 from public.t2_narx_dalil d where d.qator_id = t.qator_id and d.holat = 'faol')
    group by t.qator_id order by t.qator_id limit 500) s;

  select coalesce(jsonb_agg(x order by (x->>'summa')::numeric desc nulls last), '[]'::jsonb) into v_dalilsiz_top from (
    select jsonb_build_object('qator_id', q.id, 'nom', q.nom, 'kat', q.kat, 'birlik', q.birlik, 'narx', q.narx, 'summa', q.summa) x
    from public.t2_qator q
    where q.obyekt_id = v_run.obyekt_id and q.tur in ('rs', 'mat', 'ob') and q.narx is not null
      and not exists (select 1 from public.t2_narx_dalil d where d.qator_id = q.id and d.holat = 'faol')
    order by q.summa desc nulls last limit 30) s;

  v_xulosa := format('%s ta resursdan %s tasi dalil bilan tasdiqlangan (%s%%); %s tasida narx yo''q; %s tasida manbadan og''ish %s%% dan katta; %s tasiga aniq taklif bor, lekin hali bog''lanmagan.',
    v_jami, v_dalilli, case when v_jami > 0 then round(v_dalilli::numeric * 100 / v_jami, 1) else 0 end,
    v_narxsiz, jsonb_array_length(v_ogish), coalesce(p_ogish_foiz, 10), jsonb_array_length(v_taklif_bor));
  v_natija := jsonb_build_object('agent', 'pto_smeta', 'turi', 'narx_dalil_auditi', 'vaqt', now(),
    'resurslar', v_jami, 'dalilli', v_dalilli, 'narxsiz', v_narxsiz, 'ogish_chegara_foiz', coalesce(p_ogish_foiz, 10),
    'katta_ogish', v_ogish, 'taklif_bor_boglanmagan', v_taklif_bor, 'dalilsiz_eng_katta', v_dalilsiz_top, 'xulosa', v_xulosa);

  update public.t2_agent_run set holat = 'waiting_review', result = v_natija, versiya = versiya + 1,
    started_at = coalesce(started_at, now()), updated_at = now() where id = p_run_id;
  perform public.t2_audit_yoz(v_run.kompaniya_id, 'agent_worker_run', 'agent_control', v_run.obyekt_id,
    format('run=%s worker=narx_audit resurs=%s dalilli=%s', p_run_id, v_jami, v_dalilli), 'actor:' || p_actor_id, null);
  v_res := jsonb_build_object('ok', true, 'run_id', p_run_id, 'holat', 'waiting_review', 'versiya', v_run.versiya + 1, 'result', v_natija);
  insert into public.t2_agent_command_log(operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'agent_worker_narx_audit', v_res);
  return v_res;
end $function$;

CREATE OR REPLACE FUNCTION public.t2_agent_ishchi_ombor_v1(p_actor_id bigint, p_run_id bigint, p_expected_version integer, p_operation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_prev jsonb; v_run public.t2_agent_run%rowtype; v_guard jsonb; v_natija jsonb; v_res jsonb;
  v_bez int; v_bez_summa numeric; v_aktda jsonb; v_shubhali jsonb; v_xulosa text;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_agent_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  select * into v_run from public.t2_agent_run where id = p_run_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'RUN_NOT_FOUND'); end if;
  if v_run.agent_kod <> 'warehouse' or v_run.command_kod <> 'warehouse.bezsklad.audit' then
    return jsonb_build_object('ok', false, 'code', 'WORKER_MISMATCH');
  end if;
  if v_run.obyekt_id is null then return jsonb_build_object('ok', false, 'code', 'OBJECT_SCOPE_REQUIRED'); end if;
  v_guard := public.t2_agent_scope_guard_v1(p_actor_id, v_run.kompaniya_id, v_run.loyiha_id, v_run.obyekt_id);
  if coalesce((v_guard->>'ok')::boolean, false) is not true then return v_guard; end if;
  if p_expected_version is null or p_expected_version <> v_run.versiya then
    return jsonb_build_object('ok', false, 'code', 'STALE_VERSION', 'versiya', v_run.versiya);
  end if;
  if v_run.holat <> 'queued' then return jsonb_build_object('ok', false, 'code', 'RUN_NOT_QUEUED', 'holat', v_run.holat); end if;

  select count(*), coalesce(sum(summa), 0) into v_bez, v_bez_summa
    from public.t2_qator where obyekt_id = v_run.obyekt_id and tur in ('rs', 'mat') and kat = 'БЕЗСКЛАД';

  select coalesce(jsonb_agg(jsonb_build_object('qator_id', q.id, 'nom', q.nom, 'birlik', q.birlik, 'summa', q.summa) order by q.summa desc nulls last), '[]'::jsonb)
    into v_aktda
  from public.t2_qator q
  where q.obyekt_id = v_run.obyekt_id and q.tur in ('rs', 'mat') and q.kat = 'МАТ'
    and public.t2_bez_sklad_qoida(q.nom, q.birlik)
    and exists (select 1 from public.t2_akt_qator a where a.qator_id = q.id);

  select coalesce(jsonb_agg(x order by (x->>'summa')::numeric desc nulls last), '[]'::jsonb) into v_shubhali from (
    select jsonb_build_object('nom', min(q.nom), 'birlik', q.birlik, 'qatorlar', count(*), 'summa', sum(q.summa)) x
    from public.t2_qator q
    where q.obyekt_id = v_run.obyekt_id and q.tur in ('rs', 'mat') and q.kat = 'МАТ'
      and upper(q.nom) ~ '(БЕТОН|РАСТВОР)' and not public.t2_bez_sklad_qoida(q.nom, q.birlik)
    group by upper(btrim(q.nom)), q.birlik
    order by sum(q.summa) desc nulls last limit 100) s;

  v_xulosa := format('Qoida (beton/rastvor + м³, asfaltobeton т/м³) bo''yicha avtomatik БЕЗСКЛАД: %s qator, %s so''m. F2 aktida bo''lgani uchun МАТ qolgan: %s qator. Nomida beton/rastvor bor, lekin qoidaga tushmagan: %s xil — ko''zdan kechiring.',
    v_bez, to_char(round(v_bez_summa), 'FM999G999G999G999G990'), jsonb_array_length(v_aktda), jsonb_array_length(v_shubhali));
  v_natija := jsonb_build_object('agent', 'warehouse', 'turi', 'bez_sklad_nazorat', 'vaqt', now(),
    'bez_sklad_qatorlar', v_bez, 'bez_sklad_summa', round(v_bez_summa, 2),
    'aktda_qolgan', v_aktda, 'shubhali', v_shubhali, 'xulosa', v_xulosa);

  update public.t2_agent_run set holat = 'waiting_review', result = v_natija, versiya = versiya + 1,
    started_at = coalesce(started_at, now()), updated_at = now() where id = p_run_id;
  perform public.t2_audit_yoz(v_run.kompaniya_id, 'agent_worker_run', 'agent_control', v_run.obyekt_id,
    format('run=%s worker=ombor_bezsklad bez=%s aktda=%s shubhali=%s', p_run_id, v_bez, jsonb_array_length(v_aktda), jsonb_array_length(v_shubhali)), 'actor:' || p_actor_id, null);
  v_res := jsonb_build_object('ok', true, 'run_id', p_run_id, 'holat', 'waiting_review', 'versiya', v_run.versiya + 1, 'result', v_natija);
  insert into public.t2_agent_command_log(operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'agent_worker_ombor', v_res);
  return v_res;
end $function$;

CREATE OR REPLACE FUNCTION public.t2_narxla(p_obyekt_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_stavka numeric;
  r_jami int; r_exact int; r_labor int; r_stavka int; r_mash0 int; r_miss int;
  r_qol int; r_belgi int;
begin
  perform t2_manba_belgila('narxlash');

  select son into v_stavka
  from t2_sozlama where obyekt_id = p_obyekt_id and kalit = 'chel_stavka';
  v_stavka := coalesce(v_stavka, 0);

  with svod as (
    select nom_key, birlik_key, narx, kat from t2_narx where obyekt_id = p_obyekt_id
  ), labor as (
    select birlik_key, max(narx) narx from t2_narx
    where obyekt_id = p_obyekt_id and position('ЗАТРАТЫТРУДАРАБОЧИХ' in nom_key) > 0
    group by birlik_key
  ), registr as (
    select nom_key, birlik_key, kat, belgilangan,
           /* ⚠️ SHU QATOR YETISHMAYOTGAN EDI */
           case when belgilangan then narx end belgi_narx
    from t2_narx where obyekt_id is null
  ), hisob as (
    select q.id,
      case
        when position('ТРУДА МАШИНИСТ' in t2_norm(q.nom)) > 0 then 0::numeric
        /* Odam ataylab belgilagan narx svodkani ham bosib o'tadi */
        when r.belgi_narx is not null then r.belgi_narx
        when s.narx is not null then s.narx
        when position('ТРУДА РАБОЧИХ' in t2_norm(q.nom)) > 0 and l.narx is not null then l.narx
        else null end base_narx,
      case
        when position('ТРУДА МАШИНИСТ' in t2_norm(q.nom)) > 0 then 'МАШИНИСТ_0'
        when r.belgi_narx is not null then 'BELGILANGAN'
        when s.narx is not null then 'EXACT'
        when position('ТРУДА РАБОЧИХ' in t2_norm(q.nom)) > 0 and l.narx is not null then 'LABOR_FALLBACK'
        else 'MISS' end usul,
      coalesce(
        case when r.belgilangan then r.kat end,
        s.kat,
        case when coalesce(s.kat,'МАТ') = 'МАТ' then r.kat end,
        'МАТ') xom_kat,
      t2_kat_birlik(q.birlik, q.nom) bir_kat,
      q.nom, q.hajm
    from t2_qator q
    left join svod s    on s.nom_key = q.nom_key and s.birlik_key = q.birlik_key
    left join labor l   on l.birlik_key = q.birlik_key
    left join registr r on r.nom_key = q.nom_key and r.birlik_key = q.birlik_key
    where q.obyekt_id = p_obyekt_id and q.tur in ('rs','mat','ob')
      -- ⚡ QO'LDA KIRITILGAN NARXGA TEGILMAYDI
      and coalesce(q.narx_usul, '') <> 'QOL'
  ), yakun as (
    select id,
      /* ⚠️ ЧЕЛ stavkasi belgilangan narxni BOSIB O'TMAYDI:
         stavka umumiy sozlama, belgilangan esa aynan shu resursga
         qo'yilgan qaror — aniqrog'i ustun turadi. */
      case when v_stavka > 0 and position('ТРУДА РАБОЧИХ' in t2_norm(nom)) > 0
                and usul <> 'BELGILANGAN'
           then v_stavka else base_narx end oxirgi_narx,
      case when v_stavka > 0 and position('ТРУДА РАБОЧИХ' in t2_norm(nom)) > 0
                and usul <> 'BELGILANGAN'
           then 'СТАВКА_ЧЕЛ' else usul end oxirgi_usul,
      case when bir_kat in ('ЧЕЛ','МАШ') then bir_kat
           when xom_kat in ('ЧЕЛ','МАШ') then 'МАТ'
           else xom_kat end oxirgi_kat
    from hisob
  )
  update t2_qator q
     set narx = y.oxirgi_narx, kat = y.oxirgi_kat, narx_usul = y.oxirgi_usul,
         summa = case when y.oxirgi_narx is null then null
                      else round(coalesce(q.hajm,0) * y.oxirgi_narx, 2) end,
         yangilandi = now()
  from yakun y where q.id = y.id;

  /* QOL qatorlarining summasi ham hajm o'zgargan bo'lsa yangilanadi */
  update t2_qator q
     set summa = case when q.narx is null then null
                      else round(coalesce(q.hajm,0) * q.narx, 2) end,
         yangilandi = now()
  where q.obyekt_id = p_obyekt_id and q.tur in ('rs','mat','ob')
    and coalesce(q.narx_usul,'') = 'QOL'
    and q.summa is distinct from (case when q.narx is null then null
                                       else round(coalesce(q.hajm,0) * q.narx, 2) end);

  select count(*),
         count(*) filter (where narx_usul='EXACT'),
         count(*) filter (where narx_usul='LABOR_FALLBACK'),
         count(*) filter (where narx_usul='СТАВКА_ЧЕЛ'),
         count(*) filter (where narx_usul='МАШИНИСТ_0'),
         count(*) filter (where narx_usul='MISS'),
         count(*) filter (where narx_usul='QOL'),
         count(*) filter (where narx_usul='BELGILANGAN')
    into r_jami, r_exact, r_labor, r_stavka, r_mash0, r_miss, r_qol, r_belgi
  from t2_qator where obyekt_id = p_obyekt_id and tur in ('rs','mat','ob');

  return jsonb_build_object('ok', true, 'narxlanadigan', r_jami,
    'EXACT', r_exact, 'LABOR_FALLBACK', r_labor, 'СТАВКА_ЧЕЛ', r_stavka,
    'МАШИНИСТ_0', r_mash0, 'MISS', r_miss, 'QOL', r_qol,
    'BELGILANGAN', r_belgi,
    'qamrov_foiz', case when r_jami = 0 then 0
                        else round(100.0 * (r_jami - r_miss) / r_jami, 1) end);
end $function$;

CREATE OR REPLACE FUNCTION public.t2_smeta_narxla_res_v1(p_kompaniya_id bigint, p_actor_id bigint, p_obyekt_id bigint, p_operation_id uuid, p_narxlar jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_rol text;
  v_obyekt_kompaniya bigint;
  v_old jsonb;
  v_kiritilgan integer := 0;
  v_yaroqli integer := 0;
  v_ziddiyatli integer := 0;
  v_narxsiz integer := 0;
  v_mos integer := 0;
  v_yozildi integer := 0;
  v_natija jsonb;
begin
  if p_kompaniya_id is null or p_kompaniya_id <= 0
     or p_actor_id is null or p_actor_id <= 0
     or p_obyekt_id is null or p_obyekt_id <= 0
     or p_operation_id is null then
    raise exception 'kompaniya, actor, obyekt va operation_id majburiy' using errcode = '22023';
  end if;
  if jsonb_typeof(p_narxlar) <> 'array' then
    raise exception 'p_narxlar JSON array bo''lishi shart' using errcode = '22023';
  end if;
  if jsonb_array_length(p_narxlar) = 0 or jsonb_array_length(p_narxlar) > 10000 then
    raise exception 'p_narxlar 1..10000 qator bo''lishi shart' using errcode = '22023';
  end if;

  select o.kompaniya_id into v_obyekt_kompaniya
    from public.t2_obyekt o
   where o.id = p_obyekt_id and o.holat <> 'bekor';
  if not found or v_obyekt_kompaniya <> p_kompaniya_id then
    raise exception 'obyekt boshqa tenantga tegishli yoki faol emas' using errcode = '42501';
  end if;

  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id); 
  perform public.t2_require_permission_v2(p_kompaniya_id,p_actor_id,'narx.write');
  if v_rol not in ('admin', 'superadmin', 'boss', 'director', 'pto') and not public.t2_permission_allowed_v2(p_kompaniya_id,p_actor_id,'narx.write') then
    raise exception 'bu rol RES narxlashga ruxsatli emas' using errcode = '42501';
  end if;

  select natija into v_old
    from public.t2_onboarding_command_log
   where operation_id = p_operation_id;
  if found then
    return v_old || jsonb_build_object('takror', true);
  end if;

  perform set_config('t2.manba', 'narxlash', true);
  perform set_config('t2.kim', 'actor:' || p_actor_id::text, true);

  with source_raw as (
    select
      nullif(regexp_replace(upper(coalesce(x.kod, '')), '[[:space:][:punct:]]', '', 'g'), '') as kod_key,
      public.t2_resurs_nom_kalit(x.nom) as nom_key,
      public.t2_resurs_birlik_kalit(x.birlik) as birlik_key,
      x.narx
    from jsonb_to_recordset(p_narxlar) as x(kod text, nom text, birlik text, narx numeric)
  ), source_valid as (
    select * from source_raw
     where nom_key <> '' and birlik_key <> '' and narx is not null and narx > 0
  ), source_grouped as (
    select kod_key, nom_key, birlik_key, min(narx) as narx, count(distinct narx) as narx_soni
      from source_valid
     group by kod_key, nom_key, birlik_key
  )
  select (select count(*) from source_raw),
         (select count(*) from source_grouped where narx_soni = 1),
         (select count(*) from source_grouped where narx_soni <> 1)
    into v_kiritilgan, v_yaroqli, v_ziddiyatli;

  with source_raw as (
    select
      nullif(regexp_replace(upper(coalesce(x.kod, '')), '[[:space:][:punct:]]', '', 'g'), '') as kod_key,
      public.t2_resurs_nom_kalit(x.nom) as nom_key,
      public.t2_resurs_birlik_kalit(x.birlik) as birlik_key,
      x.narx
    from jsonb_to_recordset(p_narxlar) as x(kod text, nom text, birlik text, narx numeric)
  ), source_grouped as (
    select kod_key, nom_key, birlik_key, min(narx) as narx
      from source_raw
     where nom_key <> '' and birlik_key <> '' and narx is not null and narx > 0
     group by kod_key, nom_key, birlik_key
    having count(distinct narx) = 1
  ), target as (
    select q.id, q.hajm
      from public.t2_qator q
     where q.kompaniya_id = p_kompaniya_id and q.obyekt_id = p_obyekt_id
       and q.tur in ('rs', 'mat', 'ob') and (q.narx is null or q.narx = 0)
  ), candidate as (
    select t.id, s.narx
      from target t
      join public.t2_qator q on q.id = t.id
      join source_grouped s
        on public.t2_resurs_nom_kalit(q.nom) = s.nom_key
       and public.t2_resurs_birlik_kalit(q.birlik) = s.birlik_key
       and (s.kod_key is null or s.kod_key = regexp_replace(upper(coalesce(q.kod, '')), '[[:space:][:punct:]]', '', 'g'))
  ), target_unique as (
    select id, min(narx) as narx
      from candidate
     group by id
    having count(distinct narx) = 1
  )
  select (select count(*) from target), (select count(*) from target_unique)
    into v_narxsiz, v_mos;

  with source_raw as (
    select
      nullif(regexp_replace(upper(coalesce(x.kod, '')), '[[:space:][:punct:]]', '', 'g'), '') as kod_key,
      public.t2_resurs_nom_kalit(x.nom) as nom_key,
      public.t2_resurs_birlik_kalit(x.birlik) as birlik_key,
      x.narx
    from jsonb_to_recordset(p_narxlar) as x(kod text, nom text, birlik text, narx numeric)
  ), source_grouped as (
    select kod_key, nom_key, birlik_key, min(narx) as narx
      from source_raw
     where nom_key <> '' and birlik_key <> '' and narx is not null and narx > 0
     group by kod_key, nom_key, birlik_key
    having count(distinct narx) = 1
  ), candidate as (
    select q.id, s.narx
      from public.t2_qator q
      join source_grouped s
        on public.t2_resurs_nom_kalit(q.nom) = s.nom_key
       and public.t2_resurs_birlik_kalit(q.birlik) = s.birlik_key
       and (s.kod_key is null or s.kod_key = regexp_replace(upper(coalesce(q.kod, '')), '[[:space:][:punct:]]', '', 'g'))
     where q.kompaniya_id = p_kompaniya_id and q.obyekt_id = p_obyekt_id
       and q.tur in ('rs', 'mat', 'ob') and (q.narx is null or q.narx = 0)
  ), target_unique as (
    select id, min(narx) as narx
      from candidate
     group by id
    having count(distinct narx) = 1
  ), updated as (
    update public.t2_qator q
       set narx = u.narx,
           summa = case when q.hajm is null then null else q.hajm * u.narx end,
           narx_usul = 'RES'
      from target_unique u
     where q.id = u.id and (q.narx is null or q.narx = 0)
    returning q.id
  )
  select count(*) into v_yozildi from updated;

  perform public.t2_rollup(p_obyekt_id);
  if v_narxsiz < 5000 then
    perform public.t2_signal_refresh_object(p_kompaniya_id, p_obyekt_id);
  end if;

  v_natija := jsonb_build_object(
    'ok', true, 'takror', false, 'obyekt_id', p_obyekt_id,
    'kiritilgan', v_kiritilgan, 'yaroqli_manba', v_yaroqli,
    'ziddiyatli_manba', v_ziddiyatli, 'narxsiz', v_narxsiz,
    'mos', v_mos, 'yozildi', v_yozildi, 'narxsiz_qoldi', greatest(v_narxsiz - v_yozildi, 0)
  );

  insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija)
  values (p_operation_id, p_actor_id, 't2_smeta_narxla_res_v1', v_natija);
  perform public.t2_audit_yoz(p_kompaniya_id, 'smeta_narxla_res', 'smeta', p_obyekt_id,
    format('RES qator=%s; mos=%s; yozildi=%s', v_kiritilgan, v_mos, v_yozildi),
    'actor:' || p_actor_id::text, null);
  return v_natija;
end;
$function$;

CREATE OR REPLACE FUNCTION public.t2_smeta_narxla_res_v2(p_kompaniya_id bigint, p_actor_id bigint, p_obyekt_id bigint, p_operation_id uuid, p_narxlar jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_rol text;
  v_obyekt_kompaniya bigint;
  v_old jsonb;
  v_old_actor bigint;
  v_old_command text;
  v_kiritilgan integer := 0;
  v_yaroqli integer := 0;
  v_ziddiyatli integer := 0;
  v_narxsiz integer := 0;
  v_mos integer := 0;
  v_yozildi integer := 0;
  v_natija jsonb;
begin
  if p_kompaniya_id is null or p_kompaniya_id <= 0
     or p_actor_id is null or p_actor_id <= 0
     or p_obyekt_id is null or p_obyekt_id <= 0
     or p_operation_id is null then
    raise exception 'kompaniya, actor, obyekt va operation_id majburiy' using errcode = '22023';
  end if;
  if p_narxlar is null or jsonb_typeof(p_narxlar) <> 'array' then
    raise exception 'p_narxlar JSON array bo''lishi shart' using errcode = '22023';
  end if;
  if jsonb_array_length(p_narxlar) = 0 or jsonb_array_length(p_narxlar) > 10000 then
    raise exception 'p_narxlar 1..10000 qator bo''lishi shart' using errcode = '22023';
  end if;

  select o.kompaniya_id into v_obyekt_kompaniya
    from public.t2_obyekt o
   where o.id = p_obyekt_id and o.holat <> 'bekor';
  if not found or v_obyekt_kompaniya <> p_kompaniya_id then
    raise exception 'obyekt boshqa tenantga tegishli yoki faol emas' using errcode = '42501';
  end if;

  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id); 
  perform public.t2_require_permission_v2(p_kompaniya_id,p_actor_id,'narx.write');
  if v_rol not in ('admin', 'superadmin', 'boss', 'director', 'pto') and not public.t2_permission_allowed_v2(p_kompaniya_id,p_actor_id,'narx.write') then
    raise exception 'bu rol RES narxlashga ruxsatli emas' using errcode = '42501';
  end if;

  -- Idempotent javob faqat actor + tenant tekshirilgandan keyin qaytariladi.
  --
  -- ⚠️ 2026-09-08 (Claude, ko'rib chiqishda topildi): bu yerda avval
  -- `return v_old;` turardi — ya'ni takroriy chaqiruvda ham saqlangan
  -- javobdagi `takror: false` qaytardi. Yozuv takrorlanmasdi (bu to'g'ri
  -- ishlagan), lekin CHAQIRUVCHI buni yangi narxlash deb o'qirdi va
  -- ekranda "N qator narxlandi" ni QAYTA ko'rsatardi. Shu sabab bu
  -- fayl bilan birga kelgan acceptance testining o'zi ham yiqilardi
  -- (u aynan `takror = true` ni talab qiladi). Endi bayroq to'g'ri.
  perform pg_advisory_xact_lock(hashtextextended('t2_smeta_narxla_res_v2:' || p_operation_id::text, 0));
  select natija, actor_id, command into v_old, v_old_actor, v_old_command
    from public.t2_onboarding_command_log
   where operation_id = p_operation_id;
  if found then
    if v_old_actor is distinct from p_actor_id or v_old_command is distinct from 't2_smeta_narxla_res_v2'
       or (v_old->>'obyekt_id')::bigint is distinct from p_obyekt_id then
      raise exception 'operation_id boshqa actor, obyekt yoki amalga tegishli' using errcode = '42501';
    end if;
    return v_old || jsonb_build_object('takror', true);
  end if;

  perform set_config('t2.manba', 'narxlash', true);
  perform set_config('t2.kim', 'actor:' || p_actor_id::text, true);

  with source_raw as (
    select
      public.t2_resurs_nom_kalit(x.nom) as nom_key,
      public.t2_resurs_birlik_kalit(x.birlik) as birlik_key,
      x.narx
    from jsonb_to_recordset(p_narxlar) as x(nom text, birlik text, narx numeric)
  ), source_valid as (
    select * from source_raw
     where nom_key <> '' and birlik_key <> '' and narx is not null and narx >= 0 and narx not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
  ), source_grouped as (
    select nom_key, birlik_key, min(narx) as narx, count(distinct narx) as narx_soni
      from source_valid
     group by nom_key, birlik_key
  )
  select (select count(*) from source_raw),
         (select count(*) from source_grouped where narx_soni = 1),
         (select count(*) from source_grouped where narx_soni <> 1)
    into v_kiritilgan, v_yaroqli, v_ziddiyatli;

  with source_raw as (
    select
      public.t2_resurs_nom_kalit(x.nom) as nom_key,
      public.t2_resurs_birlik_kalit(x.birlik) as birlik_key,
      x.narx
    from jsonb_to_recordset(p_narxlar) as x(nom text, birlik text, narx numeric)
  ), source_grouped as (
    select nom_key, birlik_key, min(narx) as narx
      from source_raw
     where nom_key <> '' and birlik_key <> '' and narx is not null and narx >= 0 and narx not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
     group by nom_key, birlik_key
    having count(distinct narx) = 1
  ), target as (
    select q.id, q.hajm
      from public.t2_qator q
     where q.kompaniya_id = p_kompaniya_id and q.obyekt_id = p_obyekt_id
       and q.tur in ('rs', 'mat', 'ob') and q.narx is null
  ), candidate as (
    select t.id, s.narx
      from target t
      join public.t2_qator q on q.id = t.id
      join source_grouped s
        on public.t2_resurs_nom_kalit(q.nom) = s.nom_key
       and public.t2_resurs_birlik_kalit(q.birlik) = s.birlik_key
  ), target_unique as (
    select id, min(narx) as narx
      from candidate
     group by id
    having count(distinct narx) = 1
  )
  select (select count(*) from target), (select count(*) from target_unique)
    into v_narxsiz, v_mos;

  with source_raw as (
    select
      public.t2_resurs_nom_kalit(x.nom) as nom_key,
      public.t2_resurs_birlik_kalit(x.birlik) as birlik_key,
      x.narx
    from jsonb_to_recordset(p_narxlar) as x(nom text, birlik text, narx numeric)
  ), source_grouped as (
    select nom_key, birlik_key, min(narx) as narx
      from source_raw
     where nom_key <> '' and birlik_key <> '' and narx is not null and narx >= 0 and narx not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
     group by nom_key, birlik_key
    having count(distinct narx) = 1
  ), candidate as (
    select q.id, s.narx
      from public.t2_qator q
      join source_grouped s
        on public.t2_resurs_nom_kalit(q.nom) = s.nom_key
       and public.t2_resurs_birlik_kalit(q.birlik) = s.birlik_key
     where q.kompaniya_id = p_kompaniya_id and q.obyekt_id = p_obyekt_id
       and q.tur in ('rs', 'mat', 'ob') and q.narx is null
  ), target_unique as (
    select id, min(narx) as narx
      from candidate
     group by id
    having count(distinct narx) = 1
  ), updated as (
    update public.t2_qator q
       set narx = u.narx,
           summa = case when q.hajm is null then null else q.hajm * u.narx end,
           narx_usul = 'RES'
      from target_unique u
     where q.id = u.id and q.narx is null
    returning q.id
  )
  select count(*) into v_yozildi from updated;

  perform public.t2_rollup(p_obyekt_id);
  if v_narxsiz < 5000 then
    perform public.t2_signal_refresh_object(p_kompaniya_id, p_obyekt_id);
  end if;

  v_natija := jsonb_build_object(
    'ok', true, 'takror', false, 'obyekt_id', p_obyekt_id,
    'kiritilgan', v_kiritilgan, 'yaroqli_manba', v_yaroqli,
    'ziddiyatli_manba', v_ziddiyatli, 'narxsiz', v_narxsiz,
    'mos', v_mos, 'yozildi', v_yozildi, 'narxsiz_qoldi', greatest(v_narxsiz - v_yozildi, 0)
  );

  insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija)
  values (p_operation_id, p_actor_id, 't2_smeta_narxla_res_v2', v_natija);
  perform public.t2_audit_yoz(p_kompaniya_id, 'smeta_narxla_res', 'smeta', p_obyekt_id,
    format('RES qator=%s; mos=%s; yozildi=%s', v_kiritilgan, v_mos, v_yozildi),
    'actor:' || p_actor_id::text, null);
  return v_natija;
end;
$function$;

CREATE OR REPLACE FUNCTION public.t2_smeta_narxla_res_v3(p_kompaniya_id bigint, p_actor_id bigint, p_obyekt_id bigint, p_operation_id uuid, p_narxlar jsonb, p_nol_ham boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_rol text;
  v_obyekt_kompaniya bigint;
  v_old jsonb;
  v_old_actor bigint;
  v_old_command text;
  v_kiritilgan integer := 0;
  v_yaroqli integer := 0;
  v_ziddiyatli integer := 0;
  v_narxsiz integer := 0;
  v_mos integer := 0;
  v_yozildi integer := 0;
  v_natija jsonb;
begin
  if p_kompaniya_id is null or p_kompaniya_id <= 0
     or p_actor_id is null or p_actor_id <= 0
     or p_obyekt_id is null or p_obyekt_id <= 0
     or p_operation_id is null then
    raise exception 'kompaniya, actor, obyekt va operation_id majburiy' using errcode = '22023';
  end if;
  if p_narxlar is null or jsonb_typeof(p_narxlar) <> 'array' then
    raise exception 'p_narxlar JSON array bo''lishi shart' using errcode = '22023';
  end if;
  if p_nol_ham is null then
    raise exception 'p_nol_ham majburiy (true/false)' using errcode = '22023';
  end if;
  if jsonb_array_length(p_narxlar) = 0 or jsonb_array_length(p_narxlar) > 10000 then
    raise exception 'p_narxlar 1..10000 qator bo''lishi shart' using errcode = '22023';
  end if;

  select o.kompaniya_id into v_obyekt_kompaniya
    from public.t2_obyekt o
   where o.id = p_obyekt_id and o.holat <> 'bekor';
  if not found or v_obyekt_kompaniya <> p_kompaniya_id then
    raise exception 'obyekt boshqa tenantga tegishli yoki faol emas' using errcode = '42501';
  end if;

  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  if v_rol not in ('admin', 'superadmin', 'boss', 'director', 'pto') then
    raise exception 'bu rol RES narxlashga ruxsatli emas' using errcode = '42501';
  end if;

  -- Idempotent javob faqat actor + tenant tekshirilgandan keyin qaytariladi.
  --
  -- ⚠️ 2026-09-08 (Claude, ko'rib chiqishda topildi): bu yerda avval
  -- `return v_old;` turardi — ya'ni takroriy chaqiruvda ham saqlangan
  -- javobdagi `takror: false` qaytardi. Yozuv takrorlanmasdi (bu to'g'ri
  -- ishlagan), lekin CHAQIRUVCHI buni yangi narxlash deb o'qirdi va
  -- ekranda "N qator narxlandi" ni QAYTA ko'rsatardi. Shu sabab bu
  -- fayl bilan birga kelgan acceptance testining o'zi ham yiqilardi
  -- (u aynan `takror = true` ni talab qiladi). Endi bayroq to'g'ri.
  perform pg_advisory_xact_lock(hashtextextended('t2_smeta_narxla_res_v3:' || p_operation_id::text, 0));
  select natija, actor_id, command into v_old, v_old_actor, v_old_command
    from public.t2_onboarding_command_log
   where operation_id = p_operation_id;
  if found then
    if v_old_actor is distinct from p_actor_id or v_old_command is distinct from 't2_smeta_narxla_res_v3'
       or (v_old->>'obyekt_id')::bigint is distinct from p_obyekt_id then
      raise exception 'operation_id boshqa actor, obyekt yoki amalga tegishli' using errcode = '42501';
    end if;
    return v_old || jsonb_build_object('takror', true);
  end if;

  perform set_config('t2.manba', 'narxlash', true);
  perform set_config('t2.kim', 'actor:' || p_actor_id::text, true);

  with source_raw as (
    select
      public.t2_resurs_nom_kalit(x.nom) as nom_key,
      public.t2_resurs_birlik_kalit(x.birlik) as birlik_key,
      x.narx
    from jsonb_to_recordset(p_narxlar) as x(nom text, birlik text, narx numeric)
  ), source_valid as (
    select * from source_raw
     where nom_key <> '' and birlik_key <> '' and narx is not null and narx >= 0 and narx not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
  ), source_grouped as (
    select nom_key, birlik_key, min(narx) as narx, count(distinct narx) as narx_soni
      from source_valid
     group by nom_key, birlik_key
  )
  select (select count(*) from source_raw),
         (select count(*) from source_grouped where narx_soni = 1),
         (select count(*) from source_grouped where narx_soni <> 1)
    into v_kiritilgan, v_yaroqli, v_ziddiyatli;

  with source_raw as (
    select
      public.t2_resurs_nom_kalit(x.nom) as nom_key,
      public.t2_resurs_birlik_kalit(x.birlik) as birlik_key,
      x.narx
    from jsonb_to_recordset(p_narxlar) as x(nom text, birlik text, narx numeric)
  ), source_grouped as (
    select nom_key, birlik_key, min(narx) as narx
      from source_raw
     where nom_key <> '' and birlik_key <> '' and narx is not null and narx >= 0 and narx not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
     group by nom_key, birlik_key
    having count(distinct narx) = 1
  ), target as (
    select q.id, q.hajm
      from public.t2_qator q
     where q.kompaniya_id = p_kompaniya_id and q.obyekt_id = p_obyekt_id
       and q.tur in ('rs', 'mat', 'ob') and (q.narx is null or (p_nol_ham and q.narx = 0))
  ), candidate as (
    select t.id, s.narx
      from target t
      join public.t2_qator q on q.id = t.id
      join source_grouped s
        on public.t2_resurs_nom_kalit(q.nom) = s.nom_key
       and public.t2_resurs_birlik_kalit(q.birlik) = s.birlik_key
  ), target_unique as (
    select id, min(narx) as narx
      from candidate
     group by id
    having count(distinct narx) = 1
  )
  select (select count(*) from target), (select count(*) from target_unique)
    into v_narxsiz, v_mos;

  with source_raw as (
    select
      public.t2_resurs_nom_kalit(x.nom) as nom_key,
      public.t2_resurs_birlik_kalit(x.birlik) as birlik_key,
      x.narx
    from jsonb_to_recordset(p_narxlar) as x(nom text, birlik text, narx numeric)
  ), source_grouped as (
    select nom_key, birlik_key, min(narx) as narx
      from source_raw
     where nom_key <> '' and birlik_key <> '' and narx is not null and narx >= 0 and narx not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
     group by nom_key, birlik_key
    having count(distinct narx) = 1
  ), candidate as (
    select q.id, s.narx
      from public.t2_qator q
      join source_grouped s
        on public.t2_resurs_nom_kalit(q.nom) = s.nom_key
       and public.t2_resurs_birlik_kalit(q.birlik) = s.birlik_key
     where q.kompaniya_id = p_kompaniya_id and q.obyekt_id = p_obyekt_id
       and q.tur in ('rs', 'mat', 'ob') and (q.narx is null or (p_nol_ham and q.narx = 0))
  ), target_unique as (
    select id, min(narx) as narx
      from candidate
     group by id
    having count(distinct narx) = 1
  ), updated as (
    update public.t2_qator q
       set narx = u.narx,
           summa = case when q.hajm is null then null else q.hajm * u.narx end,
           narx_usul = 'RES'
      from target_unique u
     where q.id = u.id and (q.narx is null or (p_nol_ham and q.narx = 0))
    returning q.id
  )
  select count(*) into v_yozildi from updated;

  perform public.t2_rollup(p_obyekt_id);
  if v_narxsiz < 5000 then
    perform public.t2_signal_refresh_object(p_kompaniya_id, p_obyekt_id);
  end if;

  v_natija := jsonb_build_object(
    'ok', true, 'takror', false, 'obyekt_id', p_obyekt_id, 'nol_ham', coalesce(p_nol_ham, false),
    'kiritilgan', v_kiritilgan, 'yaroqli_manba', v_yaroqli,
    'ziddiyatli_manba', v_ziddiyatli, 'narxsiz', v_narxsiz,
    'mos', v_mos, 'yozildi', v_yozildi, 'narxsiz_qoldi', greatest(v_narxsiz - v_yozildi, 0)
  );

  insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija)
  values (p_operation_id, p_actor_id, 't2_smeta_narxla_res_v3', v_natija);
  perform public.t2_audit_yoz(p_kompaniya_id, 'smeta_narxla_res', 'smeta', p_obyekt_id,
    format('RES qator=%s; mos=%s; yozildi=%s; nol_ham=%s', v_kiritilgan, v_mos, v_yozildi, coalesce(p_nol_ham, false)),
    'actor:' || p_actor_id::text, null);
  return v_natija;
end;
$function$;

CREATE OR REPLACE FUNCTION public.t2_viborka_smetadan_toldir(p_obyekt_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_komp bigint; v_yangi int; v_yangilandi int;
begin
  select kompaniya_id into v_komp from t2_obyekt where id = p_obyekt_id;
  if not found then
    return jsonb_build_object('ok', false, 'sabab', 'obyekt',
      'xabar', 'Obyekt topilmadi: ' || p_obyekt_id);
  end if;

  perform t2_manba_belgila('rollup');   -- avtomat hisoblash, odam emas

  with reja as (
    select nom_key, birlik_key, max(nom) nom, max(birlik) birlik,
           sum(hajm) reja_hajm
    from t2_qator
    where obyekt_id = p_obyekt_id and tur in ('mat','ob') and hajm is not null
    group by nom_key, birlik_key
  ), yoz as (
    insert into t2_viborka (obyekt_id, kompaniya_id, nom, birlik, reja_hajm)
    select p_obyekt_id, v_komp, nom, birlik, reja_hajm from reja
    on conflict (kompaniya_id, obyekt_id, nom_key, birlik_key)
    do update set reja_hajm = excluded.reja_hajm, yangilandi = now()
    returning (xmax = 0) as yangi_mi   -- xmax=0 -> INSERT, aks holda UPDATE
  )
  select count(*) filter (where yangi_mi), count(*) filter (where not yangi_mi)
    into v_yangi, v_yangilandi
  from yoz;

  return jsonb_build_object('ok', true, 'obyekt_id', p_obyekt_id,
    'yangi_qator', coalesce(v_yangi,0), 'yangilangan_qator', coalesce(v_yangilandi,0));
end $function$;

CREATE OR REPLACE FUNCTION public.t2_signal_refresh_object(p_kompaniya_id bigint, p_obyekt_id bigint)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  r record;
  v_count integer := 0;
begin
  if not exists (select 1 from public.t2_obyekt o
                 where o.id = p_obyekt_id and o.kompaniya_id = p_kompaniya_id
                   and o.holat <> 'bekor') then
    raise exception 'obyekt boshqa tenantga tegishli yoki faol emas' using errcode = '42501';
  end if;
  for r in select q.id, q.nom, q.tur, q.narx, q.birlik, q.hajm from public.t2_qator q
           where q.kompaniya_id = p_kompaniya_id and q.obyekt_id = p_obyekt_id loop
    perform public.t2_signal_producer_apply(
      p_kompaniya_id, 'obyekt', p_obyekt_id::text, 'missing_price', 'warning',
      coalesce(r.nom, 'Smeta qatorida narx yo''q'), 't2_qator', r.id::text,
      r.tur in ('rs','mat','ob') and r.narx is null,
      jsonb_build_object('qator_id', r.id, 'tur', r.tur), null);
    if r.tur in ('rs','mat','ob') and r.narx is null then v_count := v_count + 1; end if;
    perform public.t2_signal_producer_apply(
      p_kompaniya_id, 'obyekt', p_obyekt_id::text, 'data_quality', 'error',
      'Smeta qatori metadata/miqdor tekshiruvdan o''tmadi', 't2_qator', r.id::text,
      r.nom is null or r.birlik is null or r.hajm is null or r.hajm < 0 or r.narx < 0,
      jsonb_build_object('qator_id', r.id, 'nom_missing', r.nom is null,
                         'birlik_missing', r.birlik is null, 'hajm', r.hajm, 'narx', r.narx), null);
  end loop;
  update public.t2_signal s set state='resolved', resolved_at=now(), updated_at=now()
   where s.kompaniya_id=p_kompaniya_id and s.entity_type='obyekt'
     and s.entity_id=p_obyekt_id::text and s.signal_type in ('missing_price','data_quality')
     and s.manba='t2_qator' and s.state='open'
     and not exists (select 1 from public.t2_qator q where q.id=s.manba_id::bigint
                     and q.kompaniya_id=p_kompaniya_id and q.obyekt_id=p_obyekt_id);
  for r in select z.id,z.item_text,z.status,z.required_date from public.t2_erp_taminot z
           where z.kompaniya_id=p_kompaniya_id and z.obyekt_id=p_obyekt_id loop
    perform public.t2_signal_producer_apply(
      p_kompaniya_id,'obyekt',p_obyekt_id::text,'open_request','info',
      coalesce(r.item_text,'Ochiq ta''minot zayavkasi'),'t2_erp_taminot',r.id::text,
      r.status in ('submitted','approved','procurement','ordered','partially_delivered'),
      jsonb_build_object('request_id',r.id,'status',r.status),r.required_date::timestamptz);
  end loop;
  for r in select z.id,z.ziddiyat,z.maydon,z.izoh from public.t2_ozgarish z
           where z.kompaniya_id=p_kompaniya_id and z.obyekt_id=p_obyekt_id loop
    perform public.t2_signal_producer_apply(
      p_kompaniya_id,'obyekt',p_obyekt_id::text,'mirror_conflict','error',
      'Ko''zgu va manba o''rtasida ziddiyat','t2_ozgarish',r.id::text,r.ziddiyat,
      jsonb_build_object('maydon',r.maydon,'izoh',r.izoh),null);
  end loop;
  for r in select g.id,g.nom,g.tugash_sana,g.ish_holati,g.faol from public.t2_grafik_qator g
           where g.kompaniya_id=p_kompaniya_id and g.obyekt_id=p_obyekt_id loop
    perform public.t2_signal_producer_apply(
      p_kompaniya_id,'obyekt',p_obyekt_id::text,'schedule_delay','warning',
      coalesce(r.nom,'Grafik muddati kechikdi'),'t2_grafik_qator',r.id::text,
      r.faol and r.tugash_sana is not null and r.tugash_sana < current_date
        and r.ish_holati <> 'bajarildi',
      jsonb_build_object('tugash_sana',r.tugash_sana,'ish_holati',r.ish_holati),r.tugash_sana::timestamptz);
  end loop;
  for r in select ht.kod,ht.nom from public.t2_hujjat_turi ht loop
    perform public.t2_signal_producer_apply(
      p_kompaniya_id,'obyekt',p_obyekt_id::text,'document_missing','warning',
      coalesce(r.nom,'Majburiy hujjat yo''q'),'t2_hujjat_turi',r.kod,
      not exists (select 1 from public.t2_obyekt_hujjat h
                  where h.kompaniya_id=p_kompaniya_id and h.obyekt_id=p_obyekt_id
                    and h.turi=r.kod and h.holat <> 'bekor'),
      jsonb_build_object('turi',r.kod),null);
  end loop;
  update public.t2_signal s set state='resolved', resolved_at=now(), updated_at=now()
   where s.kompaniya_id=p_kompaniya_id and s.entity_type='obyekt'
     and s.entity_id=p_obyekt_id::text and s.state='open'
     and ((s.manba='t2_erp_taminot' and not exists
             (select 1 from public.t2_erp_taminot z where z.id=s.manba_id::bigint
               and z.kompaniya_id=p_kompaniya_id and z.obyekt_id=p_obyekt_id))
       or (s.manba='t2_ozgarish' and not exists
             (select 1 from public.t2_ozgarish z where z.id=s.manba_id::bigint
               and z.kompaniya_id=p_kompaniya_id and z.obyekt_id=p_obyekt_id))
       or (s.manba='t2_grafik_qator' and not exists
             (select 1 from public.t2_grafik_qator g where g.id=s.manba_id::bigint
               and g.kompaniya_id=p_kompaniya_id and g.obyekt_id=p_obyekt_id))
       or (s.manba='t2_hujjat_turi' and not exists
             (select 1 from public.t2_hujjat_turi ht where ht.kod=s.manba_id)));
  return v_count;
end;
$function$;

CREATE OR REPLACE FUNCTION public.t2_rollup(p_obyekt_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_jami numeric; v_toliq boolean; v_miss int; v_yetim int;
begin
  perform t2_manba_belgila('rollup');

  update t2_qator b set summa = c.jami, yangilandi = now()
  from (select ota_id, sum(summa) jami from t2_qator
        where obyekt_id = p_obyekt_id and tur='rs' and ota_id is not null
        group by ota_id) c
  where b.id = c.ota_id and b.tur = 'bl';

  update t2_qator b set summa = null
  where b.obyekt_id = p_obyekt_id and b.tur='bl'
    and not exists (select 1 from t2_qator c where c.ota_id = b.id);

  /* ⚠️ 'rs' SHU YERDA QO'SHILDI — busiz rz ostidagi yakka resurs
     jimgina yo'qolardi. */
  update t2_qator r set summa = c.jami, yangilandi = now()
  from (select ota_id, sum(summa) jami from t2_qator
        where obyekt_id = p_obyekt_id and tur in ('bl','mat','ob','rs')
          and ota_id is not null
        group by ota_id) c
  where r.id = c.ota_id and r.tur = 'rz';

  select sum(summa) into v_jami
  from t2_qator where obyekt_id = p_obyekt_id and tur = 'rz';

  select count(*) into v_miss
  from t2_qator where obyekt_id = p_obyekt_id and tur in ('rs','mat','ob') and narx is null;

  /* ⚠️ YETIM QATOR NAZORATI: otasi yo'q (rz emas) qator jamiga
     KIRMAYDI. Soni javobda qaytadi — jim qolmasin. */
  select count(*) into v_yetim
  from t2_qator q
  where q.obyekt_id = p_obyekt_id and q.tur <> 'rz' and q.ota_id is null;

  v_toliq := (v_miss = 0);

  return jsonb_build_object('ok', true, 'jami', v_jami, 'toliq', v_toliq,
    'narxsiz_qator', v_miss, 'yetim_qator', v_yetim,
    'izoh', case when v_toliq then 'Barcha qator narxlangan — jami ishonchli.'
                 else v_miss || ' qatorda narx topilmadi. JAMI TO''LIQ EMAS — ' ||
                      'bu raqam ustida moliyaviy qaror qabul qilmang.' end ||
           case when v_yetim > 0 then ' ⚠️ ' || v_yetim ||
                     ' ta otasiz qator jamiga KIRMADI.' else '' end);
end $function$;

CREATE OR REPLACE FUNCTION public.t2_object_financials_v1(p_kompaniya_id bigint, p_actor_id bigint, p_object_ids bigint[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_ids bigint[];
  v_objects jsonb;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id,p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id,p_actor_id,'object.read');
  perform public.t2_require_permission_v2(p_kompaniya_id,p_actor_id,'smeta.read');
  perform public.t2_require_permission_v2(p_kompaniya_id,p_actor_id,'fakt.read');
  perform public.t2_require_permission_v2(p_kompaniya_id,p_actor_id,'f2.read');
  if p_object_ids is null
     or coalesce(array_ndims(p_object_ids),1) <> 1
     or exists(select 1 from unnest(p_object_ids) x(id) where id is null or id <= 0) then
    raise exception 'OBJECT_IDS_INVALID' using errcode='22023';
  end if;
  select coalesce(array_agg(distinct id order by id),'{}'::bigint[])
    into v_ids from unnest(p_object_ids) x(id);
  if cardinality(v_ids) > 200 then
    raise exception 'OBJECT_IDS_LIMIT_200' using errcode='22023';
  end if;
  if exists (
    select 1 from unnest(v_ids) x(id)
    left join public.t2_obyekt o on o.id=x.id and o.kompaniya_id=p_kompaniya_id
    where o.id is null
  ) then
    raise exception 'OBJECT_SCOPE_INVALID' using errcode='42501';
  end if;
  with
  q as materialized (
    select id,obyekt_id,ota_id,tur,nom,hajm,narx,summa,norma
    from public.t2_qator
    where kompaniya_id=p_kompaniya_id and obyekt_id=any(v_ids)
  ),
  parents as materialized (
    select distinct ota_id from q where ota_id is not null
  ),
  leaves as materialized (
    select q.*,
      coalesce(q.nom,'') ~* 'ЗАТРАТЫ\s+ТРУДА\s+МАШИНИСТ' as driver_labor
    from q left join parents ch on ch.ota_id=q.id
    where q.tur in ('rs','mat','ob','bl') and ch.ota_id is null
  ),
  acts as materialized (
    select id,obyekt_id,tur from public.t2_akt
    where obyekt_id=any(v_ids)
      and (kompaniya_id=p_kompaniya_id or kompaniya_id is null)
      and ((tur='fakt' and holat<>'bekor') or (tur='f2' and holat='tasdiqlangan'))
  ),
  act_counts as (
    select obyekt_id,
      count(*) filter(where tur='fakt') as fakt_count,
      count(*) filter(where tur='f2') as f2_count
    from acts group by obyekt_id
  ),
  line_agg as materialized (
    select aq.qator_id,
      count(*) filter(where a.tur='fakt') as fakt_count,
      sum(aq.hajm) filter(where a.tur='fakt') as fakt_hajm,
      sum(aq.summa) filter(where a.tur='fakt') as fakt_money,
      count(*) filter(where a.tur='fakt' and aq.summa is null) as fakt_unknown,
      sum(coalesce(aq.certified_amount,aq.summa)) filter(where a.tur='f2') as f2_money,
      count(*) filter(where a.tur='f2' and coalesce(aq.certified_amount,aq.summa) is null) as f2_unknown,
      count(*) filter(where a.tur='f2' and aq.certified_amount is null and aq.summa is not null) as f2_legacy_count
    from acts a
    join public.t2_akt_qator aq on aq.akt_id=a.id and aq.obyekt_id=a.obyekt_id
    join q on q.id=aq.qator_id and q.obyekt_id=a.obyekt_id
    where aq.kompaniya_id=p_kompaniya_id or aq.kompaniya_id is null
    group by aq.qator_id
  ),
  source_rows as (
    select l.*,d.fakt_count as direct_count,d.fakt_money as direct_money,
      d.fakt_unknown as direct_unknown,d.f2_money,d.f2_unknown,d.f2_legacy_count,
      coalesce(d.fakt_hajm,0) as direct_hajm,
      coalesce(pd.fakt_hajm,0) as parent_hajm,
      coalesce(pd.fakt_count,0) as parent_count,
      l.tur='rs' and l.norma is not null and p.tur='bl'
        and coalesce(d.fakt_hajm,0)=0 as derive_parent
    from leaves l
    left join line_agg d on d.qator_id=l.id
    left join q p on p.id=l.ota_id and p.obyekt_id=l.obyekt_id
    left join line_agg pd on pd.qator_id=p.id
  ),
  effective as (
    select s.*,
      case when derive_parent then parent_hajm*norma else direct_hajm end as effective_hajm,
      case when derive_parent then
        case when coalesce(direct_count,0)+parent_count>0 then parent_hajm*norma*narx end
        else direct_money end as fakt_money,
      case when driver_labor then 0
        when derive_parent then
          case when coalesce(direct_count,0)+parent_count>0 and narx is null then 1 else 0 end
        else coalesce(direct_unknown,0) end as fakt_unknown
    from source_rows s
  ),
  valued as (
    select e.*,
      case when driver_labor then coalesce(summa,0) else summa end as smeta_value,
      case when driver_labor and coalesce(direct_count,0)+parent_count>0
        then coalesce(fakt_money,0) else fakt_money end as fakt_value,
      case when driver_labor then coalesce(f2_money,0) else f2_money end as f2_value,
      case
        when hajm is null or effective_hajm is null then
          case when driver_labor then 0::numeric end
        when (hajm>=0 and hajm-effective_hajm<=0) or (hajm<0 and hajm-effective_hajm>=0) then 0::numeric
        when driver_labor then coalesce(round((hajm-effective_hajm)*narx,2),0)
        else round((hajm-effective_hajm)*narx,2)
      end as ostatka_value
    from effective e
  ),
  totals as (
    select obyekt_id,count(*) as leaf_count,
      count(*) filter(where driver_labor) as driver_labor_count,
      round(sum(smeta_value),2) as smeta_known,
      count(*) filter(where smeta_value is null) as smeta_unknown,
      round(sum(fakt_value),2) as fakt_known,
      sum(fakt_unknown) as fakt_unknown,
      round(sum(f2_value),2) as f2_known,
      sum(case when driver_labor then 0 else coalesce(f2_unknown,0) end) as f2_unknown,
      sum(coalesce(f2_legacy_count,0)) as f2_legacy_count,
      sum(ostatka_value) as ostatka_known,
      count(*) filter(where ostatka_value is null) as ostatka_unknown
    from valued group by obyekt_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'obyekt_id',o.id,
    'smeta',jsonb_build_object('known',t.smeta_known,'unknown',coalesce(t.smeta_unknown,0),'present',coalesce(t.leaf_count,0)>0),
    'fakt',jsonb_build_object('known',case when coalesce(a.fakt_count,0)>0 then t.fakt_known end,
      'unknown',coalesce(t.fakt_unknown,0),'present',coalesce(a.fakt_count,0)>0),
    'f2',jsonb_build_object('known',case when coalesce(a.f2_count,0)=0 then 0::numeric
        when coalesce(t.leaf_count,0)=0 then 0::numeric else t.f2_known end,
      'unknown',coalesce(t.f2_unknown,0),'present',coalesce(a.f2_count,0)>0),
    'ostatka',jsonb_build_object('known',t.ostatka_known,'unknown',coalesce(t.ostatka_unknown,0),'present',coalesce(t.leaf_count,0)>0),
    'leaf_count',coalesce(t.leaf_count,0),
    'fakt_act_count',coalesce(a.fakt_count,0),
    'f2_approved_act_count',coalesce(a.f2_count,0),
    'f2_legacy_count',coalesce(t.f2_legacy_count,0),
    'driver_labor_count',coalesce(t.driver_labor_count,0)
  ) order by o.id),'[]'::jsonb)
  into v_objects
  from unnest(v_ids) o(id)
  left join totals t on t.obyekt_id=o.id
  left join act_counts a on a.obyekt_id=o.id;
  return jsonb_build_object('ok',true,'kompaniya_id',p_kompaniya_id,'basis','direct','objects',v_objects);
end
$function$;

CREATE OR REPLACE FUNCTION public.t2_workbench_v1(p_obyekt_id bigint, p_actor_id bigint, p_davr date DEFAULT NULL::date, p_limit integer DEFAULT 800)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_komp bigint; v_loyiha bigint; v_rol text; v_nom text; v_loyiha_nom text;
  v_lim integer := least(greatest(coalesce(p_limit,800),1),3000);
  v_davrlar date[]; v_through integer; v_cur_rev bigint;
  v_lines jsonb; v_changes jsonb; v_periods jsonb; v_revisions jsonb;
  v_yakun jsonb;
begin
  select o.kompaniya_id, o.loyiha_id, o.nom, l.nom
    into v_komp, v_loyiha, v_nom, v_loyiha_nom
  from public.t2_obyekt o left join public.t2_loyiha l on l.id = o.loyiha_id
  where o.id = p_obyekt_id;
  if v_komp is null then return jsonb_build_object('ok',false,'code','OBYEKT_NOT_FOUND'); end if;
  v_rol := public.t2_actor_kompaniya_azo_tekshir(v_komp, p_actor_id);

  select array_agg(oy order by oy) into v_davrlar
  from (select distinct date_trunc('month', a.oy)::date oy
        from public.t2_akt a where a.obyekt_id = p_obyekt_id and a.tur = 'f2' and a.holat = 'tasdiqlangan') s;
  v_davrlar := coalesce(v_davrlar, array[]::date[]);
  if array_length(v_davrlar,1) is null then
    v_through := 0;
  else
    v_through := coalesce(
      array_position(v_davrlar, date_trunc('month', coalesce(p_davr, v_davrlar[array_length(v_davrlar,1)]))::date) - 1,
      array_length(v_davrlar,1) - 1);
  end if;
  select id into v_cur_rev from public.t2_smeta_revision where obyekt_id = p_obyekt_id order by seq desc limit 1;

  select coalesce(jsonb_agg(x order by (x->>'_tartib')::numeric), '[]'::jsonb) into v_lines from (
    select jsonb_build_object('lineId', q.id::text, 'sectionId', coalesce(q.ota_id::text,'root'),
      'description', q.nom, 'unit', coalesce(q.birlik,''),
      'baselineQuantity', coalesce(q.hajm,0), 'baselineReferencePrice', coalesce(q.narx,0),
      '_tartib', q.tartib) x
    from public.t2_qator q
    where q.obyekt_id = p_obyekt_id and q.tur in ('rs','mat','ob')
    order by q.tartib, q.id limit v_lim) s;

  select coalesce(jsonb_agg(jsonb_build_object(
      'changeId', o.id::text, 'kind',
        case o.tur when 'almashtirish' then 'substitution' when 'qoshimcha_ish' then 'additional_work'
             when 'olib_tashlash' then 'removal' when 'hajm_ozgarish' then 'quantity_increase'
             when 'yangi_bolim' then 'new_section' when 'yangi_ish' then 'new_item'
             when 'resurs_almashtirish' then 'resource_replacement' else 'additional_work' end,
      'status', case o.holat when 'tasdiqlangan' then 'approved' when 'qoralama' then 'pending' else 'rejected' end,
      'lineId', coalesce((select z.qator_id::text from public.t2_smeta_ozgarish_qator z
                          where z.ozgarish_id = o.id and z.qator_id is not null limit 1),
                         (select z.yangi_qator_id::text from public.t2_smeta_ozgarish_qator z
                          where z.ozgarish_id = o.id and z.yangi_qator_id is not null limit 1), 'na'),
      'revisionId', 'rev-'||coalesce(o.natija_revision_id::text,'pending'),
      'effectivePeriodIndex', coalesce(array_position(v_davrlar, date_trunc('month', o.effective_oy)::date) - 1, 0),
      'quantityDelta', coalesce((select sum(coalesce(z.yangi_hajm,0) - coalesce(z.eski_hajm,0))
                                 from public.t2_smeta_ozgarish_qator z where z.ozgarish_id = o.id), 0),
      'reason', coalesce(o.sabab,''),
      'evidenceIds', case when o.evidence_hujjat_id is not null then jsonb_build_array('hujjat-'||o.evidence_hujjat_id) else '[]'::jsonb end,
      'actorId', o.actor_id::text
    ) order by o.yaratildi), '[]'::jsonb) into v_changes
  from public.t2_smeta_ozgarish o where o.obyekt_id = p_obyekt_id;

  select coalesce(jsonb_agg(p order by (p->>'_oy')), '[]'::jsonb) into v_periods from (
    select jsonb_build_object(
      'periodId', to_char(a.oy,'YYYY-MM'), 'label', to_char(a.oy,'YYYY-MM'),
      'revisionId', 'rev-'||coalesce(max(a.revision_id)::text,'0'), 'frozen', true,
      'documentIds', jsonb_agg(distinct 'akt-'||a.id),
      'lines', jsonb_agg(jsonb_build_object(
        'lineId', aq.qator_id::text, 'quantity', aq.hajm,
        'f2ValuationPrice', aq.narx, 'actualProcurementPrice', aq.actual_narx,
        'referencePriceSourceId', 'baseline-'||coalesce(aq.revision_id::text,'0'),
        'actualPriceSourceId', case when aq.actual_narx is not null
          then coalesce(aq.narx_manba,'qol')||'-'||coalesce(aq.narx_manba_id::text,'?') else null end)),
      '_oy', a.oy) p
    from public.t2_akt a join public.t2_akt_qator aq on aq.akt_id = a.id
    where a.obyekt_id = p_obyekt_id and a.tur = 'f2' and a.holat = 'tasdiqlangan'
    group by a.oy) s;

  select coalesce(jsonb_agg(jsonb_build_object(
      'revisionId', 'rev-'||r.id, 'kind', case when r.seq = 0 then 'baseline' else 'change' end,
      'status', case when r.seq = 0 then 'certified' else 'approved' end,
      'actorId', r.actor_id::text, 'occurredAt', r.yaratildi, 'reason', coalesce(r.izoh,''),
      'evidenceIds', '[]'::jsonb, 'immutable', true) order by r.seq), '[]'::jsonb) into v_revisions
  from public.t2_smeta_revision r where r.obyekt_id = p_obyekt_id;

  v_yakun := public.t2_obyekt_yakunlash_v1(p_obyekt_id, p_actor_id);

  return jsonb_build_object(
    'ok', true, 'generated_at', now(),
    'projectId', v_loyiha::text, 'objectId', p_obyekt_id::text,
    'projectName', coalesce(v_loyiha_nom,''), 'objectName', v_nom,
    'currentPeriodId', case when array_length(v_davrlar,1) is not null
      then to_char(v_davrlar[v_through + 1],'YYYY-MM') else null end,
    'valuation', jsonb_build_object(
      'projectId', v_loyiha::text, 'objectId', p_obyekt_id::text,
      'estimateRevisionId', 'rev-'||coalesce(v_cur_rev::text,'0'),
      'currency', 'UZS', 'throughPeriod', v_through,
      'lines', (select coalesce(jsonb_agg(l - '_tartib'), '[]'::jsonb) from jsonb_array_elements(v_lines) l),
      'changes', v_changes,
      'periods', (select coalesce(jsonb_agg(pp - '_oy'), '[]'::jsonb) from jsonb_array_elements(v_periods) pp)),
    'requirements', v_yakun->'requirements',
    'documents', v_yakun->'documents',
    'revisions', v_revisions,
    'lines_truncated', jsonb_array_length(v_lines) >= v_lim,
    'forma3_unresolved', v_yakun->'forma3_unresolved');
end $function$;

CREATE OR REPLACE FUNCTION public.t2_resurs_narx_taklif_v1(p_obyekt_id bigint, p_actor_id bigint, p_items text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_k bigint; v_items jsonb; v_res jsonb := '[]'::jsonb; v_i jsonb; v_nk text; v_bk text; v_var jsonb; v_sh bigint[];
begin
  v_k := public.t2_obyekt_kompaniya_azo(p_obyekt_id, p_actor_id);
  v_sh := public.t2_obyekt_shartnoma_obyektlari(p_obyekt_id);
  v_items := coalesce(p_items, '[]')::jsonb;
  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) > 80 then raise exception 'ITEMS_0_80'; end if;
  for v_i in select value from jsonb_array_elements(v_items) loop
    v_nk := public.t2_resurs_nom_kalit(v_i->>'nom'); v_bk := public.t2_resurs_birlik_kalit(v_i->>'birlik');
    select coalesce(jsonb_agg(x), '[]'::jsonb) into v_var from (
      (select jsonb_build_object('manba', 'smeta_obyekt', 'narx', q.narx, 'izoh', 'shu obyekt smetasi (RES)') x
         from public.t2_qator q
        where q.kompaniya_id = v_k and q.obyekt_id = p_obyekt_id and q.tur in ('rs', 'mat', 'ob') and q.narx > 0
          and public.t2_resurs_nom_kalit(q.nom) = v_nk and public.t2_resurs_birlik_kalit(q.birlik) = v_bk
        order by q.id desc limit 1)
      union all
      (select jsonb_build_object('manba', 'smeta_shartnoma', 'narx', q.narx, 'izoh', 'shu shartnoma: ' || o.nom) x
         from public.t2_qator q join public.t2_obyekt o on o.id = q.obyekt_id
        where q.kompaniya_id = v_k and q.obyekt_id = any(v_sh) and q.tur in ('rs', 'mat', 'ob') and q.narx > 0
          and public.t2_resurs_nom_kalit(q.nom) = v_nk and public.t2_resurs_birlik_kalit(q.birlik) = v_bk
        order by q.id desc limit 1)
      union all
      (select jsonb_build_object('manba', 'smeta', 'narx', q.narx, 'izoh', 'boshqa shartnoma: ' || o.nom) x
         from public.t2_qator q join public.t2_obyekt o on o.id = q.obyekt_id
        where q.kompaniya_id = v_k and q.obyekt_id <> p_obyekt_id and not (q.obyekt_id = any(v_sh))
          and q.tur in ('rs', 'mat', 'ob') and q.narx > 0
          and public.t2_resurs_nom_kalit(q.nom) = v_nk and public.t2_resurs_birlik_kalit(q.birlik) = v_bk
        order by q.id desc limit 1)
      union all
      (select jsonb_build_object('manba', 'katalog', 'narx', k.narx, 'izoh', 'katalog: ' || m.nom) x
         from public.t2_narx_manba_qator k join public.t2_narx_manba m on m.id = k.manba_id and m.holat = 'faol'
        where k.kompaniya_id = v_k and k.narx > 0
          and public.t2_resurs_nom_kalit(k.nom) = v_nk and public.t2_resurs_birlik_kalit(k.birlik) = v_bk
        order by m.yaratildi desc, k.id desc limit 1)
    ) s;
    v_res := v_res || jsonb_build_array(jsonb_build_object('i', v_i->'i', 'variantlar', v_var));
  end loop;
  return v_res;
end $function$;

CREATE OR REPLACE FUNCTION public.t2_resurs_qidir_v1(p_obyekt_id bigint, p_actor_id bigint, p_q text, p_kat text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_k bigint; v_t text[]; v_sm jsonb; v_kt jsonb; v_sh bigint[];
begin
  v_k := public.t2_obyekt_kompaniya_azo(p_obyekt_id, p_actor_id);
  v_sh := public.t2_obyekt_shartnoma_obyektlari(p_obyekt_id);
  v_t := public.t2_qidiruv_sozlar(p_q);
  if cardinality(v_t) = 0 then return '[]'::jsonb; end if;
  with r as (
    select q.id, q.obyekt_id, q.kat, q.kod, q.nom, q.birlik, q.narx,
           public.t2_resurs_nom_kalit(q.nom) nk, public.t2_resurs_birlik_kalit(q.birlik) bk,
           case when q.obyekt_id = p_obyekt_id then 0 when q.obyekt_id = any(v_sh) then 1 else 2 end daraja
      from public.t2_qator q
     where q.kompaniya_id = v_k and q.tur in ('rs', 'mat', 'ob') and q.nom is not null
       and (nullif(p_kat, '') is null or q.kat = p_kat)
       and not exists (select 1 from unnest(v_t) s where position(s in upper(replace(coalesce(q.kod, '') || ' ' || q.nom, 'Ё', 'Е'))) = 0)
     limit 4000
  ), g as (
    select kat, nk, bk, count(*) n, min(daraja) daraja,
           (array_agg(id order by daraja, (narx > 0) desc, id desc))[1] rep
      from r group by kat, nk, bk
  )
  select coalesce(jsonb_agg(x order by (x->>'daraja')::int, (x->>'soni')::int desc), '[]'::jsonb) into v_sm from (
    select jsonb_build_object('manba', 'smeta', 'kat', q.kat, 'kod', q.kod, 'nom', q.nom, 'birlik', q.birlik,
             'narx', nullif(q.narx, 0), 'soni', g.n, 'daraja', g.daraja, 'shu_obyekt', g.daraja = 0,
             'narx_manba', case g.daraja when 0 then 'smeta_obyekt' when 1 then 'smeta_shartnoma' else 'smeta' end) x
      from (select * from g order by daraja, n desc limit 20) g join public.t2_qator q on q.id = g.rep) s;

  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_kt from (
    select jsonb_build_object('manba', 'katalog', 'kat', null, 'kod', k.kod, 'nom', k.nom, 'birlik', k.birlik, 'narx', k.narx,
             'narx_manba', 'katalog', 'manba_nom', m.nom) x
      from public.t2_narx_manba_qator k join public.t2_narx_manba m on m.id = k.manba_id and m.holat = 'faol'
     where k.kompaniya_id = v_k and k.narx > 0
       and not exists (select 1 from unnest(v_t) s where position(s in upper(replace(coalesce(k.kod, '') || ' ' || k.nom, 'Ё', 'Е'))) = 0)
     order by m.yaratildi desc, k.id limit 10) s;
  return v_sm || v_kt;
end $function$;

CREATE OR REPLACE FUNCTION public.t2_ish_turi_qidir_v1(p_obyekt_id bigint, p_actor_id bigint, p_q text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_k bigint; v_t text[]; v_res jsonb;
begin
  v_k := public.t2_obyekt_kompaniya_azo(p_obyekt_id, p_actor_id);
  v_t := public.t2_qidiruv_sozlar(p_q);
  if cardinality(v_t) = 0 then return '[]'::jsonb; end if;
  with b as (
    select q.id, q.obyekt_id, q.kod, q.nom, q.birlik,
           upper(btrim(coalesce(q.kod, ''))) kk, public.t2_resurs_nom_kalit(q.nom) nk, public.t2_resurs_birlik_kalit(q.birlik) bk
      from public.t2_qator q
     where q.kompaniya_id = v_k and q.tur = 'bl' and q.nom is not null
       and not exists (select 1 from unnest(v_t) s where position(s in upper(replace(coalesce(q.kod, '') || ' ' || q.nom, 'Ё', 'Е'))) = 0)
     limit 3000
  ), g as (
    select kk, nk, bk, count(*) n, bool_or(obyekt_id = p_obyekt_id) shu,
           coalesce(max(id) filter (where obyekt_id = p_obyekt_id), max(id)) rep
      from b group by kk, nk, bk
  ), top as (select * from g order by shu desc, n desc, rep desc limit 15)
  select coalesce(jsonb_agg(jsonb_build_object(
      'manba', 'smeta', 'qator_id', r.id, 'kod', r.kod, 'nom', r.nom, 'birlik', r.birlik,
      'soni', top.n, 'shu_obyekt', top.shu,
      'sostav', (select coalesce(jsonb_agg(jsonb_build_object('tur', c.tur, 'kat', c.kat, 'kod', c.kod, 'nom', c.nom,
                    'birlik', c.birlik, 'norma', c.norma, 'narx', nullif(c.narx, 0)) order by c.tartib, c.id), '[]'::jsonb)
                   from public.t2_qator c where c.ota_id = r.id and c.tur in ('rs', 'mat', 'ob')))
      order by top.shu desc, top.n desc), '[]'::jsonb)
    into v_res
  from top join public.t2_qator r on r.id = top.rep;

  v_res := v_res || coalesce((select jsonb_agg(jsonb_build_object('manba', 'katalog', 'ish_turi_id', t.id, 'kod', t.kod, 'nom', t.nomi,
              'birlik', t.birligi, 'narx', nullif(t.narx, 0), 'sostav', '[]'::jsonb))
     from (select * from public.t2_ish_turi t where t.kompaniya_id = v_k
              and not exists (select 1 from unnest(v_t) s where position(s in upper(t.kod || ' ' || t.nomi)) = 0)
            order by t.kod limit 5) t), '[]'::jsonb);
  return v_res;
end $function$;

commit;
