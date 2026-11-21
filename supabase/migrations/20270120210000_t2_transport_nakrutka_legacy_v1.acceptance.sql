-- Qabul sinovi: FAQAT ROLLBACK ichida. Eski yo'l (t2_obyekt_nakrutka_v1) tkm materialni transport-% bazasidan chiqaradi.
do $$
declare k bigint; a bigint; o bigint; m1 bigint; m2 bigint; r jsonb; koef numeric; kutilgan numeric; ch jsonb; n int;
begin
  insert into public.t2_kompaniya (nom, kod, faol) values ('ACC TL', 'ACCTL' || floor(random() * 1e6), true) returning id into k;
  insert into public.t2_foydalanuvchi (login, holat) values ('acc_tl_' || floor(random() * 1e9), 'faol') returning id into a;
  insert into public.t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values (a, k, 'pto', 'faol');
  insert into public.t2_obyekt (nom, kompaniya_id) values ('_ACC_TL_', k) returning id into o;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, nom, birlik, hajm, narx, summa, kat, tartib) values (o, k, 'rs', '_ACC_1_', 'm3', 1, 1000, 1000, 'МАТ', 920001) returning id into m1;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, nom, birlik, hajm, narx, summa, kat, tartib, transport_usul) values (o, k, 'rs', '_ACC_2_', 'm3', 1, 1000, 1000, 'МАТ', 920002, 'tkm') returning id into m2;
  ch := public._t2_transport_chiqar_v1(o);
  if (ch->>'tr_ex_mat')::numeric <> 1000 or (ch->>'tr_ex_kab')::numeric <> 0 then raise exception 'ACC: chiqarish yig''indisi: %', ch; end if;
  r := public.t2_obyekt_nakrutka_v1(o, a, null);
  if (r->>'ok')::boolean is not true then raise exception 'ACC: t2_obyekt_nakrutka_v1: %', r; end if;
  koef := (r->'koeffitsientlar'->>'ТРАНСПОРТ_МАТЕРИАЛ')::numeric;
  kutilgan := 1000 * koef * 0.01;   -- faqat m1 (m2 tkm - chiqarilgan)
  if abs((r->'nakrutka'->>'tr_mat')::numeric - kutilgan) > 0.005 then
    raise exception 'ACC: eski yo''l tr_mat % kutilgan % (tkm chiqarilmagan?)', r->'nakrutka'->>'tr_mat', kutilgan;
  end if;
  -- view ham xatosiz o'qiladi
  select count(*) into n from public.t2_obyekt_nakrutka where obyekt_id = o;
  if n <> 1 then raise exception 'ACC: view qatori %', n; end if;
  raise notice 'OK: transport_nakrutka_legacy acceptance';
end $$;