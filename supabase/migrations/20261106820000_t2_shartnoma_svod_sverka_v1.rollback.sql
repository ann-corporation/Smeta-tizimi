-- Rollback: 20261106820000 (nakopitelniy shartnoma svodi). Faqat shu migratsiya qo'shgan narsalar olib tashlanadi.
-- DIQQAT: DS yozuvlari va sotuvdan yaratilgan F3 (t2_forma3.manba='sotuv') yo'qoladi — rollback dan oldin eksport qiling.
-- F2 asosidagi F3 (manba='f2'), t2_shartnoma, t2_akt, t2_tolov o'zgarmaydi.
begin;
drop function if exists public.t2_sverka_yozuv_v1(bigint, bigint, bigint, text, bigint, integer, jsonb, uuid);
drop function if exists public.t2_shartnoma_svod_v1(bigint, bigint);
delete from public.t2_forma3 where manba = 'sotuv';
drop index if exists public.t2_forma3_sotuv_takror_uq;
drop index if exists public.t2_forma3_shartnoma_idx;
alter table public.t2_forma3 drop constraint if exists t2_forma3_sotuv_check;
alter table public.t2_forma3 drop constraint if exists t2_forma3_manba_check;
alter table public.t2_forma3 drop column if exists nds_foiz;
alter table public.t2_forma3 drop column if exists sotuv_sana;
alter table public.t2_forma3 drop column if exists sotuv_summa;
alter table public.t2_forma3 drop column if exists manba;
drop table if exists public.t2_shartnoma_ds;
commit;
