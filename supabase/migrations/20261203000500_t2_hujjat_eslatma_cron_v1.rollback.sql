-- ROLLBACK: 20261203000500 (hujjat eslatma cron v1). pg_cron kengaytmasi va boshqa joblar (t2-obyekt-snapshot-kunlik) tegilmaydi.
-- DIQQAT: t2_bildirishnoma_tg (Telegram yetkazish jurnali) o'chadi; t2_outbox/t2_bildirishnoma ma'lumoti saqlanadi.
begin;

do $cron$
declare n text;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    foreach n in array array['t2-hujjat-eslatma-kunlik', 't2-yb-muddat-kunlik', 't2-outbox-bildirishnoma', 't2-bildirishnoma-tg-tozala'] loop
      if exists (select 1 from cron.job where jobname = n) then perform cron.unschedule(n); end if;
    end loop;
  end if;
end $cron$;

drop function if exists public.t2_bildirishnoma_tg_natija_v1(jsonb, integer);
drop function if exists public.t2_bildirishnoma_tg_navbat_v1(integer, integer);
drop table if exists public.t2_bildirishnoma_tg;

commit;
