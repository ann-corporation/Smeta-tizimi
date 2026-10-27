-- Rollback: 20261111400000_t2_kompaniya_sozlama_v1
-- Saqlangan sozlamalar (imzo tomonlari, hujjat dizayni) o'chadi; frontend brauzer nusxasiga qaytadi.
-- t2_kompaniya.f2_tasdiq_rejimi ustuni va qiymati o'zgarmaydi (u 20261106670000 migratsiyasiga tegishli).
begin;
drop function if exists public.t2_kompaniya_sozlama_saqla_v1(bigint, bigint, text, jsonb, uuid);
drop function if exists public.t2_kompaniya_sozlama_ol_v1(bigint, bigint);
drop table if exists public.t2_kompaniya_sozlama;
commit;
