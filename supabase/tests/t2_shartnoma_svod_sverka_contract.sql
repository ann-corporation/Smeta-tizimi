-- Kontrakt: 20261106820000_t2_shartnoma_svod_sverka_v1 (nakopitelniy shartnoma svodi: DS, F3 sotuvdan, to'lov).
-- Faqat izolyatsiyalangan tenantda; hamma yozuv tranzaksiya ichida, oxirida ROLLBACK. Sun'iy ma'lumot (real loyiha raqamlari emas).
begin;

do $$
declare f text;
begin
  foreach f in array array['public.t2_shartnoma_svod_v1(bigint,bigint)', 'public.t2_sverka_yozuv_v1(bigint,bigint,bigint,text,bigint,integer,jsonb,uuid)'] loop
    if to_regprocedure(f) is null then raise exception 'missing %', f; end if;
    if has_function_privilege('anon', f, 'execute') then raise exception 'anon must not execute %', f; end if;
    if has_function_privilege('authenticated', f, 'execute') then raise exception 'authenticated must not execute %', f; end if;
    if not has_function_privilege('service_role', f, 'execute') then raise exception 'service_role must execute %', f; end if;
  end loop;
  if (select provolatile from pg_proc where oid = 'public.t2_shartnoma_svod_v1(bigint,bigint)'::regprocedure) <> 's' then
    raise exception 't2_shartnoma_svod_v1 must be stable (GET /api/sb)';
  end if;
  if not exists (select 1 from pg_class c where c.oid = to_regclass('public.t2_shartnoma_ds') and c.relrowsecurity) then raise exception 't2_shartnoma_ds missing or RLS disabled'; end if;
  if has_table_privilege('anon', 'public.t2_shartnoma_ds', 'select') or has_table_privilege('authenticated', 'public.t2_shartnoma_ds', 'select') then
    raise exception 't2_shartnoma_ds must not be readable by anon/authenticated';
  end if;
  if (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 't2_forma3'
       and column_name in ('manba', 'sotuv_summa', 'sotuv_sana', 'nds_foiz')) <> 4 then raise exception 't2_forma3 sotuv columns missing'; end if;
  if exists (select 1 from public.t2_forma3 where manba is distinct from 'f2' and manba <> 'sotuv') then raise exception 'manba invalid'; end if;
end $$;

do $$
declare v_k bigint; v_a bigint; v_sh bigint; v_r jsonb; v_s jsonb; v_id bigint; v_op uuid := gen_random_uuid();
begin
  select k.id, z.foydalanuvchi_id into v_k, v_a from public.t2_kompaniya k join public.t2_azolik z on z.kompaniya_id = k.id
   where z.rol in ('admin', 'superadmin') limit 1;
  if v_k is null then raise notice 'skip functional: no admin membership'; return; end if;
  insert into public.t2_shartnoma(kompaniya_id, raqam, nom, jami_nds_bilan, holat, kim) values (v_k, 'TEST-SVOD-' || v_op, 'test', 1000.00, 'faol', 'test')
  returning id into v_sh;

  v_r := public.t2_sverka_yozuv_v1(v_a, v_k, v_sh, 'f3_sotuv', null, null, jsonb_build_object('sotuv_sana', '2026-01-10', 'raqam', '1', 'sotuv_summa', 300.01), v_op);
  if not (v_r->>'ok')::boolean then raise exception 'f3_sotuv insert failed: %', v_r; end if;
  v_id := (v_r->>'id')::bigint;
  if (select manba || ':' || nds_foiz || ':' || davr_boshi from public.t2_forma3 where id = v_id) <> 'sotuv:12.00:2026-01-10' then raise exception 'f3 row wrong'; end if;
  if public.t2_sverka_yozuv_v1(v_a, v_k, v_sh, 'f3_sotuv', null, null, '{}'::jsonb, v_op) <> v_r then raise exception 'idempotency broken'; end if;
  v_r := public.t2_sverka_yozuv_v1(v_a, v_k, v_sh, 'f3_sotuv', null, null, jsonb_build_object('sotuv_sana', '2026-01-10', 'raqam', '1', 'sotuv_summa', 300.01), gen_random_uuid());
  if v_r->>'code' <> 'F3_TAKROR' then raise exception 'duplicate F3 must be rejected: %', v_r; end if;
  v_r := public.t2_sverka_yozuv_v1(v_a, v_k, v_sh, 'f3_sotuv', v_id, 99, jsonb_build_object('holat', 'imzolangan'), gen_random_uuid());
  if v_r->>'code' <> 'STALE_VERSION' then raise exception 'stale version must be rejected: %', v_r; end if;
  v_r := public.t2_sverka_yozuv_v1(v_a, v_k, v_sh, 'f3_sotuv', v_id, 1, jsonb_build_object('holat', 'imzolangan'), gen_random_uuid());
  if not (v_r->>'ok')::boolean then raise exception 'f3 status update failed: %', v_r; end if;
  v_r := public.t2_sverka_yozuv_v1(v_a, v_k, v_sh, 'ds', null, null, jsonb_build_object('sana', '2026-02-01', 'raqam', '1', 'jami_nds_bilan', 1500), gen_random_uuid());
  if not (v_r->>'ok')::boolean then raise exception 'ds failed: %', v_r; end if;
  v_r := public.t2_sverka_yozuv_v1(v_a, v_k, v_sh, 'boshqa', null, null, '{}'::jsonb, gen_random_uuid());
  if v_r->>'code' <> 'TUR_INVALID' then raise exception 'unknown tur must be rejected'; end if;

  v_s := public.t2_shartnoma_svod_v1(v_k, v_a);
  select x into v_s from jsonb_array_elements(v_s->'shartnomalar') x where (x->>'id')::bigint = v_sh;
  if jsonb_array_length(v_s->'f3') <> 1 or (v_s->'f3'->0->>'sotuv_summa')::numeric <> 300.01 or v_s->'f3'->0->>'holat' <> 'imzolangan' then
    raise exception 'svod f3 wrong: %', v_s;
  end if;
  if jsonb_array_length(v_s->'ds') <> 1 then raise exception 'svod ds wrong: %', v_s; end if;
end $$;

rollback;
