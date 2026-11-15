-- rollback T2-QULF-V1 (begin/commit yo'q -- tashqi tranzaksiya)
drop function if exists public.t2_qulf_talab_v1(bigint, bigint);
drop function if exists public.t2_qulf_chaqiriq_ishlat_v1(text, bigint, timestamptz);
drop function if exists public.t2_qulf_urinish_v1(bigint, boolean);
drop table if exists public.t2_qulf_chaqiriq_ishlatilgan;
drop table if exists public.t2_qulf_siyosat;
drop table if exists public.t2_qulf_kalit;
drop table if exists public.t2_qulf_foydalanuvchi;