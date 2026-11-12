-- ROLLBACK 20261214500000_t2_lab_sinov_sorov_v1: sinov so'rovi qatlami olib tashlanadi.
-- DIQQAT: t2_lab_sinov_sorov dagi so'rov tafsilotlari yo'qoladi; t2_tomon_murojaat, t2_lab_protokol, t2_qarz_asos yozuvlari QOLADI (ular mustaqil hujjatlar).
begin;
drop trigger if exists t2_lab_aosr_qorovul on public.t2_tomon_taqdim;
drop function if exists public._t2_lab_aosr_qorovul();
drop function if exists public.t2_lab_sorov_aosr_holat_v1(bigint, bigint, bigint);
drop function if exists public.t2_lab_sorov_natija_v1(bigint, bigint, bigint, integer, jsonb, bigint[]);
drop function if exists public.t2_lab_sorov_tafsilot_v1(bigint, bigint, bigint);
drop function if exists public.t2_lab_sorov_royxat_v1(bigint, bigint, text, text, bigint, bigint, integer);
drop function if exists public.t2_lab_sorov_yarat_v1(bigint, bigint, bigint, text, bigint, bigint, bigint, text, text, integer, date, text, boolean, bigint, uuid);
drop function if exists public.t2_lab_sinov_turlari_v1(bigint, bigint);
drop function if exists public._t2_lab_aosr_holat(bigint);
drop function if exists public._t2_lab_maydon_tekshir(text, jsonb);
drop function if exists public._t2_lab_azo(bigint, bigint, text);
drop function if exists public._t2_lab_rol_ok(text, text);
drop table if exists public.t2_lab_sinov_sorov;
drop table if exists public.t2_lab_sinov_turi;
commit;
