-- Rollback: 20261106100000_t2_smeta_studio_qoralama_v1.sql
-- Faqat studiya qoralamalari o'chadi (tasdiqlangan smeta/Fakt/F2 ga bog'liq emas). Avval nusxa oling:
--   create table public.t2_smeta_studio_qoralama_zaxira as select * from public.t2_smeta_studio_qoralama;
begin;
drop function if exists public.t2_smeta_studio_ol_v1(bigint, bigint, uuid);
drop function if exists public.t2_smeta_studio_royxat_v1(bigint, bigint);
drop function if exists public.t2_smeta_studio_saqla_v1(bigint, bigint, bigint, uuid, integer, jsonb, uuid);
drop table if exists public.t2_smeta_studio_qoralama;
commit;
