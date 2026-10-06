-- Rollback: 20261106320000_t2_agent_kasb_v1
drop function if exists public.t2_agent_fakt_v1(bigint, bigint, text[], bigint);
drop function if exists public.t2_agent_kasb_v1(bigint, bigint);
drop table if exists public.t2_agent_kasb;
