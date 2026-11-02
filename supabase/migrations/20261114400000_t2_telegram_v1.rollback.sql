-- T2-TELEGRAM-V1 rollback: RPC lar va jadvallar olib tashlanadi (bog'lanishlar tarixi yo'qoladi — ataylab;
-- t2_audit_log dagi telegram_ulandi/telegram_uzildi yozuvlari QOLADI). Mavjud jadvallar/funksiyalar o'zgartirilmagan edi.
begin;
drop function if exists public.t2_telegram_statistika_v1(bigint);
drop function if exists public.t2_telegram_update_qabul_v1(bigint,bigint);
drop function if exists public.t2_telegram_manzil_v1(bigint,text);
drop function if exists public.t2_telegram_sozlama_v1(bigint,jsonb);
drop function if exists public.t2_telegram_holat_v1(bigint);
drop function if exists public.t2_telegram_kirish_v1(bigint,uuid);
drop function if exists public.t2_telegram_aniqla_v1(bigint);
drop function if exists public.t2_telegram_uz_v1(bigint,bigint,text,uuid);
drop function if exists public.t2_telegram_ulash_v1(text,bigint,bigint,text,uuid);
drop function if exists public.t2_telegram_kod_yarat_v1(bigint,text);
drop function if exists public._t2_telegram_audit(bigint,text,text);
drop table if exists public.t2_telegram_hodisa;
drop table if exists public.t2_telegram_update;
drop table if exists public.t2_telegram_ulash_kod;
drop table if exists public.t2_telegram_ulanish;
commit;
