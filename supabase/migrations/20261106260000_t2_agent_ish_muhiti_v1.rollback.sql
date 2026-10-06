-- Orqaga qaytarish: agent ish muhiti (qoida/xotira/manba/taklif/veb jurnali). Ma'lumot YO'QOLADI — avval zaxira oling.
drop function if exists public.t2_agent_veb_log_v1(bigint, bigint, text, text, integer, integer, text, bigint);
drop function if exists public.t2_agent_veb_ruxsat_v1(bigint, bigint, text);
drop function if exists public.t2_agent_taklif_qaror_v1(bigint, bigint, text, text);
drop function if exists public.t2_agent_taklif_royxat_v1(bigint, bigint, text);
drop function if exists public.t2_agent_taklif_yarat_v1(bigint, bigint, text, text, text, text, jsonb, jsonb, bigint);
drop function if exists public.t2_agent_xotira_yoz_v1(bigint, bigint, text, text, text);
drop function if exists public.t2_agent_muhit_v1(bigint, bigint, text);
drop function if exists public._t2_agent_qaror_rol_ok(text);
drop table if exists public.t2_agent_veb_olish;
drop table if exists public.t2_agent_taklif;
drop table if exists public.t2_agent_manba;
drop table if exists public.t2_agent_xotira;
-- Yadro qoidalar triggeri jadvalni o'chirishga to'sqinlik qilmaydi (DROP TABLE trigger'ni chaqirmaydi).
drop table if exists public.t2_agent_qoida;
drop function if exists public._t2_agent_qoida_yadro_qulf();
