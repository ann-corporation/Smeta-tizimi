-- T2-AGENT-ISHCHI-NARX-AUDIT-001 — ikkinchi ishchi agent: Narx auditori (PTO/Smeta).
-- Egasi Q5/Q11: НАПУ himoyasida har narx dalil bilan tasdiqlanishi kerak; AI ishchilar tizim yuzi.
-- Agent faqat O'QIYDI: smeta resurslari narxi, dalillar (t2_narx_dalil_holat), aniq takliflar
-- (t2_narx_taklif) → hisobot run.result da, run 'waiting_review' (rahbar ko'rib chiqadi).
-- Buyruq 'price.evidence.audit' pto_smeta profiliga qo'shiladi. Faqat ADDITIV.

begin;

update public.t2_agent_profile
   set allowed_commands = allowed_commands || '["price.evidence.audit"]'::jsonb,
       allowed_tools = case when allowed_tools ? 'price.read' then allowed_tools else allowed_tools || '["price.read"]'::jsonb end,
       versiya = versiya + 1, updated_at = now()
 where kod = 'pto_smeta' and not (allowed_commands ? 'price.evidence.audit');

create or replace function public.t2_agent_ishchi_narx_audit_v1(
  p_actor_id bigint, p_run_id bigint, p_expected_version integer, p_operation_id uuid, p_ogish_foiz numeric default 10)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
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
end $$;

revoke all on function public.t2_agent_ishchi_narx_audit_v1(bigint, bigint, integer, uuid, numeric) from public, anon, authenticated;
grant execute on function public.t2_agent_ishchi_narx_audit_v1(bigint, bigint, integer, uuid, numeric) to service_role;

commit;
