-- Rollback 20261230000000: drop qaytarib bo'lmaydi (ustun ma'lumoti yo'qoladi). Zaxira: drop dan oldin
--   create table public.t2_document_registry_drive_bak as select id, drive_file_id, drive_parent_id, drive_revision from public.t2_document_registry where drive_file_id is not null;
-- Ustunlarni qaytarish (qiymatsiz): 
alter table public.t2_document_registry
  add column if not exists drive_file_id text, add column if not exists drive_parent_id text, add column if not exists drive_revision text,
  add column if not exists drive_sync_status text, add column if not exists drive_last_sync_at timestamptz, add column if not exists drive_last_error text;
