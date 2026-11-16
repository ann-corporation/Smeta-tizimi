-- Qabul (yengil, faqat o'qish). 20261231000000 qo'llangandan KEYIN.
do $test$
declare v_job int;
begin
  if has_function_privilege('anon', 'public.t2_kesh_qadam_tanla_v1(text,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.t2_kesh_qadam_bajar_v1(text)', 'execute') then
    raise exception 'A0: grantlar ochiq';
  end if;
  select count(*) into v_job from cron.job
   where jobname in ('t2_kesh_ogir_tanla', 't2_kesh_ogir_bajar', 't2_kesh_ogir_katta_tanla', 't2_kesh_ogir_katta_bajar') and active;
  if v_job <> 4 then raise exception 'A1: yangi 4 job topilmadi (%)', v_job; end if;
  if exists (select 1 from cron.job where jobname = 't2_kesh_ogir_tungi') then raise exception 'A2: eski tungi job qolgan'; end if;
  raise notice 'OK';
end $test$;
