-- Rollback: 20261221950000_t2_pul_bilan_yopiladi_v2. t2_nakopitelniy_v2 qo'llashdan oldingi prod ta'rifiga (md5(prosrc)=3a5c5b1f752beb991bdca8643055f5cb) qaytadi; predikat o'chadi.
-- Ta'rif qo'llashdan oldin pg_get_functiondef bilan olingan; imzo/SECURITY DEFINER/grant o'zgarmaydi.
begin;

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
      'smeta_hajm', coalesce(zr.v, q.hajm), 'asl_smeta_hajm', q.hajm, 'smeta_narx', q.narx, 'smeta_summa', q.summa,
      /* hisob_yadro_v2 */ 'fakt_hajm', coalesce(fh.fakt_hajm,0), 'fakt_summa', coalesce(fh.fakt_summa,0),
      'oldingi_hajm',  coalesce(p.oldingi_hajm,0),
      'oldingi_summa', coalesce(p.oldingi_summa,0),
      'joriy_hajm',    coalesce(p.joriy_hajm,0),
      'joriy_summa',   coalesce(p.joriy_summa,0),
      'joriy_qoralama_summa', coalesce(p.joriy_qoralama_summa,0),
      'jami_hajm',  coalesce(p.oldingi_hajm,0) + coalesce(p.joriy_hajm,0),
      'jami_summa', coalesce(p.oldingi_summa,0) + coalesce(p.joriy_summa,0),
      'f2_summa_nomalum', coalesce(p.oldingi_nom,0) + coalesce(p.joriy_nom,0),
      'f2_mumkin_hajm', coalesce(fh.fakt_hajm,0) - (coalesce(p.oldingi_hajm,0) + coalesce(p.joriy_hajm,0)),
      'almashtirilgan_hajm', coalesce(al.v,0),
      'qoldiq_hajm',  case when q.versiya_holat = 'almashtirilgan' then coalesce(p.oldingi_hajm,0) + coalesce(p.joriy_hajm,0) + coalesce(al.v,0) else coalesce(zr.v, q.hajm, 0) end - (coalesce(p.oldingi_hajm,0) + coalesce(p.joriy_hajm,0)) - coalesce(al.v,0),
      'almashtirilgan_summa', public.t2_almashtirilgan_summa_hisob(coalesce(al.v,0), q.hajm, q.narx, q.summa),
      'qoldiq_summa', case when zr.v is not null and q.change_type is distinct from 'REPLACEMENT' and q.versiya_holat is distinct from 'almashtirilgan'
        then case when q.hajm <> 0 and q.summa is not null then q.summa / q.hajm * (zr.v - (coalesce(p.oldingi_hajm,0) + coalesce(p.joriy_hajm,0)) - coalesce(al.v,0)) end
        else case when q.versiya_holat = 'almashtirilgan' then coalesce(p.oldingi_summa,0) + coalesce(p.joriy_summa,0) + coalesce(public.t2_almashtirilgan_summa_hisob(coalesce(al.v,0), q.hajm, q.narx, q.summa),0) else coalesce(case when zr.v is not null and q.hajm <> 0 and q.summa is not null then q.summa * zr.v / q.hajm else q.summa end, 0) end - (coalesce(p.oldingi_summa,0) + coalesce(p.joriy_summa,0)) - coalesce(public.t2_almashtirilgan_summa_hisob(coalesce(al.v,0), q.hajm, q.narx, q.summa),0) end,
      'jami_baseline_summa', coalesce(p.oldingi_baseline,0) + coalesce(p.joriy_baseline,0),
      'jami_actual_summa',   p.jami_actual_summa,
      'narx_variance_summa', case when p.oldingi_baseline is null and p.joriy_baseline is null then null else (coalesce(p.oldingi_vr,0) + coalesce(p.joriy_vr,0)) - (coalesce(p.oldingi_baseline,0) + coalesce(p.joriy_baseline,0)) end,
      'bajarilish_foiz', case when coalesce(zr.v, q.hajm, 0) <> 0 then round((coalesce(p.oldingi_hajm,0) + coalesce(p.joriy_hajm,0)) / coalesce(zr.v, q.hajm) * 100, 1) end
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
        sum(aq.baseline_summa) filter (where a.tur='f2' and a.holat='tasdiqlangan' and a.oy < v_davr and not public._t2_akt_qator_yaxlit_summami_v1(aq.narx, aq.hajm, aq.summa)) as oldingi_baseline, sum(coalesce(aq.certified_amount, aq.summa)) filter (where a.tur='f2' and a.holat='tasdiqlangan' and a.oy < v_davr and not public._t2_akt_qator_yaxlit_summami_v1(aq.narx, aq.hajm, aq.summa)) as oldingi_vr,
        sum(aq.hajm)  filter (where a.tur='f2' and a.holat='tasdiqlangan' and a.oy = v_davr) as joriy_hajm,
        sum(coalesce(aq.certified_amount, aq.summa)) filter (where a.tur='f2' and a.holat='tasdiqlangan' and a.oy = v_davr) as joriy_summa,
        count(*) filter (where a.tur='f2' and a.holat='tasdiqlangan' and a.oy = v_davr
                           and q.tur not in ('rz','bl') and coalesce(q.nom,'') !~* 'ЗАТРАТЫ\s+ТРУДА\s+МАШИНИСТ' and coalesce(aq.certified_amount, aq.summa) is null and coalesce(aq.certified_quantity, aq.hajm, 0) <> 0) as joriy_nom,
        sum(aq.baseline_summa) filter (where a.tur='f2' and a.holat='tasdiqlangan' and a.oy = v_davr and not public._t2_akt_qator_yaxlit_summami_v1(aq.narx, aq.hajm, aq.summa)) as joriy_baseline, sum(coalesce(aq.certified_amount, aq.summa)) filter (where a.tur='f2' and a.holat='tasdiqlangan' and a.oy = v_davr and not public._t2_akt_qator_yaxlit_summami_v1(aq.narx, aq.hajm, aq.summa)) as joriy_vr,
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
    ) p on true left join (select h.qator_id, h.fakt_hajm, h.fakt_summa from public._t2_qator_holat_v2(array[p_obyekt_id]) h) fh on fh.qator_id = q.id
    left join lateral (select case when exists (select 1 from public.t2_qator zz where zz.replaces_line_id = q.id and zz.replaces_line_id is not null) or exists (select 1 from public.t2_qator zz where zz.replaces_line_id = q.ota_id and zz.replaces_line_id is not null) then public.t2_almashtirilgan_hajm(q.id) else 0::numeric end as v) al on true
    left join lateral (select case when (q.change_type = 'REPLACEMENT' and q.replaces_line_id is not null and q.almashtirish_hajm is null)
        or (q.tur in ('rs','mat','ob') and q.ota_id is not null and exists (select 1 from public.t2_qator zp where zp.id = q.ota_id and zp.change_type = 'REPLACEMENT' and zp.replaces_line_id is not null and zp.almashtirish_hajm is null))
        then public.t2_zamena_reja_hajm(q.id) end as v) zr on true
    where ((not v_faol and (q.versiya_holat = 'faol' or coalesce(p.oldingi_hajm,0) <> 0 or coalesce(p.joriy_hajm,0) <> 0 or coalesce(fh.fakt_hajm,0) <> 0 or coalesce(p.joriy_qoralama_summa,0) <> 0)) or coalesce(al.v,0) <> 0 or coalesce(p.oldingi_hajm,0) <> 0 or coalesce(p.joriy_hajm,0) <> 0
           or coalesce(p.joriy_qoralama_summa,0) <> 0 or coalesce(fh.fakt_hajm,0) <> 0 or q.qoshimcha or q.zamena)
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
          sum(aq.baseline_summa) filter (where a.tur='f2' and a.holat='tasdiqlangan' and a.oy < v_davr and not public._t2_akt_qator_yaxlit_summami_v1(aq.narx, aq.hajm, aq.summa)) as oldingi_baseline, sum(coalesce(aq.certified_amount, aq.summa)) filter (where a.tur='f2' and a.holat='tasdiqlangan' and a.oy < v_davr and not public._t2_akt_qator_yaxlit_summami_v1(aq.narx, aq.hajm, aq.summa)) as oldingi_vr,
          sum(coalesce(aq.certified_amount, aq.summa)) filter (where a.tur='f2' and a.holat='tasdiqlangan' and a.oy = v_davr) as joriy_summa,
          count(*) filter (where a.tur='f2' and a.holat='tasdiqlangan' and a.oy = v_davr
                             and q.tur not in ('rz','bl') and coalesce(q.nom,'') !~* 'ЗАТРАТЫ\s+ТРУДА\s+МАШИНИСТ' and coalesce(aq.certified_amount, aq.summa) is null and coalesce(aq.certified_quantity, aq.hajm, 0) <> 0) as joriy_nom,
          sum(aq.baseline_summa) filter (where a.tur='f2' and a.holat='tasdiqlangan' and a.oy = v_davr and not public._t2_akt_qator_yaxlit_summami_v1(aq.narx, aq.hajm, aq.summa)) as joriy_baseline, sum(coalesce(aq.certified_amount, aq.summa)) filter (where a.tur='f2' and a.holat='tasdiqlangan' and a.oy = v_davr and not public._t2_akt_qator_yaxlit_summami_v1(aq.narx, aq.hajm, aq.summa)) as joriy_vr,
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
        coalesce((select sum(h.fakt_summa) from public._t2_qator_holat_v2(array[p_obyekt_id]) h where not exists (select 1 from public.t2_qator c where c.ota_id = h.qator_id)),0) as fakt_summa,
        coalesce(sum(x.oldingi_summa),0) as oldingi_summa,
        coalesce(sum(x.joriy_summa),0)   as joriy_summa,
        coalesce(sum(x.joriy_qoralama_summa),0) as joriy_qoralama_summa,
        coalesce(sum(x.oldingi_summa),0) + coalesce(sum(x.joriy_summa),0) as jami_summa,
        coalesce(sum(x.oldingi_nom),0) as oldingi_nom,
        coalesce(sum(x.joriy_nom),0)   as joriy_nom,
        coalesce(sum(x.oldingi_baseline),0) + coalesce(sum(x.joriy_baseline),0) as baseline_summa, coalesce(sum(x.oldingi_vr),0) + coalesce(sum(x.joriy_vr),0) as vr_summa
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
      'narx_variance_summa', vr_summa - baseline_summa,
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

-- t2_rahbar_panel_v1: qo'llashdan oldingi prod ta'rifi.
CREATE OR REPLACE FUNCTION public.t2_rahbar_panel_v1(p_kompaniya_id bigint, p_actor_id bigint, p_davr_dan date DEFAULT NULL::date, p_davr_gacha date DEFAULT NULL::date, p_obyekt_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_ob bigint[]; v_dan date; v_gacha date; v_davr_bor boolean;
  v_sm jsonb; v_sj jsonb; v_maxr numeric; v_maxr_joriy boolean; v_fk jsonb; v_f2 jsonb; v_f2d jsonb; v_f2q jsonb;            -- obyekt_id(text) → paket
  j_sm jsonb; j_fk jsonb; j_f2 jsonb; j_f2d jsonb; j_f2q jsonb;            -- jami paketlar
  v_aktlar jsonb; v_tolov_soni int; v_tolov numeric; v_tolov_d numeric; v_xar_soni int; v_xar_d numeric;
  v_shartnoma jsonb; v_sh_jami numeric; v_sh_soni int;
  v_deb jsonb; v_kred jsonb; v_rent jsonb; v_oylar jsonb; v_prog jsonb;
  v_obyektlar jsonb; v_signal jsonb; v_diqqat jsonb; v_tasdiq jsonb; v_reestr numeric; v_reestr_soni int;
  v_trend_dan date; v_trend_gacha date;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'financial.read');

  if p_davr_dan is not null and p_davr_gacha is not null and p_davr_dan > p_davr_gacha then
    return jsonb_build_object('ok', false, 'code', 'DAVR_NOTOGRI');
  end if;
  v_dan := date_trunc('month', p_davr_dan)::date;
  v_gacha := p_davr_gacha;
  v_davr_bor := p_davr_dan is not null or p_davr_gacha is not null;

  if p_obyekt_id is not null then
    if not exists (select 1 from public.t2_obyekt where id = p_obyekt_id and kompaniya_id = p_kompaniya_id) then
      return jsonb_build_object('ok', false, 'code', 'OBYEKT_SCOPE_MISMATCH');
    end if;
    v_ob := array[p_obyekt_id];
  else
    select coalesce(array_agg(id order by id), '{}') into v_ob from public.t2_obyekt where kompaniya_id = p_kompaniya_id;
  end if;

  -- Summa paketlari (obyekt bo'yicha) — yagona hisob yo'li.
  select jsonb_object_agg(p.obyekt_id::text, p.paket) into v_sm  from public._t2_summa_paket_kesh_v1(v_ob, 'smeta') p;
  select jsonb_object_agg(k.obyekt_id::text, k.smeta_joriy) into v_sj from public.t2_obyekt_kesh k
   where k.obyekt_id = any(v_ob) and k.smeta_joriy is not null
     and not exists (select 1 from public.t2_obyekt_kesh_iflos i where i.obyekt_id = k.obyekt_id);
  select sum(coalesce((v_sj->(o2::text)->>'qqs_bilan')::numeric, (v_sm->(o2::text)->>'qqs_bilan')::numeric)),
         coalesce(bool_and(jsonb_exists(v_sj, o2::text)), false)
    into v_maxr, v_maxr_joriy from unnest(v_ob) o2;
  select jsonb_object_agg(p.obyekt_id::text, p.paket) into v_fk  from public._t2_summa_paket_kesh_v1(v_ob, 'fakt') p;
  select jsonb_object_agg(p.obyekt_id::text, p.paket) into v_f2  from public._t2_summa_paket_kesh_v1(v_ob, 'f2') p;
  select jsonb_object_agg(p.obyekt_id::text, p.paket) into v_f2q from public._t2_summa_paket_kesh_v1(v_ob, 'f2_qoralama') p;
  if v_davr_bor then
    select jsonb_object_agg(p.obyekt_id::text, p.paket) into v_f2d from public._t2_summa_paket_kesh_v1(v_ob, 'f2', v_dan, v_gacha) p;
  else
    v_f2d := v_f2;
  end if;
  select public._t2_summa_paket_jam_v1(coalesce(jsonb_agg(value), '[]'::jsonb)) into j_sm  from jsonb_each(coalesce(v_sm, '{}'::jsonb));
  select public._t2_summa_paket_jam_v1(coalesce(jsonb_agg(value), '[]'::jsonb)) into j_fk  from jsonb_each(coalesce(v_fk, '{}'::jsonb));
  select public._t2_summa_paket_jam_v1(coalesce(jsonb_agg(value), '[]'::jsonb)) into j_f2  from jsonb_each(coalesce(v_f2, '{}'::jsonb));
  select public._t2_summa_paket_jam_v1(coalesce(jsonb_agg(value), '[]'::jsonb)) into j_f2d from jsonb_each(coalesce(v_f2d, '{}'::jsonb));
  select public._t2_summa_paket_jam_v1(coalesce(jsonb_agg(value), '[]'::jsonb)) into j_f2q from jsonb_each(coalesce(v_f2q, '{}'::jsonb));

  -- F2 aktlari: obyekt paketining ulushi (akt прямые / obyekt прямые) — yig'indisi obyekt paketiga AYNAN teng.
  with ak as (
    select a.id, a.obyekt_id, a.oy, a.sana, a.holat, a.forma3_id, a.raqam, a.kim, a.lifecycle_status,
           coalesce(a.lifecycle_submitted_at, a.yaratildi) as qachondan,
           coalesce(sum(coalesce(aq.certified_amount, aq.summa)), 0) as pr
      from public.t2_akt a
      left join public.t2_akt_qator aq on aq.akt_id = a.id
     where a.kompaniya_id = p_kompaniya_id and a.tur = 'f2' and a.holat in ('tasdiqlangan', 'qoralama') and a.obyekt_id = any(v_ob)
     group by a.id
  ), ul as (
    select ak.*, sum(ak.pr) over (partition by ak.obyekt_id, ak.holat) as jami_pr,
           count(*) over (partition by ak.obyekt_id, ak.holat) as soni
      from ak
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', ul.id, 'obyekt_id', ul.obyekt_id, 'oy', ul.oy, 'sana', ul.sana, 'holat', ul.holat, 'forma3_id', ul.forma3_id,
           'raqam', ul.raqam, 'kim', ul.kim, 'bosqich', ul.lifecycle_status, 'qachondan', ul.qachondan,
           'qqs_bilan', round(case when ul.jami_pr <> 0 then ul.pr / ul.jami_pr else 1.0 / ul.soni end
                              * ((case when ul.holat = 'tasdiqlangan' then v_f2 else v_f2q end)->(ul.obyekt_id::text)->>'qqs_bilan')::numeric, 2),
           'ustamali', round(case when ul.jami_pr <> 0 then ul.pr / ul.jami_pr else 1.0 / ul.soni end
                              * ((case when ul.holat = 'tasdiqlangan' then v_f2 else v_f2q end)->(ul.obyekt_id::text)->>'ustamali')::numeric, 2))
         order by ul.oy, ul.id), '[]'::jsonb)
    into v_aktlar
    from ul;

  -- To'lovlar (t2_tolov, 1C sverka ham shu yerga yozadi). Yozuv yo'q → null (kiritilmagan).
  select count(*), sum(case when t.tur = 'qaytarim' then -abs(t.summa) else t.summa end)
    into v_tolov_soni, v_tolov
    from public.t2_tolov t
   where t.kompaniya_id = p_kompaniya_id and t.holat <> 'bekor'
     and (p_obyekt_id is null or t.obyekt_id = p_obyekt_id);
  if v_tolov_soni = 0 then v_tolov := null; end if;
  select sum(case when t.tur = 'qaytarim' then -abs(t.summa) else t.summa end) into v_tolov_d
    from public.t2_tolov t
   where t.kompaniya_id = p_kompaniya_id and t.holat <> 'bekor'
     and (p_obyekt_id is null or t.obyekt_id = p_obyekt_id)
     and (v_dan is null or t.sana >= v_dan) and (v_gacha is null or t.sana <= v_gacha);
  if v_tolov_soni = 0 then v_tolov_d := null; elsif v_tolov_d is null then v_tolov_d := 0; end if;

  -- Xarajat (tannarx manbai). Yozuv yo'q → null.
  select count(*) into v_xar_soni from public.t2_xarajat x
   where x.kompaniya_id = p_kompaniya_id and coalesce(x.holat, 'faol') <> 'bekor' and (p_obyekt_id is null or x.obyekt_id = p_obyekt_id);
  select sum(x.summa) into v_xar_d from public.t2_xarajat x
   where x.kompaniya_id = p_kompaniya_id and coalesce(x.holat, 'faol') <> 'bekor' and (p_obyekt_id is null or x.obyekt_id = p_obyekt_id)
     and (v_dan is null or x.sana >= v_dan) and (v_gacha is null or x.sana <= v_gacha);
  if v_xar_soni = 0 then v_xar_d := null; elsif v_xar_d is null then v_xar_d := 0; end if;

  -- Shartnomalar (asosiy, bekor emas): oxirgi faol DS summasi, aks holda shartnoma summasi (QQS bilan).
  with sh as (
    select s.id, s.raqam, s.nom,
           coalesce((select d.jami_nds_bilan from public.t2_shartnoma_ds d where d.shartnoma_id = s.id and d.holat = 'faol'
                      order by d.sana desc, d.id desc limit 1), s.jami_nds_bilan) as qqs_bilan,
           array(select b.obyekt_id from public.t2_shartnoma_bog b where b.shartnoma_id = s.id and b.holat = 'faol' order by b.obyekt_id) as obyektlar
      from public.t2_shartnoma s
     where s.kompaniya_id = p_kompaniya_id and s.holat <> 'bekor' and coalesce(s.asosiy, true)
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', sh.id, 'raqam', sh.raqam, 'nom', sh.nom, 'qqs_bilan', sh.qqs_bilan,
           'obyektlar', to_jsonb(sh.obyektlar),
           'f2_qqs_bilan', (select round(sum((v_f2->(o::text)->>'qqs_bilan')::numeric), 2) from unnest(sh.obyektlar) o),
           'tolangan', case when v_tolov_soni > 0 then (select coalesce(sum(case when t.tur = 'qaytarim' then -abs(t.summa) else t.summa end), 0)
                                                        from public.t2_tolov t where t.shartnoma_id = sh.id and t.holat <> 'bekor') end)
           order by sh.id), '[]'::jsonb),
         sum(sh.qqs_bilan), count(sh.qqs_bilan)
    into v_shartnoma, v_sh_jami, v_sh_soni
    from sh
   where p_obyekt_id is null or p_obyekt_id = any(sh.obyektlar);

  -- Debitor: tasdiqlangan F2 (QQS bilan) − to'lov; yosh — FIFO (to'lov eng eski F2 ni yopadi).
  if v_tolov_soni > 0 then
    with f as (
      select (e->>'id')::bigint as id, coalesce((e->>'sana')::date, ((e->>'oy')::date + interval '1 month' - interval '1 day')::date) as sana,
             (e->>'qqs_bilan')::numeric as s
        from jsonb_array_elements(v_aktlar) e where e->>'holat' = 'tasdiqlangan'
    ), c as (
      select f.*, sum(f.s) over (order by f.sana, f.id) as kum from f
    ), q as (
      select c.sana, greatest(0, least(c.s, c.kum - greatest(v_tolov, 0))) as qoldiq from c
    )
    select jsonb_build_object(
             'qiymat', round(coalesce((j_f2->>'qqs_bilan')::numeric, 0) - v_tolov, 2),
             'hujjatlangan', j_f2->'qqs_bilan', 'tolangan', round(v_tolov, 2),
             'yosh', jsonb_build_object(
               'k0_30',  round(coalesce(sum(q.qoldiq) filter (where current_date - q.sana <= 30), 0), 2),
               'k30_60', round(coalesce(sum(q.qoldiq) filter (where current_date - q.sana > 30 and current_date - q.sana <= 60), 0), 2),
               'k60',    round(coalesce(sum(q.qoldiq) filter (where current_date - q.sana > 60), 0), 2)),
             'asos', 'f2_tasdiqlangan', 'manbalar_yoq', '[]'::jsonb)
      into v_deb from q;
  else
    v_deb := jsonb_build_object('qiymat', null, 'hujjatlangan', j_f2->'qqs_bilan', 'tolangan', null, 'yosh', null,
                                'asos', 'f2_tasdiqlangan', 'manbalar_yoq', jsonb_build_array('tolov'));
  end if;

  -- Kreditor: yetkazuvchi / subpudrat hujjatlari tizimda hali yo'q → null (uydirma yo'q).
  v_kred := jsonb_build_object('qiymat', null, 'manbalar_yoq', jsonb_build_array('yetkazuvchi_hujjatlari', 'sklad_kirim', '1c_prixod', 'subpudrat_aktlari'));

  -- Rentabellik: daromad = tasdiqlangan F2 (QQS siz, ustamali) davrda; tannarx = haqiqiy xarajat.
  v_rent := jsonb_build_object(
    'daromad', j_f2d->'ustamali',
    'tannarx', round(v_xar_d, 2),
    'marja', round((j_f2d->>'ustamali')::numeric - v_xar_d, 2),
    'foiz', case when v_xar_d is not null and coalesce((j_f2d->>'ustamali')::numeric, 0) <> 0
                 then round(((j_f2d->>'ustamali')::numeric - v_xar_d) / (j_f2d->>'ustamali')::numeric * 100, 1) end,
    'manbalar_yoq', case when v_xar_soni = 0 then jsonb_build_array('xarajat', 'sklad_kirim_narxi', '1c_prixod', 'ish_haqi') else '[]'::jsonb end);

  -- Pul oqimi / trend: oylar (davr bo'lmasa — oxirgi 12 oy). Ma'lumot manbai yo'q → null (kulrang «kiritilmagan»).
  v_trend_gacha := date_trunc('month', coalesce(v_gacha, current_date))::date;
  v_trend_dan := coalesce(v_dan, (v_trend_gacha - interval '11 months')::date);
  select coalesce(jsonb_agg(jsonb_build_object(
           'oy', to_char(m.oy, 'YYYY-MM'),
           'bajarildi', (select round(coalesce(sum((e->>'qqs_bilan')::numeric), 0), 2) from jsonb_array_elements(v_aktlar) e
                          where e->>'holat' = 'tasdiqlangan' and date_trunc('month', (e->>'oy')::date) = m.oy),
           'tolov', case when v_tolov_soni > 0 then (select round(coalesce(sum(case when t.tur = 'qaytarim' then -abs(t.summa) else t.summa end), 0), 2)
                          from public.t2_tolov t where t.kompaniya_id = p_kompaniya_id and t.holat <> 'bekor'
                           and (p_obyekt_id is null or t.obyekt_id = p_obyekt_id) and date_trunc('month', t.sana) = m.oy) end,
           'xarajat', case when v_xar_soni > 0 then (select round(coalesce(sum(x.summa), 0), 2)
                          from public.t2_xarajat x where x.kompaniya_id = p_kompaniya_id and coalesce(x.holat, 'faol') <> 'bekor'
                           and (p_obyekt_id is null or x.obyekt_id = p_obyekt_id) and date_trunc('month', x.sana) = m.oy) end)
         order by m.oy), '[]'::jsonb)
    into v_oylar
    from generate_series(v_trend_dan::timestamp, v_trend_gacha::timestamp, interval '1 month') as g(oy0)
    cross join lateral (select date_trunc('month', g.oy0)::date as oy) m;

  -- Keyingi 90 kun prognozi: qoralama F2 → kutilayotgan to'lov; tasdiqlangan, lekin to'lanmagan (debitor).
  v_prog := jsonb_build_object(
    'kun', 90,
    'qoralama_f2', j_f2q->'qqs_bilan',
    'tolanmagan_f2', v_deb->'qiymat',
    'kutilayotgan', case when v_deb->>'qiymat' is not null
                         then round(coalesce((j_f2q->>'qqs_bilan')::numeric, 0) + greatest((v_deb->>'qiymat')::numeric, 0), 2) end,
    'majburiyatlar', null,
    'manbalar_yoq', case when v_tolov_soni = 0 then jsonb_build_array('tolov', 'tolov_majburiyatlari') else jsonb_build_array('tolov_majburiyatlari') end);

  -- Signallar — guruhlangan (xom 9 ming qator emas).
  select coalesce(jsonb_agg(jsonb_build_object('signal_type', g.signal_type, 'soni', g.soni, 'kritik', g.kritik,
           'obyektlar', g.obyektlar) order by g.kritik desc, g.soni desc), '[]'::jsonb)
    into v_signal
    from (
      select s.signal_type, count(*) as soni, count(*) filter (where s.severity in ('error', 'high', 'critical')) as kritik,
             (select coalesce(jsonb_agg(jsonb_build_object('obyekt_id', t.oid, 'soni', t.n) order by t.n desc), '[]'::jsonb)
                from (select s2.entity_id::bigint as oid, count(*) as n from public.t2_signal s2
                       where s2.kompaniya_id = p_kompaniya_id and s2.state = 'open' and s2.signal_type = s.signal_type
                         and s2.entity_type = 'obyekt' and s2.entity_id ~ '^\d+$'
                         and (p_obyekt_id is null or s2.entity_id = p_obyekt_id::text)
                       group by 1 order by 2 desc limit 5) t) as obyektlar
        from public.t2_signal s
       where s.kompaniya_id = p_kompaniya_id and s.state = 'open'
         and (p_obyekt_id is null or (s.entity_type = 'obyekt' and s.entity_id = p_obyekt_id::text))
       group by s.signal_type
    ) g;

  -- Obyektlar matritsasi.
  with o as (
    select o.id, o.nom, o.holat, o.loyiha_id, l.nom as loyiha_nom
      from public.t2_obyekt o left join public.t2_loyiha l on l.id = o.loyiha_id
     where o.id = any(v_ob)
  ), sh as (
    select distinct on (b.obyekt_id) b.obyekt_id, s.id, s.raqam,
           coalesce((select d.jami_nds_bilan from public.t2_shartnoma_ds d where d.shartnoma_id = s.id and d.holat = 'faol'
                      order by d.sana desc, d.id desc limit 1), s.jami_nds_bilan) as qqs_bilan,
           (select count(*) from public.t2_shartnoma_bog b2 where b2.shartnoma_id = s.id and b2.holat = 'faol') as obyekt_soni
      from public.t2_shartnoma_bog b join public.t2_shartnoma s on s.id = b.shartnoma_id
     where b.obyekt_id = any(v_ob) and b.holat = 'faol' and s.holat <> 'bekor'
     order by b.obyekt_id, s.asosiy desc nulls last, s.id
  ), tl as (
    select t.obyekt_id, sum(case when t.tur = 'qaytarim' then -abs(t.summa) else t.summa end) as summa
      from public.t2_tolov t where t.kompaniya_id = p_kompaniya_id and t.holat <> 'bekor' and t.obyekt_id = any(v_ob)
     group by t.obyekt_id
  ), sg as (
    select s.entity_id::bigint as obyekt_id, count(*) as soni, count(*) filter (where s.severity in ('error', 'high', 'critical')) as kritik,
           (array_agg(s.signal_type order by s.severity desc, s.detected_at desc))[1] as eng
      from public.t2_signal s
     where s.kompaniya_id = p_kompaniya_id and s.state = 'open' and s.entity_type = 'obyekt' and s.entity_id ~ '^\d+$'
     group by 1
  ), f3 as (
    select f.obyekt_id, sum(f.sotuv_summa) as sotuv, count(*) as soni
      from public.t2_forma3 f where f.kompaniya_id = p_kompaniya_id and f.holat <> 'bekor' and f.obyekt_id = any(v_ob)
     group by f.obyekt_id
  ), x as (
    select o.*, sh.id as sh_id, sh.raqam as sh_raqam, sh.qqs_bilan as sh_qqs, sh.obyekt_soni as sh_obyekt_soni,
           v_sm->(o.id::text) as sm, coalesce(v_sj->(o.id::text), v_sm->(o.id::text)) as smx, (v_sj->(o.id::text)) is not null as smx_joriy, v_fk->(o.id::text) as fk, v_f2->(o.id::text) as f2, v_f2q->(o.id::text) as f2q,
           case when v_tolov_soni > 0 then coalesce(tl.summa, 0) end as tolangan,
           sg.soni as sig_soni, sg.kritik as sig_kritik, sg.eng as sig_eng, f3.sotuv as f3_sotuv, f3.soni as f3_soni
      from o left join sh on sh.obyekt_id = o.id left join tl on tl.obyekt_id = o.id
      left join sg on sg.obyekt_id = o.id left join f3 on f3.obyekt_id = o.id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'obyekt_id', x.id, 'nom', x.nom, 'holat', x.holat, 'loyiha_id', x.loyiha_id, 'loyiha_nom', x.loyiha_nom,
           'shartnoma', case when x.sh_id is not null then jsonb_build_object('id', x.sh_id, 'raqam', x.sh_raqam, 'qqs_bilan', x.sh_qqs,
                              'umumiy', x.sh_obyekt_soni > 1) end,
           'smeta', x.sm, 'fakt', x.fk, 'f2', x.f2,
           'f2_qoralama', jsonb_build_object('qqs_bilan', x.f2q->'qqs_bilan', 'ustamali', x.f2q->'ustamali',
                              'soni', (select count(*) from jsonb_array_elements(v_aktlar) e where (e->>'obyekt_id')::bigint = x.id and e->>'holat' = 'qoralama')),
           'f3', case when x.f3_soni is not null then jsonb_build_object('sotuv', x.f3_sotuv, 'soni', x.f3_soni) end,
           'tolangan', round(x.tolangan, 2),
           'tolangan_foiz', case when x.tolangan is not null and coalesce((x.f2->>'qqs_bilan')::numeric, 0) <> 0
                                 then round(x.tolangan / (x.f2->>'qqs_bilan')::numeric * 100, 1) end,
           'qarz', case when x.tolangan is not null then round(coalesce((x.f2->>'qqs_bilan')::numeric, 0) - x.tolangan, 2) end,
           'marja_foiz', null,
           'bajarilish', jsonb_build_object(
             'fakt', case when coalesce((x.smx->>'ustamasiz')::numeric, 0) <> 0 then round((x.fk->>'ustamasiz')::numeric / (x.smx->>'ustamasiz')::numeric * 100, 1) end,
             'f2', case when coalesce((x.smx->>'ustamasiz')::numeric, 0) <> 0 then round((x.f2->>'ustamasiz')::numeric / (x.smx->>'ustamasiz')::numeric * 100, 1) end,
             'f3', case when x.f3_soni is not null and coalesce((x.smx->>'qqs_bilan')::numeric, 0) <> 0 then round(x.f3_sotuv / (x.smx->>'qqs_bilan')::numeric * 100, 1) end,
             'joriy', x.smx_joriy),
           'signal', jsonb_build_object('soni', coalesce(x.sig_soni, 0), 'kritik', coalesce(x.sig_kritik, 0), 'eng_kop', x.sig_eng))
         order by x.loyiha_nom nulls last, x.nom), '[]'::jsonb)
    into v_obyektlar
    from x;

  -- Tizim ↔ reestr farqi (reestr MANBA EMAS — faqat signal), kompaniya kesimida.
  if p_obyekt_id is null then
    select count(*), sum(r.qqs_bilan) into v_reestr_soni, v_reestr
      from public.t2_f2_reestr_jami r where r.kompaniya_id = p_kompaniya_id and coalesce(r.holat, 'faol') <> 'bekor';
  end if;

  -- §4 Diqqat talab qiladi — pul ta'siri bo'yicha top-10.
  with ob as (
    select (e->>'obyekt_id')::bigint as id, e->>'nom' as nom, e from jsonb_array_elements(v_obyektlar) e
  ), d as (
    -- Fakt > F2: bajarilgan, lekin topshirilmagan ish (olinmagan pul).
    select 'fakt_topshirilmagan'::text as kod, ob.id as obyekt_id, ob.nom,
           round((ob.e->'fakt'->>'qqs_bilan')::numeric - coalesce((ob.e->'f2'->>'qqs_bilan')::numeric, 0), 2) as summa, null::bigint as soni
      from ob where (ob.e->'fakt'->>'qqs_bilan')::numeric - coalesce((ob.e->'f2'->>'qqs_bilan')::numeric, 0) > 1
    union all
    -- F2 > fakt: faktsiz topshirilgan (xavf).
    select 'f2_faktdan_oshgan', ob.id, ob.nom,
           round((ob.e->'f2'->>'qqs_bilan')::numeric - coalesce((ob.e->'fakt'->>'qqs_bilan')::numeric, 0), 2), null
      from ob where (ob.e->'f2'->>'ustamasiz')::numeric - coalesce((ob.e->'fakt'->>'ustamasiz')::numeric, 0) > 1
    union all
    -- Smetadan oshgan hajm (F2 hajmi > smeta hajmi), прямые bahoda.
    select 'smetadan_oshgan', ob.id, ob.nom, round((ob.e->'fakt'->>'smetadan_oshgan')::numeric, 2), (ob.e->'fakt'->>'smetadan_oshgan_soni')::bigint
      from ob where coalesce((ob.e->'fakt'->>'smetadan_oshgan')::numeric, 0) > 0
    union all
    -- Tasdiqlangan F2, lekin F3 chiqarilmagan.
    select 'f3_chiqarilmagan', f.oid, (select ob.nom from ob where ob.id = f.oid), round(sum(f.s), 2), count(*)
      from (select (e->>'obyekt_id')::bigint as oid, (e->>'qqs_bilan')::numeric as s
              from jsonb_array_elements(v_aktlar) e where e->>'holat' = 'tasdiqlangan' and e->>'forma3_id' is null) f
     group by f.oid
    union all
    -- Shartnoma limitiga yaqin (≥ 90%) yoki oshgan — DS kerak bo'lishi mumkin.
    select 'shartnoma_limit', null, s->>'raqam', round((s->>'qqs_bilan')::numeric - (s->>'f2_qqs_bilan')::numeric, 2), null
      from jsonb_array_elements(v_shartnoma) s
     where coalesce((s->>'qqs_bilan')::numeric, 0) > 0 and (s->>'f2_qqs_bilan')::numeric >= 0.9 * (s->>'qqs_bilan')::numeric
    union all
    -- Muddati o'tgan to'lov (60 kundan ortiq to'lanmagan F2).
    select 'tolov_kechikkan', null, null, round((v_deb->'yosh'->>'k60')::numeric, 2), null
     where coalesce((v_deb->'yosh'->>'k60')::numeric, 0) > 0
    union all
    -- Tizim ↔ reestr farqi.
    select 'reestr_farq', null, null, round(abs(v_reestr - coalesce((j_f2->>'qqs_bilan')::numeric, 0)), 2), v_reestr_soni::bigint
     where v_reestr_soni > 0 and abs(v_reestr - coalesce((j_f2->>'qqs_bilan')::numeric, 0)) > 1
    union all
    -- Narxsiz qatorlar (summasi noma'lum — oxirida).
    select 'narxsiz', null, null, null, coalesce((j_sm->>'narxsiz_soni')::bigint, 0) + coalesce((j_f2->>'narxsiz_soni')::bigint, 0)
     where coalesce((j_sm->>'narxsiz_soni')::bigint, 0) + coalesce((j_f2->>'narxsiz_soni')::bigint, 0) > 0
    union all
    -- Sklad manfiy qoldig'i.
    select 'sklad_manfiy', k.obyekt_id, (select ob.nom from ob where ob.id = k.obyekt_id), null, count(*)
      from public.t2_sklad_qoldiq k where k.kompaniya_id = p_kompaniya_id and k.qoldiq < 0 and (p_obyekt_id is null or k.obyekt_id = p_obyekt_id)
     group by k.obyekt_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('kod', t.kod, 'obyekt_id', t.obyekt_id, 'nom', t.nom, 'summa_tasir', t.summa, 'soni', t.soni)
           order by t.summa desc nulls last, t.soni desc nulls last), '[]'::jsonb)
    into v_diqqat
    from (select * from d order by d.summa desc nulls last, d.soni desc nulls last limit 10) t;

  -- §5 Tasdiq kutmoqda: qoralama F2 + yuborilgan zayavkalar (eng eski birinchi).
  select coalesce(jsonb_agg(z.j order by z.qachondan), '[]'::jsonb) into v_tasdiq
    from (
      select (e->>'qachondan')::timestamptz as qachondan,
             jsonb_build_object('tur', 'f2', 'id', (e->>'id')::bigint, 'obyekt_id', (e->>'obyekt_id')::bigint, 'nom', e->>'raqam',
               'bosqich', e->>'bosqich', 'summa', (e->>'qqs_bilan')::numeric, 'qachondan', e->>'qachondan', 'kim', e->>'kim') as j
        from jsonb_array_elements(v_aktlar) e where e->>'holat' = 'qoralama'
      union all
      select r.created_at, jsonb_build_object('tur', 'zayavka', 'id', r.id, 'obyekt_id', r.obyekt_id, 'nom', r.item_text,
               'bosqich', r.status, 'summa', null, 'qachondan', r.created_at, 'kim', r.requested_by)
        from public.t2_erp_taminot r
       where r.kompaniya_id = p_kompaniya_id and r.status = 'submitted' and r.obyekt_id = any(v_ob)
      order by 1 limit 50
    ) z;

  return jsonb_build_object(
    'ok', true, 'generated_at', now(), 'versiya', 1,
    'davr', jsonb_build_object('dan', v_dan, 'gacha', v_gacha),
    'qamrov', jsonb_build_object('kompaniya_id', p_kompaniya_id, 'obyekt_id', p_obyekt_id, 'obyekt_soni', coalesce(array_length(v_ob, 1), 0)),
    'kartalar', jsonb_build_object(
      'portfel', jsonb_build_object('shartnoma_qqs_bilan', round(v_sh_jami, 2), 'shartnoma_soni', v_sh_soni, 'smeta', j_sm),
      'bajarildi', jsonb_build_object('davr', j_f2d, 'jami', j_f2,
        'akt_soni', (select count(*) from jsonb_array_elements(v_aktlar) e where e->>'holat' = 'tasdiqlangan'
                       and (v_dan is null or (e->>'oy')::date >= v_dan) and (v_gacha is null or (e->>'oy')::date <= v_gacha)),
        'foiz_smeta', case when coalesce(v_maxr, 0) <> 0 then round((j_f2->>'qqs_bilan')::numeric / v_maxr * 100, 1) end,
        'foiz_smeta_joriy', v_maxr_joriy,
        'foiz_shartnoma', case when coalesce(v_sh_jami, 0) <> 0 then round((j_f2->>'qqs_bilan')::numeric / v_sh_jami * 100, 1) end,
        'reestr', case when v_reestr_soni > 0 then jsonb_build_object('qqs_bilan', round(v_reestr, 2), 'soni', v_reestr_soni,
                         'farq', round(v_reestr - coalesce((j_f2->>'qqs_bilan')::numeric, 0), 2)) end),
      'tolandi', jsonb_build_object('davr', round(v_tolov_d, 2), 'jami', round(v_tolov, 2), 'yozuv_soni', v_tolov_soni,
        'manbalar_yoq', case when v_tolov_soni = 0 then jsonb_build_array('tolov') else '[]'::jsonb end),
      'debitor', v_deb,
      'kreditor', v_kred,
      'rentabellik', v_rent),
    'fakt', j_fk,
    'f2_qoralama', j_f2q,
    'pul_oqimi', jsonb_build_object('oylar', v_oylar, 'prognoz', v_prog),
    'obyektlar', v_obyektlar,
    'diqqat', v_diqqat,
    'tasdiq_kutmoqda', v_tasdiq,
    'signal_guruh', v_signal,
    'shartnomalar', v_shartnoma);
end $function$;

drop function if exists public.t2_pul_bilan_yopiladi_v1(text, numeric);

commit;
