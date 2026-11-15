-- TEZLIK (egasi: sahifalar 10 s -> 2-3 s). t2_object_financials_v1: pul MANTIG'I O'ZGARMAGAN, faqat ish usuli.
-- Sabab: t2_qator CTE'si har qatorning to'liq `nom` matnini (140k qator) materiallashtirib, temp faylga yozardi (temp written ~6500 blok).
-- Endi `nom` faqat bir marta regex bilan driver_labor (bool) ga aylantiriladi va CTE'larda ko'chirilmaydi. Natija jsonb bayt-baytiga bir xil
-- (38 obyekt, JSON tengligi tekshirilgan; BEGIN..ROLLBACK). Imzo, SECURITY DEFINER, ruxsat tekshiruvlari va grant o'zgarmaydi.
-- Oldingi ta'rif md5(prosrc)=bc3ccc52c6544ccedd425d63086256c0.
begin;

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
    select id,obyekt_id,ota_id,tur,(coalesce(nom,'') ~* 'ЗАТРАТЫ\s+ТРУДА\s+МАШИНИСТ') as driver_labor,hajm,narx,summa,norma,versiya_holat,change_type,qoshimcha,zamena
    from public.t2_qator
    where kompaniya_id=p_kompaniya_id and obyekt_id=any(v_ids)
  ),
  parents as materialized (
    select distinct ota_id from q where ota_id is not null
  ),
  leaves as materialized (
    select q.* from q left join parents ch on ch.ota_id=q.id
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
      case when versiya_holat <> 'faol' or not public.t2_qator_asl_v1(change_type,qoshimcha,zamena) then 0::numeric when driver_labor then coalesce(summa,0) else summa end as smeta_value,
      case when driver_labor and coalesce(direct_count,0)+parent_count>0
        then coalesce(fakt_money,0) else fakt_money end as fakt_value,
      case when driver_labor then coalesce(f2_money,0) else f2_money end as f2_value,
      case
        when versiya_holat <> 'faol' then 0::numeric
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

commit;
