-- Drain purge work and stop the archive worker before rolling back these contracts.
set local lock_timeout = '3s';
lock table public.t2_jarvis_suhbat in access exclusive mode;
lock table public.t2_jarvis_suhbat_r2_purge in access exclusive mode;
do $$
begin
  if exists (select 1 from public.t2_jarvis_suhbat_r2_purge) then
    raise exception 'Preserve Jarvis R2 cleanup records before rollback';
  end if;
end
$$;
drop trigger t2_jarvis_suhbat_archive_deleted on public.t2_jarvis_suhbat;
drop function public._t2_jarvis_suhbat_archive_deleted_v1();
drop function public.t2_jarvis_suhbat_archive_stage_v1(bigint,text,integer);
drop function public.t2_jarvis_suhbat_archive_purge_pick_v1(integer);
drop function public.t2_jarvis_suhbat_archive_purge_ack_v1(bigint,text);
drop table public.t2_jarvis_suhbat_r2_purge;
