-- Rollback: T2-NAKRUTKA-PODVAL-001. ⚠️ Maxsus podvallar va ularning tarixi yo'qoladi — avval eksport qiling.
begin;
drop function if exists public.t2_nakrutka_podval_ochir_v1(bigint, bigint, integer, text);
drop function if exists public.t2_nakrutka_podval_saqla_v1(bigint, bigint, bigint, text, jsonb, bigint, integer, uuid, text);
drop view if exists public.t2_nakrutka_podval_royxat;
drop table if exists public.t2_nakrutka_podval_tarix;
drop table if exists public.t2_nakrutka_podval;
commit;
