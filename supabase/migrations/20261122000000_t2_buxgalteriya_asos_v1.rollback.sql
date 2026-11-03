-- ROLLBACK: 20261122000000_t2_buxgalteriya_asos_v1. Avval 20261122000100 (RPC) rollback qilinadi.
-- DIQQAT: jurnal (t2_bux_provodka) va reja jadvallari O'CHIRILADI - kerak bo'lsa avval eksport qiling. Hujjat jadvallari (t2_tolov, t2_forma3 ...) tegilmaydi.
begin;

drop function if exists public._t2_bux_moslik_seed(bigint);
drop function if exists public._t2_bux_hisob_seed(bigint);

-- jurnalni o'chirish uchun o'zgarmaslik triggeri vaqtincha olinadi
drop trigger if exists t2_bux_provodka_ozgarmas_trg on public.t2_bux_provodka;
drop table if exists public.t2_bux_provodka;
drop function if exists public._t2_bux_provodka_ozgarmas();
drop table if exists public.t2_bux_davr;
drop table if exists public.t2_bux_moslik;
drop table if exists public.t2_bux_hisob;

-- bank importi bilan yozilgan to'lovlar eski qiymatga qaytariladi (to'lov o'zi saqlanadi)
update public.t2_tolov set manba = 'qolda' where manba = 'bank_import';
alter table public.t2_tolov drop constraint if exists t2_tolov_manba_check;
alter table public.t2_tolov add constraint t2_tolov_manba_check check (manba is null or manba in ('qolda', 'sverka_1c'));
comment on column public.t2_tolov.manba is 'qolda — qo''lda kiritilgan; sverka_1c — 1C akt-sverka importi.';

commit;
