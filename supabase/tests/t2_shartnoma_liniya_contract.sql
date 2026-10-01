-- Run only on a disposable Supabase branch or isolated tenant.
-- Every write is inside a transaction that ends with ROLLBACK.

begin;

do $$
begin
  if to_regprocedure('public.t2_shartnoma_liniya_v1(bigint,bigint)') is null then
    raise exception 'missing t2_shartnoma_liniya_v1';
  end if;
  if to_regprocedure('public.t2_shartnoma_saqla_v2(bigint,bigint,bigint,integer,jsonb,jsonb,jsonb,uuid)') is null then
    raise exception 'missing t2_shartnoma_saqla_v2';
  end if;
  if has_function_privilege('anon', 'public.t2_shartnoma_liniya_v1(bigint,bigint)', 'execute') then
    raise exception 'anon must not execute t2_shartnoma_liniya_v1';
  end if;
  if has_function_privilege('authenticated', 'public.t2_shartnoma_liniya_v1(bigint,bigint)', 'execute') then
    raise exception 'authenticated must not execute t2_shartnoma_liniya_v1';
  end if;
  if not has_function_privilege('service_role', 'public.t2_shartnoma_liniya_v1(bigint,bigint)', 'execute') then
    raise exception 'service_role must execute t2_shartnoma_liniya_v1';
  end if;
  if has_function_privilege('anon', 'public.t2_shartnoma_saqla_v2(bigint,bigint,bigint,integer,jsonb,jsonb,jsonb,uuid)', 'execute') then
    raise exception 'anon must not execute t2_shartnoma_saqla_v2';
  end if;
  if has_function_privilege('authenticated', 'public.t2_shartnoma_saqla_v2(bigint,bigint,bigint,integer,jsonb,jsonb,jsonb,uuid)', 'execute') then
    raise exception 'authenticated must not execute t2_shartnoma_saqla_v2';
  end if;
  if not has_function_privilege('service_role', 'public.t2_shartnoma_saqla_v2(bigint,bigint,bigint,integer,jsonb,jsonb,jsonb,uuid)', 'execute') then
    raise exception 'service_role must execute t2_shartnoma_saqla_v2';
  end if;
  if not exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 't2_shartnoma_liniya_v1'
       and p.proargtypes = array['int8'::regtype, 'int8'::regtype]::oidvector
       and p.provolatile = 's'
  ) then
    raise exception 't2_shartnoma_liniya_v1 must be stable';
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_class c
    where c.oid = to_regclass('public.t2_shartnoma_tomon')
      and c.relrowsecurity
  ) then
    raise exception 't2_shartnoma_tomon missing or RLS disabled';
  end if;
  if not exists (
    select 1 from pg_class c
    where c.oid = to_regclass('public.t2_shartnoma_qoshimcha_bog')
      and c.relrowsecurity
  ) then
    raise exception 't2_shartnoma_qoshimcha_bog missing or RLS disabled';
  end if;
  if not exists (
    select 1 from pg_trigger
     where tgname = 't2_shartnoma_bog_izchil'
       and tgrelid = to_regclass('public.t2_shartnoma_bog')
       and not tgisinternal
  ) then
    raise exception 'missing t2_shartnoma_bog_izchil trigger';
  end if;
  if not exists (
    select 1 from pg_trigger
     where tgname = 't2_shartnoma_qbog_izchil'
       and tgrelid = to_regclass('public.t2_shartnoma_qoshimcha_bog')
       and not tgisinternal
  ) then
    raise exception 'missing t2_shartnoma_qbog_izchil trigger';
  end if;
end;
$$;

do $$
declare
  v_kompaniya_id bigint;
  v_actor_id bigint;
  v_loyiha_id bigint;
  v_o1 bigint;
  v_o2 bigint;
  v_a jsonb;
  v_c jsonb;
  v_dup jsonb;
  v_stale jsonb;
  v_raqam_a text := 'TEST-LINIYA-' || gen_random_uuid();
  v_raqam_b text := 'TEST-LINIYA-' || gen_random_uuid();
  v_raqam_lab text := 'TEST-LINIYA-' || gen_random_uuid();
  v_operation_a uuid := gen_random_uuid();
  v_operation_b uuid := gen_random_uuid();
  v_operation_lab uuid := gen_random_uuid();
  v_operation_dup uuid := gen_random_uuid();
  v_operation_stale uuid := gen_random_uuid();
  v_caught boolean := false;
begin
  select a.kompaniya_id, a.foydalanuvchi_id, l.id
    into v_kompaniya_id, v_actor_id, v_loyiha_id
    from public.t2_azolik a
    join public.t2_kompaniya k on k.id = a.kompaniya_id and k.faol
    join public.t2_loyiha l on l.kompaniya_id = a.kompaniya_id and l.holat <> 'bekor'
   where a.holat = 'faol'
     and a.rol in ('admin', 'superadmin')
   order by a.kompaniya_id, l.id
   limit 1;

  if v_kompaniya_id is null then
    raise notice 't2_shartnoma_liniya contract behavior skipped: no active admin/superadmin company with a project';
    return;
  end if;

  insert into public.t2_obyekt(nom, tur, kompaniya_id, loyiha_id)
  values ('TEST-LINIYA-O1', 'obyekt', v_kompaniya_id, null)
  returning id into v_o1;
  insert into public.t2_obyekt(nom, tur, kompaniya_id, loyiha_id)
  values ('TEST-LINIYA-O2', 'obyekt', v_kompaniya_id, null)
  returning id into v_o2;

  v_a := public.t2_shartnoma_saqla_v2(
    v_actor_id, v_kompaniya_id, null, null,
    jsonb_build_object('raqam', v_raqam_a, 'nom', 'TEST-LINIYA-A', 'loyiha_id', v_loyiha_id, 'asosiy', true),
    '[{"rol":"Buyurtmachi","nom":"X"}]'::jsonb,
    jsonb_build_array(v_o1), v_operation_a
  );
  if coalesce((v_a->>'ok')::boolean, false) is not true then
    raise exception 'main contract A was not saved: %', v_a;
  end if;

  if public.t2_shartnoma_saqla_v2(
    v_actor_id, v_kompaniya_id, null, null,
    jsonb_build_object('raqam', v_raqam_a, 'nom', 'TEST-LINIYA-A', 'loyiha_id', v_loyiha_id, 'asosiy', true),
    '[{"rol":"Buyurtmachi","nom":"X"}]'::jsonb,
    jsonb_build_array(v_o1), v_operation_a
  ) is distinct from v_a then
    raise exception 'same operation_id did not return an identical result';
  end if;

  begin
    perform public.t2_shartnoma_saqla_v2(
      v_actor_id, v_kompaniya_id, null, null,
      jsonb_build_object('raqam', v_raqam_b, 'nom', 'TEST-LINIYA-B', 'loyiha_id', v_loyiha_id, 'asosiy', true),
      '[{"rol":"Buyurtmachi","nom":"X"}]'::jsonb,
      jsonb_build_array(v_o1), v_operation_b
    );
    raise exception 'second main contract accepted the already-bound object';
  exception when others then
    v_caught := position('OBYEKT_BOSHQA_ASOSIY' in sqlerrm) > 0;
    if not v_caught then
      raise exception 'unexpected second-main-contract error: %', sqlerrm;
    end if;
  end;

  v_c := public.t2_shartnoma_saqla_v2(
    v_actor_id, v_kompaniya_id, null, null,
    jsonb_build_object('raqam', v_raqam_lab, 'nom', 'TEST-LINIYA-LAB', 'loyiha_id', v_loyiha_id, 'asosiy', false, 'turi', 'Laboratoriya'),
    '[{"rol":"Buyurtmachi","nom":"X"}]'::jsonb,
    jsonb_build_array(v_o1), v_operation_lab
  );
  if coalesce((v_c->>'ok')::boolean, false) is not true then
    raise exception 'additional laboratory contract was not saved: %', v_c;
  end if;

  v_dup := public.t2_shartnoma_saqla_v2(
    v_actor_id, v_kompaniya_id, null, null,
    jsonb_build_object('raqam', v_raqam_a, 'nom', 'TEST-LINIYA-DUP', 'loyiha_id', v_loyiha_id, 'asosiy', true),
    '[{"rol":"Buyurtmachi","nom":"X"}]'::jsonb,
    jsonb_build_array(v_o2), v_operation_dup
  );
  if (v_dup->>'ok')::boolean is distinct from false or v_dup->>'code' <> 'RAQAM_BAND' then
    raise exception 'duplicate raqam was not rejected with RAQAM_BAND: %', v_dup;
  end if;

  v_stale := public.t2_shartnoma_saqla_v2(
    v_actor_id, v_kompaniya_id, (v_a->>'id')::bigint, 0,
    jsonb_build_object('raqam', v_raqam_a, 'nom', 'TEST-LINIYA-A-EDIT', 'loyiha_id', v_loyiha_id, 'asosiy', true),
    '[{"rol":"Buyurtmachi","nom":"X"}]'::jsonb,
    jsonb_build_array(v_o1), v_operation_stale
  );
  if (v_stale->>'ok') is distinct from 'false' or v_stale->>'code' is distinct from 'STALE_VERSION' then
    raise exception 'wrong expected version was not rejected with STALE_VERSION: %', v_stale;
  end if;
end;
$$;

rollback;
