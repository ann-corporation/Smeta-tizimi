-- Acceptance 20261230000000 (yengil): drop dan keyin registry ishlaydi va Drive ustunlari yo'q.
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 't2_document_registry' and column_name like 'drive\_%') then
    raise exception 'ACC: drive ustunlari qolgan'; end if;
  if to_regclass('public.t2_replica_sync_job') is not null then raise exception 'ACC: replika navbati qolgan'; end if;
  perform 1 from public.t2_document_registry limit 1;
end $$;
