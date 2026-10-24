-- Rollback: 20261107200000 (t2_qarz_svod_v1). Faqat o'qish funksiyasi - ma'lumot yo'qolmaydi.
begin;
drop function if exists public.t2_qarz_svod_v1(bigint, bigint);
commit;