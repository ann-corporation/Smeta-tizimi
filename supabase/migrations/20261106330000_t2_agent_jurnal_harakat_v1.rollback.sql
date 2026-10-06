-- Rollback: 20261106330000_t2_agent_jurnal_harakat_v1
drop function if exists public.t2_agent_harakat_royxat_v1(bigint, bigint, integer);
drop function if exists public.t2_agent_harakat_natija_v1(bigint, bigint, boolean, jsonb);
drop function if exists public.t2_agent_harakat_qaror_v1(bigint, bigint, text);
drop function if exists public.t2_agent_harakat_taklif_v1(bigint, bigint, bigint, text, jsonb, text, boolean);
drop function if exists public.t2_agent_jurnal_royxat_v1(bigint, bigint, boolean, integer);
drop function if exists public.t2_agent_shaxsiy_saqla_v1(bigint, text, text, text);
drop function if exists public.t2_agent_shaxsiy_v1(bigint);
drop table if exists public.t2_agent_harakat;
drop table if exists public.t2_agent_jurnal;
drop table if exists public.t2_agent_shaxsiy_sozlama;
drop function if exists public.t2_agent_jurnal_yoz_v1(bigint, bigint, uuid, text, text, text, text, text, jsonb, text[], text, integer, integer, integer, boolean);
