-- ROLLBACK: 20261108420000_t2_tender_rpc_p2_v1 (faqat funksiyalar; ma'lumot jadvallari 20261108400000 rollback ida)
begin;
drop function if exists public.t2_tender_tafsilot_v1(bigint,bigint,bigint);
drop function if exists public.t2_tenderlar_v1(bigint,bigint,text,text,integer,bigint);
drop function if exists public.t2_tender_yop_v1(bigint,bigint,uuid,bigint,integer,boolean);
drop function if exists public.t2_tender_golib_v1(bigint,bigint,uuid,bigint,integer,bigint,bigint[],jsonb);
drop function if exists public.t2_tender_taklif_qaytar_v1(bigint,bigint,uuid,bigint,integer);
drop function if exists public.t2_tender_taklif_ber_v1(bigint,bigint,uuid,bigint,jsonb,text,jsonb);
drop function if exists public.t2_tender_elon_v1(bigint,bigint,uuid,text,text,bigint[],bigint,timestamptz,jsonb,jsonb);
drop function if exists public._t2_tender_korinadi(bigint,bigint);
commit;
