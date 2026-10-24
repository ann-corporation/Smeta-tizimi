-- ROLLBACK: 20261108600000_t2_topshiriq_v1
drop function if exists public.t2_topshiriqlar_v1(bigint,bigint,text,text,bigint,integer,bigint);
drop function if exists public.t2_topshiriq_otish_v1(bigint,bigint,uuid,bigint,integer,text,text,bigint[]);
drop function if exists public.t2_topshiriq_ber_v1(bigint,bigint,uuid,text,bigint,bigint,bigint,bigint,text,text,date,jsonb,jsonb);
drop function if exists public._t2_topshiriq_doira(bigint,bigint,bigint);
drop function if exists public._t2_topshiriq_hodisa(bigint,text,bigint,jsonb,bigint,uuid);
drop table if exists public.t2_topshiriq_otish;
drop table if exists public.t2_topshiriq;