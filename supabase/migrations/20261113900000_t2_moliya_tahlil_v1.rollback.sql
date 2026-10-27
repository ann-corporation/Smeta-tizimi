-- Rollback: 20261113900000 (t2_moliya_tahlil_v1). DIQQAT: t2_moliya_qolda dagi qo'lda kiritilgan qiymatlar yo'qoladi —
-- rollbackdan oldin nusxa oling: create table t2_moliya_qolda_bak_20261113900000 as table public.t2_moliya_qolda;
begin;
drop function if exists public.t2_moliya_tahlil_v1(bigint, bigint, bigint);
drop function if exists public.t2_moliya_qolda_yoz_v1(bigint, bigint, bigint, text, numeric, date, text, uuid);
drop table if exists public.t2_moliya_qolda;
commit;
