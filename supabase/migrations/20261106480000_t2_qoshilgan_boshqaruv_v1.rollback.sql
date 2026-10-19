-- ROLLBACK for 20261106480000_t2_qoshilgan_boshqaruv_v1.sql — faqat yangi funksiyalar olib tashlanadi.
-- Ular yaratgan qatorlar oddiy qo'shilgan qatorlar (t2_ish_abc_ochir_v1 bilan o'chiriladi); ma'lumot o'chirilmaydi.
begin;
drop function if exists public.t2_resurs_ish_zamena_v1(bigint, bigint, bigint, bigint, jsonb, text, uuid, bigint);
drop function if exists public.t2_qoshilgan_kochir_v1(bigint, bigint, bigint, bigint, bigint, bigint, uuid);
commit;
