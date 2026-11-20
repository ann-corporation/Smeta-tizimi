-- Qabul sinovi: FAQAT ROLLBACK ichida. Belgilash: ruxsat, yaroqsiz qator rad, tkm -> foiz (t·km bor) rad, idempotent.
do $$
declare k bigint; a bigint; x bigint; o bigint; m1 bigint; m2 bigint; bl bigint; tr bigint; r jsonb;
begin
  insert into public.t2_kompaniya (nom, kod, faol) values ('ACC TB', 'ACCTB' || floor(random() * 1e6), true) returning id into k;
  insert into public.t2_foydalanuvchi (login, holat) values ('acc_tb_' || floor(random() * 1e9), 'faol') returning id into a;
  insert into public.t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values (a, k, 'pto', 'faol');
  insert into public.t2_foydalanuvchi (login, holat) values ('acc_tx_' || floor(random() * 1e9), 'faol') returning id into x;   -- begona
  insert into public.t2_obyekt (nom, kompaniya_id) values ('_ACC_TB_', k) returning id into o;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, nom, kat, summa, tartib) values (o, k, 'rs', '_ACC_M1_', 'МАТ', 1000, 930001) returning id into m1;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, nom, kat, summa, tartib) values (o, k, 'rs', '_ACC_M2_', 'МАТ', 1000, 930002) returning id into m2;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, nom, tartib) values (o, k, 'bl', '_ACC_ISH_', 930003) returning id into bl;

  r := public.t2_qator_transport_belgila_v1(a, o, array[m1, m2], 'tkm');
  if (r->>'ok')::boolean is not true or (r->>'ozgardi')::int <> 2 or (r->>'tkm_qatori_yoq_soni')::int <> 2 then raise exception 'ACC: tkm belgilash: %', r; end if;
  -- idempotent
  r := public.t2_qator_transport_belgila_v1(a, o, array[m1, m2], 'tkm');
  if (r->>'ozgardi')::int <> 0 then raise exception 'ACC: idempotent emas: %', r; end if;
  -- yaroqsiz (ish qatori)
  r := public.t2_qator_transport_belgila_v1(a, o, array[bl], 'tkm');
  if r->>'code' <> 'QATOR_YARAMAYDI' then raise exception 'ACC: yaroqsiz qator qabul qilindi: %', r; end if;
  -- usul noto'g'ri
  if public.t2_qator_transport_belgila_v1(a, o, array[m1], 'xx')->>'code' <> 'USUL_NOTOGRI' then raise exception 'ACC: usul tekshiruvi'; end if;
  -- t·km qatori bor material foiz ga qaytarilmaydi
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, nom, kat, summa, tartib, transport_manba_qator_id) values (o, k, 'rs', '_ACC_TR_', 'МАШ', 10, 930004, m1) returning id into tr;
  r := public.t2_qator_transport_belgila_v1(a, o, array[m1], 'foiz');
  if r->>'code' <> 'TKM_QATOR_BOR' then raise exception 'ACC: t·km bor material foiz ga o''tdi: %', r; end if;
  -- m2 (t·km yo'q) narx_ichida ga o'tadi, m1 tkm qoladi
  r := public.t2_qator_transport_belgila_v1(a, o, array[m2], 'narx_ichida');
  if (r->>'ok')::boolean is not true or (select transport_usul from public.t2_qator where id = m2) <> 'narx_ichida' then raise exception 'ACC: narx_ichida: %', r; end if;
  -- foiz = NULL
  r := public.t2_qator_transport_belgila_v1(a, o, array[m2], 'foiz');
  if (select transport_usul from public.t2_qator where id = m2) is not null then raise exception 'ACC: foiz NULL emas'; end if;
  -- begona aktor
  begin
    perform public.t2_qator_transport_belgila_v1(x, o, array[m2], 'tkm');
    raise exception 'ACC: begona aktor belgiladi';
  exception when others then
    if sqlerrm like 'ACC:%' then raise; end if;
  end;
  raise notice 'OK: transport_belgila acceptance';
end $$;