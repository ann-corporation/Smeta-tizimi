-- 20261203001000 rollback — faqat o'qish funksiyasi olib tashlanadi (ma'lumotga tegmaydi; boshqa obyektlar unga bog'liq emas).
begin;
drop function if exists public.t2_f2_versiya_kochirma_v1(bigint, bigint);
commit;
