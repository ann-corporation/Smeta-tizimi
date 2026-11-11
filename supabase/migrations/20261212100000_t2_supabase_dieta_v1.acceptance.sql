-- Acceptance (psql, supabase/migrations papkasidan, STAGING/branch baza): sinov qatorlari -> migratsiya -> tekshiruv -> tozalash.
-- Migratsiya o'zi begin/commit qiladi, shuning uchun sinov qatorlari undan OLDIN alohida qo'shiladi.

-- 1) Sinov qatorlari (eski va yangi f2_qoralama_yangila + boshqa command)
insert into public.t2_onboarding_command_log (operation_id, actor_id, command, natija, created_at) values
  ('00000000-0000-0000-0000-00000000d101', 0, 'f2_qoralama_yangila', '{"ok":true,"holat":"x","akt_id":1,"eski_qatorlar":[{"a":1}],"_request":"r"}', now() - interval '20 days'),
  ('00000000-0000-0000-0000-00000000d102', 0, 'f2_qoralama_yangila', '{"ok":true,"holat":"x","akt_id":2,"eski_qatorlar":[{"a":2}],"_request":"r"}', now() - interval '1 day'),
  ('00000000-0000-0000-0000-00000000d103', 0, 'obyekt_yarat',        '{"ok":true,"eski_qatorlar":[1]}',                                                  now() - interval '90 days');

-- 2) Migratsiya
\ir 20261212100000_t2_supabase_dieta_v1.sql

-- 3) Tekshiruv, so'ng sinov qatorlarini o'chirish
begin;
do $$
declare v jsonb;
begin
  if (select i.indpred is null from pg_index i where i.indexrelid = 'public.t2_qator_paket_manba_idx'::regclass) then
    raise exception 'paket_manba indeksi partial emas'; end if;
  if (select i.indpred is null from pg_index i where i.indexrelid = 'public.t2_qator_manba_idx'::regclass) then
    raise exception 'manba indeksi partial emas'; end if;
  if (select natija ? 'eski_qatorlar' from public.t2_onboarding_command_log where operation_id = '00000000-0000-0000-0000-00000000d101') then
    raise exception '20 kunlik yozuvda eski_qatorlar qolgan'; end if;
  if not (select natija ? 'eski_qatorlar' from public.t2_onboarding_command_log where operation_id = '00000000-0000-0000-0000-00000000d102') then
    raise exception '1 kunlik yozuv tegilgan'; end if;
  if not (select natija ? 'eski_qatorlar' from public.t2_onboarding_command_log where operation_id = '00000000-0000-0000-0000-00000000d103') then
    raise exception 'boshqa command tegilgan'; end if;
  if (select (natija->>'akt_id')::int <> 1 or natija->>'_request' <> 'r' or (natija->>'_kompakt')::boolean is not true
        from public.t2_onboarding_command_log where operation_id = '00000000-0000-0000-0000-00000000d101') then
    raise exception 'qolgan natija maydonlari buzilgan'; end if;
  v := public.t2_dieta_log_kompakt_v1(7, true);
  if (v->>'qator')::int <> 0 or (v->>'dry_run')::boolean is not true then raise exception 'qayta ishga tushirish idempotent emas: %', v; end if;
  if has_function_privilege('anon', 'public.t2_dieta_log_kompakt_v1(integer, boolean)', 'execute')
     or has_function_privilege('authenticated', 'public.t2_dieta_log_kompakt_v1(integer, boolean)', 'execute') then
    raise exception 'funksiya anon/authenticated ga ochiq'; end if;
end $$;
delete from public.t2_onboarding_command_log where operation_id in
  ('00000000-0000-0000-0000-00000000d101','00000000-0000-0000-0000-00000000d102','00000000-0000-0000-0000-00000000d103');
commit;  -- sinov qatorlari o'chirildi. Migratsiya o'zi commit qiladi: sinovni faqat staging/branch bazada yuriting (prodda emas).
-- Tekshiruv yiqilsa sinov qatorlari qoladi: `delete from public.t2_onboarding_command_log where operation_id::text like '00000000-0000-0000-0000-00000000d10%'`.
