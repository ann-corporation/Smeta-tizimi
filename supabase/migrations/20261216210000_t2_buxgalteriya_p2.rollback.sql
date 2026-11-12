-- ROLLBACK: 20261216210000_t2_buxgalteriya_p2. Funksiyalar va t2_bux_hisobot_qator o'chiriladi; jurnal (t2_bux_provodka) ma'lumoti tegilmaydi
-- (boshlangich_saldo / tannarx provodkalari qoladi - kerak bo'lsa avval ularni storno qiling). t2_bux_shablon dagi 'tannarx.yopish' qatori o'chiriladi.
begin;

drop function if exists public.t2_bux_tannarx_v1(bigint, bigint, date, text, boolean, uuid);
drop function if exists public.t2_bux_saldo_bekor_v1(bigint, bigint, uuid);
drop function if exists public.t2_bux_saldo_import_v1(bigint, bigint, date, text, jsonb, boolean, uuid);
drop function if exists public.t2_bux_hisobot_saqla_v1(bigint, bigint, text, jsonb, uuid);
drop function if exists public.t2_bux_hisobot_v1(bigint, bigint, date, date, text);
drop function if exists public.t2_bux_pul_korinish_v1(bigint, bigint, date, date);
drop function if exists public._t2_bux_qoida_kafolat(bigint, text);
drop table if exists public.t2_bux_hisobot_qator;
delete from public.t2_bux_shablon where shablon = 'pudratchi' and kalit = 'tannarx.yopish';
delete from public.t2_bux_moslik where kalit = 'tannarx.yopish';

commit;