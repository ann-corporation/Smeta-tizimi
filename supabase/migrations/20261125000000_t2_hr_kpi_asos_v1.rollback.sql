-- ROLLBACK 20261125000000_t2_hr_kpi_asos_v1: HR+KPI jadvallari va t2_kadr_bog kengaytmasi olib tashlanadi.
-- DIQQAT: tabel, jarima, oylik yozuvlari yo'qoladi - kerak bo'lsa avval eksport qiling.
begin;
drop table if exists public.t2_hr_oylik;
drop table if exists public.t2_hr_tuzatma;
drop table if exists public.t2_hr_tabel;
drop table if exists public.t2_hr_tatil;
drop table if exists public.t2_hr_kalendar;
drop table if exists public.t2_hr_xodim_pii;
drop table if exists public.t2_hr_xodim;
drop table if exists public.t2_hr_sozlama;
drop table if exists public.t2_hr_sxema;
alter table public.t2_kadr_bog drop column if exists gacha;
alter table public.t2_kadr_bog drop column if exists dan;
alter table public.t2_kadr_bog drop column if exists rol;
alter table public.t2_kadr_bog drop column if exists ulush_foiz;
commit;
