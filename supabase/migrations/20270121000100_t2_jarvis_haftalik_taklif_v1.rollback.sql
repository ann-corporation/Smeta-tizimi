-- Отключить новую обёртку; existing counters и proposals/решения не удаляются.
drop function if exists public.t2_jarvis_haftalik_taklif_v1(bigint, uuid);
drop index if exists public.t2_agent_jarvis_week_uq;
