-- Rollback T2-MODUL-TANLOV-V1 (faqat shu migratsiya obyektlari).
begin;
drop function if exists public.t2_modul_tanlov_yoz_v1(bigint,bigint,text[],text[],integer);
drop function if exists public.t2_modul_tanlov_oqi_v1(bigint,bigint);
drop table if exists public.t2_foydalanuvchi_modul_tanlov;
commit;
