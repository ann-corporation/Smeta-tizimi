-- Rollback 20261106760000: funksiyalar olib tashlanadi. Jadvallar (profillar, takliflar) va ochiq_profil ustuni O'CHIRILMAYDI —
-- foydalanuvchi kiritgan ma'lumot saqlanadi. Qabul qilingan takliflardan paydo bo'lgan a'zoliklar ham oddiy a'zolik sifatida qoladi.
begin;
drop function if exists public.t2_mutaxassis_profil_ol_v1(bigint);
drop function if exists public.t2_mutaxassis_profil_saqla_v1(bigint, boolean, text, text, int, text[], text, boolean);
drop function if exists public.t2_mutaxassislar_qidir_v1(bigint, bigint, text, text);
drop function if exists public.t2_xizmat_kompaniya_qidir_v1(bigint, text);
drop function if exists public.t2_xizmat_taklif_yubor_v1(bigint, bigint, text, text);
drop function if exists public.t2_xizmat_takliflarim_v1(bigint);
drop function if exists public.t2_xizmat_taklif_bekor_v1(bigint, bigint);
drop function if exists public.t2_xizmat_takliflar_kelgan_v1(bigint, bigint);
drop function if exists public.t2_xizmat_taklif_javob_v1(bigint, bigint, bigint, boolean, text);
drop function if exists public.t2_kompaniya_ochiq_profil_v1(bigint, bigint, boolean);
drop function if exists public._t2_mutaxassis_karta(bigint, boolean);
drop function if exists public._t2_mutaxassis_statistika(bigint);
commit;
