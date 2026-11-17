-- ROLLBACK: 20261231000000_kesh_ogir_bosqichli. Yangi 4 jobni o'chiradi, eski t2_kesh_ogir_tungi jobini (20261225000000 dagi) tiklaydi.
-- t2_kesh_ogir_yangila_v1 funksiyasi o'zgarmagan edi. Natija keshi ma'lumotlari tegilmaydi.
do $cron$
declare n text;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    foreach n in array array['t2_kesh_ogir_tanla', 't2_kesh_ogir_bajar', 't2_kesh_ogir_katta_tanla', 't2_kesh_ogir_katta_bajar', 't2_kesh_ogir_tungi'] loop
      if exists (select 1 from cron.job where jobname = n) then perform cron.unschedule(n); end if;
    end loop;
    perform cron.schedule('t2_kesh_ogir_tungi', '*/10 21-23 * * *',
      $c$set statement_timeout = '60s'; select public.t2_kesh_ogir_yangila_v1(25, 2)$c$);
  end if;
end $cron$;

drop function if exists public.t2_kesh_holat_v1(integer);
drop function if exists public.t2_kesh_qadam_bajar_v1(text);
drop function if exists public.t2_kesh_qadam_tanla_v1(text, integer);
drop table if exists public.t2_kesh_qadam;
