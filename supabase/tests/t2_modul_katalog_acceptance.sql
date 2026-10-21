-- Run after the forward migration INSIDE a transaction; always force rollback.
do $test$
declare v_actor bigint; v_company bigint; j jsonb; first_result jsonb; op uuid := gen_random_uuid();
begin
  select id into v_actor from public.t2_foydalanuvchi where holat='faol' and public.t2_platforma_superadmin(id) order by id limit 1;
  select id into v_company from public.t2_kompaniya where faol order by id limit 1;
  if v_actor is null or v_company is null then raise exception 'MODULE_TEST_CONTEXT_MISSING'; end if;
  j := public.t2_modul_holat_v1(v_company,v_actor);
  if j->>'ok' <> 'true' or jsonb_array_length(j->'modullar') <> 4 then raise exception 'MODULE_READ_FAILED'; end if;
  if has_function_privilege('anon','public.t2_modul_holat_v1(bigint,bigint)','execute') or has_function_privilege('authenticated','public.t2_modul_holat_v1(bigint,bigint)','execute') then raise exception 'MODULE_GRANT_TOO_WIDE'; end if;
  first_result := public.t2_capability_override_set_v1(v_actor,'module.erp','company',v_company,'off','SYNTHETIC ROLLBACK TEST',0,op);
  if first_result->>'ok' <> 'true' or first_result#>>'{effective,holat}' <> 'off' then raise exception 'MODULE_OFF_FAILED %',first_result; end if;
  if public.t2_capability_override_set_v1(v_actor,'module.erp','company',v_company,'off','SYNTHETIC ROLLBACK TEST',0,op) <> first_result then raise exception 'MODULE_IDEMPOTENCY_FAILED'; end if;
  j := public.t2_capability_override_set_v1(v_actor,'module.erp','company',v_company,'on','SYNTHETIC ROLLBACK TEST',0,gen_random_uuid());
  if j->>'code' <> 'STALE_VERSION' then raise exception 'MODULE_STALE_NOT_REJECTED'; end if;
  j := public.t2_modul_holat_v1(v_company,v_actor);
  if not exists(select 1 from jsonb_array_elements(j->'modullar') m where m->>'kod'='module.erp' and m->>'holat'='off' and m->>'manba'='company') then raise exception 'MODULE_EFFECTIVE_READ_FAILED'; end if;
  begin
    perform public.t2_modul_holat_v1(v_company,9223372036854775806);
    raise exception 'MODULE_UNAUTHORIZED_ALLOWED';
  exception when insufficient_privilege then null; end;
  raise exception 'MODULE_ACCEPTANCE_PASS: 4 modules, source/effective read, company off, idempotency, stale version, unauthorized and ACL checks; forced rollback';
end $test$;
