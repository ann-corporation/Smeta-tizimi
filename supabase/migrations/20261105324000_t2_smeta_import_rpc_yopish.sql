-- Xavfsizlik P0 (egasi 2026-10-02: "ha qilaver"). 5 ta SECURITY DEFINER smeta import RPC PUBLIC/anon/authenticated
-- uchun ochiq edi — kirmagan odam ham PostgREST orqali istalgan kompaniyaga smeta yoza olardi (p_kompaniya_id,
-- p_actor_id brauzerdan). Ularni faqat server (functions/api/smeta-yukla.ts, service_role) chaqiradi.
-- Qonun: privileged RPC faqat service_role; Browser → BFF → tekshirilgan sessiya → service_role → RPC.
begin;

revoke execute on function public.t2_smeta_import_boshla_v1(bigint, bigint, bigint, uuid, bigint) from public, anon, authenticated;
revoke execute on function public.t2_smeta_import_bulk_v1(bigint, bigint, bigint, uuid, bigint, jsonb) from public, anon, authenticated;
revoke execute on function public.t2_smeta_import_yakunla_v1(bigint, bigint, bigint) from public, anon, authenticated;
revoke execute on function public.t2_smeta_paket_import_boshla_v1(bigint, bigint, bigint, uuid, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.t2_smeta_paket_import_yakunla_v1(bigint, bigint, bigint) from public, anon, authenticated;

grant execute on function public.t2_smeta_import_boshla_v1(bigint, bigint, bigint, uuid, bigint) to service_role;
grant execute on function public.t2_smeta_import_bulk_v1(bigint, bigint, bigint, uuid, bigint, jsonb) to service_role;
grant execute on function public.t2_smeta_import_yakunla_v1(bigint, bigint, bigint) to service_role;
grant execute on function public.t2_smeta_paket_import_boshla_v1(bigint, bigint, bigint, uuid, text, text, jsonb) to service_role;
grant execute on function public.t2_smeta_paket_import_yakunla_v1(bigint, bigint, bigint) to service_role;

-- Qo'riqchi: public sxemada anon yoki authenticated chaqira oladigan SECURITY DEFINER qolmasin.
do $$
declare v text;
begin
  select string_agg(p.proname, ', ') into v
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'));
  if v is not null then raise exception 'SECDEF_OCHIQ: %', v; end if;
end $$;

commit;
