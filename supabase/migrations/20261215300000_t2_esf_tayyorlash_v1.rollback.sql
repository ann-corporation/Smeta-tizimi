-- rollback 20261215300000_t2_esf_tayyorlash_v1
-- Diqqat: ustunlarni o'chirish kiritilgan ESF ID/holat ma'lumotini yo'qotadi.
drop function if exists public.t2_forma3_shartnoma_royxat_v1(bigint,bigint);
drop function if exists public.t2_forma3_esf_holat_v1(bigint,bigint,text,text);
drop function if exists public.t2_shartnoma_esf_id_v1(bigint,bigint,text,text,text,text);
alter table public.t2_forma3 drop constraint if exists t2_forma3_esf_holat_chk;
alter table public.t2_forma3 drop column if exists esf_holat, drop column if exists esf_tashqi_id, drop column if exists esf_yangilandi;
alter table public.t2_shartnoma drop constraint if exists t2_shartnoma_esf_id_turi_chk;
alter table public.t2_shartnoma drop column if exists esf_id_turi, drop column if exists my3_shartnoma_id,
  drop column if exists kapital_imv_id, drop column if exists kadastr_raqam;
