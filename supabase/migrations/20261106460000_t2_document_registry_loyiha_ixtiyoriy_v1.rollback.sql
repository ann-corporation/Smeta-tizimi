-- Rollback: loyihasiz hujjat bo'lsa bekor qilib bo'lmaydi (ma'lumot yo'qolmasin) — avval ularni loyihaga biriktiring.
do $$ begin
  if exists (select 1 from public.t2_document_registry where loyiha_id is null) then
    raise exception 'ROLLBACK_BLOCKED: loyihasiz hujjatlar bor — avval loyihaga biriktiring';
  end if;
end $$;
alter table public.t2_document_registry alter column loyiha_id set not null;
