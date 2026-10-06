-- Orqaga qaytarish: o'rganish tsikli (fikr/signal/buyruq). Ma'lumot YO'QOLADI — avval zaxira oling.
drop function if exists public.t2_agent_buyruq_holat_v1(bigint, bigint, text, text, integer, text);
drop function if exists public.t2_agent_buyruq_royxat_v1(bigint);
drop function if exists public.t2_agent_taklif_qaror_v1(bigint, bigint, text, text, boolean);
drop function if exists public.t2_agent_rivojlanish_yigish_v1(bigint, integer);
drop function if exists public.t2_agent_signal_yoz_v1(bigint, bigint, text, text, text, text);
drop function if exists public.t2_agent_fikr_royxat_v1(bigint, bigint);
drop function if exists public.t2_agent_fikr_yoz_v1(bigint, bigint, text, text, text, bigint[], text, text);
drop function if exists public._t2_agent_xesh_v1(bigint);
drop function if exists public._t2_agent_tozala_v1(text, bigint);
drop table if exists public.t2_agent_buyruq;
drop table if exists public.t2_agent_signal;
drop table if exists public.t2_agent_fikr;
-- Eski 4-argumentli t2_agent_taklif_qaror_v1 ni 20261106260000 migratsiyasi qayta yaratadi (uni qayta qo'llang).
