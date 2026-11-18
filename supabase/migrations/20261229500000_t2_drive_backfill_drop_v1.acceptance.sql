-- Acceptance 20261229500000: funksiya yo'q va Drive ustunlariga murojaat qiluvchi funksiya (replika funksiyalaridan tashqari) qolmagan.
do $$ declare v text; begin
  if to_regprocedure('public.t2_document_canonical_backfill_v1(bigint,text,text,bigint,text,text)') is not null then raise exception 'ACC: backfill funksiyasi qolgan'; end if;
  select string_agg(p.proname, ', ') into v from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname not like 't2_replica_%' and p.proname not like 't2_document_replica_%'
     and p.prosrc ~* '(drive_file_id|drive_parent_id|drive_revision|drive_sync_status|drive_last_sync_at|drive_last_error|t2_replica_sync_job)';
  if v is not null then raise exception 'ACC: Drive ga murojaat qiluvchi funksiyalar: %', v; end if;
end $$;
