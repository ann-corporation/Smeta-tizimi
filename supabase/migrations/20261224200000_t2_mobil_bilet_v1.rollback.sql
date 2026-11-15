-- rollback T2-MOBIL-BILET-V1
begin;
drop function if exists public.t2_mobil_bilet_ishlat_v1(text, bigint, timestamptz);
drop table if exists public.t2_mobil_bilet_ishlatilgan;
commit;
