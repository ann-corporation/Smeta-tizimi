-- T2-DIREKTIVA-PTO-PRO-V1 · 1-raund — F2 NULL semantikasi (P0).
-- Isbot (2026-10-08, jonli baza): 264 ta `price_intentionally_absent` F2 qatorida certified_amount to'g'ri NULL, lekin
-- t2_qator_holat ulardan 258 tasini f2_summa = 0 ko'rsatardi (COALESCE(sum(...), 0)); GREATEST(NULL, 0) = 0 ham
-- noma'lumni nolga aylantirardi; Nakopitelniy va F3 esa sertifikatlangan summa o'rniga aq.summa ni COALESCE(...,0) bilan yig'ardi.
-- Qonun: NULL ≠ 0; sertifikatlangan aniq summa manbadan (COALESCE(certified_amount, summa)); noma'lum qism bo'lsa jami NULL,
-- alohida "ma'lum qism" va "noma'lum soni" ko'rsatiladi. Ma'lum qatorlarning qiymati O'ZGARMAYDI (summa = certified_amount
-- hamma qatorda tekshirildi: farq 0). Faqat ko'rinish/hisob funksiyalari; biznes jadvallari yozilmaydi.

-- 1) t2_qator_holat — mavjud ustunlar tartibi saqlanadi, oxiriga f2_summa_nomalum qo'shiladi.
create or replace view public.t2_qator_holat as
 WITH direct AS NOT MATERIALIZED (
         SELECT q.id, q.obyekt_id, q.tur, q.raqam, q.kod, q.nom, q.birlik, q.kat, q.ota_id, q.norma, q.hajm, q.narx, q.summa,
            COALESCE(sum(aq.hajm) FILTER (WHERE a.tur = 'fakt'::text AND a.holat <> 'bekor'::text), 0::numeric) AS direct_fakt_hajm,
            COALESCE(sum(aq.summa) FILTER (WHERE a.tur = 'fakt'::text AND a.holat <> 'bekor'::text), 0::numeric) AS direct_fakt_summa,
            COALESCE(sum(COALESCE(aq.certified_quantity, aq.hajm)) FILTER (WHERE a.tur = 'f2'::text AND a.holat = 'tasdiqlangan'::text), 0::numeric) AS f2_hajm,
            COALESCE(sum(COALESCE(aq.certified_amount, aq.summa)) FILTER (WHERE a.tur = 'f2'::text AND a.holat = 'tasdiqlangan'::text), 0::numeric) AS f2_summa_malum,
            count(*) FILTER (WHERE a.tur = 'f2'::text AND a.holat = 'tasdiqlangan'::text
                               AND COALESCE(aq.certified_amount, aq.summa) IS NULL
                               AND COALESCE(aq.certified_quantity, aq.hajm, 0::numeric) <> 0::numeric) AS f2_summa_nomalum
           FROM t2_qator q
             LEFT JOIN t2_akt_qator aq ON aq.qator_id = q.id
             LEFT JOIN t2_akt a ON a.id = aq.akt_id
          GROUP BY q.id, q.obyekt_id, q.tur, q.raqam, q.kod, q.nom, q.birlik, q.kat, q.ota_id, q.norma, q.hajm, q.narx, q.summa
        ), effective AS NOT MATERIALIZED (
         SELECT d.id, d.obyekt_id, d.tur, d.raqam, d.kod, d.nom, d.birlik, d.kat, d.ota_id, d.norma, d.hajm, d.narx, d.summa,
            d.direct_fakt_hajm, d.direct_fakt_summa, d.f2_hajm,
            CASE WHEN d.f2_summa_nomalum > 0 THEN NULL::numeric ELSE d.f2_summa_malum END AS f2_summa,
            d.f2_summa_nomalum,
                CASE
                    WHEN d.tur = 'rs'::text AND d.norma IS NOT NULL AND parent.tur = 'bl'::text AND d.direct_fakt_hajm = 0::numeric THEN parent.direct_fakt_hajm * d.norma
                    ELSE d.direct_fakt_hajm
                END AS fakt_hajm,
                CASE
                    WHEN d.tur = 'rs'::text AND d.norma IS NOT NULL AND parent.tur = 'bl'::text AND d.direct_fakt_hajm = 0::numeric THEN
                    CASE
                        WHEN d.narx IS NULL THEN NULL::numeric
                        ELSE parent.direct_fakt_hajm * d.norma * d.narx
                    END
                    ELSE d.direct_fakt_summa
                END AS fakt_summa,
                CASE
                    WHEN d.tur = 'rs'::text AND d.norma IS NOT NULL AND parent.tur = 'bl'::text AND d.direct_fakt_hajm = 0::numeric THEN 'BL_NORMA'::text
                    ELSE 'DIRECT'::text
                END AS fakt_manbasi
           FROM direct d
             LEFT JOIN direct parent ON parent.id = d.ota_id AND parent.obyekt_id = d.obyekt_id
        )
 SELECT id,
    id AS qator_id,
    obyekt_id, tur, raqam, kod, nom, birlik, kat,
    hajm AS smeta_hajm,
    narx AS smeta_narx,
    summa AS smeta_summa,
    fakt_hajm,
    fakt_summa,
    f2_hajm,
    f2_summa,
    hajm - f2_hajm AS qoldiq_hajm,
    summa - f2_summa AS qoldiq_summa,
    GREATEST(fakt_hajm - f2_hajm, 0::numeric) AS f2_mumkin_hajm,
    -- GREATEST(NULL, 0) = 0 in PostgreSQL — an unknown operand must stay unknown.
    CASE WHEN fakt_summa IS NULL OR f2_summa IS NULL THEN NULL::numeric ELSE GREATEST(fakt_summa - f2_summa, 0::numeric) END AS f2_mumkin_summa,
        CASE
            WHEN f2_hajm <> 0::numeric THEN round(f2_summa / f2_hajm, 2)
            ELSE NULL::numeric
        END AS f2_narx,
        CASE
            WHEN fakt_hajm <> 0::numeric THEN round(fakt_summa / fakt_hajm, 2)
            ELSE NULL::numeric
        END AS fakt_narx,
        CASE
            WHEN f2_hajm <> 0::numeric AND narx IS NOT NULL AND narx <> 0::numeric THEN round((f2_summa / f2_hajm - narx) / narx * 100::numeric, 1)
            ELSE NULL::numeric
        END AS f2_narx_farq_foiz,
    ota_id,
    norma,
    direct_fakt_hajm,
    direct_fakt_summa,
    fakt_manbasi,
    f2_summa_nomalum
   FROM effective;

-- 2) t2_f2_kat_oy — jami_summa noma'lum qism bo'lsa NULL; ma'lum qism va noma'lum soni alohida (oxiriga).
create or replace view public.t2_f2_kat_oy as
 SELECT a.obyekt_id,
    a.kompaniya_id,
    a.tur,
    a.oy,
    COALESCE(q.kat, 'МАТ'::text) AS kat,
    count(*) AS qator_soni,
    sum(COALESCE(aq.certified_quantity, aq.hajm)) AS jami_hajm,
    CASE WHEN count(*) FILTER (WHERE COALESCE(aq.certified_amount, aq.summa) IS NULL AND COALESCE(aq.certified_quantity, aq.hajm, 0::numeric) <> 0::numeric) > 0
         THEN NULL::numeric ELSE sum(COALESCE(aq.certified_amount, aq.summa)) END AS jami_summa,
    COALESCE(sum(COALESCE(aq.certified_amount, aq.summa)), 0::numeric) AS malum_summa,
    count(*) FILTER (WHERE COALESCE(aq.certified_amount, aq.summa) IS NULL AND COALESCE(aq.certified_quantity, aq.hajm, 0::numeric) <> 0::numeric) AS nomalum_soni
   FROM t2_akt_qator aq
     JOIN t2_akt a ON a.id = aq.akt_id AND a.holat <> 'bekor'::text
     JOIN t2_qator q ON q.id = aq.qator_id
  GROUP BY a.obyekt_id, a.kompaniya_id, a.tur, a.oy, (COALESCE(q.kat, 'МАТ'::text));

-- 3) Nakopitelniy — F2 summalari sertifikatlangan aniq summadan; noma'lum bo'lsa NULL (qator va jami darajasida),
--    "f2_summa_nomalum" soni bilan. Chiqish shakli va boshqa maydonlar o'zgarmaydi.
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
      'tur', q.tur, 'kat', q.kat, 'qoshimcha', q.qoshimcha, 'zamena', q.zamena,
      'smeta_hajm', q.hajm, 'smeta_narx', q.narx, 'smeta_summa', q.summa,
      'fakt_hajm', coalesce(p.fakt_hajm,0), 'fakt_summa', coalesce(p.fakt_summa,0),
      'oldingi_hajm',  coalesce(p.oldingi_hajm,0),
      'oldingi_summa', case when p.oldingi_nom > 0 then null else coalesce(p.oldingi_summa,0) end,
      'joriy_hajm',    coalesce(p.joriy_hajm,0),
      'joriy_summa',   case when p.joriy_nom > 0 then null else coalesce(p.joriy_summa,0) end,
      'joriy_qoralama_summa', case when p.qoralama_nom > 0 then null else coalesce(p.joriy_qoralama_summa,0) end,
      'jami_hajm',  coalesce(p.oldingi_hajm,0) + coalesce(p.joriy_hajm,0),
      'jami_summa', case when coalesce(p.oldingi_nom,0) + coalesce(p.joriy_nom,0) > 0 then null
                         else coalesce(p.oldingi_summa,0) + coalesce(p.joriy_summa,0) end,
      'f2_summa_nomalum', coalesce(p.oldingi_nom,0) + coalesce(p.joriy_nom,0),
      'f2_mumkin_hajm', coalesce(p.fakt_hajm,0) - (coalesce(p.oldingi_hajm,0) + coalesce(p.joriy_hajm,0)),
      'qoldiq_hajm',  coalesce(q.hajm,0) - (coalesce(p.oldingi_hajm,0) + coalesce(p.joriy_hajm,0)),
      'qoldiq_summa', case when coalesce(p.oldingi_nom,0) + coalesce(p.joriy_nom,0) > 0 then null
                           else coalesce(q.summa,0) - (coalesce(p.oldingi_summa,0) + coalesce(p.joriy_summa,0)) end,
      'jami_baseline_summa', coalesce(p.oldingi_baseline,0) + coalesce(p.joriy_baseline,0),
      'jami_actual_summa',   p.jami_actual_summa,
      'narx_variance_summa',
        case when coalesce(p.oldingi_nom,0) + coalesce(p.joriy_nom,0) > 0 then null
             else (coalesce(p.oldingi_summa,0) + coalesce(p.joriy_summa,0))
                  - (coalesce(p.oldingi_baseline,0) + coalesce(p.joriy_baseline,0)) end,
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
                           and coalesce(aq.certified_amount, aq.summa) is null and coalesce(aq.certified_quantity, aq.hajm, 0) <> 0) as oldingi_nom,
        sum(aq.baseline_summa) filter (where a.tur='f2' and a.holat='tasdiqlangan' and a.oy < v_davr) as oldingi_baseline,
        sum(aq.hajm)  filter (where a.tur='f2' and a.holat='tasdiqlangan' and a.oy = v_davr) as joriy_hajm,
        sum(coalesce(aq.certified_amount, aq.summa)) filter (where a.tur='f2' and a.holat='tasdiqlangan' and a.oy = v_davr) as joriy_summa,
        count(*) filter (where a.tur='f2' and a.holat='tasdiqlangan' and a.oy = v_davr
                           and coalesce(aq.certified_amount, aq.summa) is null and coalesce(aq.certified_quantity, aq.hajm, 0) <> 0) as joriy_nom,
        sum(aq.baseline_summa) filter (where a.tur='f2' and a.holat='tasdiqlangan' and a.oy = v_davr) as joriy_baseline,
        sum(aq.summa) filter (where a.tur='f2' and a.holat='qoralama' and a.oy = v_davr) as joriy_qoralama_summa,
        count(*) filter (where a.tur='f2' and a.holat='qoralama' and a.oy = v_davr
                           and coalesce(aq.certified_amount, aq.summa) is null and coalesce(aq.certified_quantity, aq.hajm, 0) <> 0) as qoralama_nom,
        case when count(*) filter (where a.tur='f2' and a.holat='tasdiqlangan' and aq.actual_narx is null) > 0
             then null
             else sum(aq.hajm * aq.actual_narx) filter (where a.tur='f2' and a.holat='tasdiqlangan')
        end as jami_actual_summa
      from public.t2_akt_qator aq
      join public.t2_akt a on a.id = aq.akt_id and a.holat <> 'bekor'
      where aq.qator_id = q.id
    ) p on true
    where (not v_faol or coalesce(p.oldingi_hajm,0) <> 0 or coalesce(p.joriy_hajm,0) <> 0
           or coalesce(p.joriy_qoralama_summa,0) <> 0 or coalesce(p.fakt_hajm,0) <> 0 or q.qoshimcha or q.zamena)
    order by q.tartib, q.id
    offset case when v_faol then v_off else 0 end
    limit v_lim + 1
  ) d;

  v_keyingi := v_olindi > v_lim;
  if v_keyingi then
    v_qatorlar := v_qatorlar - (jsonb_array_length(v_qatorlar) - 1);
  end if;

  select count(*) into v_qcount from public.t2_qator where obyekt_id = p_obyekt_id;

  if v_off = 0 then
    if to_regclass('public.t2_smeta_ozgarish') is not null then
      execute 'select coalesce(sum(delta_summa),0) from public.t2_smeta_ozgarish where obyekt_id=$1 and holat=''qoralama'''
        into v_pending using p_obyekt_id;
    end if;

    with agg as (
      select
        coalesce(sum(q.summa) filter (where q.tur in ('rs','mat','ob')),0) as smeta_summa,
        count(*) filter (where q.tur in ('rs','mat','ob') and q.summa is null) as smeta_summa_nomalum,
        coalesce(sum(x.fakt_summa),0) as fakt_summa,
        coalesce(sum(x.oldingi_summa),0) as oldingi_summa,
        coalesce(sum(x.joriy_summa),0)   as joriy_summa,
        coalesce(sum(x.joriy_qoralama_summa),0) as joriy_qoralama_summa,
        coalesce(sum(x.oldingi_summa),0) + coalesce(sum(x.joriy_summa),0) as jami_summa,
        coalesce(sum(x.oldingi_nom),0) as oldingi_nom,
        coalesce(sum(x.joriy_nom),0)   as joriy_nom,
        coalesce(sum(x.oldingi_baseline),0) + coalesce(sum(x.joriy_baseline),0) as baseline_summa
      from public.t2_qator q
      left join lateral (
        select
          sum(aq.summa) filter (where a.tur='fakt') as fakt_summa,
          sum(coalesce(aq.certified_amount, aq.summa)) filter (where a.tur='f2' and a.holat='tasdiqlangan' and a.oy <  v_davr) as oldingi_summa,
          count(*) filter (where a.tur='f2' and a.holat='tasdiqlangan' and a.oy <  v_davr
                             and coalesce(aq.certified_amount, aq.summa) is null and coalesce(aq.certified_quantity, aq.hajm, 0) <> 0) as oldingi_nom,
          sum(aq.baseline_summa) filter (where a.tur='f2' and a.holat='tasdiqlangan' and a.oy < v_davr) as oldingi_baseline,
          sum(coalesce(aq.certified_amount, aq.summa)) filter (where a.tur='f2' and a.holat='tasdiqlangan' and a.oy = v_davr) as joriy_summa,
          count(*) filter (where a.tur='f2' and a.holat='tasdiqlangan' and a.oy = v_davr
                             and coalesce(aq.certified_amount, aq.summa) is null and coalesce(aq.certified_quantity, aq.hajm, 0) <> 0) as joriy_nom,
          sum(aq.baseline_summa) filter (where a.tur='f2' and a.holat='tasdiqlangan' and a.oy = v_davr) as joriy_baseline,
          sum(aq.summa) filter (where a.tur='f2' and a.holat='qoralama' and a.oy = v_davr) as joriy_qoralama_summa
        from public.t2_akt_qator aq
        join public.t2_akt a on a.id = aq.akt_id and a.holat <> 'bekor'
        where aq.qator_id = q.id
      ) x on true
      where q.obyekt_id = p_obyekt_id
    )
    select jsonb_build_object(
      'smeta_summa', smeta_summa,
      'smeta_summa_asos', 'barglar',
      'smeta_summa_nomalum', smeta_summa_nomalum,
      'fakt_summa', fakt_summa,
      'oldingi_summa', case when oldingi_nom > 0 then null else oldingi_summa end,
      'joriy_tasdiqlangan_summa', case when joriy_nom > 0 then null else joriy_summa end,
      'joriy_qoralama_summa', joriy_qoralama_summa,
      'jami_tasdiqlangan_summa', case when oldingi_nom + joriy_nom > 0 then null else jami_summa end,
      'jami_tasdiqlangan_malum_summa', jami_summa,
      'f2_summa_nomalum', oldingi_nom + joriy_nom,
      'qoldiq_summa', case when oldingi_nom + joriy_nom > 0 then null else smeta_summa - jami_summa end,
      'f2_mumkin_summa', case when oldingi_nom + joriy_nom > 0 then null else fakt_summa - jami_summa end,
      'baseline_summa', baseline_summa,
      'narx_variance_summa', case when oldingi_nom + joriy_nom > 0 then null else jami_summa - baseline_summa end,
      'pending_ozgarish_delta', v_pending,
      'bajarilish_foiz', case when smeta_summa <> 0 and oldingi_nom + joriy_nom = 0 then round(jami_summa / smeta_summa * 100, 1) end)
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

-- 4) F3 — bajarilgan F2 summasi sertifikatlangan aniq summadan; noma'lum qism bo'lsa NULL saqlanadi (qisman summa EMAS).
alter table public.t2_forma3 alter column bajarilgan_f2_summa drop not null;

CREATE OR REPLACE FUNCTION public.t2_forma3_yarat_v1(p_actor_id bigint, p_loyiha_id bigint, p_obyekt_id bigint, p_shartnoma_id bigint, p_davr_boshi date, p_davr_oxiri date, p_akt_ids bigint[], p_raqam text, p_operation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_komp bigint; v_rol text; v_id bigint; v_summa numeric := 0; v_n integer := 0; v_nom integer := 0;
begin
  if p_operation_id is null then return jsonb_build_object('ok',false,'code','OPERATION_ID_REQUIRED'); end if;
  select id into v_id from public.t2_forma3 where operation_id = p_operation_id;
  if found then return jsonb_build_object('ok',true,'takror',true,'forma3_id',v_id); end if;

  if p_loyiha_id is not null then
    select kompaniya_id into v_komp from public.t2_loyiha where id = p_loyiha_id;
  elsif p_obyekt_id is not null then
    select kompaniya_id, loyiha_id into v_komp, p_loyiha_id from public.t2_obyekt where id = p_obyekt_id;
  end if;
  if v_komp is null then return jsonb_build_object('ok',false,'code','SCOPE_NOT_FOUND'); end if;
  v_rol := public.t2_actor_kompaniya_azo_tekshir(v_komp, p_actor_id);
  if v_rol not in ('boss','superadmin','rahbar','bugalter') then
    return jsonb_build_object('ok',false,'code','FORMA3_DENIED');
  end if;
  if p_akt_ids is null or array_length(p_akt_ids,1) is null then
    return jsonb_build_object('ok',false,'code','FORMA3_AKT_REQUIRED');
  end if;
  if exists (
    select 1 from unnest(p_akt_ids) aid
    left join public.t2_akt a on a.id = aid
    where a.id is null or a.tur <> 'f2' or a.holat <> 'tasdiqlangan'
       or a.kompaniya_id <> v_komp
       or (p_obyekt_id is not null and a.obyekt_id <> p_obyekt_id)
       or a.oy < date_trunc('month', p_davr_boshi) or a.oy > date_trunc('month', p_davr_oxiri)
  ) then
    return jsonb_build_object('ok',false,'code','FORMA3_AKT_INVALID',
      'xato','Har akt: tasdiqlangan Ф2, shu scope va davr ichida bo''lishi kerak');
  end if;

  select coalesce(sum(coalesce(aq.certified_amount, aq.summa)),0), count(distinct a.id),
         count(*) filter (where coalesce(aq.certified_amount, aq.summa) is null and coalesce(aq.certified_quantity, aq.hajm, 0) <> 0)
    into v_summa, v_n, v_nom
  from public.t2_akt a join public.t2_akt_qator aq on aq.akt_id = a.id
  where a.id = any(p_akt_ids);
  if v_nom > 0 then v_summa := null; end if;   -- NULL ≠ 0: never store a partial sum as the certified total

  insert into public.t2_forma3
    (kompaniya_id, loyiha_id, obyekt_id, shartnoma_id, raqam, davr_boshi, davr_oxiri,
     holat, bajarilgan_f2_summa, qoida_holat, qoida_manba, operation_id, actor_id)
  values (v_komp, p_loyiha_id, p_obyekt_id, p_shartnoma_id, p_raqam, p_davr_boshi, p_davr_oxiri,
     'qoralama', v_summa, 'FORMA3_RULE_MAPPED',
     'EGA_QAROR_B_NAKRUTKA_KASKAD_V1: ВСЕГО К ОПЛАТЕ = nakrutka kaskadi (t2_nakrutka_hisob_v1 bilan aynan: ИТОГО-4 × (1+НДС)); davr ustunlari faqat holat=tasdiqlangan F2 dan; qamrov — loyiha (shartnoma) darajasida; avans kirmaydi; hisob — frontend lib/forma3-export.ts jonli formulalar bilan (tiyingacha nazorat).',
     p_operation_id, p_actor_id)
  returning id into v_id;

  insert into public.t2_forma3_akt (forma3_id, akt_id) select v_id, unnest(p_akt_ids);
  update public.t2_akt set forma3_id = v_id where id = any(p_akt_ids);

  perform public.t2_audit_yoz(v_komp, 'forma3_yarat', 'smeta', p_obyekt_id,
    format('forma3_id=%s davr=%s..%s aktlar=%s f2_summa=%s nomalum_qator=%s qoida=EGA_QAROR_B_NAKRUTKA_KASKAD_V1',
           v_id, p_davr_boshi, p_davr_oxiri, v_n, coalesce(round(v_summa,2)::text, 'NOMALUM'), v_nom),
    'actor:'||p_actor_id, null);

  return jsonb_build_object('ok',true,'takror',false,'forma3_id',v_id,
    'bajarilgan_f2_summa',v_summa,'f2_summa_nomalum',v_nom,'aktlar',v_n,
    'qoida_holat','FORMA3_RULE_MAPPED',
    'qoida_manba','EGA_QAROR_B_NAKRUTKA_KASKAD_V1',
    'izoh','F3 jami qoidasi eganing B qarori bilan MAPPED: nakrutka kaskadi, ВСЕГО К ОПЛАТЕ = F2 к оплате jamisi (tiyingacha). Hisob hujjat-yozuvchida (lib/forma3-export.ts) jonli formulalar bilan.');
end $function$;
