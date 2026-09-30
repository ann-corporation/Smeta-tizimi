-- Rollback: T2-NARX-DALIL-001. ⚠️ Narx manbalari, ularning pozitsiyalari va dalillar yo'qoladi — avval eksport qiling.
begin;
drop function if exists public.t2_narx_dalil_ochir_v1(bigint, bigint, bigint[], text);
drop function if exists public.t2_narx_dalil_bogla_v1(bigint, bigint, jsonb, text);
drop function if exists public.t2_narx_manba_bekor_v1(bigint, bigint, integer, text);
drop function if exists public.t2_narx_manba_yoz_v1(bigint, jsonb, jsonb, text, bigint, integer, uuid, text);
drop view if exists public.t2_narx_dalil_holat;
drop view if exists public.t2_narx_taklif;
drop view if exists public.t2_narx_manba_royxat;
drop table if exists public.t2_narx_dalil;
drop table if exists public.t2_narx_manba_qator;
drop table if exists public.t2_narx_manba;
commit;
