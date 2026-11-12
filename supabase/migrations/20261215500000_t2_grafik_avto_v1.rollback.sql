-- Rollback 20261215500000: P6/P7 grafik qatlami. t2_grafik_qator (qo'lda grafik) tegilmaydi.
update public.t2_tomon_resurs set faol = false, izoh = 'Keyingi bosqich' where kalit = 'grafik';
drop function if exists public.t2_grafik_sozlama_saqla_v1(bigint, bigint, bigint, bigint, integer, numeric, date, integer, integer, boolean);
drop function if exists public.t2_tomon_grafik_v1(bigint, bigint, bigint, bigint);
drop function if exists public.t2_grafik_reja_v1(bigint, bigint, bigint);
drop function if exists public._t2_grafik_json_v1(bigint);
drop table if exists public.t2_grafik_sozlama;
