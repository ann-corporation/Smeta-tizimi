-- 20261122000000: Supabase security advisor (function_search_path_mutable) - 3 ichki yordamchi funksiyaga qat'iy search_path.
-- Manba: 20261108410000_t2_buyurtma_p3_v1. Funksiya tanasi o'zgarmaydi, faqat SET search_path.
begin;
alter function public._t2_buyurtma_bosqich_holat(text) set search_path = public, pg_temp;
alter function public._t2_buyurtma_otish_ruxsat(text,text,text) set search_path = public, pg_temp;
alter function public._t2_yet_qator_xato(jsonb) set search_path = public, pg_temp;
commit;
