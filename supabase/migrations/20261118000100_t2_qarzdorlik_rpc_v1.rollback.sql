-- ROLLBACK 20261118000100_t2_qarzdorlik_rpc_v1: qarzdorlik RPC lari olib tashlanadi (jadval/ustunlar 20261118000000 rollback da).
begin;
drop function if exists public.t2_qarzdorlik_royxat_v1(bigint, bigint);
drop function if exists public.t2_qarzdorlik_saqla_v1(bigint, bigint, bigint, integer, jsonb, jsonb, jsonb, uuid);
drop function if exists public.t2_qarzdorlik_import_v1(bigint, bigint, jsonb, bigint, uuid);
commit;
