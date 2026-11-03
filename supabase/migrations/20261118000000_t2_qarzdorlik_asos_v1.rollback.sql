-- ROLLBACK 20261118000000_t2_qarzdorlik_asos_v1: asos jadvali va spravka ustunlari olib tashlanadi.
-- OGOHLANTIRISH: t2_qarz_asos dagi kiritilgan ma'lumot yo'qoladi (avval eksport qiling).
-- Avval 20261118000100 rollback ni bajaring (RPC lar shu jadvalga tayanadi).
begin;
drop table if exists public.t2_qarz_asos;
alter table public.t2_shartnoma drop column if exists spravka_sana;
alter table public.t2_shartnoma drop column if exists spravka_prognoz;
alter table public.t2_shartnoma drop column if exists spravka_qarz;
alter table public.t2_shartnoma drop column if exists spravka_tolangan;
alter table public.t2_shartnoma drop column if exists predmet;
alter table public.t2_shartnoma drop column if exists sana;
commit;
