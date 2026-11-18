-- T2-MAT-JOY-QAYTAR-001 - egasi qarori (2026-11-18): F-2 hujjati smetadagi tartibni AYNAN takrorlaydi; mat -> BL qo'lda biriktirish bekor.
-- 20270113500000 dagi jadval va RPC lar olib tashlanadi (hech qaysi ekran/API ularni ishlatmaydi; asl smeta qatorlariga tegilmaydi).
drop function if exists public.t2_qator_joy_qoy_v1(bigint, bigint, bigint, bigint, bigint, boolean);
drop function if exists public.t2_qator_joy_ol_v1(bigint, bigint, bigint);
drop table if exists public.t2_qator_joy_bog;
