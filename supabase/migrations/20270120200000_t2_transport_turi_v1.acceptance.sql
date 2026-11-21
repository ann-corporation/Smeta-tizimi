-- Qabul sinovi: FAQAT ROLLBACK ichida (migratsiyaning o'z begin/commit i yo'q). Xato: raise exception 'ACC: ...'.
-- SELF-CONTAINED: sintetik kompaniya/obyekt/qatorlar, sintetik summalar.
do $$
declare
  k bigint; a bigint; x bigint; o bigint; rz bigint; m1 bigint; m2 bigint; m3 bigint; tr1 bigint; tr2 bigint;
  nk jsonb := jsonb_build_object('ТРАНСПОРТ_МАТЕРИАЛ', 5, 'СКЛАДСКИЕ_МАТЕРИАЛ', 0, 'СКЛАДСКИЕ_МК', 0, 'ТРАНСПОРТ_КАБЕЛЬ', 0, 'ПРОЧИЕ_ПОДРЯДЧИК', 0,
                                  'ТРАНСПОРТ_ОБОРУД', 0, 'ЗАГОТ_СКЛАД_ОБОРУД', 0, 'СТРАХОВАНИЕ', 0, 'РИСК', 0, 'НДС', 12);
  agg jsonb; pk jsonb; au jsonb; ok boolean;
begin
  insert into public.t2_kompaniya (nom, kod, faol) values ('ACC TR', 'ACCTR' || floor(random() * 1e6), true) returning id into k;
  insert into public.t2_foydalanuvchi (login, holat) values ('acc_tr_' || floor(random() * 1e9), 'faol') returning id into a;
  insert into public.t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values (a, k, 'pto', 'faol');
  insert into public.t2_foydalanuvchi (login, holat) values ('acc_tx_' || floor(random() * 1e9), 'faol') returning id into x;   -- begona
  insert into public.t2_obyekt (nom, kompaniya_id) values ('_ACC_TR_', k) returning id into o;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, nom, tartib) values (o, k, 'rz', '_ACC_BOLIM_', 910001) returning id into rz;
  -- m1: oddiy material (foiz), m2: tkm material, m3: narx_ichida material; hammasi 1000 (sintetik)
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, nom, birlik, hajm, narx, summa, kat, tartib)
    values (o, k, 'rs', '_ACC_MAT_1_', 'm3', 1, 1000, 1000, 'МАТ', 910002) returning id into m1;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, nom, birlik, hajm, narx, summa, kat, tartib, transport_usul)
    values (o, k, 'rs', '_ACC_MAT_2_', 'm3', 1, 1000, 1000, 'МАТ', 910003, 'tkm') returning id into m2;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, nom, birlik, hajm, narx, summa, kat, tartib, transport_usul)
    values (o, k, 'rs', '_ACC_MAT_3_', 'm3', 1, 1000, 1000, 'МАТ', 910004, 'narx_ichida') returning id into m3;

  -- T1: usul faqat material qatoriga (rz ga qo'yib bo'lmaydi)
  begin
    update public.t2_qator set transport_usul = 'tkm' where id = rz;
    raise exception 'ACC: T1 rz ga usul qo''yildi';
  exception when check_violation then null; end;

  -- T2: t·km qatori faqat tkm materialga bog'lanadi (m1 foiz - rad)
  begin
    insert into public.t2_qator (obyekt_id, kompaniya_id, tur, nom, birlik, hajm, narx, summa, kat, tartib, transport_manba_qator_id)
      values (o, k, 'rs', '_ACC_TR_X_', 'Т·КМ', 1, 10, 10, 'МАШ', 910005, m1);
    raise exception 'ACC: T2 foiz materialga t·km qatori bog''landi';
  exception when check_violation then null; end;

  -- T3: haqiqiy t·km qatori m2 ga
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, nom, birlik, hajm, narx, summa, kat, tartib, transport_manba_qator_id, transport_zichlik, transport_km)
    values (o, k, 'rs', '_ACC_TR_1_', 'Т·КМ', 2.4, 10, 24, 'МАШ', 910006, m2, 2.4, 10) returning id into tr1;

  -- T4: ikkinchi faol t·km qatori rad (bitta materialga bitta)
  begin
    insert into public.t2_qator (obyekt_id, kompaniya_id, tur, nom, birlik, hajm, narx, summa, kat, tartib, transport_manba_qator_id)
      values (o, k, 'rs', '_ACC_TR_2_', 'Т·КМ', 1, 10, 10, 'МАШ', 910007, m2);
    raise exception 'ACC: T4 takroriy t·km qatori qabul qilindi';
  exception when unique_violation then null; end;

  -- T5: tkm material %-bazadan chiqariladi: mat = 3000 + 24 (МАШ alohida) ; tr_ex_mat = 2000 (m2 + m3); baza = 3000 - 2000
  agg := (select a2.agg from public._t2_summa_agg_v1(array[o]::bigint[], 'smeta', null::bigint[], null::date, null::date, null::text, null::text) a2 limit 1);
  if (agg->>'mat')::numeric <> 3000 or (agg->>'tr_ex_mat')::numeric <> 2000 or (agg->>'mash')::numeric <> 24 then
    raise exception 'ACC: T5 agg noto''g''ri: %', agg;
  end if;
  pk := public._t2_summa_paket_hisob_v1(agg, nk);
  if (pk->'ustama'->>'tr_mat')::numeric <> 50 then
    raise exception 'ACC: T5 transport-%% bazasi: kutilgan 50 (faqat m1 1000 x 5%%), olindi %', pk->'ustama'->>'tr_mat';
  end if;
  -- T5b: kalitsiz agg (eski shakl) - avvalgi xatti-harakat (baza to'liq 3000 -> 150)
  pk := public._t2_summa_paket_hisob_v1(agg - 'tr_ex_mat' - 'tr_ex_kab' - 'tr_ex_ob', nk);
  if (pk->'ustama'->>'tr_mat')::numeric <> 150 then raise exception 'ACC: T5b eski xatti-harakat buzildi: %', pk->'ustama'->>'tr_mat'; end if;

  -- T6: tkm dan chiqish t·km qatori bor paytda rad
  begin
    update public.t2_qator set transport_usul = null where id = m2;
    raise exception 'ACC: T6 t·km qatori bor materialni tkm dan chiqarish mumkin bo''ldi';
  exception when check_violation then null; end;

  -- T7: audit (begona aktor rad; toza holatda xato yo'q)
  begin
    perform public.t2_qator_transport_audit_v1(x, o);
    raise exception 'ACC: T7 begona aktor audit oldi';
  exception when others then
    if sqlerrm like 'ACC:%' then raise; end if;
  end;
  au := public.t2_qator_transport_audit_v1(a, o);
  if (au->>'ok')::boolean is not true or (au->'xulosa'->>'xato_soni')::int <> 0
     or (au->'xulosa'->>'tkm')::int <> 1 or (au->'xulosa'->>'narx_ichida')::int <> 1 or (au->'xulosa'->>'tkm_qator_soni')::int <> 1 then
    raise exception 'ACC: T7 toza audit noto''g''ri: %', au;
  end if;

  -- T8: planted xatolar (cheklovlar vaqtincha olib tashlanadi - ROLLBACK ichida): takroriy t·km, tkm transportsiz, tkm+foiz
  drop index public.t2_qator_transport_manba_faol_uq;
  alter table public.t2_qator disable trigger t2_qator_transport_guard_ins_trg;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, nom, birlik, hajm, narx, summa, kat, tartib, transport_manba_qator_id)
    values (o, k, 'rs', '_ACC_TR_DUP_', 'Т·КМ', 1, 10, 10, 'МАШ', 910008, m2) returning id into tr2;                 -- ikkinchi t·km (m2)
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, nom, birlik, hajm, narx, summa, kat, tartib, transport_manba_qator_id)
    values (o, k, 'rs', '_ACC_TR_FOIZ_', 'Т·КМ', 1, 10, 10, 'МАШ', 910009, m1);                                      -- m1 foiz + t·km
  update public.t2_qator set transport_usul = 'tkm' where id = m3;                                                      -- m3: tkm, transportsiz
  au := public.t2_qator_transport_audit_v1(a, o);
  ok := exists (select 1 from jsonb_array_elements(au->'xatolar') f where f->>'kod' = 'IKKITA_TRANSPORT' and (f->>'qator_id')::bigint = m2)
    and exists (select 1 from jsonb_array_elements(au->'xatolar') f where f->>'kod' = 'TKM_VA_FOIZ')
    and exists (select 1 from jsonb_array_elements(au->'xatolar') f where f->>'kod' = 'TKM_TRANSPORT_YOQ' and (f->>'qator_id')::bigint = m3);
  if not ok then raise exception 'ACC: T8 audit planted xatolarni topmadi: %', au; end if;
  raise notice 'OK: transport_turi acceptance';
end $$;