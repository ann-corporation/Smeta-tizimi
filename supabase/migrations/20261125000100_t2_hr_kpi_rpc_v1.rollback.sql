-- ROLLBACK 20261125000100_t2_hr_kpi_rpc_v1: HR+KPI RPC lari olib tashlanadi (jadvallar 20261125000000 rollback da).
begin;
drop function if exists public.t2_hr_oylik_hisobla_v1(bigint, bigint, text, text, jsonb, uuid);
drop function if exists public.t2_hr_tuzatma_qaror_v1(bigint, bigint, bigint, text, text, integer, uuid);
drop function if exists public.t2_hr_tuzatma_saqla_v1(bigint, bigint, jsonb, integer, uuid);
drop function if exists public.t2_hr_tabel_saqla_v1(bigint, bigint, text, jsonb, uuid);
drop function if exists public.t2_hr_kalendar_saqla_v1(bigint, bigint, jsonb, jsonb, uuid);
drop function if exists public.t2_hr_sxema_saqla_v1(bigint, bigint, jsonb, jsonb, uuid);
drop function if exists public.t2_hr_xodim_saqla_v1(bigint, bigint, bigint, jsonb, jsonb, jsonb, integer, uuid);
drop function if exists public.t2_hr_oylik_buxgalteriya_v1(bigint, bigint, text);
drop function if exists public.t2_hr_kpi_v1(bigint, bigint, text);
drop function if exists public.t2_hr_oy_v1(bigint, bigint, text);
drop function if exists public.t2_hr_xodimlar_v1(bigint, bigint);
drop function if exists public._t2_hr_hisob_v1(bigint, date, bigint[]);
drop function if exists public._t2_hr_kunlar_v1(bigint, date);
drop function if exists public._t2_hr_log_v1(uuid, bigint, text, jsonb);
drop function if exists public._t2_hr_oy_v1(text);
drop function if exists public._t2_hr_ruxsat_v1(bigint, bigint, text[]);
commit;
