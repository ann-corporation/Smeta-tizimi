-- Qabul (yengil, faqat o'qish; tashqi tranzaksiyada). 20261225000000 qo'llangandan KEYIN. Bitta obyektga tegadi (eng kichik id), hech narsa yozmaydi.
do $test$
declare v_job int;
begin
  if has_function_privilege('anon', 'public.t2_kesh_yengil_yangila_v1(integer,integer,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.t2_kesh_ogir_yangila_v1(integer,integer)', 'execute') then
    raise exception 'A0: grantlar ochiq';
  end if;
  select count(*) into v_job from cron.job where jobname in ('t2_kesh_yengil', 't2_kesh_ogir_tungi') and active
     and command ilike '%statement_timeout = ''60s''%';
  if v_job <> 2 then raise exception 'A1: yangi joblar topilmadi yoki timeout 60s emas (%)', v_job; end if;
  if exists (select 1 from cron.job where jobname in ('t2_obyekt_kesh_yangila', 't2_obyekt_kesh_tungi') and active) then
    raise exception 'A2: eski og''ir joblar faol';
  end if;
  raise notice 'OK';
end $test$;
