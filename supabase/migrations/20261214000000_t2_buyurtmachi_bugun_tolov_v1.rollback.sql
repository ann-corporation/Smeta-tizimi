-- Rollback: 20261214000000_t2_buyurtmachi_bugun_tolov_v1
-- Tasdiqlangan xabarlardan yaratilgan t2_tolov qatorlari (manba='zakazchik_xabar') avval qo'lda ko'rib chiqiladi: ular haqiqiy to'lov yozuvi.
begin;
drop function if exists public.t2_zakazchik_tolov_bekor_v1(bigint, bigint, bigint);
drop function if exists public.t2_tomon_tolov_qaror_v1(bigint, bigint, bigint, text, text);
drop function if exists public.t2_tomon_tolov_royxat_v1(bigint, bigint, text, text, integer);
drop function if exists public.t2_zakazchik_tolov_yoz_v1(bigint, bigint, bigint, bigint, numeric, date, text, text, uuid);
drop function if exists public.t2_zakazchik_bugun_v1(bigint, bigint);
drop function if exists public._t2_zakazchik_paket_v1(bigint, bigint, bigint, text, text);
drop table if exists public.t2_tomon_tolov;
update public.t2_tomon_resurs set faol = false where kalit in ('fakt', 'tolov_holati');
-- t2_tolov.manba cheklovi: zakazchik_xabar qatori bo'lmasa eski ro'yxatga qaytariladi
do $$
begin
  if not exists (select 1 from public.t2_tolov where manba = 'zakazchik_xabar') then
    alter table public.t2_tolov drop constraint if exists t2_tolov_manba_check;
    alter table public.t2_tolov add constraint t2_tolov_manba_check check (manba is null or manba in ('qolda', 'sverka_1c', 'bank_import'));
  end if;
end $$;
commit;
