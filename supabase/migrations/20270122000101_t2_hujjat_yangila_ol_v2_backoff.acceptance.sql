-- Qabul: 5+ urinishli eskirgan yozuv 6 soatga kechiktiriladi, kam urinishli darhol qaytadi.
do $$
declare v_k bigint; v_a bigint; v_b bigint; r record;
begin
  select kompaniya_id into v_k from public.t2_hujjat_yangila_navbat limit 1;
  insert into public.t2_hujjat_yangila_navbat(kompaniya_id, tur, manba_id, holat, urinish, boshlandi, keyingi_vaqt)
    values (v_k, 'f2', -900001, 'ishlanmoqda', 6, now() - interval '20 minutes', now() - interval '20 minutes') returning id into v_a;
  insert into public.t2_hujjat_yangila_navbat(kompaniya_id, tur, manba_id, holat, urinish, boshlandi, keyingi_vaqt)
    values (v_k, 'f2', -900002, 'ishlanmoqda', 1, now() - interval '20 minutes', now() - interval '20 minutes') returning id into v_b;
  perform public.t2_hujjat_yangila_ol_v2(1, -1, array['__yoq__']);  -- faqat tiklash qismi (boshqa kompaniya/tur — hech narsa olinmaydi)
  perform public.t2_hujjat_yangila_ol_v2(1, v_k, array['__yoq__']);
  select * into r from public.t2_hujjat_yangila_navbat where id = v_a;
  if r.holat <> 'kutmoqda' or r.keyingi_vaqt < now() + interval '5 hours' or r.oxirgi_xato not like 'FON_UZILDI%' then raise exception 'backoff ishlamadi: %', row_to_json(r); end if;
  select * into r from public.t2_hujjat_yangila_navbat where id = v_b;
  if r.holat <> 'kutmoqda' or r.keyingi_vaqt > now() + interval '1 minute' then raise exception 'oddiy tiklash buzildi: %', row_to_json(r); end if;
  delete from public.t2_hujjat_yangila_navbat where id in (v_a, v_b);
  raise notice 'ACCEPTANCE OK';
end $$;
