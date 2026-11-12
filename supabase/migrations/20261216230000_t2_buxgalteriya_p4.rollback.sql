-- ROLLBACK: 20261216230000_t2_buxgalteriya_p4. Funksiyalar, jadvallar (bank navbati, kassa orderlari, taqsim) o'chiriladi;
-- DIQQAT: kassa orderlari va navbat ma'lumoti yo'qoladi (jurnaldagi 'kassa' / 'bank_ish_haqi' provodkalari qoladi - kerak bo'lsa avval storno qiling).
-- _t2_bux_kerak_v3 o'rami olib tashlanadi va avvalgi (_asos) nomiga qaytariladi.
begin;

drop function if exists public.t2_bux_kassa_kitob_v1(bigint, bigint, date, date);
drop function if exists public.t2_bux_kassa_bekor_v1(bigint, bigint, bigint, uuid);
drop function if exists public.t2_bux_kassa_yoz_v1(bigint, bigint, text, date, numeric, text, bigint, bigint, bigint, text, uuid);
drop function if exists public.t2_bux_bank_qabul_v1(bigint, bigint, bigint, bigint, bigint, uuid);
drop function if exists public.t2_bux_bank_taklif_v1(bigint, bigint, integer);
drop function if exists public.t2_bux_bank_yuklash_v1(bigint, bigint, jsonb, uuid);
drop function if exists public._t2_bux_bank_mos(bigint, boolean, text);
drop function if exists public.t2_bux_taqsim_saqla_v1(bigint, bigint, bigint, jsonb, uuid);
drop function if exists public._t2_bux_kerak_v3(bigint);
alter function public._t2_bux_kerak_v3_asos(bigint) rename to _t2_bux_kerak_v3;
drop table if exists public.t2_bux_ish_haqi_taqsim;
drop table if exists public.t2_bux_kassa_order;
drop table if exists public.t2_bux_bank_qator;
delete from public.t2_bux_shablon where shablon = 'pudratchi' and kalit in ('ish_haqi.ish_beruvchi', 'param.ish_beruvchi_foiz', 'kassa.hisob');
delete from public.t2_bux_moslik where kalit in ('ish_haqi.ish_beruvchi', 'param.ish_beruvchi_foiz', 'kassa.hisob');

commit;