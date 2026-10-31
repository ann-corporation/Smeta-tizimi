-- 20261117000000 rollback — faqat o'qish funksiyasi olib tashlanadi (ma'lumotga tegmaydi).
begin;
drop function if exists public.t2_f2_versiya_kochirma_v1(bigint, bigint);
commit;
