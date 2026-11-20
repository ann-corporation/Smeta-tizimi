-- rollback 20270119000501_t2_hujjat_yangila_turlar_v1
drop trigger if exists t2_akt_hujjat_yangila_oylik_trg on public.t2_akt;
drop trigger if exists t2_akt_qator_hujjat_yangila_oylik_ins_trg on public.t2_akt_qator;
drop trigger if exists t2_akt_qator_hujjat_yangila_oylik_upd_trg on public.t2_akt_qator;
drop trigger if exists t2_akt_qator_hujjat_yangila_oylik_del_trg on public.t2_akt_qator;
drop trigger if exists t2_forma3_hujjat_yangila_trg on public.t2_forma3;
drop function if exists public.t2_akt_hujjat_yangila_oylik_trg();
drop function if exists public.t2_akt_qator_hujjat_yangila_oylik_ins_trg();
drop function if exists public.t2_akt_qator_hujjat_yangila_oylik_upd_trg();
drop function if exists public.t2_akt_qator_hujjat_yangila_oylik_del_trg();
drop function if exists public.t2_forma3_hujjat_yangila_trg();
drop function if exists public._t2_hujjat_yangila_oylik_toplam_v1(bigint[]);
drop function if exists public._t2_hujjat_yangila_oylik_belgila_v1(bigint, bigint, date, text);
-- t2_hujjat_yangila_belgila_v1 ni 20270119000001 dagi (faqat f2) holatga qaytarish:
create or replace function public.t2_hujjat_yangila_belgila_v1(p_kompaniya bigint, p_tur text, p_idlar bigint[])
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  if p_tur <> 'f2' then return jsonb_build_object('ok', false, 'code', 'TUR_QOLLANMAYDI'); end if;
  perform public._t2_hujjat_yangila_f2_toplam_v1(array(select a.id from public.t2_akt a where a.id = any(p_idlar) and a.kompaniya_id = p_kompaniya));
  return jsonb_build_object('ok', true);
end $fn$;
-- Navbatda qolgan yangi tur qatorlari zararsiz (ishlovchi bilmasa 'otkazildi'); xohlansa:
delete from public.t2_hujjat_yangila_navbat where tur in ('forma3', 'slichitelniy', 'ostatka', 'nakopitelniy', 'm29');