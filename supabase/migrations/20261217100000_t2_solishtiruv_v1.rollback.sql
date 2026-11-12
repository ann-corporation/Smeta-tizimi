-- Rollback: 20261217100000_t2_solishtiruv_v1 (additiv migratsiyaning teskarisi). Navbat ma'lumoti (t2_solishtiruv_istisno) o'chadi.
do $c$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') and exists (select 1 from cron.job where jobname = 't2_solishtiruv_tungi') then
    perform cron.unschedule('t2_solishtiruv_tungi');
  end if;
end $c$;
drop function if exists public.t2_solishtiruv_cron_v1();
drop function if exists public.t2_solishtiruv_v1(bigint, bigint, bigint);
drop function if exists public.t2_solishtiruv_tushuntir_v1(bigint, bigint, bigint, text, text, uuid);
drop function if exists public.t2_solishtiruv_yangila_v1(bigint, bigint, bigint, uuid);
drop function if exists public._t2_solishtiruv_yangila_ich(bigint, bigint);
drop table if exists public.t2_solishtiruv_istisno;
drop table if exists public.t2_solishtiruv_qoida;