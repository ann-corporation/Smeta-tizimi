-- 20261203001700_t2_zamena_qozon_v1 — ROLLBACK
-- t2_qator_holat, t2_nakopitelniy_v2, t2_ish_abc_saqla_v1, t2_almashtirilgan_summa_hisob ni migratsiyadan OLDINGI prod
-- ta'rifiga (pg_get_viewdef / pg_get_functiondef matni aynan) qaytaradi; t2_zamena_reja_hajm o'chiriladi.
-- Ma'lumot o'zgarmaydi (migratsiya faqat hisob qatlamini o'zgartirgan).
begin;

create or replace view public.t2_qator_holat as
 SELECT q.id,
    q.id AS qator_id,
    q.obyekt_id,
    q.tur,
    q.raqam,
    q.kod,
    q.nom,
    q.birlik,
    q.kat,
        CASE
            WHEN q.versiya_holat = 'almashtirilgan'::text THEN 0::numeric
            ELSE q.hajm
        END AS smeta_hajm,
    q.narx AS smeta_narx,
        CASE
            WHEN q.versiya_holat = 'almashtirilgan'::text THEN 0::numeric
            ELSE q.summa
        END AS smeta_summa,
    e.fakt_hajm,
        CASE
            WHEN d.f2_hajm <> 0::numeric AND d.f2_summa_yoq = 0 AND e.fakt_hajm IS NOT NULL AND e.fakt_summa IS NOT NULL THEN _t2_f2_narxda_v1(e.fakt_hajm, d.f2_hajm, d.f2_summa_malum)
            ELSE e.fakt_summa
        END AS fakt_summa,
    d.f2_hajm,
    d.f2_summa_malum AS f2_summa,
        CASE
            WHEN q.versiya_holat = 'almashtirilgan'::text THEN 0::numeric
            ELSE q.hajm - d.f2_hajm - al.v
        END AS qoldiq_hajm,
        CASE
            WHEN q.versiya_holat = 'almashtirilgan'::text THEN 0::numeric
            ELSE q.summa - d.f2_summa_malum - COALESCE(als.s, 0::numeric)
        END AS qoldiq_summa,
    GREATEST(e.fakt_hajm - d.f2_hajm, 0::numeric) AS f2_mumkin_hajm,
    GREATEST(e.fakt_summa - d.f2_summa_malum, 0::numeric) AS f2_mumkin_summa,
        CASE
            WHEN d.f2_hajm <> 0::numeric THEN round(d.f2_summa_malum / d.f2_hajm, 2)
            ELSE NULL::numeric
        END AS f2_narx,
        CASE
            WHEN e.fakt_hajm <> 0::numeric THEN round(e.fakt_summa / e.fakt_hajm, 2)
            ELSE NULL::numeric
        END AS fakt_narx,
        CASE
            WHEN d.f2_hajm <> 0::numeric AND q.narx IS NOT NULL AND q.narx <> 0::numeric THEN round((d.f2_summa_malum / d.f2_hajm - q.narx) / q.narx * 100::numeric, 1)
            ELSE NULL::numeric
        END AS f2_narx_farq_foiz,
    q.ota_id,
    q.norma,
    d.direct_fakt_hajm,
    d.direct_fakt_summa,
    e.fakt_manbasi,
    d.f2_summa_nomalum,
    al.v AS almashtirilgan_hajm,
    als.s AS almashtirilgan_summa,
    q.versiya_holat,
    q.hajm AS asl_smeta_hajm,
    q.summa AS asl_smeta_summa,
    d.f2_summa_yoq,
        CASE
            WHEN e.fakt_manbasi = 'BL_NORMA'::text THEN
            CASE
                WHEN e.fakt_summa IS NULL AND COALESCE(e.fakt_hajm, 0::numeric) <> 0::numeric THEN 1::bigint
                ELSE 0::bigint
            END
            ELSE d.fakt_summa_nomalum
        END AS fakt_summa_nomalum
   FROM t2_qator q
     LEFT JOIN ( SELECT z.obyekt_id,
            z.id,
            t2_almashtirilgan_hajm(z.id) AS v
           FROM t2_qator z
          WHERE (z.id IN ( SELECT zz.replaces_line_id
                   FROM t2_qator zz
                  WHERE zz.replaces_line_id IS NOT NULL)) OR (z.ota_id IN ( SELECT zz.replaces_line_id
                   FROM t2_qator zz
                  WHERE zz.replaces_line_id IS NOT NULL))) zm ON zm.id = q.id AND zm.obyekt_id = q.obyekt_id
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN zm.id IS NOT NULL THEN zm.v
                    ELSE 0::numeric
                END AS v) al
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN COALESCE(al.v, 0::numeric) = 0::numeric THEN 0::numeric
                    WHEN q.narx IS NOT NULL THEN al.v * q.narx
                    WHEN q.hajm IS NOT NULL AND q.hajm <> 0::numeric AND q.summa IS NOT NULL THEN al.v * q.summa / q.hajm
                    ELSE NULL::numeric
                END AS s) als
     LEFT JOIN LATERAL ( SELECT COALESCE(sum(aq.hajm) FILTER (WHERE a.tur = 'fakt'::text AND a.holat <> 'bekor'::text), 0::numeric) AS direct_fakt_hajm,
            COALESCE(sum(aq.summa) FILTER (WHERE a.tur = 'fakt'::text AND a.holat <> 'bekor'::text), 0::numeric) AS direct_fakt_summa,
            COALESCE(sum(COALESCE(aq.certified_quantity, aq.hajm)) FILTER (WHERE a.tur = 'f2'::text AND a.holat = 'tasdiqlangan'::text), 0::numeric) AS f2_hajm,
            COALESCE(sum(COALESCE(aq.certified_amount, aq.summa)) FILTER (WHERE a.tur = 'f2'::text AND a.holat = 'tasdiqlangan'::text), 0::numeric) AS f2_summa_malum,
            count(*) FILTER (WHERE a.tur = 'f2'::text AND a.holat = 'tasdiqlangan'::text AND (q.tur <> ALL (ARRAY['rz'::text, 'bl'::text])) AND COALESCE(q.nom, ''::text) !~* 'ЗАТРАТЫ\s+ТРУДА\s+МАШИНИСТ'::text AND COALESCE(aq.certified_amount, aq.summa) IS NULL AND COALESCE(aq.certified_quantity, aq.hajm, 0::numeric) <> 0::numeric) AS f2_summa_nomalum,
            count(*) FILTER (WHERE a.tur = 'f2'::text AND a.holat = 'tasdiqlangan'::text AND COALESCE(aq.certified_amount, aq.summa) IS NULL AND COALESCE(aq.certified_quantity, aq.hajm, 0::numeric) <> 0::numeric) AS f2_summa_yoq,
            count(*) FILTER (WHERE a.tur = 'fakt'::text AND a.holat <> 'bekor'::text AND aq.summa IS NULL AND COALESCE(aq.hajm, 0::numeric) <> 0::numeric) AS fakt_summa_nomalum
           FROM t2_akt_qator aq
             LEFT JOIN t2_akt a ON a.id = aq.akt_id
          WHERE aq.qator_id = q.id) d ON true
     LEFT JOIN LATERAL ( SELECT count(p.id) AS bl_soni,
            COALESCE(sum(paq.hajm) FILTER (WHERE pa.tur = 'fakt'::text AND pa.holat <> 'bekor'::text), 0::numeric) AS fakt_hajm,
            COALESCE(sum(paq.hajm) FILTER (WHERE pa.tur = 'fakt'::text AND pa.holat <> 'bekor'::text AND paq.narx_manba = 'f2_sertifikat'::text), 0::numeric) AS f2s_hajm
           FROM t2_qator p
             LEFT JOIN t2_akt_qator paq ON paq.qator_id = p.id
             LEFT JOIN t2_akt pa ON pa.id = paq.akt_id
          WHERE q.tur = 'rs'::text AND q.norma IS NOT NULL AND p.id = q.ota_id AND p.obyekt_id = q.obyekt_id AND p.tur = 'bl'::text) bl ON true
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN bl.bl_soni > 0 AND d.direct_fakt_hajm = 0::numeric THEN (bl.fakt_hajm - bl.f2s_hajm) * q.norma
                    ELSE d.direct_fakt_hajm
                END AS fakt_hajm,
                CASE
                    WHEN bl.bl_soni > 0 AND d.direct_fakt_hajm = 0::numeric THEN
                    CASE
                        WHEN q.narx IS NULL THEN NULL::numeric
                        ELSE (bl.fakt_hajm - bl.f2s_hajm) * q.norma * q.narx
                    END
                    ELSE d.direct_fakt_summa
                END AS fakt_summa,
                CASE
                    WHEN bl.bl_soni > 0 AND d.direct_fakt_hajm = 0::numeric THEN 'BL_NORMA'::text
                    ELSE 'DIRECT'::text
                END AS fakt_manbasi) e;

CREATE OR REPLACE FUNCTION public.t2_nakopitelniy_v2(p_obyekt_id bigint, p_actor_id bigint, p_davr date DEFAULT NULL::date, p_limit integer DEFAULT 500, p_faqat_faol boolean DEFAULT true, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_komp bigint; v_rol text; v_davr date; v_obnom text; v_loyiha bigint;
  v_lim integer := least(greatest(coalesce(p_limit,500),1),5000);
  v_off integer := greatest(coalesce(p_offset,0),0);
  v_faol boolean := coalesce(p_faqat_faol,true);
  v_qatorlar jsonb; v_jami jsonb := null; v_davrlar jsonb; v_qcount integer;
  v_pending numeric := 0; v_olindi integer; v_keyingi boolean;
  v_nak jsonb := null;
begin
  select kompaniya_id, nom, loyiha_id into v_komp, v_obnom, v_loyiha from public.t2_obyekt where id = p_obyekt_id;
  if v_komp is null then return jsonb_build_object('ok',false,'code','OBYEKT_NOT_FOUND'); end if;
  v_rol := public.t2_actor_kompaniya_azo_tekshir(v_komp, p_actor_id);  -- raises 42501

  v_davr := date_trunc('month', coalesce(
              p_davr,
              (select max(a.oy) from public.t2_akt a where a.obyekt_id = p_obyekt_id and a.tur='f2' and a.holat='tasdiqlangan'),
              (select max(a.oy) from public.t2_akt a where a.obyekt_id = p_obyekt_id and a.tur='f2'),
              now()::date))::date;

  select
    coalesce(jsonb_agg(d.r order by d.tartib, d.id), '[]'::jsonb), count(*)
  into v_qatorlar, v_olindi
  from (
    select q.tartib, q.id, jsonb_build_object(
      'qator_id', q.id, 'tartib', q.tartib, 'kod', q.kod, 'nom', q.nom, 'birlik', q.birlik,
      'tur', q.tur, 'kat', q.kat, 'versiya_holat', q.versiya_holat, 'qoshimcha', q.qoshimcha, 'zamena', q.zamena,
      'smeta_hajm', q.hajm, 'smeta_narx', q.narx, 'smeta_summa', q.summa,
      'fakt_hajm', coalesce(p.fakt_hajm,0), 'fakt_summa', coalesce(p.fakt_summa,0),
      'oldingi_hajm',  coalesce(p.oldingi_hajm,0),
      'oldingi_summa', coalesce(p.oldingi_summa,0),
      'joriy_hajm',    coalesce(p.joriy_hajm,0),
      'joriy_summa',   coalesce(p.joriy_summa,0),
      'joriy_qoralama_summa', coalesce(p.joriy_qoralama_summa,0),
      'jami_hajm',  coalesce(p.oldingi_hajm,0) + coalesce(p.joriy_hajm,0),
      'jami_summa', coalesce(p.oldingi_summa,0) + coalesce(p.joriy_summa,0),
      'f2_summa_nomalum', coalesce(p.oldingi_nom,0) + coalesce(p.joriy_nom,0),
      'f2_mumkin_hajm', coalesce(p.fakt_hajm,0) - (coalesce(p.oldingi_hajm,0) + coalesce(p.joriy_hajm,0)),
      'almashtirilgan_hajm', coalesce(al.v,0),
      'qoldiq_hajm',  case when q.versiya_holat = 'almashtirilgan' then coalesce(p.oldingi_hajm,0) + coalesce(p.joriy_hajm,0) + coalesce(al.v,0) else coalesce(q.hajm,0) end - (coalesce(p.oldingi_hajm,0) + coalesce(p.joriy_hajm,0)) - coalesce(al.v,0),
      'almashtirilgan_summa', public.t2_almashtirilgan_summa_hisob(coalesce(al.v,0), q.hajm, q.narx, q.summa),
      'qoldiq_summa', case when q.versiya_holat = 'almashtirilgan' then coalesce(p.oldingi_summa,0) + coalesce(p.joriy_summa,0) + coalesce(public.t2_almashtirilgan_summa_hisob(coalesce(al.v,0), q.hajm, q.narx, q.summa),0) else coalesce(q.summa,0) end - (coalesce(p.oldingi_summa,0) + coalesce(p.joriy_summa,0)) - coalesce(public.t2_almashtirilgan_summa_hisob(coalesce(al.v,0), q.hajm, q.narx, q.summa),0),
      'jami_baseline_summa', coalesce(p.oldingi_baseline,0) + coalesce(p.joriy_baseline,0),
      'jami_actual_summa',   p.jami_actual_summa,
      'narx_variance_summa',
        (coalesce(p.oldingi_summa,0) + coalesce(p.joriy_summa,0))
        - (coalesce(p.oldingi_baseline,0) + coalesce(p.joriy_baseline,0)),
      'bajarilish_foiz', case when coalesce(q.hajm,0) <> 0
        then round((coalesce(p.oldingi_hajm,0) + coalesce(p.joriy_hajm,0)) / q.hajm * 100, 1) end
    ) as r
    from (
      select * from public.t2_qator b
      where b.obyekt_id = p_obyekt_id
      order by b.tartib, b.id
      offset case when v_faol then 0 else v_off end
      limit case when v_faol then null else v_lim + 1 end
    ) q
    left join lateral (
      select
        sum(aq.hajm)  filter (where a.tur='fakt') as fakt_hajm,
        sum(aq.summa) filter (where a.tur='fakt') as fakt_summa,
        sum(aq.hajm)  filter (where a.tur='f2' and a.holat='tasdiqlangan' and a.oy <  v_davr) as oldingi_hajm,
        sum(coalesce(aq.certified_amount, aq.summa)) filter (where a.tur='f2' and a.holat='tasdiqlangan' and a.oy <  v_davr) as oldingi_summa,
        count(*) filter (where a.tur='f2' and a.holat='tasdiqlangan' and a.oy <  v_davr
                           and q.tur not in ('rz','bl') and coalesce(q.nom,'') !~* 'ЗАТРАТЫ\s+ТРУДА\s+МАШИНИСТ' and coalesce(aq.certified_amount, aq.summa) is null and coalesce(aq.certified_quantity, aq.hajm, 0) <> 0) as oldingi_nom,
        sum(aq.baseline_summa) filter (where a.tur='f2' and a.holat='tasdiqlangan' and a.oy < v_davr) as oldingi_baseline,
        sum(aq.hajm)  filter (where a.tur='f2' and a.holat='tasdiqlangan' and a.oy = v_davr) as joriy_hajm,
        sum(coalesce(aq.certified_amount, aq.summa)) filter (where a.tur='f2' and a.holat='tasdiqlangan' and a.oy = v_davr) as joriy_summa,
        count(*) filter (where a.tur='f2' and a.holat='tasdiqlangan' and a.oy = v_davr
                           and q.tur not in ('rz','bl') and coalesce(q.nom,'') !~* 'ЗАТРАТЫ\s+ТРУДА\s+МАШИНИСТ' and coalesce(aq.certified_amount, aq.summa) is null and coalesce(aq.certified_quantity, aq.hajm, 0) <> 0) as joriy_nom,
        sum(aq.baseline_summa) filter (where a.tur='f2' and a.holat='tasdiqlangan' and a.oy = v_davr) as joriy_baseline,
        sum(aq.summa) filter (where a.tur='f2' and a.holat='qoralama' and a.oy = v_davr) as joriy_qoralama_summa,
        count(*) filter (where a.tur='f2' and a.holat='qoralama' and a.oy = v_davr
                           and q.tur not in ('rz','bl') and coalesce(q.nom,'') !~* 'ЗАТРАТЫ\s+ТРУДА\s+МАШИНИСТ' and coalesce(aq.certified_amount, aq.summa) is null and coalesce(aq.certified_quantity, aq.hajm, 0) <> 0) as qoralama_nom,
        case when count(*) filter (where a.tur='f2' and a.holat='tasdiqlangan' and aq.actual_narx is null) > 0
             then null
             else sum(aq.hajm * aq.actual_narx) filter (where a.tur='f2' and a.holat='tasdiqlangan')
        end as jami_actual_summa
      from public.t2_akt_qator aq
      join public.t2_akt a on a.id = aq.akt_id and a.holat <> 'bekor'
      where aq.qator_id = q.id
    ) p on true
    left join lateral (select case when exists (select 1 from public.t2_qator zz where zz.replaces_line_id = q.id and zz.replaces_line_id is not null) or exists (select 1 from public.t2_qator zz where zz.replaces_line_id = q.ota_id and zz.replaces_line_id is not null) then public.t2_almashtirilgan_hajm(q.id) else 0::numeric end as v) al on true
    where ((not v_faol and (q.versiya_holat = 'faol' or coalesce(p.oldingi_hajm,0) <> 0 or coalesce(p.joriy_hajm,0) <> 0 or coalesce(p.fakt_hajm,0) <> 0 or coalesce(p.joriy_qoralama_summa,0) <> 0)) or coalesce(al.v,0) <> 0 or coalesce(p.oldingi_hajm,0) <> 0 or coalesce(p.joriy_hajm,0) <> 0
           or coalesce(p.joriy_qoralama_summa,0) <> 0 or coalesce(p.fakt_hajm,0) <> 0 or q.qoshimcha or q.zamena)
    order by q.tartib, q.id
    offset case when v_faol then v_off else 0 end
    limit v_lim + 1
  ) d;

  v_keyingi := v_olindi > v_lim;
  if v_keyingi then
    v_qatorlar := v_qatorlar - (jsonb_array_length(v_qatorlar) - 1);
  end if;

  select count(*) into v_qcount from public.t2_qator where obyekt_id = p_obyekt_id and versiya_holat = 'faol'; -- versiya_faollashtir_v1

  if v_off = 0 then
    if to_regclass('public.t2_smeta_ozgarish') is not null then
      execute 'select coalesce(sum(delta_summa),0) from public.t2_smeta_ozgarish where obyekt_id=$1 and holat=''qoralama'''
        into v_pending using p_obyekt_id;
    end if;

    with pa as (
      select aq.qator_id,
          sum(aq.summa) filter (where a.tur='fakt') as fakt_summa,
          sum(coalesce(aq.certified_amount, aq.summa)) filter (where a.tur='f2' and a.holat='tasdiqlangan' and a.oy <  v_davr) as oldingi_summa,
          count(*) filter (where a.tur='f2' and a.holat='tasdiqlangan' and a.oy <  v_davr
                             and q.tur not in ('rz','bl') and coalesce(q.nom,'') !~* 'ЗАТРАТЫ\s+ТРУДА\s+МАШИНИСТ' and coalesce(aq.certified_amount, aq.summa) is null and coalesce(aq.certified_quantity, aq.hajm, 0) <> 0) as oldingi_nom,
          sum(aq.baseline_summa) filter (where a.tur='f2' and a.holat='tasdiqlangan' and a.oy < v_davr) as oldingi_baseline,
          sum(coalesce(aq.certified_amount, aq.summa)) filter (where a.tur='f2' and a.holat='tasdiqlangan' and a.oy = v_davr) as joriy_summa,
          count(*) filter (where a.tur='f2' and a.holat='tasdiqlangan' and a.oy = v_davr
                             and q.tur not in ('rz','bl') and coalesce(q.nom,'') !~* 'ЗАТРАТЫ\s+ТРУДА\s+МАШИНИСТ' and coalesce(aq.certified_amount, aq.summa) is null and coalesce(aq.certified_quantity, aq.hajm, 0) <> 0) as joriy_nom,
          sum(aq.baseline_summa) filter (where a.tur='f2' and a.holat='tasdiqlangan' and a.oy = v_davr) as joriy_baseline,
          sum(aq.summa) filter (where a.tur='f2' and a.holat='qoralama' and a.oy = v_davr) as joriy_qoralama_summa
      from public.t2_qator q
      join public.t2_akt_qator aq on aq.qator_id = q.id
      join public.t2_akt a on a.id = aq.akt_id and a.holat <> 'bekor'
      where q.obyekt_id = p_obyekt_id
      group by aq.qator_id
    ), agg as (
      select
        coalesce(sum(q.summa) filter (where q.tur in ('rs','mat','ob') and q.versiya_holat = 'faol'),0) as smeta_summa,
        count(*) filter (where q.tur in ('rs','mat','ob') and q.summa is null and q.versiya_holat = 'faol') as smeta_summa_nomalum,
        coalesce(sum(x.fakt_summa),0) as fakt_summa,
        coalesce(sum(x.oldingi_summa),0) as oldingi_summa,
        coalesce(sum(x.joriy_summa),0)   as joriy_summa,
        coalesce(sum(x.joriy_qoralama_summa),0) as joriy_qoralama_summa,
        coalesce(sum(x.oldingi_summa),0) + coalesce(sum(x.joriy_summa),0) as jami_summa,
        coalesce(sum(x.oldingi_nom),0) as oldingi_nom,
        coalesce(sum(x.joriy_nom),0)   as joriy_nom,
        coalesce(sum(x.oldingi_baseline),0) + coalesce(sum(x.joriy_baseline),0) as baseline_summa
      from public.t2_qator q
      left join pa x on x.qator_id = q.id
      where q.obyekt_id = p_obyekt_id
    )
    select jsonb_build_object(
      'smeta_summa', smeta_summa,
      'smeta_summa_asos', 'barglar',
      'smeta_summa_nomalum', smeta_summa_nomalum,
      'fakt_summa', fakt_summa,
      'oldingi_summa', oldingi_summa,
      'joriy_tasdiqlangan_summa', joriy_summa,
      'joriy_qoralama_summa', joriy_qoralama_summa,
      'jami_tasdiqlangan_summa', jami_summa,
      'jami_tasdiqlangan_malum_summa', jami_summa,
      'f2_summa_nomalum', oldingi_nom + joriy_nom,
      'qoldiq_summa', smeta_summa - jami_summa - (select coalesce(sum(public.t2_almashtirilgan_summa_hisob(public.t2_almashtirilgan_hajm(o.id), o.hajm, o.narx, o.summa)),0)
        from public.t2_qator o where o.obyekt_id = p_obyekt_id and o.tur in ('rs','mat','ob') and o.versiya_holat = 'faol'
          and (exists (select 1 from public.t2_qator zz where zz.replaces_line_id = o.id and zz.replaces_line_id is not null)
               or exists (select 1 from public.t2_qator zz where zz.replaces_line_id = o.ota_id and zz.replaces_line_id is not null))),
      'f2_mumkin_summa', fakt_summa - jami_summa,
      'baseline_summa', baseline_summa,
      'narx_variance_summa', jami_summa - baseline_summa,
      'pending_ozgarish_delta', v_pending,
      'bajarilish_foiz', case when smeta_summa <> 0 then round(jami_summa / smeta_summa * 100, 1) end)
      into v_jami from agg;

    if to_regclass('public.t2_obyekt_nakrutka') is not null then
      execute $q$
        select jsonb_build_object(
          'pryamye', round(n.pryamye, 2),
          'itogo4', round(n.itogo4, 2),
          'nds', round(n.nds, 2),
          'nds_foiz', case when coalesce(n.itogo4,0) <> 0 then round(n.nds / n.itogo4 * 100, 2) end,
          'vsego', round(n.vsego, 2))
        from public.t2_obyekt_nakrutka n where n.obyekt_id = $1 limit 1 $q$
        into v_nak using p_obyekt_id;
    end if;
    v_jami := v_jami || jsonb_build_object('smeta_nakrutka', v_nak);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'oy', to_char(a.oy,'YYYY-MM'), 'akt_id', a.id, 'raqam', a.raqam,
           'holat', a.holat, 'hujjat_jami', a.hujjat_jami, 'davr_muhr', a.davr_muhr,
           'revision_id', a.revision_id,
           'joriy', a.oy = v_davr, 'oldingi', a.oy < v_davr,
           'certified', a.holat = 'tasdiqlangan') order by a.oy, a.id), '[]'::jsonb)
    into v_davrlar
  from public.t2_akt a where a.obyekt_id = p_obyekt_id and a.tur = 'f2' and a.holat <> 'bekor';

  return jsonb_build_object(
    'ok', true, 'generated_at', now(),
    'obyekt', jsonb_build_object('id', p_obyekt_id, 'nom', v_obnom, 'kompaniya_id', v_komp, 'loyiha_id', v_loyiha),
    'davr', to_char(v_davr,'YYYY-MM'),
    'joriy_revision_id', (select id from public.t2_smeta_revision where obyekt_id=p_obyekt_id order by seq desc limit 1),
    'qatorlar', v_qatorlar,
    'qatorlar_jami', v_qcount,
    'qatorlar_korsatildi', jsonb_array_length(v_qatorlar),
    'offset', v_off,
    'limit', v_lim,
    'keyingi_offset', case when v_keyingi then v_off + v_lim end,
    'truncated', v_keyingi,
    'jami', v_jami,
    'davrlar', v_davrlar);
end $function$;

CREATE OR REPLACE FUNCTION public.t2_ish_abc_saqla_v1(p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint, p_command text, p_ota_qator_id bigint, p_almashtirilayotgan_qator_id bigint, p_ish jsonb, p_resurslar jsonb, p_fakt_hajm numeric, p_sana date, p_sabab text, p_operation_id uuid, p_kutilgan_versiya integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_rol text; v_prev jsonb; v_ota bigint := p_ota_qator_id; v_versiya integer := p_kutilgan_versiya;
  v_add jsonb; v_id bigint; v_kind text; v_res jsonb; v_r jsonb; v_rid bigint; v_i integer := 0;
  v_ish_hajm numeric; v_hajm numeric; v_narx numeric; v_kat text; v_ids bigint[] := '{}'; v_eski public.t2_qator%rowtype;
  v_fakt jsonb; v_manba text; v_norma numeric; v_rtur text; v_fakt_q jsonb := '[]'::jsonb;
begin
  if p_command not in ('additional', 'replacement', 'resurs_zamena') then return jsonb_build_object('ok', false, 'code', 'COMMAND_INVALID'); end if;
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  if nullif(btrim(coalesce(p_sabab, '')), '') is null then return jsonb_build_object('ok', false, 'code', 'SABAB_REQUIRED'); end if;
  if p_resurslar is not null and (jsonb_typeof(p_resurslar) <> 'array' or jsonb_array_length(p_resurslar) > 60) then
    return jsonb_build_object('ok', false, 'code', 'RESURSLAR_0_60');
  end if;
  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id,p_actor_id,'smeta.write');
  if v_rol not in ('admin', 'superadmin', 'boss', 'director', 'pto') and not public.t2_permission_allowed_v2(p_kompaniya_id,p_actor_id,'smeta.write') then return jsonb_build_object('ok', false, 'code', 'WRITE_ROLE_REQUIRED'); end if;
  select response into v_prev from public.t2_addrepl_command where operation_id = p_operation_id;
  if found then return jsonb_build_object('ok', true, 'takror', true, 'qator_id', v_prev->'qator_id'); end if;
  if p_command = 'resurs_zamena' then
    select * into v_eski from public.t2_qator where id = p_almashtirilayotgan_qator_id and obyekt_id = p_obyekt_id and kompaniya_id = p_kompaniya_id;
    if not found or v_eski.tur not in ('rs', 'mat', 'ob') or v_eski.ota_id is null then return jsonb_build_object('ok', false, 'code', 'RESURS_NOT_FOUND'); end if;
    v_r := p_resurslar->0;
    if v_r is null then return jsonb_build_object('ok', false, 'code', 'RESURS_REQUIRED'); end if;
    select hajm, versiya into v_ish_hajm, v_versiya from public.t2_qator where id = v_eski.ota_id;
    v_norma := nullif(v_r->>'norma', '')::numeric; if v_norma <= 0 then v_norma := null; end if;
    v_hajm := case when v_norma is not null and v_ish_hajm is not null then round(v_norma * v_ish_hajm, 6) else nullif(v_r->>'hajm', '')::numeric end;
    v_add := public.t2_addrepl_execute_v1(jsonb_strip_nulls(jsonb_build_object(
      'command', 'replacement', 'kompaniya_id', p_kompaniya_id, 'actor_id', p_actor_id, 'obyekt_id', p_obyekt_id,
      'ota_qator_id', v_eski.ota_id, 'almashtirilayotgan_qator_id', v_eski.id, 'nom', btrim(v_r->>'nom'), 'birlik', btrim(v_r->>'birlik'),
      'hajm', v_hajm, 'kod', nullif(btrim(coalesce(v_r->>'kod', '')), ''), 'sabab', p_sabab, 'operation_id', p_operation_id, 'kutilgan_versiya', v_versiya)));
    v_id := (v_add->>'qator_id')::bigint;
    v_narx := nullif(v_r->>'narx', '')::numeric; if v_narx < 0 then v_narx := null; end if;
    v_kat := coalesce(nullif(v_r->>'kat', ''), v_eski.kat);
    update public.t2_qator set norma = v_norma, kat = case when v_kat in ('ЧЕЛ','МАШ','МАТ','ОБ','М/К','КАБ','БЕЗСКЛАД') then v_kat else kat end,
           narx = v_narx, summa = case when v_narx is null or v_hajm is null then null else round(v_hajm * v_narx, 2) end,
           narx_usul = upper(coalesce(nullif(v_r->>'narx_manba', ''), 'qolda'))
     where id = v_id;
    perform public.t2_qator_ota_jami_yangila_v1(array[v_id]); -- ota_jami_rollup_v1
    perform public.t2_audit_yoz(p_kompaniya_id, 'resurs_zamena', 'smeta', p_obyekt_id, format('yangi=%s eski=%s', v_id, v_eski.id), 'actor:' || p_actor_id, null);
    return jsonb_build_object('ok', true, 'qator_id', v_id, 'change_id', v_add->'change_id');
  end if;
  if p_ish is null or nullif(btrim(coalesce(p_ish->>'nom', '')), '') is null or nullif(btrim(coalesce(p_ish->>'birlik', '')), '') is null then
    return jsonb_build_object('ok', false, 'code', 'ISH_NOM_BIRLIK_REQUIRED');
  end if;
  v_ish_hajm := nullif(p_ish->>'hajm', '')::numeric;
  if v_ish_hajm is null or v_ish_hajm = 0 then return jsonb_build_object('ok', false, 'code', 'ISH_HAJM_REQUIRED'); end if;
  if p_command = 'additional' and v_ota is null then
    perform 1 from public.t2_obyekt where id = p_obyekt_id and kompaniya_id = p_kompaniya_id for update;
    if not found then return jsonb_build_object('ok', false, 'code', 'OBJECT_ACCESS_DENIED'); end if;
    select id, versiya into v_ota, v_versiya from public.t2_qator
     where obyekt_id = p_obyekt_id and tur = 'rz' and ota_id is null and nom = 'СМЕТАДАН ТАШҚАРИ ИШЛАР' order by id limit 1;
    if v_ota is null then
      insert into public.t2_qator(obyekt_id, kompaniya_id, ota_id, daraja, tartib, tur, nom, qoshimcha, change_type)
        values (p_obyekt_id, p_kompaniya_id, null, 0, (select coalesce(max(tartib), 0) + 1 from public.t2_qator where obyekt_id = p_obyekt_id),
                'rz', 'СМЕТАДАН ТАШҚАРИ ИШЛАР', true, 'ADDITIONAL')
        returning id, versiya into v_ota, v_versiya;
    end if;
  end if;
  if v_ota is null then return jsonb_build_object('ok', false, 'code', 'PARENT_REQUIRED'); end if;
  v_add := public.t2_addrepl_execute_v1(jsonb_strip_nulls(jsonb_build_object(
    'command', p_command, 'kompaniya_id', p_kompaniya_id, 'actor_id', p_actor_id, 'obyekt_id', p_obyekt_id,
    'ota_qator_id', v_ota, 'almashtirilayotgan_qator_id', p_almashtirilayotgan_qator_id,
    'nom', btrim(p_ish->>'nom'), 'birlik', btrim(p_ish->>'birlik'), 'hajm', v_ish_hajm,
    'kod', nullif(btrim(coalesce(p_ish->>'kod', '')), ''), 'sabab', p_sabab, 'operation_id', p_operation_id, 'kutilgan_versiya', v_versiya)));
  v_id := (v_add->>'qator_id')::bigint;
  select tur into v_kind from public.t2_qator where id = v_id;
  if p_resurslar is not null and jsonb_array_length(p_resurslar) > 0 then
    if v_kind <> 'bl' then raise exception 'RESURS_FAQAT_ISH_OSTIGA'; end if;
    for v_r in select value from jsonb_array_elements(p_resurslar) loop
      v_i := v_i + 1;
      v_norma := nullif(v_r->>'norma', '')::numeric; if v_norma <= 0 then v_norma := null; end if;
      v_hajm := case when v_norma is not null then round(v_norma * v_ish_hajm, 6) else nullif(v_r->>'hajm', '')::numeric end;
      if nullif(btrim(coalesce(v_r->>'nom', '')), '') is null or nullif(btrim(coalesce(v_r->>'birlik', '')), '') is null
         or coalesce(v_hajm, 0) = 0 then
        raise exception 'RESURS_INVALID: % (nom, birlik va norma yoki aniq hajm <> 0)', v_i;
      end if;
      v_kat := nullif(v_r->>'kat', '');
      v_rtur := case when v_norma is not null then 'rs' when v_kat = 'ОБ' then 'ob' else 'mat' end;
      v_res := public.t2_addrepl_execute_v1(jsonb_strip_nulls(jsonb_build_object(
        'command', 'resource', 'tur', v_rtur, 'kompaniya_id', p_kompaniya_id, 'actor_id', p_actor_id, 'obyekt_id', p_obyekt_id,
        'ota_qator_id', v_id, 'nom', btrim(v_r->>'nom'), 'birlik', btrim(v_r->>'birlik'), 'hajm', v_hajm,
        'kod', nullif(btrim(coalesce(v_r->>'kod', '')), ''), 'sabab', p_sabab,
        'operation_id', md5(p_operation_id::text || ':abc:' || v_i)::uuid,
        'kutilgan_versiya', (select versiya from public.t2_qator where id = v_id))));
      v_rid := (v_res->>'qator_id')::bigint;
      v_narx := nullif(v_r->>'narx', '')::numeric; if v_narx < 0 then v_narx := null; end if;
      v_manba := upper(coalesce(nullif(v_r->>'narx_manba', ''), 'qolda'));
      update public.t2_qator set norma = v_norma,
             kat = case when v_kat in ('ЧЕЛ','МАШ','МАТ','ОБ','М/К','КАБ','БЕЗСКЛАД') then v_kat else kat end,
             narx = v_narx, summa = case when v_narx is null then null else round(v_hajm * v_narx, 2) end,
             narx_usul = case when v_narx is null then null else v_manba end
       where id = v_rid;
      v_ids := v_ids || v_rid;
      if v_rtur <> 'rs' then v_fakt_q := v_fakt_q || jsonb_build_array(jsonb_build_object('qator_id', v_rid, 'hajm', v_hajm)); end if;
    end loop;
    update public.t2_qator set summa = (select sum(summa) from public.t2_qator where ota_id = v_id and tur in ('rs', 'mat', 'ob'))
     where id = v_id;
  end if;
  if coalesce(p_fakt_hajm, 0) <> 0 then
    if v_kind not in ('bl', 'mat', 'ob') then raise exception 'FAKT_FAQAT_ISH_YOKI_MATERIAL'; end if;
    v_fakt := public.t2_fakt_yoz_v2(p_obyekt_id, coalesce(p_sana, current_date),
      jsonb_build_array(jsonb_build_object('qator_id', v_id, 'hajm', p_fakt_hajm)) || v_fakt_q, p_actor_id,
      md5(p_operation_id::text || ':abc:fakt')::uuid, left('ABC: ' || p_sabab, 500), null, 'actor:' || p_actor_id);
    if coalesce((v_fakt->>'ok')::boolean, false) is not true then
      raise exception 'FAKT_NOT_WRITTEN: %', coalesce(v_fakt->>'code', v_fakt->>'error', v_fakt::text);
    end if;
  end if;
  perform public.t2_qator_ota_jami_yangila_v1(array[v_id] || v_ids); -- ota_jami_rollup_v1
  perform public.t2_audit_yoz(p_kompaniya_id, 'ish_abc_' || p_command, 'smeta', p_obyekt_id,
    format('qator=%s resurs=%s fakt=%s', v_id, cardinality(v_ids), coalesce(p_fakt_hajm, 0)), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true, 'qator_id', v_id, 'resurs_ids', to_jsonb(v_ids), 'bolim_id', v_ota, 'change_id', v_add->'change_id');
end $function$;

CREATE OR REPLACE FUNCTION public.t2_almashtirilgan_summa_hisob(p_alm numeric, p_hajm numeric, p_narx numeric, p_summa numeric)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case when coalesce(p_alm, 0) = 0 then 0::numeric
              when p_narx is not null then p_alm * p_narx
              when p_hajm is not null and p_hajm <> 0 and p_summa is not null then p_alm * p_summa / p_hajm end
$function$;

drop function if exists public.t2_zamena_reja_hajm(bigint);

commit;
