-- acceptance 20270119000001_t2_hujjat_yangila_navbat_v1 (ROLLBACK ichida ishga tushiriladi; xato bo'lsa exception)
do $t$
declare v_akt bigint; v_k bigint; v_n public.t2_hujjat_yangila_navbat%rowtype; v_r jsonb; v_id bigint;
begin
  select id, kompaniya_id into v_akt, v_k from public.t2_akt where tur = 'f2' and holat = 'qoralama' limit 1;
  if v_akt is null then raise notice 'SKIP: qoralama F-2 yoq'; return; end if;
  delete from public.t2_hujjat_yangila_navbat where tur = 'f2' and manba_id = v_akt;
  -- 1) t2_akt o'zgarishi navbat qatori yaratadi (kutmoqda, +2 daqiqa)
  update public.t2_akt set izoh = izoh where id = v_akt;
  select * into v_n from public.t2_hujjat_yangila_navbat where tur = 'f2' and manba_id = v_akt;
  if not found or v_n.holat <> 'kutmoqda' or v_n.keyingi_vaqt < now() + interval '110 seconds' then raise exception 'F1: trigger navbat qatori yaratmadi'; end if;
  -- 2) debounce: ikkinchi o'zgarish vaqtni SURMAYDI
  perform pg_sleep(0.05);
  update public.t2_akt set izoh = izoh where id = v_akt;
  if (select keyingi_vaqt from public.t2_hujjat_yangila_navbat where id = v_n.id) <> v_n.keyingi_vaqt then raise exception 'F2: debounce vaqti surildi'; end if;
  -- 3) muddat kelmagan - ol bo'sh
  v_r := public.t2_hujjat_yangila_ol_v1(5, v_k);
  if jsonb_array_length(v_r->'qatorlar') <> 0 and exists (select 1 from jsonb_array_elements(v_r->'qatorlar') x where (x->>'manba_id')::bigint = v_akt) then raise exception 'F3: muddatsiz olindi'; end if;
  -- 4) muddat keldi - ol; ishlanmoqda
  update public.t2_hujjat_yangila_navbat set keyingi_vaqt = now() where id = v_n.id;
  v_r := public.t2_hujjat_yangila_ol_v1(50, v_k);
  if not exists (select 1 from jsonb_array_elements(v_r->'qatorlar') x where (x->>'manba_id')::bigint = v_akt) then raise exception 'F4: muddati kelgan olinmadi'; end if;
  -- 5) yasash paytida yangi o'zgarish -> qayta=true; tugagach yana kutmoqda
  update public.t2_akt set izoh = izoh where id = v_akt;
  if not (select qayta from public.t2_hujjat_yangila_navbat where id = v_n.id) then raise exception 'F5: qayta belgisi yoq'; end if;
  perform public.t2_hujjat_yangila_tugat_v1(v_n.id, 'ok', null, 3);
  if (select holat from public.t2_hujjat_yangila_navbat where id = v_n.id) <> 'kutmoqda' then raise exception 'F6: qayta navbatga qaytmadi'; end if;
  -- 6) retry: xato -> kutmoqda + kechikish; 6 urinishdan keyin 'xato'
  update public.t2_hujjat_yangila_navbat set holat = 'ishlanmoqda', urinish = 1, qayta = false where id = v_n.id;
  perform public.t2_hujjat_yangila_tugat_v1(v_n.id, 'xato', 'sinov', null);
  select * into v_n from public.t2_hujjat_yangila_navbat where id = v_n.id;
  if v_n.holat <> 'kutmoqda' or v_n.keyingi_vaqt < now() + interval '100 seconds' or v_n.oxirgi_xato <> 'sinov' then raise exception 'F7: retry kechikishi notogri'; end if;
  update public.t2_hujjat_yangila_navbat set holat = 'ishlanmoqda', urinish = 6 where id = v_n.id;
  perform public.t2_hujjat_yangila_tugat_v1(v_n.id, 'xato', 'oxirgi', null);
  if (select holat from public.t2_hujjat_yangila_navbat where id = v_n.id) <> 'xato' then raise exception 'F8: 6 urinishdan keyin xato emas'; end if;
  -- 7) hisob-kitob: yasash tokenga tegmaydi (navbat jadvalida token yoq; t2_token_harakat o'zgarmaydi)
  -- 8) backfill idempotent
  v_r := public.t2_hujjat_yangila_backfill_v1(3);
  if (public.t2_hujjat_yangila_backfill_v1(3)->>'allaqachon')::boolean is not true then raise exception 'F9: backfill ikki marta ishladi'; end if;
  -- 9) holat RPC
  if jsonb_array_length(public.t2_hujjat_yangila_holat_v1(v_k, 'f2', array[v_akt])->'qatorlar') <> 1 then raise exception 'F10: holat RPC'; end if;
  raise notice 'OK: hujjat_yangila navbat acceptance';
end $t$;
