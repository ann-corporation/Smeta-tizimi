-- Rollback 20261203000800_t2_narx_internet_kesh_v1: kesh va domen sozlamasi olib tashlanadi.
-- Biznes ma'lumotiga ta'sir yo'q (smeta narxi, reestr va dalil mavjud jadvallarda qoladi). Server funksiyalar bo'lmasa
-- standart domen ro'yxati bilan va keshsiz ishlaydi (har qidiruv qayta hisoblanadi).
begin;
drop function if exists public.t2_narx_internet_domen_yoz_v1(bigint, bigint, text[]);
drop function if exists public.t2_narx_internet_domen_ol_v1(bigint, bigint);
drop function if exists public.t2_narx_internet_kesh_yoz_v1(bigint, bigint, jsonb);
drop function if exists public.t2_narx_internet_kesh_ol_v1(bigint, bigint, text[]);
drop table if exists public.t2_narx_internet_sozlama;
drop table if exists public.t2_narx_internet_kesh;
commit;
