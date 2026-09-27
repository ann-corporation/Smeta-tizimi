-- Source-only behavioral acceptance. Run in a disposable transaction.
begin;
do $$
declare
  v_suffix text := replace(gen_random_uuid()::text,'-','');
  v_user bigint;
  v_company bigint;
  v_other_company bigint;
  v_run jsonb;
  v_denied jsonb;
  v_approved jsonb;
  v_stale jsonb;
  v_tool jsonb;
  v_op uuid := gen_random_uuid();
  v_run_id bigint;
  v_run_again jsonb;
  v_running jsonb;
begin
  insert into public.t2_foydalanuvchi(login,holat) values ('_agent_acc_'||v_suffix,'faol') returning id into v_user;
  insert into public.t2_kompaniya(nom,kod,faol) values ('_AGENT_ACC_'||v_suffix,'_AGENT_'||left(v_suffix,8),true) returning id into v_company;
  insert into public.t2_kompaniya(nom,kod,faol) values ('_AGENT_OTHER_'||v_suffix,'_AGENT_O_'||left(v_suffix,7),true) returning id into v_other_company;
  insert into public.t2_azolik(foydalanuvchi_id,kompaniya_id,rol,holat) values (v_user,v_company,'boss','faol');

  v_run := public.t2_agent_run_start_v1(v_user,'pto_smeta','f2.draft.prepare',v_company,null,null,v_op,jsonb_build_object('source','acceptance'),true);
  if (v_run->>'ok')::boolean is not true or v_run->>'holat' <> 'approval_required' then raise exception 'FAIL run reserve: %',v_run; end if;
  v_run_id := (v_run->>'run_id')::bigint;
  v_run_again := public.t2_agent_run_start_v1(v_user,'pto_smeta','f2.draft.prepare',v_company,null,null,v_op,jsonb_build_object('source','retry'),true);
  if (v_run_again->>'ok')::boolean is not true or (v_run_again->>'run_id')::bigint <> v_run_id then
    raise exception 'FAIL operation idempotency: %',v_run_again;
  end if;
  v_denied := public.t2_agent_run_start_v1(v_user,'pto_smeta','not.allowed',v_company,null,null,gen_random_uuid(),'{}'::jsonb,false);
  if v_denied->>'code' <> 'COMMAND_NOT_ALLOWED' then raise exception 'FAIL command allowlist: %',v_denied; end if;
  v_approved := public.t2_agent_approval_decide_v1(v_user,v_run_id,'approve','acceptance', (v_run->>'versiya')::int,gen_random_uuid());
  if v_approved->>'holat' <> 'queued' then raise exception 'FAIL approval: %',v_approved; end if;
  v_running := public.t2_agent_run_transition_v1(v_user,v_run_id,'running', (v_approved->>'versiya')::int,gen_random_uuid());
  if (v_running->>'ok')::boolean is not true or v_running->>'holat' <> 'running' then raise exception 'FAIL transition after approval: %',v_running; end if;
  v_stale := public.t2_agent_run_transition_v1(v_user,v_run_id,'applying', (v_run->>'versiya')::int,gen_random_uuid());
  if v_stale->>'code' <> 'STALE_VERSION' then raise exception 'FAIL optimistic lock: %',v_stale; end if;
  v_tool := public.t2_agent_tool_call_prepare_v1(v_user,v_run_id,'f2.read','{}'::jsonb,gen_random_uuid(),null);
  if (v_tool->>'ok')::boolean is not true then raise exception 'FAIL allowlisted tool: %',v_tool; end if;
  v_tool := public.t2_agent_tool_call_prepare_v1(v_user,v_run_id,'arbitrary.sql','{}'::jsonb,gen_random_uuid(),null);
  if v_tool->>'code' <> 'TOOL_NOT_ALLOWED' then raise exception 'FAIL tool deny: %',v_tool; end if;
  v_run := public.t2_agent_run_start_v1(v_user,'pto_smeta','f2.draft.prepare',v_company,null,null,gen_random_uuid(),null,true);
  if (v_run->>'ok')::boolean is not true then raise exception 'FAIL second run: %',v_run; end if;
  v_denied := public.t2_agent_run_start_v1(v_user,'pto_smeta','f2.draft.prepare',v_other_company,null,null,gen_random_uuid(),'{}'::jsonb,true);
  if v_denied->>'code' <> 'COMPANY_ACCESS_DENIED' then raise exception 'FAIL cross-company access was accepted: %',v_denied; end if;
end $$;
rollback;

select 'PASS' as status, 't2_agent_control_plane_v1 behavioral acceptance rolled back' as note;
