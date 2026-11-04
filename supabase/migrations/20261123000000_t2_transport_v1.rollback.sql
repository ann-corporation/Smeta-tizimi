-- ROLLBACK: 20261123000000 (transport v1). Faqat t2_tr_* jadvallari va funksiyalari. t2_xarajat ga o'tkazilgan qatorlar
-- (hujjat_ref 'transport:%') O'CHIRILMAYDI - ular moliya yozuvi; kerak bo'lsa t2_xarajat_bekor_v1 bilan bekor qilinadi.
begin;
drop function if exists public.t2_transport_ol_v1(bigint, bigint, text, jsonb);
drop function if exists public.t2_tr_xarajat_otkaz_v1(bigint, bigint, uuid, jsonb);
drop function if exists public.t2_tr_reys_bekor_v1(bigint, bigint, uuid, jsonb);
drop function if exists public.t2_tr_reys_yop_v1(bigint, bigint, uuid, jsonb);
drop function if exists public.t2_tr_reys_yurish_v1(bigint, bigint, uuid, jsonb);
drop function if exists public.t2_tr_reys_saqla_v1(bigint, bigint, uuid, jsonb);
drop function if exists public.t2_tr_tarif_saqla_v1(bigint, bigint, uuid, jsonb);
drop function if exists public.t2_tr_yoqilgi_narx_saqla_v1(bigint, bigint, uuid, jsonb);
drop function if exists public.t2_tr_hujjat_saqla_v1(bigint, bigint, uuid, jsonb);
drop function if exists public.t2_tr_haydovchi_saqla_v1(bigint, bigint, uuid, jsonb);
drop function if exists public.t2_tr_mashina_saqla_v1(bigint, bigint, uuid, jsonb);
drop function if exists public._t2_tr_tannarx_v1(bigint);
drop function if exists public._t2_tr_yoqilgi_narx(bigint, text, date);
drop function if exists public._t2_tr_saqla_op(bigint, uuid, text, jsonb);
drop function if exists public._t2_tr_takror(bigint, uuid, text);
drop function if exists public._t2_tr_vaqt(jsonb, text);
drop function if exists public._t2_tr_sana(jsonb, text);
drop function if exists public._t2_tr_matn(jsonb, text, integer);
drop function if exists public._t2_tr_son(jsonb, text);
drop table if exists public.t2_tr_taqsim, public.t2_tr_yuk, public.t2_tr_bekat, public.t2_tr_reys, public.t2_tr_tarif, public.t2_tr_yoqilgi_narx,
  public.t2_tr_hujjat, public.t2_tr_mashina, public.t2_tr_haydovchi, public.t2_tr_operation cascade;
commit;
