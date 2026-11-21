-- 20270121000001_t2_hujjat_yangila_tezlat_v1
-- Hujjatlar paketi: oldindan tayyorlash (egasi 2026-11-21). Tanlangan hujjatlarning navbat qatorlarini DARHOL muddatli qiladi (debounce 2 daqiqani kutmaydi);
-- F-2 uchun navbat qatori yo'q bo'lsa qo'shadi. Token yechilmaydi, hujjat yasalmaydi - faqat navbat vaqti. Ishlovchi: /api/hujjat-paket amal=tayyorla.
-- Applied: YO'Q (L0 qo'llaydi: avval ROLLBACK sinov; fayl ichida begin/commit yo'q). Faqat service_role. 20270119000001 va 20270119000501 dan keyin.
create or replace function public.t2_hujjat_yangila_tezlat_v1(p_kompaniya bigint, p_tur text, p_idlar bigint[])
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $fn$
declare v_n integer := 0; v_idlar bigint[];
begin
  if p_kompaniya is null or p_tur is null or p_tur not in ('f2', 'forma3', 'nakopitelniy', 'm29', 'slichitelniy', 'ostatka') then
    return jsonb_build_object('ok', false, 'code', 'TUR_NOTOGRI');
  end if;
  v_idlar := coalesce((select array_agg(x) from (select unnest(p_idlar) x limit 500) q), '{}');
  if p_tur = 'f2' then  -- faqat shu kompaniyaning bekor emas, taxminiy emas F-2 lari navbatga (yo'q bo'lsa qo'shiladi)
    perform public._t2_hujjat_yangila_f2_toplam_v1(array(
      select a.id from public.t2_akt a
       where a.id = any(v_idlar) and a.kompaniya_id = p_kompaniya and a.holat <> 'bekor' and not public._t2_f2_taxminiy_v1(a.raqam, a.izoh)));
  end if;
  update public.t2_hujjat_yangila_navbat set keyingi_vaqt = now()
   where kompaniya_id = p_kompaniya and tur = p_tur and manba_id = any(v_idlar) and holat = 'kutmoqda' and keyingi_vaqt > now();
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'tezlatildi', v_n);
end $fn$;

revoke all on function public.t2_hujjat_yangila_tezlat_v1(bigint, text, bigint[]) from public, anon, authenticated;
grant execute on function public.t2_hujjat_yangila_tezlat_v1(bigint, text, bigint[]) to service_role;