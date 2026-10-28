-- Rollback: 20261114000000_t2_tizim_xaritasi_v1 — tizim xaritasi o'qish RPC si va ko'rish ruxsatlari.
-- Faqat shu migratsiya yaratgan obyektlar o'chiriladi. ⚠️ t2_tizim_xaritasi_ruxsat jadvalidagi berilgan ruxsatlar ham
-- o'chadi (audit jurnalidagi ber/ol yozuvlari saqlanadi) — qayta qo'llansa, ruxsatlar qaytadan beriladi.
begin;
drop function if exists public.t2_tizim_xaritasi_v1(bigint, bigint);
drop function if exists public._t2_tizim_kim_nom(text);
drop function if exists public.t2_tizim_xaritasi_ruxsat_ol_v1(bigint, bigint, text, uuid);
drop function if exists public.t2_tizim_xaritasi_ruxsat_ber_v1(bigint, bigint, text, uuid);
drop function if exists public.t2_tizim_xaritasi_ruxsat_royxat_v1(bigint);
drop function if exists public.t2_tizim_xaritasi_ruxsat_tekshir_v1(bigint);
drop function if exists public._t2_tizim_xaritasi_ruxsatmi(bigint);
drop table if exists public.t2_tizim_xaritasi_ruxsat;
commit;
