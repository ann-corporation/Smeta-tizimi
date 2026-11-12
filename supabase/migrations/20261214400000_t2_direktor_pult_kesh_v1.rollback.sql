-- Rollback t2_direktor_pult_kesh_v1: panelni eski (jonli) hisobga qaytaradi, kesh va triggerlarni olib tashlaydi.
-- Panel natijasi o'zgarmaydi (faqat sekinlashadi). Hisob yadrosi (_t2_summa_*) tegilmagan.
do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 't2_obyekt_kesh_yangila') then perform cron.unschedule('t2_obyekt_kesh_yangila'); end if;
    if exists (select 1 from cron.job where jobname = 't2_obyekt_kesh_tungi') then perform cron.unschedule('t2_obyekt_kesh_tungi'); end if;
  end if;
end $cron$;

do $patch$
declare
  v_eski text; v_yangi text; v_juft text[]; i int;
begin
  select pg_get_functiondef('public.t2_rahbar_panel_v1(bigint,bigint,date,date,bigint)'::regprocedure) into v_eski;
  if v_eski is null or position('_t2_summa_paket_kesh_v1' in v_eski) = 0 then return; end if;
  v_yangi := v_eski;
  v_juft := array[
    '_t2_summa_paket_kesh_v1(v_ob, ''f2'', v_dan, v_gacha) p',  '_t2_summa_paket_v1(v_ob, ''f2'', null, v_dan, v_gacha) p',
    '_t2_summa_paket_kesh_v1(v_ob, ''smeta'') p',               '_t2_summa_paket_v1(v_ob, ''smeta'') p',
    '_t2_summa_paket_kesh_v1(v_ob, ''fakt'') p',                '_t2_summa_paket_v1(v_ob, ''fakt'') p',
    '_t2_summa_paket_kesh_v1(v_ob, ''f2'') p',                  '_t2_summa_paket_v1(v_ob, ''f2'') p',
    '_t2_summa_paket_kesh_v1(v_ob, ''f2_qoralama'') p',         '_t2_summa_paket_v1(v_ob, ''f2_qoralama'') p'];
  i := 1;
  while i < array_length(v_juft, 1) loop
    v_yangi := replace(v_yangi, v_juft[i], v_juft[i + 1]);
    i := i + 2;
  end loop;
  if position('_t2_summa_paket_kesh_v1' in v_yangi) > 0 then raise exception 'ROLLBACK: panelda kesh chaqiruvi qoldi'; end if;
  execute v_yangi;
end $patch$;

drop function if exists public.t2_rahbar_pult_v1(bigint, bigint);
drop function if exists public._t2_summa_paket_kesh_v1(bigint[], text, date, date);
drop function if exists public.t2_obyekt_kesh_yangila_v1(integer, text);
drop function if exists public._t2_kesh_hisobla_v1(bigint);
drop function if exists public._t2_kesh_oy_paket_v1(bigint, date);

do $drop$
declare j text; op text;
begin
  foreach j in array array['t2_qator', 't2_akt', 't2_akt_qator', 't2_akt_podval', 't2_svod_yaxlit', 't2_nakrutka_podval', 't2_nakrutka_koef', 't2_shartnoma_bog', 't2_shartnoma'] loop
    foreach op in array array['ins', 'upd', 'del'] loop
      execute format('drop trigger if exists %I on public.%I', 't2_kesh_' || j || '_' || op, j);
      execute format('drop function if exists public.%I()', '_t2_kesh_' || j || '_' || op);
    end loop;
  end loop;
end $drop$;

drop function if exists public._t2_kesh_belgila_v1(bigint[], text);
drop table if exists public.t2_obyekt_kesh_iflos;
drop table if exists public.t2_obyekt_kesh;
