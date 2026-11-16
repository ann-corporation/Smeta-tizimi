-- Stop the archive worker first. Do not remove the only pointer to an R2 transcript.
do $$
begin
  if exists (select 1 from public.t2_jarvis_suhbat where archive_sha256 is not null) then
    raise exception 'JARVIS_ARCHIVE_ROLLBACK_REQUIRES_RESTORE';
  end if;
end
$$;
drop function if exists public.t2_jarvis_suhbat_mutate_v1(bigint,bigint,text,text,text,text,jsonb,uuid);
drop table if exists public.t2_jarvis_suhbat_append_receipt;
drop table if exists public.t2_jarvis_suhbat_create_receipt;
drop function if exists public.t2_jarvis_suhbat_sync_v1(bigint,bigint,text,text);
drop function if exists public._t2_jarvis_suhbat_snapshot_v1(public.t2_jarvis_suhbat);
drop function if exists public.t2_jarvis_suhbat_archive_commit_v1(bigint,text,integer);
drop function if exists public.t2_jarvis_suhbat_archive_restore_v1(bigint,text);
drop function if exists public.t2_jarvis_suhbat_archive_pick_v1(integer);
drop index if exists public.t2_jarvis_suhbat_archive_pick_idx;
alter table public.t2_jarvis_suhbat drop constraint t2_jarvis_archive_pointer, drop column archive_sha256, drop column archive_bytes;
-- Leave legacy cleanup disabled: re-enabling it would delete the just-restored transcripts.
