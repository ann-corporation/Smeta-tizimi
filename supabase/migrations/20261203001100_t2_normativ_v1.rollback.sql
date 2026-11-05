-- L0 only. Never drop normative records/source references after use.
do $$ begin
 if to_regclass('public.t2_normativ_hujjat') is not null then
   if exists(select 1 from public.t2_normativ_hujjat) then raise exception 'NORMATIV_ROLLBACK_NONEMPTY'; end if;
 end if;
 if to_regclass('public.t2_normativ_bolak') is not null then
   if exists(select 1 from public.t2_normativ_bolak) then raise exception 'NORMATIV_ROLLBACK_NONEMPTY'; end if;
 end if;
end $$;
drop function if exists public.t2_normativ_oqi_v1(bigint,bigint,uuid);
drop function if exists public.t2_normativ_holat_v1(bigint,uuid,text,integer,uuid,text);
drop function if exists public.t2_normativ_hujjat_qosh_v1(bigint,uuid,jsonb,jsonb);
drop function if exists public.t2_normativ_ruxsat_v1(bigint,bigint,boolean);
drop table if exists public.t2_normativ_bolak;
drop table if exists public.t2_normativ_hujjat;
-- Shared extensions are intentionally retained.
