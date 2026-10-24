-- Rollback: 20261106880000 — qoplama jadval va RPC lar olib tashlanadi (asl smeta qatorlari hech qachon o'zgarmagan).
begin;
drop function if exists public.t2_bajarilmadi_royxat_v1(bigint, bigint, bigint);
drop function if exists public.t2_bajarilmadi_bekor_v1(bigint, bigint, bigint, text, uuid);
drop function if exists public.t2_bajarilmadi_belgila_v1(bigint, bigint, bigint, jsonb, text, text, bigint, date, bigint, uuid);
drop table if exists public.t2_qator_bajarilmadi;
commit;
