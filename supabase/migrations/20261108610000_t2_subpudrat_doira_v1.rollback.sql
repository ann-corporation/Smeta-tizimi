-- ROLLBACK: 20261108610000_t2_subpudrat_doira_v1
drop function if exists public.t2_subpudrat_qamrov_v1(bigint,bigint,bigint);
drop function if exists public.t2_subpudrat_royxat_v1(bigint,bigint,text);
drop function if exists public.t2_subpudrat_qator_saqla_v1(bigint,bigint,uuid,bigint,integer,jsonb,bigint);
drop function if exists public.t2_subpudrat_saqla_v1(bigint,bigint,uuid,integer,jsonb);
delete from public.t2_tomon_resurs where kalit = 'subpudrat_doira' and not exists (select 1 from public.t2_tomon_grant g where g.resurs = 'subpudrat_doira');
drop table if exists public.t2_subpudrat_amal;
drop table if exists public.t2_subpudrat_qator;
drop table if exists public.t2_subpudrat_shartnoma;