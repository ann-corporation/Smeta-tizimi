-- Rollback: rahbar read-modellari (yangi funksiyalar, boshqa hech narsaga ta'sir qilmaydi).
begin;
drop function if exists public.t2_boss_decision_v1(bigint,bigint);
drop function if exists public.t2_boss_documents_v1(bigint,bigint,bigint,bigint,boolean,bigint,integer);
commit;
