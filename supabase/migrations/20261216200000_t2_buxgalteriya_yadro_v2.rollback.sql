-- ROLLBACK: 20261216200000_t2_buxgalteriya_yadro_v2.
-- Yangi funksiyalar/trigger/jadvallar/ustun o'chiriladi. V1 funksiyalari (_t2_bux_sync, _t2_bux_hujjat_nomi, _t2_bux_hisob_seed, _t2_bux_moslik_seed,
-- t2_bux_avto_provodka_v1, t2_bux_davr_v1) bu migratsiyada create-or-replace qilingan: ularni tiklash uchun
-- 20261126500000 (seed funksiyalari) va 20261126500100 (RPC) fayllaridagi `create or replace function` bloklarini qayta ishga tushiring (idempotent).
-- Jurnal (t2_bux_provodka) ma'lumoti tegilmaydi; t2_bux_sozlama / t2_bux_shablon ma'lumoti O'CHIRILADI.
begin;

drop trigger if exists t2_bux_provodka_davr_blok_trg on public.t2_bux_provodka;
drop function if exists public._t2_bux_davr_blok_trg();
drop function if exists public.t2_bux_hisob_tasdiq_v1(bigint, bigint, text[], uuid);
drop function if exists public.t2_bux_davr_blok_v1(bigint, bigint, boolean, uuid);
drop function if exists public.t2_bux_shablon_tanla_v1(bigint, bigint, text, uuid);
drop function if exists public.t2_bux_kartochka_v1(bigint, bigint, date, date, bigint, bigint, text, integer);
drop function if exists public.t2_bux_sozlama_v1(bigint, bigint);
drop function if exists public._t2_bux_kerak_v2(bigint);
drop table if exists public.t2_bux_shablon;
drop table if exists public.t2_bux_sozlama;
alter table public.t2_bux_hisob drop column if exists tekshirilsin;

commit;
