-- Rollback: 20261112400000_t2_sverka_import_v1. Ma'lumot yo'qotiladi: t2_tolov_taqsimot, t2_f2_reestr_jami (jadvallar) va
-- t2_tolov.hujjat_raqam/manba ustunlari. Import qilingan t2_tolov / t2_forma3 (manba='sotuv') qatorlari va t2_forma3_akt bog'lari
-- O'CHIRILMAYDI (oddiy ma'lumot sifatida qoladi).
begin;
drop function if exists public.t2_sverka_moslash_v1(bigint, bigint);
drop function if exists public.t2_forma3_f2_bog_v1(bigint, bigint, bigint, bigint[], bigint[], uuid);
drop function if exists public.t2_tolov_taqsimot_saqla_v1(bigint, bigint, bigint, jsonb, uuid);
drop function if exists public.t2_f2_reestr_yoz_v1(bigint, bigint, jsonb, uuid);
drop function if exists public.t2_sverka_import_v1(bigint, bigint, jsonb, uuid);
drop function if exists public._t2_forma3_f2_bog(bigint, bigint, bigint[], bigint[]);
drop function if exists public._t2_tolov_taqsimot_yoz(bigint, bigint, jsonb, text);
drop function if exists public._t2_akt_shartnoma_f2mi(bigint, bigint, bigint);
drop table if exists public.t2_f2_reestr_jami;
drop table if exists public.t2_tolov_taqsimot;
drop index if exists public.t2_tolov_sverka_takror_uq;
alter table public.t2_tolov drop constraint if exists t2_tolov_manba_check;
alter table public.t2_tolov drop column if exists manba;
alter table public.t2_tolov drop column if exists hujjat_raqam;
commit;
