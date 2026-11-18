-- Qabul sinovi: FAQAT ROLLBACK ichida (rb_run). Jadvalga yozadi (sinov qatori), oxirida raise notice 'ACC OK'.
do $$
declare
  v_a bigint := 183; v_k bigint := 123; v_o bigint := 162;
  v_task jsonb; v_r jsonb; v_bad jsonb;
begin
  v_task := jsonb_build_object('id','acc-task-1','goal','sinov','scope',jsonb_build_object('actorId',v_a,'companyId',v_k,'objectId',v_o),
    'revision',0,'cancelled',false,'steps',jsonb_build_array(
      jsonb_build_object('id','object.summary','tool','object.summary','input',jsonb_build_object('objectId',v_o),'operationId','acc-op-1','write',false,'expectedVersion',null,'state','queued','evidence',null),
      jsonb_build_object('id','object.discrepancies','tool','object.discrepancies','input',jsonb_build_object('objectId',v_o),'operationId','acc-op-2','write',false,'expectedVersion',null,'state','queued','evidence',null)));
  v_r := public.t2_jarvis_vazifa_saqla_v1(v_a,v_k,v_o,'acc-task-1',-1,v_task);
  if (v_r->>'ok')::boolean is not true then raise exception 'ACC: create %', v_r; end if;
  v_r := public.t2_jarvis_vazifa_saqla_v1(v_a,v_k,v_o,'acc-task-1',-1,v_task);   -- idempotent qayta yuborish
  if (v_r->>'ok')::boolean is not true then raise exception 'ACC: idempotent create %', v_r; end if;
  v_r := public.t2_jarvis_vazifa_ol_v1(v_a,v_k,v_o,'acc-task-1');
  if (v_r->>'ok')::boolean is not true or v_r->'task' <> v_task then raise exception 'ACC: ol %', v_r; end if;
  if jsonb_array_length(public.t2_jarvis_vazifa_royxat_v1(v_a,v_k,v_o)->'tasks') <> 1 then raise exception 'ACC: royxat'; end if;
  -- eskirgan revision
  v_r := public.t2_jarvis_vazifa_saqla_v1(v_a,v_k,v_o,'acc-task-1',5,jsonb_set(v_task,'{revision}','6'));
  if v_r->>'code' is distinct from 'REVISION_CONFLICT' then raise exception 'ACC: stale %', v_r; end if;
  -- yozuvchi qadam rad etiladi
  v_bad := jsonb_set(jsonb_set(v_task,'{revision}','1'),'{steps,0,write}','true');
  v_r := public.t2_jarvis_vazifa_saqla_v1(v_a,v_k,v_o,'acc-task-1',0,v_bad);
  if v_r->>'code' is distinct from 'TASK_WRITE_FORBIDDEN' then raise exception 'ACC: write %', v_r; end if;
  -- boshqa obyekt scope'i rad etiladi
  v_r := public.t2_jarvis_vazifa_ol_v1(v_a,v_k,v_o+1000000,'acc-task-1');
  if (v_r->>'ok')::boolean is not false then raise exception 'ACC: scope %', v_r; end if;
  raise notice 'ACC OK';
end $$;