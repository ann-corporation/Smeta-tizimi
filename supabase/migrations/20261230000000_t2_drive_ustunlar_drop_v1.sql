-- 20261230000000 - GOOGLE DRIVE NUSXA USTUNLARI VA REPLIKA NAVBATINI O'CHIRISH.
-- !!! FAQAT Drive nusxalari R2 ga ko'chirilgandan keyin (faqat Drive da bo'lgan hujjat qolmaganligi tasdiqlangandan keyin) !!!
-- QO'LLANMAYDI (egasi tasdiqlaydi). Himoya: quyidagi DO bloki (1) Drive da bor, lekin R2 kaliti yo'q registry qatori topilsa va
-- (2) o'chiriladigan ustunlarga murojaat qiladigan funksiya (pg_proc) qolgan bo'lsa MIGRATSIYANI TO'XTATADI - avval ularni qayta yozing
-- (t2_document_canonical_reserve/finalize/reconcile, t2_document_registry_v1, t2_replica_job_* va h.k.).
-- MA'LUMOT YO'QOLMASLIGI: faqat Drive-only (drive_* ustunlar, t2_replica_sync_job navbati, t2_document_replica_*_v1 va t2_replica_job_*_v1 funksiyalari) o'chadi;
--   R2 kalitlari, sha256, registry qatorlari, hujjat metama'lumoti va boshqa hamma Drive'ga aloqasiz ma'lumot O'ZGARMAYDI. Drive id lari o'chirishdan oldin
--   t2_document_registry_drive_bak jadvaliga nusxalanadi (rollback shundan tiklaydi).
-- OGOHLANTIRISH: quyidagi funksiyalar drive_* ustunlariga murojaat qiladi va drop dan OLDIN ustunsiz qayta yozilishi kerak (aks holda DO guard to'xtatadi):
--   t2_document_canonical_reserve/reserve_slot/finalize/reconcile/get/share/backfill_v1, t2_document_registry_v1, t2_boss_dashboard_*, t2_hujjat_stuck_health, t2_smeta_paket_import.
-- t2_papka/t2_obyekt/t2_papka_daraxt/t2_company_storage_workspace dagi drive_id ustunlari bu migratsiyaga KIRMAYDI (papka daraxti ADR kerak).
do $$
declare v_yolgiz bigint; v_fn text;
begin
  select count(*) into v_yolgiz from public.t2_document_registry where drive_file_id is not null and r2_key is null;
  if v_yolgiz > 0 then raise exception 'Drive-only hujjatlar bor (%): avval ops/scripts/drive-r2-kochir.mjs --apply', v_yolgiz; end if;
  select string_agg(p.proname, ', ') into v_fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname not like 't2_replica_%' and p.proname not like 't2_document_replica_%'
     and p.prosrc ~* '(drive_file_id|drive_parent_id|drive_revision|drive_sync_status|drive_last_sync_at|drive_last_error|t2_replica_sync_job)';
  if v_fn is not null then raise exception 'Drive ustunlariga murojaat qiluvchi funksiyalar qolgan: %', v_fn; end if;
end $$;

create table if not exists public.t2_document_registry_drive_bak as
  select id, kompaniya_id, drive_file_id, drive_parent_id, drive_revision from public.t2_document_registry where drive_file_id is not null;

drop function if exists public.t2_document_replica_rename_v1;
drop function if exists public.t2_document_replica_content_v1;
drop function if exists public.t2_document_replica_deleted_v1;
drop function if exists public.t2_document_replica_move_v1;
drop function if exists public.t2_replica_job_claim_v1;
drop function if exists public.t2_replica_job_failed_v1;
drop function if exists public.t2_replica_job_synced_v1;
drop table if exists public.t2_replica_sync_job;

alter table public.t2_document_registry
  drop column if exists drive_file_id,
  drop column if exists drive_parent_id,
  drop column if exists drive_revision,
  drop column if exists drive_sync_status,
  drop column if exists drive_last_sync_at,
  drop column if exists drive_last_error;
