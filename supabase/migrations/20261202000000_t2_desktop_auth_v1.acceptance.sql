-- Synthetic acceptance, no real actors/data. All fixtures disappear at ROLLBACK.
begin;
do $$
declare
  a bigint; b bigint; r jsonb;
  exp bigint := floor(extract(epoch from clock_timestamp())*1000)::bigint + 3600000;
  d uuid := '00000000-0000-4000-8000-000000000001';
  op uuid := '00000000-0000-4000-8000-000000000002';
begin
  insert into public.t2_foydalanuvchi(login,ism,holat) values('desktop_acc_'||gen_random_uuid(),'Synthetic Desktop','faol') returning id into a;
  insert into public.t2_foydalanuvchi(login,ism,holat) values('desktop_acc_'||gen_random_uuid(),'Synthetic Other','faol') returning id into b;
  r := public.t2_desktop_qurilma_yarat_v1(a,d,repeat('a',64),exp,op);
  if r->>'ok' <> 'true' then raise exception 'create: %',r; end if;
  if public.t2_desktop_qurilma_yarat_v1(a,gen_random_uuid(),repeat('b',64),exp,op)->>'code' <> 'OPERATION_ALREADY_USED' then raise exception 'duplicate operation'; end if;
  r := public.t2_desktop_qurilma_tekshir_v1(repeat('a',64));
  if r->>'ok' <> 'true' or (r->>'foydalanuvchi_id')::bigint <> a or r ? 'token_hash' then raise exception 'verify identity/hash leak'; end if;
  if public.t2_desktop_qurilma_tekshir_v1(repeat('f',64))->>'ok' <> 'false' then raise exception 'unknown token'; end if;
  if public.t2_desktop_qurilma_bekor_v1(b,d,gen_random_uuid())->>'ok' <> 'false' then raise exception 'foreign actor revoke'; end if;
  if public.t2_desktop_qurilma_bekor_v1(a,d,gen_random_uuid())->>'ok' <> 'true' then raise exception 'revoke'; end if;
  if public.t2_desktop_qurilma_tekshir_v1(repeat('a',64))->>'ok' <> 'false' then raise exception 'revoked accepted'; end if;
  perform public.t2_desktop_qurilma_bekor_v1(a,d,gen_random_uuid());
  if (select versiya from public.t2_desktop_qurilma where device_id=d) <> 2 then raise exception 'revoke retry not idempotent'; end if;
  perform public.t2_desktop_qurilma_yarat_v1(a,gen_random_uuid(),repeat('c',64),exp,gen_random_uuid());
  update public.t2_desktop_qurilma set tugaydi=1 where token_hash=repeat('c',64);
  if public.t2_desktop_qurilma_tekshir_v1(repeat('c',64))->>'ok' <> 'false' then raise exception 'expired accepted'; end if;
  perform public.t2_desktop_qurilma_yarat_v1(a,gen_random_uuid(),repeat('d',64),exp,gen_random_uuid());
  update public.t2_foydalanuvchi set sessiya_bekor_dan=clock_timestamp() where id=a;
  if public.t2_desktop_qurilma_tekshir_v1(repeat('d',64))->>'ok' <> 'false' then raise exception 'global revocation ignored'; end if;
  if public.t2_desktop_qurilma_yarat_v1(a,gen_random_uuid(),repeat('e',64),exp,gen_random_uuid())->>'code' <> 'ACTOR_INVALID' then raise exception 'stale cookie issuance'; end if;
  if not (select relrowsecurity from pg_class where oid='public.t2_desktop_qurilma'::regclass) then raise exception 'RLS off'; end if;
  if has_table_privilege('anon','public.t2_desktop_qurilma','select') or has_table_privilege('authenticated','public.t2_desktop_qurilma','insert') then raise exception 'credential table public'; end if;
  if has_function_privilege('anon','public.t2_desktop_qurilma_tekshir_v1(text)','execute') or has_function_privilege('authenticated','public.t2_desktop_qurilma_yarat_v1(bigint,uuid,text,bigint,uuid)','execute') then raise exception 'credential RPC public'; end if;
end $$;
rollback;
