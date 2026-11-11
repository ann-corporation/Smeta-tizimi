-- Rehearsal + acceptance in ONE transaction (psql, run from supabase/migrations): old packet captured -> migration applied -> asserted -> ROLLBACK.
-- No business writer; nothing is committed. Objects 151, 152, 153 (largest). Actor: first active platform superadmin.
-- Without psql: run the three parts (capture DO block, migration file text, assert DO block) in that order inside one begin..rollback.
begin;

-- 1) Capture the CURRENT (pre-migration) packets.
create temp table _paket_eski on commit drop as
select o as obyekt_id, public.t2_obyekt_paket_v1(o, (select f.id from public.t2_foydalanuvchi f
         where f.holat='faol' and public.t2_platforma_superadmin(f.id) order by f.id limit 1))::jsonb as p
  from unnest(array[151,152,153]::bigint[]) o;
do $$ begin
  if exists (select 1 from _paket_eski where p->'h' ? 'f2_narx') then raise exception 'migration already applied: rehearsal needs the pre-migration definition'; end if;
  if (select count(*) from _paket_eski) <> 3 then raise exception 'old packets missing'; end if;
end $$;

-- 2) Apply the migration.
\ir 20261211200000_t2_obyekt_paket_f2_narx_v1.sql

-- 3) Assert.
do $$
declare v_actor bigint; v_o bigint; v_old jsonb; v_new jsonb; v_n integer; v_exp jsonb;
begin
  if has_function_privilege('anon','public.t2_obyekt_paket_v1(bigint,bigint)','execute')
     or has_function_privilege('authenticated','public.t2_obyekt_paket_v1(bigint,bigint)','execute')
     or not has_function_privilege('service_role','public.t2_obyekt_paket_v1(bigint,bigint)','execute') then
    raise exception 'Package grants';
  end if;
  if exists(select 1 from pg_proc where oid='public.t2_obyekt_paket_v1(bigint,bigint)'::regprocedure
    and (provolatile<>'s' or not prosecdef)) then raise exception 'Package stable/definer'; end if;
  select f.id into v_actor from public.t2_foydalanuvchi f
    where f.holat='faol' and public.t2_platforma_superadmin(f.id) order by f.id limit 1;
  if v_actor is null then raise exception 'Acceptance actor missing (not skipped)'; end if;
  for v_o in select obyekt_id from _paket_eski order by 1 loop
    select p into v_old from _paket_eski where obyekt_id = v_o;
    v_new := public.t2_obyekt_paket_v1(v_o, v_actor)::jsonb;
    v_n := (v_new->>'soni')::integer;
    -- old fields byte-identical (jsonb equality) once the new keys are removed
    if (v_new #- '{q,raqam}' #- '{h,f2_narx}' #- '{h,smeta_hajm}') is distinct from v_old then
      raise exception 'Old fields changed, object %', v_o;
    end if;
    -- f2_narx: parallel array, == t2_qator_holat.f2_narx in packet order (NULL stays NULL)
    if jsonb_typeof(v_new->'h'->'f2_narx') <> 'array' or jsonb_array_length(v_new->'h'->'f2_narx') <> v_n then
      raise exception 'f2_narx length, object %', v_o;
    end if;
    select coalesce(jsonb_agg(h.f2_narx order by q.tartib, q.id), '[]'::jsonb) into v_exp
      from public.t2_qator q join public.t2_qator_holat h on h.id = q.id and h.obyekt_id = v_o
     where q.obyekt_id = v_o and q.versiya_holat = 'faol';
    if v_new->'h'->'f2_narx' is distinct from v_exp then raise exception 'f2_narx parity, object %', v_o; end if;
    -- raqam: sparse {id: text} == t2_qator.raqam where not null (empty object when none)
    select coalesce(jsonb_object_agg(q.id::text, q.raqam) filter (where q.raqam is not null), '{}'::jsonb) into v_exp
      from public.t2_qator q where q.obyekt_id = v_o and q.versiya_holat = 'faol';
    if v_new->'q'->'raqam' is distinct from v_exp then raise exception 'raqam parity, object %', v_o; end if;
    if (select count(*) from jsonb_object_keys(v_new->'q'->'raqam')) > v_n then raise exception 'raqam longer than rows, object %', v_o; end if;
    -- smeta_hajm: sparse {id: view smeta_hajm} only where it differs from t2_qator.hajm (zamena plan quantity)
    select coalesce(jsonb_object_agg(q.id::text, h.smeta_hajm) filter (where h.smeta_hajm is distinct from q.hajm), '{}'::jsonb) into v_exp
      from public.t2_qator q join public.t2_qator_holat h on h.id = q.id and h.obyekt_id = v_o
     where q.obyekt_id = v_o and q.versiya_holat = 'faol';
    if v_new->'h'->'smeta_hajm' is distinct from v_exp then raise exception 'smeta_hajm parity, object %', v_o; end if;
    raise notice 'object %: % rows OK', v_o, v_n;
  end loop;
end $$;
rollback;