-- ROLLBACK t2_tomon_murojaat_v1 (barcha murojaatlar va dalil biriktirishlari O'CHADI).
drop function if exists public.t2_tomon_murojaat_turlari_v1(bigint, bigint);
drop function if exists public.t2_tomon_murojaat_tafsilot_v1(bigint, bigint, bigint);
drop function if exists public.t2_tomon_murojaat_royxat_v1(bigint, bigint, text, text, bigint, integer);
drop function if exists public.t2_tomon_murojaat_bekor_v1(bigint, bigint, bigint, text);
drop function if exists public.t2_tomon_murojaat_qaror_v1(bigint, bigint, bigint, text, text);
drop function if exists public.t2_tomon_murojaat_hujjat_v1(bigint, bigint, bigint, bigint);
drop function if exists public.t2_tomon_murojaat_javob_v1(bigint, bigint, bigint, text, bigint[]);
drop function if exists public.t2_tomon_murojaat_yarat_v1(bigint, bigint, bigint, text, text, text, text, date, bigint, text, uuid);
drop function if exists public._t2_tomon_dalil_biriktir(public.t2_tomon_murojaat, bigint, bigint, bigint[]);
drop function if exists public._t2_tomon_murojaat_olish(bigint, bigint, boolean);
-- Hodisa jurnali: murojaat hodisalarini olib tashlab, eski cheklovga qaytish (jurnal triggeri vaqtincha o'chiriladi).
alter table public.t2_tomon_hodisa disable trigger t2_tomon_hodisa_ozgarmas;
delete from public.t2_tomon_hodisa where murojaat_id is not null;
alter table public.t2_tomon_hodisa enable trigger t2_tomon_hodisa_ozgarmas;
drop table if exists public.t2_tomon_murojaat_hujjat;
alter table public.t2_tomon_hodisa drop column if exists murojaat_id;
drop table if exists public.t2_tomon_murojaat;
drop table if exists public.t2_tomon_murojaat_turi;
alter table public.t2_tomon_hodisa drop constraint if exists t2_tomon_hodisa_tur_check;
alter table public.t2_tomon_hodisa add constraint t2_tomon_hodisa_tur_check check (tur in (
  'taklif','qabul','rad','bekor','toxtatish','davom','yopish','grant','grant_bekor','taqdim','korilmoqda','qaror','izoh','qaytarish','kod_xato','qidiruv'));
create or replace function public._t2_tomon_rol_ok(p_rol text, p_amal text) returns boolean
language sql immutable as $$
  select case p_amal
    when 'boshqarish' then p_rol in ('superadmin','admin','boss','rahbar','director')
    when 'taqdim'     then p_rol in ('superadmin','admin','boss','rahbar','director','pto')
    when 'qaror'      then p_rol in ('superadmin','admin','boss','rahbar','director','buyurtmachi')
    when 'izoh'       then p_rol not in ('kuzatuvchi')
    when 'korish'     then true
    else false end
$$;
-- t2_tomon_hujjat_ol_v1: faqat taqdim yo'li (20261106220000) ga qaytarish — shu migratsiyaning rollback faylini qo'llang.
