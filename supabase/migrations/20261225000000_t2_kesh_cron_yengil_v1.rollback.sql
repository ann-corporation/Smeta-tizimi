-- ROLLBACK: 20261225000000_t2_kesh_cron_yengil_v1. Eski jobni TIKLAYDI (job 20 faol EMAS holda: egasi ruxsatisiz yoqilmaydi, chunki IO sababi shu edi).
-- Job 21 (tungi 'hammasi', 900 s) va job 37 asl jadvaliga qaytariladi. Kesh jadvallari/ma'lumotlari tegilmaydi (o'chirilgan og'ir qatorlar eski cron/tungi job orqali qayta to'lib chiqadi).
do $cron$
declare n text;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    foreach n in array array['t2_kesh_yengil', 't2_kesh_ogir_tungi', 't2_obyekt_kesh_yangila', 't2_obyekt_kesh_tungi'] loop
      if exists (select 1 from cron.job where jobname = n) then perform cron.unschedule(n); end if;
    end loop;
    perform cron.schedule('t2_obyekt_kesh_tungi', '20 22 * * *',
      $c$set statement_timeout = '900s'; select public.t2_obyekt_kesh_yangila_v1(600, 'hammasi')$c$);
    perform cron.schedule('t2_obyekt_kesh_yangila', '* * * * *',
      $c$set statement_timeout = '150s'; select public.t2_obyekt_kesh_yangila_v1(40, 'iflos')$c$);
    perform cron.alter_job((select jobid from cron.job where jobname = 't2_obyekt_kesh_yangila'), active := false);
    if exists (select 1 from cron.job where jobname = 't2_obyekt_ustama_yangila') then
      perform cron.alter_job((select jobid from cron.job where jobname = 't2_obyekt_ustama_yangila'),
        schedule := '* * * * *',
        command := $c$set statement_timeout = '150s'; select public.t2_obyekt_ustama_yangila_v1(40)$c$);
    end if;
  end if;
end $cron$;

drop function if exists public.t2_kesh_ogir_yangila_v1(integer, integer);
drop function if exists public.t2_kesh_yengil_yangila_v1(integer, integer, integer);
drop function if exists public._t2_kesh_yengil_hisobla_v1(bigint);

drop function if exists public._t2_obyekt_natija_kesh_tozala_v1(bigint);
