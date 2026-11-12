-- ROLLBACK: 20261216220000_t2_buxgalteriya_p3. Yangi funksiyalar o'chiriladi; avto-provodka/davr/pul-korinish va V1 funksiyalari bu migratsiyada qayta yozilgan:
-- ularni tiklash uchun 20261216200000 (t2_bux_avto_provodka_v1, t2_bux_davr_v1) va 20261216210000 (t2_bux_pul_korinish_v1) fayllaridagi create-or-replace bloklarini qayta ishga tushiring.
-- Jurnaldagi 'ish_haqi' provodkalari tegilmaydi (kerak bo'lsa avval storno). t2_bux_shablon dagi yangi qatorlar o'chiriladi.
begin;

drop function if exists public.t2_bux_sverka_v1(bigint, bigint, bigint, date, date);
drop function if exists public.t2_bux_sverka_tomonlar_v1(bigint, bigint);
drop function if exists public._t2_bux_sverka_ochilish(bigint, bigint, date);
drop function if exists public._t2_bux_sverka_hujjatlar(bigint, bigint, date, date);
drop function if exists public._t2_bux_kerak_v3(bigint);
drop function if exists public._t2_bux_turlar();
delete from public.t2_bux_shablon where shablon = 'pudratchi' and kalit in ('ish_haqi.ndfl', 'ish_haqi.inps', 'xarajat.naryad_pudrat');
delete from public.t2_bux_moslik where kalit in ('ish_haqi.ndfl', 'ish_haqi.inps', 'xarajat.naryad_pudrat');

commit;