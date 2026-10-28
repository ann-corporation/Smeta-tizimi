-- Rollback: C11 ro'yxat RPC ni asl (VOLATILE) holatiga qaytaradi. Ma'lumotga tegmaydi.
BEGIN;
ALTER FUNCTION public.t2_sklad_kirim_royxat_v1(bigint,bigint,bigint,jsonb,integer,integer) VOLATILE;
COMMIT;
