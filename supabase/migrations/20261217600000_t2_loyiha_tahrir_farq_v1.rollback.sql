-- Rollback: 20261217600000_t2_loyiha_tahrir_farq_v1
drop function if exists public.t2_loyiha_tahrir_qaror_v1(bigint,bigint,bigint,bigint,bigint,text,text,text,text);
drop function if exists public.t2_loyiha_tahrir_farq_v1(bigint,bigint,bigint,bigint,bigint);
drop function if exists public.t2_loyiha_tahrir_royxat_v1(bigint,bigint,bigint);
drop function if exists public.t2_loyiha_tahrir_asos_v1(bigint,bigint,bigint,bigint);
drop function if exists public.t2_loyiha_tahrir_yoz_v1(bigint,bigint,bigint,bigint,text,integer,bigint,jsonb,uuid);
drop function if exists public.t2_loyiha_tahrir_yarat_v1(bigint,bigint,bigint,text,date);
drop function if exists public._t2_lm_tahrir_qaror_ich(bigint,bigint,bigint,bigint,text,text,text,text,bigint);
drop function if exists public._t2_lm_tahrir_farq_ich(bigint,bigint,bigint,bigint);
drop function if exists public._t2_lm_tahrir_royxat_ich(bigint,bigint);
drop function if exists public._t2_lm_tahrir_asos_ich(bigint,bigint,bigint);
drop function if exists public._t2_lm_tahrir_yoz_ich(bigint,bigint,bigint,text,integer,bigint,jsonb,bigint,uuid);
drop function if exists public._t2_lm_tahrir_yarat_ich(bigint,bigint,text,date,bigint);
drop table if exists public.t2_loyiha_tahrir_qaror;
drop index if exists public.t2_loyiha_miqdor_tahrir_idx;
alter table public.t2_loyiha_miqdor drop column if exists tahrir_id;
drop table if exists public.t2_loyiha_tahrir;
