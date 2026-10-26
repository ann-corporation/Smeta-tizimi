-- Rollback: 20261111100000 — smeta versiyasi / farq / da'vo. Faqat shu migratsiya yaratgan obyektlar o'chiriladi;
-- t2_qator, t2_smeta_revision, t2_smeta_ozgarish tegilmagan (migratsiya ularni o'zgartirmagan).
-- DIQQAT: yuklangan versiyalar va egasi qarorlari ham o'chadi — kerak bo'lsa avval eksport qiling.
begin;
drop view if exists public.t2_smeta_versiya_dava;
drop function if exists public.t2_smeta_versiya_bekor_v1(bigint, bigint, bigint, text, uuid);
drop function if exists public.t2_smeta_versiya_qaror_v1(bigint, bigint, bigint, jsonb, uuid);
drop function if exists public.t2_smeta_versiya_moslik_yoz_v1(bigint, bigint, bigint, jsonb, boolean, uuid);
drop function if exists public.t2_smeta_versiya_pozitsiya_yoz_v1(bigint, bigint, bigint, jsonb, uuid);
drop function if exists public.t2_smeta_versiya_yarat_v1(bigint, bigint, bigint, text, text, date, jsonb, text, uuid);
drop function if exists public.t2_smeta_versiya_dava_hajm(text, text, numeric, numeric, numeric, boolean);
drop table if exists public.t2_smeta_versiya_moslik;
drop table if exists public.t2_smeta_versiya_pozitsiya;
drop table if exists public.t2_smeta_versiya;
commit;
