-- ROLLBACK 20261216100000_t2_hr_men_kpi_v1: yangi RPC lar, KPI qoida jadvali va kpi_pulga_tasir ustuni olib tashlanadi; hisob eski (asos) funksiyaga qaytadi.
-- t2_naryad.usta_foydalanuvchi_id USTUNI QOLADI (naryad PR ga tegishli, boshqa kod ishlatadi).
begin;
drop function if exists public.t2_hr_kpi_qoida_saqla_v1(bigint, bigint, jsonb, boolean, uuid);
drop function if exists public.t2_hr_qoida_v1(bigint, bigint);
drop function if exists public.t2_hr_men_v1(bigint, bigint, text);
drop function if exists public._t2_hr_hisob_v1(bigint, date, bigint[]);
do $rename$
begin
  if to_regprocedure('public._t2_hr_hisob_asos_v1(bigint, date, bigint[])') is not null then
    alter function public._t2_hr_hisob_asos_v1(bigint, date, bigint[]) rename to _t2_hr_hisob_v1;
  end if;
end $rename$;
drop function if exists public._t2_hr_kpi_hisob_v1(bigint, date, jsonb);
drop function if exists public._t2_hr_naryad_oy_v1(bigint, date);
drop function if exists public._t2_hr_kpi_qoida_v1(bigint);
drop function if exists public._t2_hr_naryad_bor_v1();
drop table if exists public.t2_hr_kpi_qoida;
alter table public.t2_hr_sozlama drop column if exists kpi_pulga_tasir;
-- yangi qiymatlar ishlatilgan bo'lsa, eski cheklovga moslab qaytariladi
update public.t2_hr_xodim set rol = 'boshqa' where rol = 'pto';
update public.t2_hr_xodim set baza_turi = 'oylik', baza_summa = null where baza_turi = 'donabay';
alter table public.t2_hr_xodim drop constraint if exists t2_hr_xodim_baza_turi_check;
alter table public.t2_hr_xodim add constraint t2_hr_xodim_baza_turi_check check (baza_turi in ('oylik', 'kunlik'));
alter table public.t2_hr_xodim drop constraint if exists t2_hr_xodim_rol_check;
alter table public.t2_hr_xodim add constraint t2_hr_xodim_rol_check check (rol in ('prorab', 'brigadir', 'usta', 'ishchi', 'muhandis', 'boshqa'));
commit;
