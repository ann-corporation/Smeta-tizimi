-- Acceptance 20261229000000: public sxemada drive ustunlari / replika navbatiga murojaat qiluvchi funksiya qolmagan (t2_document_replica_* va t2_replica_job_* bundan mustasno - ular 20261230000000 da o'chadi).
do $$ declare v text; begin
  select string_agg(p.proname, ', ') into v from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname not like 't2_replica_%' and p.proname not like 't2_document_replica_%'
     and p.prosrc ~* '(drive_file_id|drive_parent_id|drive_revision|drive_sync_status|drive_last_sync_at|drive_last_error|t2_replica_sync_job)';
  if v is not null then raise exception 'ACC: Drive ga murojaat qiluvchi funksiyalar: %', v; end if;
end $$;
