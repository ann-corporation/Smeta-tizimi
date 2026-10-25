-- T2-OBYEKT-SNAPSHOT v1 rollback. DIQQAT: snapshot schema bilan birga BARCHA saqlangan snapshotlar o'chadi.
-- pg_cron kengaytmasi o'chirilmaydi (boshqa joblar bo'lishi mumkin) — faqat shu job olib tashlanadi.
begin;

do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 't2-obyekt-snapshot-kunlik') then
      perform cron.unschedule('t2-obyekt-snapshot-kunlik');
    end if;
  end if;
end $cron$;

drop schema if exists snapshot cascade;
drop index if exists public.t2_ozgarish_obyekt_id_idx;

commit;
