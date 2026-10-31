-- Faqat D2 yangi funksiyalarini olib tashlaydi; mavjud paket/biznes ma'lumoti saqlanadi.
begin;
drop function if exists public.t2_obyekt_paket_etag_v1(bigint,bigint);
drop function if exists public.t2_obyekt_paket_muhr_v1(bigint,bigint);
commit;
