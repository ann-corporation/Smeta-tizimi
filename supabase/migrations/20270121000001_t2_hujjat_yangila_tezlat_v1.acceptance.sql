-- acceptance 20270121000001_t2_hujjat_yangila_tezlat_v1 (ROLLBACK ichida; SELF-CONTAINED: sintetik id lar)
do $t$
declare k bigint := 999999011; v_r jsonb; v_vaqt timestamptz;
begin
  delete from public.t2_hujjat_yangila_navbat where kompaniya_id = k;
  insert into public.t2_hujjat_yangila_navbat (kompaniya_id, tur, manba_id, obyekt_id, keyingi_vaqt) values (k, 'm29', 999999012, 999999013, now() + interval '2 minutes');
  -- 1) kutayotgan qator darhol muddatli bo'ladi
  v_r := public.t2_hujjat_yangila_tezlat_v1(k, 'm29', array[999999012::bigint]);
  if (v_r->>'ok')::boolean is not true or (v_r->>'tezlatildi')::int <> 1 then raise exception 'T1: tezlatilmadi %', v_r; end if;
  select keyingi_vaqt into v_vaqt from public.t2_hujjat_yangila_navbat where kompaniya_id = k and tur = 'm29';
  if v_vaqt > now() then raise exception 'T2: keyingi_vaqt hali kelajakda'; end if;
  -- 2) boshqa kompaniya qatoriga tegmaydi
  v_r := public.t2_hujjat_yangila_tezlat_v1(k + 1, 'm29', array[999999012::bigint]);
  if (v_r->>'tezlatildi')::int <> 0 then raise exception 'T3: begona kompaniya'; end if;
  -- 3) noma'lum tur rad; ishlanayotgan qatorga tegmaydi
  if (public.t2_hujjat_yangila_tezlat_v1(k, 'xyz', array[1::bigint])->>'code') is distinct from 'TUR_NOTOGRI' then raise exception 'T4: tur rad etilmadi'; end if;
  update public.t2_hujjat_yangila_navbat set holat = 'ishlanmoqda', keyingi_vaqt = now() + interval '1 hour' where kompaniya_id = k and tur = 'm29';
  if (public.t2_hujjat_yangila_tezlat_v1(k, 'm29', array[999999012::bigint])->>'tezlatildi')::int <> 0 then raise exception 'T5: ishlanayotganga tegdi'; end if;
  delete from public.t2_hujjat_yangila_navbat where kompaniya_id = k;
end $t$;