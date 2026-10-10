-- Pre-use rollback only: does not alter business prices or the v1 function.
begin;
drop function if exists public.t2_smeta_narxla_res_v2(bigint, bigint, bigint, uuid, jsonb);
commit;
