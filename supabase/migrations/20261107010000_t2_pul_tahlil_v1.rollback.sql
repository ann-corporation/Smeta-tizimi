-- Rollback: 20261107010000 — t2_pul_tahlil_v1 olib tashlanadi (jadval o'zgarmagan edi, read-only).
begin;
drop function if exists public.t2_pul_tahlil_v1(bigint, bigint, bigint, bigint, date, date, text);
commit;