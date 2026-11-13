-- ROLLBACK 20261218500000_t2_ai_ishchilar_v1: faqat shu migratsiya qo'shgan obyektlar olib tashlanadi. Mavjud jadval ma'lumotlari saqlanadi.
-- OGOHLANTIRISH: t2_ai_* jadvallari (ishlar, natijalar, sozlamalar) va t2_osuvchi_taklif dagi tur='internet'/'tizim' qatorlari O'CHADI.
set local statement_timeout = '300s';

do $cron$ begin
  if to_regnamespace('cron') is not null then
    perform cron.unschedule(jobid) from cron.job where jobname = 't2-ai-ishchi-jadval';
  end if;
end $cron$;

drop function if exists public.t2_ai_bajaruvchi_navbat_v1(integer);
drop function if exists public.t2_ai_fon_foiz_saqla_v1(bigint, integer, uuid);
drop function if exists public.t2_ai_fon_limit_v1();
drop function if exists public.t2_ai_jadval_v1();
drop function if exists public.t2_ai_manba_saqla_v1(bigint, bigint, boolean, text, integer, uuid);
drop function if exists public.t2_ai_ol_v1(bigint, bigint, text, jsonb);
drop function if exists public.t2_ai_natija_holat_v1(bigint, bigint, text, uuid);
drop function if exists public.t2_ai_sozlama_saqla_v1(bigint, bigint, text, boolean, text, integer, boolean, integer, jsonb, uuid);
drop function if exists public.t2_ai_tizim_taklif_v1(bigint, jsonb);
drop function if exists public.t2_ai_internet_belgila_v1(bigint, text, text, text, text);
drop function if exists public.t2_ai_internet_bolak_v1(bigint);
drop function if exists public.t2_ai_ish_ai_yoz_v1(bigint, boolean, text, integer, integer, numeric, text, text);
drop function if exists public.t2_ai_ish_ai_ol_v1(bigint);
drop function if exists public.t2_ai_ish_qadam_yoz_v1(bigint, jsonb);
drop function if exists public.t2_ai_ish_yur_v1(bigint);
drop function if exists public.t2_ai_ish_navbat_v1(bigint, bigint, text, jsonb, uuid, text);
drop function if exists public._t2_ai_yakunla_v1(bigint);
drop function if exists public._t2_ai_quruq_v1(text, jsonb);
drop function if exists public._t2_ai_bolaklar_v1(text, bigint, jsonb);
drop function if exists public._t2_ai_faktlar_v1(text, bigint, text);
drop function if exists public._t2_ai_band_v1(text, integer, text, jsonb);
drop function if exists public._t2_ai_rol_ok_v1(text, boolean);

drop table if exists public.t2_ai_natija;
drop table if exists public.t2_ai_limit;
drop table if exists public.t2_ai_ish;
drop table if exists public.t2_ai_sozlama;
drop table if exists public.t2_ai_ishchi;

alter table public.t2_agent_kuzatuv_url drop constraint if exists t2_agent_kuzatuv_url_ai_chk;
alter table public.t2_agent_kuzatuv_url drop column if exists oxirgi_xulosa;
alter table public.t2_agent_kuzatuv_url drop column if exists chastota_soat;
alter table public.t2_agent_kuzatuv_url drop column if exists tur;

delete from public.t2_osuvchi_taklif where tur in ('internet', 'tizim');
alter table public.t2_osuvchi_taklif drop constraint if exists t2_osuvchi_taklif_tur_check;
alter table public.t2_osuvchi_taklif add constraint t2_osuvchi_taklif_tur_check check (tur in ('tajriba', 'friksiya'));
