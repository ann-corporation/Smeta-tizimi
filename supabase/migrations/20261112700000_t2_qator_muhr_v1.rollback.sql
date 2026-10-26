-- Rollback: 20261112700000 — qator muhri. Import o'ramlari asl holatiga qaytariladi; muhr jadvali, view va funksiyalar o'chiriladi.
-- t2_qator, t2_smeta_revision, t2_ozgarish ma'lumoti tegilmagan (migratsiya ularga yozmagan).
-- DIQQAT: muhrlar (asl smeta isboti) ham o'chadi — kerak bo'lsa avval eksport qiling:
--   copy (select * from public.t2_qator_muhr) to stdout with csv header;
begin;
create or replace function public.t2_smeta_import_yakunla_v1(p_kompaniya_id bigint, p_actor_id bigint, p_sessiya_id bigint)
 returns jsonb language plpgsql security definer
 set search_path to 'public', 'pg_temp' set statement_timeout to '120s' as $function$
declare v_obyekt_id bigint;
begin
  select s.obyekt_id into v_obyekt_id from public.t2_smeta_import_sessiya s where s.id=p_sessiya_id and s.kompaniya_id=p_kompaniya_id;
  if v_obyekt_id is not null then perform public.t2_smeta_import_object_lock_v1(v_obyekt_id); end if;
  return public.t2_smeta_import_yakunla_unlocked_v1(p_kompaniya_id,p_actor_id,p_sessiya_id);
end $function$;

create or replace function public.t2_smeta_paket_import_yakunla_v1(p_kompaniya_id bigint, p_actor_id bigint, p_sessiya_id bigint)
 returns jsonb language plpgsql security definer
 set search_path to 'public', 'pg_temp' set statement_timeout to '120s' as $function$
declare v_obyekt_id bigint;
begin
  select s.obyekt_id into v_obyekt_id from public.t2_smeta_paket_import_sessiya s where s.id=p_sessiya_id and s.kompaniya_id=p_kompaniya_id;
  if v_obyekt_id is not null then perform public.t2_smeta_import_object_lock_v1(v_obyekt_id); end if;
  return public.t2_smeta_paket_import_yakunla_unlocked_v1(p_kompaniya_id,p_actor_id,p_sessiya_id);
end $function$;

drop view if exists public.t2_qator_muhr_farq;
drop function if exists public.t2_qator_muhr_ol_v1(bigint, text, bigint);
drop table if exists public.t2_qator_muhr;
drop function if exists public.t2_qator_muhr_const_trg();
drop function if exists public.t2_qator_muhr_hisob(text, text, text, text, text, bigint, numeric, numeric, numeric);
drop index if exists public.t2_ozgarish_qator_vaqt_ix;
commit;
