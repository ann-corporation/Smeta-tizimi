-- T2-AGENT-ISHCHI-SIFAT-001 — birinchi ishchi agent: Sifat/Topshirish (quality_handover).
-- Egasi Q11: AI ishchilar tizimning yuzi. Agent faqat O'QIYDI va tahlil qiladi; biznes
-- ma'lumotiga yozmaydi. Natija run.result ga yoziladi va run 'waiting_review' ga o'tadi —
-- rahbar ko'rib chiqadi (inson nazorati). Buyruq: quality.handover.prepare (profilda ruxsat).
-- Faqat ADDITIV.

begin;

create or replace function public.t2_agent_ishchi_sifat_v1(
  p_actor_id bigint, p_run_id bigint, p_expected_version integer, p_operation_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_prev jsonb; v_run public.t2_agent_run%rowtype; v_guard jsonb; v_natija jsonb; v_res jsonb;
  v_yashirin jsonb; v_yashirin_soni int; v_aktli int; v_jami_yashirin int;
  v_mos_emas jsonb; v_kutilmoqda int; v_aktlar int; v_xulosa text;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_agent_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  select * into v_run from public.t2_agent_run where id = p_run_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'RUN_NOT_FOUND'); end if;
  if v_run.agent_kod <> 'quality_handover' or v_run.command_kod <> 'quality.handover.prepare' then
    return jsonb_build_object('ok', false, 'code', 'WORKER_MISMATCH');
  end if;
  if v_run.obyekt_id is null then return jsonb_build_object('ok', false, 'code', 'OBJECT_SCOPE_REQUIRED'); end if;
  v_guard := public.t2_agent_scope_guard_v1(p_actor_id, v_run.kompaniya_id, v_run.loyiha_id, v_run.obyekt_id);
  if coalesce((v_guard->>'ok')::boolean, false) is not true then return v_guard; end if;
  if p_expected_version is null or p_expected_version <> v_run.versiya then
    return jsonb_build_object('ok', false, 'code', 'STALE_VERSION', 'versiya', v_run.versiya);
  end if;
  if v_run.holat <> 'queued' then
    return jsonb_build_object('ok', false, 'code', 'RUN_NOT_QUEUED', 'holat', v_run.holat);
  end if;

  -- Tahlil (faqat o'qish)
  select count(*) filter (where yashirin), count(*) filter (where yashirin and akt_bor),
         coalesce(jsonb_agg(jsonb_build_object('qator_id', qator_id, 'nom', nom, 'kod', kod, 'fakt_hajm', fakt_hajm, 'birlik', birlik)
                   order by fakt_hajm desc) filter (where yashirin and not akt_bor), '[]'::jsonb)
    into v_jami_yashirin, v_aktli, v_yashirin
  from public.t2_aosr_coverage where obyekt_id = v_run.obyekt_id;
  v_yashirin_soni := jsonb_array_length(v_yashirin);
  select count(*) into v_aktlar from public.t2_aosr where obyekt_id = v_run.obyekt_id and holat <> 'bekor';
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'raqam', raqam, 'sana', sana, 'laboratoriya', laboratoriya,
                   'sinov_turi', sinov_turi, 'konstruksiya', konstruksiya, 'marka', marka)), '[]'::jsonb)
    into v_mos_emas from public.t2_lab_protokol_reestr where obyekt_id = v_run.obyekt_id and holat = 'faol' and natija = 'mos_emas';
  select count(*) into v_kutilmoqda from public.t2_lab_protokol where obyekt_id = v_run.obyekt_id and holat = 'faol' and natija = 'kutilmoqda';

  v_xulosa := case
    when v_yashirin_soni = 0 and jsonb_array_length(v_mos_emas) = 0 and v_kutilmoqda = 0
      then 'Yashirin ishlar АОСР bilan qoplangan, laboratoriya protokollarida muammo yo''q — topshirishga to''siq topilmadi.'
    else concat_ws(' ',
      case when v_yashirin_soni > 0 then v_yashirin_soni || ' ta yashirin ish АОСР siz.' end,
      case when jsonb_array_length(v_mos_emas) > 0 then jsonb_array_length(v_mos_emas) || ' ta protokol «mos emas».' end,
      case when v_kutilmoqda > 0 then v_kutilmoqda || ' ta protokol natijasi kutilmoqda.' end,
      'F2 bloklanmaydi (egasi qarori) — bu ogohlantirish.')
  end;
  v_natija := jsonb_build_object(
    'agent', 'quality_handover', 'turi', 'sifat_topshirish_tahlili', 'vaqt', now(),
    'yashirin_jami', v_jami_yashirin, 'yashirin_aktli', v_aktli, 'yashirin_aktsiz', v_yashirin,
    'aosr_soni', v_aktlar, 'protokol_mos_emas', v_mos_emas, 'protokol_kutilmoqda', v_kutilmoqda,
    'xulosa', v_xulosa);

  update public.t2_agent_run set holat = 'waiting_review', result = v_natija, versiya = versiya + 1,
    started_at = coalesce(started_at, now()), updated_at = now() where id = p_run_id;
  perform public.t2_audit_yoz(v_run.kompaniya_id, 'agent_worker_run', 'agent_control', v_run.obyekt_id,
    format('run=%s worker=quality_handover yashirin_aktsiz=%s mos_emas=%s', p_run_id, v_yashirin_soni, jsonb_array_length(v_mos_emas)),
    'actor:' || p_actor_id, null);
  v_res := jsonb_build_object('ok', true, 'run_id', p_run_id, 'holat', 'waiting_review', 'versiya', v_run.versiya + 1, 'result', v_natija);
  insert into public.t2_agent_command_log(operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'agent_worker_sifat', v_res);
  return v_res;
end $$;

revoke all on function public.t2_agent_ishchi_sifat_v1(bigint, bigint, integer, uuid) from public, anon, authenticated;
grant execute on function public.t2_agent_ishchi_sifat_v1(bigint, bigint, integer, uuid) to service_role;

commit;
