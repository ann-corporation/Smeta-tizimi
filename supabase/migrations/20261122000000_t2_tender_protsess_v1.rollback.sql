-- ROLLBACK: 20261122000000_t2_tender_protsess_v1. Yangi tender protsessi ma'lumotlari (jurnal, savol, baho) YO'QOLADI.
begin;
drop function if exists public.t2_tender_saqla_v1(bigint,bigint,uuid,bigint,integer,text,text,bigint[],bigint,timestamptz,jsonb,jsonb);
drop function if exists public.t2_tender_otish_v1(bigint,bigint,uuid,bigint,integer,text,text,bigint);
drop function if exists public.t2_tender_raund_v1(bigint,bigint,uuid,bigint,integer,timestamptz,text);
drop function if exists public.t2_tender_taklif_v2(bigint,bigint,uuid,bigint,jsonb,text,jsonb);
drop function if exists public.t2_tender_taklif_qaytar_v2(bigint,bigint,uuid,bigint,integer);
drop function if exists public.t2_tender_savol_ber_v1(bigint,bigint,uuid,bigint,text);
drop function if exists public.t2_tender_javob_v1(bigint,bigint,uuid,bigint,text,boolean);
drop function if exists public.t2_tender_baholash_saqla_v1(bigint,bigint,uuid,bigint,integer,jsonb);
drop function if exists public.t2_tender_golib_v2(bigint,bigint,uuid,bigint,integer,jsonb,text,boolean,jsonb);
drop function if exists public.t2_tender_baho_ber_v1(bigint,bigint,uuid,bigint,integer,text);
drop function if exists public.t2_tender_fayl_bogla_v1(bigint,bigint,uuid,bigint,bigint[]);
drop function if exists public.t2_tender_taklif_fayl_bogla_v1(bigint,bigint,uuid,bigint,bigint[]);
drop function if exists public.t2_tender_royxat_v1(bigint,bigint,text,text,text,integer,bigint);
drop function if exists public.t2_tender_tafsilot_v2(bigint,bigint,bigint);
drop function if exists public.t2_tender_yetkazuvchilar_v1(bigint,bigint);
drop function if exists public.t2_tender_tahlil_v1(bigint,bigint,date,date);
drop trigger if exists t2_birja_rfq_qator_golib_v2 on public.t2_birja_rfq_qator;
drop trigger if exists t2_tender_jurnal_ozgarmas on public.t2_tender_jurnal;
drop function if exists public._t2_tender_golib_qoriqchi();
drop function if exists public._t2_tender_jurnal_qoriqchi();
drop function if exists public._t2_tender_azo(bigint,bigint,text);
drop function if exists public._t2_tender_jurnal_yoz(bigint,bigint,text,bigint,bigint,jsonb);
drop function if exists public._t2_tender_otish_ruxsat(text,text);
drop function if exists public._t2_tender_korinadi_v2(bigint,bigint);
drop function if exists public._t2_tender_meyor_xato(text,jsonb);
drop function if exists public._t2_tender_son(text);
drop table if exists public.t2_tender_baho;
drop table if exists public.t2_tender_savol;
drop table if exists public.t2_tender_jurnal;
-- yangi holatdagi qatorlarni eski holatga yaqinlashtiramiz (check qaytishi uchun)
update public.t2_birja_rfq set holat = case holat when 'tasdiqlashda' then 'qoralama' when 'takliflar_yopildi' then 'elon' when 'baholash' then 'elon'
  when 'shartnoma' then 'golib_tanlandi' when 'bajarilmoqda' then 'golib_tanlandi' else holat end
 where holat in ('tasdiqlashda', 'takliflar_yopildi', 'baholash', 'shartnoma', 'bajarilmoqda');
alter table public.t2_birja_rfq drop constraint if exists t2_birja_rfq_holat_check;
alter table public.t2_birja_rfq add constraint t2_birja_rfq_holat_check
  check (holat in ('ochiq', 'yopiq', 'bekor', 'qoralama', 'elon', 'yopildi', 'golib_tanlandi'));
drop index if exists public.t2_birja_rfq_raqam_uq;
drop index if exists public.t2_birja_rfq_holat_idx;
alter table public.t2_birja_rfq
  drop column if exists protsess_v2, drop column if exists raqam, drop column if exists byudjet_qqs_bilan, drop column if exists byudjet_korsatish,
  drop column if exists qqs_foiz, drop column if exists valyuta, drop column if exists baholash_usuli, drop column if exists meyor, drop column if exists savol_muddat,
  drop column if exists tolov_sharti, drop column if exists raund, drop column if exists yuborgan_actor_id, drop column if exists tasdiq_actor_id,
  drop column if exists tasdiq_vaqt, drop column if exists ochilgan_vaqt, drop column if exists ochgan_actor_id, drop column if exists golib_asos,
  drop column if exists golib_vaqt, drop column if exists shartnoma_id, drop column if exists oxirgi_operation_id;
alter table public.t2_birja_rfq_qator
  drop column if exists lot_no, drop column if exists lot_nom, drop column if exists talab_sana, drop column if exists yetkazish_joyi, drop column if exists spets;
alter table public.t2_birja_taklif
  drop column if exists tolov_sharti, drop column if exists amal_kun, drop column if exists kafolat_oy, drop column if exists raund;
-- v1 RPC lar service_role ga qaytariladi
grant execute on function public.t2_tender_elon_v1(bigint,bigint,uuid,text,text,bigint[],bigint,timestamptz,jsonb,jsonb) to service_role;
grant execute on function public.t2_tender_golib_v1(bigint,bigint,uuid,bigint,integer,bigint,bigint[],jsonb) to service_role;
grant execute on function public.t2_tender_yop_v1(bigint,bigint,uuid,bigint,integer,boolean) to service_role;
grant execute on function public.t2_tender_tafsilot_v1(bigint,bigint,bigint) to service_role;
commit;
