-- Rollback: T2-F2-IMPORT-QORALAMA-YANGILA. Funksiya yangi; o'chirish boshqa obyektlarga ta'sir qilmaydi.
begin;
drop function if exists public.t2_f2_qoralama_yangila_v1(bigint, bigint, bigint, integer, jsonb, uuid, text);
commit;
