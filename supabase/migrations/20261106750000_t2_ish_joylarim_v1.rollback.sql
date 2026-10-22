-- Rollback 20261106750000: o'qish funksiyasi va indeks olib tashlanadi (ma'lumot o'zgarmagan).
begin;
drop function if exists public.t2_ish_joylarim_v1(bigint);
drop index if exists public.t2_akt_komp_tur_lc_idx;
commit;
