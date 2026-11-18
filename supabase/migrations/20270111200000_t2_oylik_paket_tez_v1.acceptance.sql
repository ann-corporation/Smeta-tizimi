-- Acceptance (BEGIN/COMMIT yo'q; faqat o'qiydi): yangi funksiyalar bor, anon/authenticated ijro eta olmaydi, oylik paket RPC stable (GET /api/sb),
-- t2_token_yangi_xeshlar_v1: noma'lum xeshlar to'liq qaytadi, takror bir marta, kirish tartibi saqlanadi.
do $$
declare f text; v_k bigint; r text[];
begin
  foreach f in array array['public.t2_f2_oylik_paket_v1(bigint,bigint,bigint,date)', 'public.t2_token_yangi_xeshlar_v1(bigint,text,text[])'] loop
    if to_regprocedure(f) is null then raise exception 'ACCEPT: missing %', f; end if;
    if has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute') then raise exception 'ACCEPT: anon/authenticated must not execute %', f; end if;
    if not has_function_privilege('service_role', f, 'execute') then raise exception 'ACCEPT: service_role must execute %', f; end if;
  end loop;
  if (select provolatile from pg_proc where oid = to_regprocedure('public.t2_f2_oylik_paket_v1(bigint,bigint,bigint,date)')) <> 's' then raise exception 'ACCEPT: t2_f2_oylik_paket_v1 must be stable'; end if;
  select kompaniya_id into v_k from public.t2_obyekt order by id limit 1;
  if v_k is null then raise notice 'skip functional: no company'; return; end if;
  r := public.t2_token_yangi_xeshlar_v1(v_k, 'hujjat', array['zz-accept-' || gen_random_uuid(), 'zz-accept-b', 'zz-accept-b', 'zz-accept-c']);
  if cardinality(r) <> 3 then raise exception 'ACCEPT: yangi xeshlar soni % (3 kutilgan, takror bir marta)', cardinality(r); end if;
  if r[2] <> 'zz-accept-b' or r[3] <> 'zz-accept-c' then raise exception 'ACCEPT: tartib buzildi'; end if;
  if cardinality(public.t2_token_yangi_xeshlar_v1(v_k, 'hujjat', '{}')) <> 0 then raise exception 'ACCEPT: bo''sh ro''yxat bo''sh qaytishi kerak'; end if;
end $$;

