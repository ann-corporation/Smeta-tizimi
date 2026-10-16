-- ИСХОДНИК ДЛЯ ИНТЕГРАТОРА CLAUDE. Не применён в production этой веткой.
-- Только новый read-model; бизнес-данные и существующий RPC не изменяются.
create or replace function public.t2_boss_decision_v1(p_kompaniya_id bigint, p_actor_id bigint)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_base jsonb; v_exec jsonb; v_role text;
begin
  v_role := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id,p_actor_id);
  select jsonb_build_object('ok',true,'generated_at',statement_timestamp(),
    'kompaniya',jsonb_build_object('kompaniya_id',k.id,'nom',k.nom,'rol',v_role,
      'obyekt_soni',(select count(*) from public.t2_obyekt where kompaniya_id=k.id and holat='faol'),
      'loyiha_soni',(select count(*) from public.t2_loyiha where kompaniya_id=k.id and holat='faol')),
    'loyihalar','[]'::jsonb,
    'moliya',(select jsonb_build_object('jami_tolangan',b.jami_tolangan,'jami_debitor',b.jami_debitor,'jami_xarajat',b.jami_xarajat,'sof_natija',null,'ulangan',true) from public.t2_bux_umumiy b where b.kompaniya_id=k.id),
    'f2',jsonb_build_object('jami',null,'soni',0,'tasdiqlangan',0,'qoralama',0,'oxirgi_oy',null),
    'shartnoma',jsonb_build_object('soni',0,'jami_summa',null,'faol',0),
    'signal',jsonb_build_object(
      'ochiq_soni',(select count(*) from public.t2_signal where kompaniya_id=k.id and state='open'),
      'kritik_soni',(select count(*) from public.t2_signal where kompaniya_id=k.id and state='open' and severity in ('high','critical','error')),
      'royxat',coalesce((select jsonb_agg(to_jsonb(g) order by priority,detected_at desc) from (
        select min(id) id,severity,signal_type,min(title) title,entity_type,entity_id,
          max(detected_at) detected_at,min(due_at) due_at,count(*) quantity,
          case severity when 'critical' then 0 when 'high' then 1 when 'error' then 1 when 'medium' then 2 when 'warning' then 2 when 'low' then 3 else 4 end priority
        from public.t2_signal where kompaniya_id=k.id and state='open'
        group by severity,signal_type,entity_type,entity_id
        order by priority,quantity desc,detected_at desc,min(id) limit 25
      ) g),'[]'::jsonb)),
    'storage',jsonb_build_object('ulangan',false),'ulanmagan_modullar','[]'::jsonb)
  into v_base from public.t2_kompaniya k where k.id=p_kompaniya_id;
  if v_base is null then return jsonb_build_object('ok',false,'code','COMPANY_NOT_FOUND'); end if;
  -- PORTFOLIO_QUERY_BEGIN
  with active_objects as materialized (
    select o.id object_id,o.loyiha_id project_id,o.nom name,l.nom project_name,
      case when coalesce(j.qator_soni,0)>0 then j.jami else null end estimate_known,
      case when coalesce(j.qator_soni,0)=0 or j.jami is null then 1 else 0 end estimate_missing,
      coalesce(j.narxsiz,0) unpriced_rows
    from public.t2_obyekt o
    left join public.t2_loyiha l on l.id=o.loyiha_id and l.kompaniya_id=p_kompaniya_id
    left join public.t2_obyekt_jami j on j.id=o.id and j.kompaniya_id=p_kompaniya_id
    where o.kompaniya_id=p_kompaniya_id and o.holat='faol'
  ), acts as (
    select a.obyekt_id,
      count(*) filter(where a.holat in ('tasdiqlangan','yakunlangan') and coalesce(a.lifecycle_status,'approved')='approved') approved_count,
      count(*) filter(where a.holat in ('tasdiqlangan','yakunlangan') and coalesce(a.lifecycle_status,'approved')='approved' and a.hujjat_jami is null) approved_missing,
      sum(a.hujjat_jami) filter(where a.holat in ('tasdiqlangan','yakunlangan') and coalesce(a.lifecycle_status,'approved')='approved') approved_known,
      count(*) filter(where a.holat='qoralama' and coalesce(a.lifecycle_status,'draft')='draft') draft_count,
      count(*) filter(where a.lifecycle_status in ('submitted','checked')) review_count
    from public.t2_akt a join active_objects o on o.object_id=a.obyekt_id
    where a.kompaniya_id=p_kompaniya_id and a.tur='f2' group by a.obyekt_id
  ), changes as (
    select c.obyekt_id,count(*) pending_changes from public.t2_smeta_ozgarish c
    join active_objects o on o.object_id=c.obyekt_id
    where c.kompaniya_id=p_kompaniya_id and c.holat='qoralama' group by c.obyekt_id
  ), objects as materialized (
    select o.*,1::bigint object_count,coalesce(a.approved_count,0) approved_count,
      coalesce(a.approved_missing,0) approved_missing,
      case when coalesce(a.approved_count,0)=0 then 0 else a.approved_known end approved_known,
      coalesce(a.draft_count,0) draft_count,coalesce(a.review_count,0) review_count,
      coalesce(c.pending_changes,0) pending_changes
    from active_objects o left join acts a on a.obyekt_id=o.object_id left join changes c on c.obyekt_id=o.object_id
  ), project_keys as (
    select l.id project_id,l.nom name from public.t2_loyiha l where l.kompaniya_id=p_kompaniya_id and l.holat='faol'
    union select o.project_id,coalesce(o.project_name,'Без проекта') from objects o
  ), projects as (
    select k.project_id,k.name,count(o.object_id) object_count,sum(o.estimate_known) estimate_known,
      coalesce(sum(o.estimate_missing),0) estimate_missing,coalesce(sum(o.unpriced_rows),0) unpriced_rows,
      case when coalesce(sum(o.approved_count),0)=0 then 0 else sum(o.approved_known) end approved_known,
      coalesce(sum(o.approved_count),0) approved_count,coalesce(sum(o.approved_missing),0) approved_missing,
      coalesce(sum(o.draft_count),0) draft_count,coalesce(sum(o.review_count),0) review_count,
      coalesce(sum(o.pending_changes),0) pending_changes
    from project_keys k left join objects o on o.project_id is not distinct from k.project_id group by k.project_id,k.name
  ), totals as (
    select count(*) object_count,sum(estimate_known) estimate_known,coalesce(sum(estimate_missing),0) estimate_missing,
      coalesce(sum(unpriced_rows),0) unpriced_rows,
      case when coalesce(sum(approved_count),0)=0 then 0 else sum(approved_known) end approved_known,
      coalesce(sum(approved_count),0) approved_count,coalesce(sum(approved_missing),0) approved_missing,
      coalesce(sum(draft_count),0) draft_count,coalesce(sum(review_count),0) review_count,coalesce(sum(pending_changes),0) pending_changes from objects
  ) select jsonb_build_object(
    'version',1,'scope','active_objects','totals',(select to_jsonb(t) from totals t),
    'objects',coalesce((select jsonb_agg(to_jsonb(o) order by o.name,o.object_id) from (select * from objects order by name,object_id limit 2500) o),'[]'::jsonb),
    'projects',coalesce((select jsonb_agg(to_jsonb(p) order by p.name,p.project_id) from (select * from projects order by name,project_id limit 500) p),'[]'::jsonb),
    'project_count',(select count(*) from projects),'project_limit',500,'object_limit',2500,
    'contracts_missing',(select count(*) from public.t2_shartnoma where kompaniya_id=p_kompaniya_id and holat='faol' and jami_nds_bilan is null),
    'payment_count',(select count(*) from public.t2_tolov where kompaniya_id=p_kompaniya_id and holat<>'bekor'),
    'expense_count',(select count(*) from public.t2_xarajat where kompaniya_id=p_kompaniya_id and holat<>'bekor'))
  into v_exec;
  -- PORTFOLIO_QUERY_END
  return v_base || jsonb_build_object('executive',v_exec);
end $$;
revoke all on function public.t2_boss_decision_v1(bigint,bigint) from public,anon,authenticated;
grant execute on function public.t2_boss_decision_v1(bigint,bigint) to service_role;
comment on function public.t2_boss_decision_v1(bigint,bigint) is 'Company scoped executive snapshot: active objects; approved F2 document amounts, drafts and facts separated. Source only until integrator migration.';
