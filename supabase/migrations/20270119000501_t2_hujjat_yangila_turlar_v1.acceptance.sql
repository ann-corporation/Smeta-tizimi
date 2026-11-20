-- acceptance 20270119000501_t2_hujjat_yangila_turlar_v1 (ROLLBACK ichida; SELF-CONTAINED: sintetik id lar, mavjud ma'lumotga tayanmaydi)
do $t$
declare k bigint := 999999001; o bigint := 999999002; v_n public.t2_hujjat_yangila_navbat%rowtype; v_vaqt timestamptz; v_r jsonb;
begin
  delete from public.t2_hujjat_yangila_navbat where kompaniya_id = k;
  -- 1) tasdiqlangan F-2 oyi: 4 tur navbatga (kodlash obyekt*1e6+YYYYMM)
  perform public._t2_hujjat_yangila_oylik_belgila_v1(k, o, date '2031-03-01', 'tasdiqlangan');
  if (select count(*) from public.t2_hujjat_yangila_navbat where kompaniya_id = k) <> 4 then raise exception 'T1: 4 tur kutilgan'; end if;
  if not exists (select 1 from public.t2_hujjat_yangila_navbat where kompaniya_id = k and tur = 'nakopitelniy' and manba_id = o * 1000000 + 203103 and obyekt_id = o and holat = 'kutmoqda') then raise exception 'T2: nakopitelniy kodlash'; end if;
  if not exists (select 1 from public.t2_hujjat_yangila_navbat where kompaniya_id = k and tur = 'm29' and manba_id = o * 1000000 + 203103) then raise exception 'T3: m29 kodlash'; end if;
  if not exists (select 1 from public.t2_hujjat_yangila_navbat where kompaniya_id = k and tur = 'slichitelniy' and manba_id = o) or not exists (select 1 from public.t2_hujjat_yangila_navbat where kompaniya_id = k and tur = 'ostatka' and manba_id = o) then raise exception 'T4: slichitelniy/ostatka'; end if;
  -- 2) debounce: takroriy belgi vaqtni surmaydi
  select keyingi_vaqt into v_vaqt from public.t2_hujjat_yangila_navbat where kompaniya_id = k and tur = 'm29';
  perform pg_sleep(0.05);
  perform public._t2_hujjat_yangila_oylik_belgila_v1(k, o, date '2031-03-01', 'tasdiqlangan');
  if (select keyingi_vaqt from public.t2_hujjat_yangila_navbat where kompaniya_id = k and tur = 'm29') <> v_vaqt then raise exception 'T5: debounce surildi'; end if;
  -- 3) qoralama F-2: faqat slichitelniy/ostatka (nakopitelniy/m29 yangi qator YO'Q); bekor: hech narsa
  delete from public.t2_hujjat_yangila_navbat where kompaniya_id = k;
  perform public._t2_hujjat_yangila_oylik_belgila_v1(k, o, date '2031-03-01', 'qoralama');
  if (select count(*) from public.t2_hujjat_yangila_navbat where kompaniya_id = k) <> 2 then raise exception 'T6: qoralama 2 tur'; end if;
  delete from public.t2_hujjat_yangila_navbat where kompaniya_id = k;
  perform public._t2_hujjat_yangila_oylik_belgila_v1(k, o, date '2031-03-01', 'bekor');
  if exists (select 1 from public.t2_hujjat_yangila_navbat where kompaniya_id = k) then raise exception 'T7: bekor navbatga tushdi'; end if;
  -- 4) qo'lda belgilash: forma3 / nakopitelniy; noma'lum tur rad
  perform public.t2_hujjat_yangila_belgila_v1(k, 'forma3', array[777001::bigint]);
  perform public.t2_hujjat_yangila_belgila_v1(k, 'nakopitelniy', array[(o * 1000000 + 203104)::bigint]);
  if not exists (select 1 from public.t2_hujjat_yangila_navbat where kompaniya_id = k and tur = 'forma3' and manba_id = 777001) then raise exception 'T8: forma3 belgi'; end if;
  if not exists (select 1 from public.t2_hujjat_yangila_navbat where kompaniya_id = k and tur = 'nakopitelniy' and obyekt_id = o) then raise exception 'T9: nakopitelniy obyekt'; end if;
  if (public.t2_hujjat_yangila_belgila_v1(k, 'noma_lum', array[1::bigint])->>'code') <> 'TUR_QOLLANMAYDI' then raise exception 'T10: tur rad'; end if;
  -- 5) ol: muddat kelganlar yangi turlar bilan qaytadi
  update public.t2_hujjat_yangila_navbat set keyingi_vaqt = now() where kompaniya_id = k;
  v_r := public.t2_hujjat_yangila_ol_v1(50, k);
  if jsonb_array_length(v_r->'qatorlar') <> 2 then raise exception 'T11: ol 2 qator kutilgan'; end if;
  delete from public.t2_hujjat_yangila_navbat where kompaniya_id = k;
  raise notice 'OK: hujjat_yangila turlar acceptance';
end $t$;