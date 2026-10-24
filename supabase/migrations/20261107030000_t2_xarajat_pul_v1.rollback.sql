-- Rollback: 20261107030000 — faqat xarajat qatori yo'q (yoki yangi ustunlar bo'sh) bo'lsa xavfsiz: ustunlar ma'lumot bilan birga o'chadi.
begin;
drop function if exists public.t2_pul_tahlil_v2(bigint, bigint, bigint, bigint, date, date, text, text);
drop function if exists public.t2_xarajat_royxat_v1(bigint, bigint, bigint, bigint, date, date, text);
drop function if exists public.t2_xarajat_bekor_v1(bigint, bigint, bigint, integer);
drop function if exists public.t2_xarajat_kirit_v1(bigint, bigint, bigint, bigint, date, text, numeric, text, text, uuid);
drop index if exists public.ix_t2_xarajat_shartnoma;
drop index if exists public.ix_t2_xarajat_obyekt;
alter table public.t2_xarajat drop constraint if exists t2_xarajat_manba_chk;
alter table public.t2_xarajat drop constraint if exists t2_xarajat_kat_chk;
alter table public.t2_xarajat drop column if exists hujjat_ref, drop column if exists manba, drop column if exists kat, drop column if exists shartnoma_id, drop column if exists obyekt_id;
commit;