-- Orqaga qaytarish: AI xarajat nazorati. Sarf tarixi YO'QOLADI — avval zaxira oling.
drop function if exists public.t2_agent_manba_holat_v1(bigint, text, boolean);
drop function if exists public.t2_agent_markaz_v1(bigint);
drop function if exists public.t2_agent_sarf_hisobot_v1(bigint, bigint);
drop function if exists public.t2_agent_sarf_yoz_v1(bigint, bigint, text, text, text, integer, integer, numeric, boolean);
drop function if exists public.t2_agent_sarf_tekshir_v1(bigint, bigint);
drop function if exists public._t2_agent_oy_sarfi_v1(bigint);
drop function if exists public.t2_agent_byudjet_belgila_v1(bigint, bigint, numeric, integer, boolean);
drop function if exists public.t2_agent_model_katalog_yoz_v1(bigint, text, text, text, text, boolean, boolean, numeric, numeric);
drop table if exists public.t2_agent_byudjet;
drop table if exists public.t2_agent_sarf;
alter table public.t2_agent_model_katalog drop column if exists narx_chiqish_usd;
alter table public.t2_agent_model_katalog drop column if exists narx_kirish_usd;
-- Eski 7-argumentli t2_agent_model_katalog_yoz_v1 ni 20261106280000 migratsiyasi qayta yaratadi.
