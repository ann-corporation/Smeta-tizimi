-- Rollback 20261106710000: trigger va funksiya olib tashlanadi. Yangi F2 larga avtomatik qo'yilgan shartnoma_id
-- O'CHIRILMAYDI (to'g'ri bog'lanish; jim ma'lumot yo'qotish yo'q).
begin;
drop trigger if exists t2_akt_shartnoma_scope on public.t2_akt;
drop function if exists public.t2_akt_shartnoma_scope_v1();
commit;
