-- 20261230000000 - GOOGLE DRIVE NUSXA USTUNLARI VA REPLIKA NAVBATINI O'CHIRISH.
-- !!! FAQAT Drive nusxalari R2 ga ko'chirilgandan keyin (faqat Drive da bo'lgan hujjat qolmaganligi tasdiqlangandan keyin) !!!
-- QO'LLANMAYDI (egasi tasdiqlaydi). Himoya: quyidagi DO bloki (1) Drive da bor, lekin R2 kaliti yo'q registry qatori topilsa va
-- (2) o'chiriladigan ustunlarga murojaat qiladigan funksiya (pg_proc) qolgan bo'lsa MIGRATSIYANI TO'XTATADI - avval ularni qayta yozing
-- (t2_document_canonical_reserve/finalize/reconcile, t2_document_registry_v1, t2_replica_job_* va h.k.).
-- t2_papka/t2_obyekt/t2_papka_daraxt/t2_company_storage_workspace dagi drive_id ustunlari bu migratsiyaga KIRMAYDI (papka daraxti ADR kerak).
do $$
declare v_yolgiz bigint; v_fn text;
begin
  select count(*) into v_yolgiz from public.t2_document_registry where drive_file_id is not null and r2_key is null;
  if v_yolgiz > 0 then raise exception 'Drive-only hujjatlar bor (%): avval ops/scripts/drive-r2-kochir.mjs --apply', v_yolgiz; end if;
  select string_agg(p.proname, ', ') into v_fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname not like 't2_replica_%'
     and p.prosrc ~* '(drive_file_id|drive_parent_id|drive_revision|drive_sync_status|drive_last_sync_at|drive_last_error|t2_replica_sync_job)';
  if v_fn is not null then raise exception 'Drive ustunlariga murojaat qiluvchi funksiyalar qolgan: %', v_fn; end if;
end $$;

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
