-- Rollback 20261230000000 (Drive-only ob'ektlarni qaytarish). Ma'lumot: drive_file_id/parent/revision t2_document_registry_drive_bak dan tiklanadi.
-- Eslatma: o'chirilgan funksiyalar (t2_document_replica_*_v1, t2_replica_job_*_v1) eski migratsiya fayllaridan (20260902120000, 20260907120000) qayta yuritiladi;
-- t2_replica_sync_job jadvali 20260902120000 dan qayta yaratiladi (navbat bo'sh boshlanadi). Non-Drive ma'lumotga ta'sir yo'q.
alter table public.t2_document_registry
  add column if not exists drive_file_id text, add column if not exists drive_parent_id text, add column if not exists drive_revision text,
  add column if not exists drive_sync_status text, add column if not exists drive_last_sync_at timestamptz, add column if not exists drive_last_error text;
do $$ begin
  if to_regclass('public.t2_document_registry_drive_bak') is not null then
    update public.t2_document_registry r set drive_file_id = b.drive_file_id, drive_parent_id = b.drive_parent_id, drive_revision = b.drive_revision
      from public.t2_document_registry_drive_bak b where b.id = r.id;
  end if;
end $$;