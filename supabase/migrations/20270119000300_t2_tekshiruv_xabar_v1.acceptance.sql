-- Qabul sinovi: FAQAT ROLLBACK ichida. Talab: 20270119000100..300.
do $$
declare k bigint; o bigint; a bigint; y bigint; akt bigint; rz bigint; bl bigint; ns bigint; tok text := 'ACCxabarTok00000000001'; n jsonb; tk bigint; kx text := repeat('d', 64); c0 int;
begin
  insert into public.t2_kompaniya (nom, kod, faol) values ('ACC TX', 'ACCTX' || floor(random() * 1e6), true) returning id into k;
  insert into public.t2_foydalanuvchi (login, holat) values ('acc_tp_' || floor(random() * 1e9), 'faol') returning id into a;
  insert into public.t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values (a, k, 'pto', 'faol');
  insert into public.t2_obyekt (nom, kompaniya_id) values ('_ACC_TX_', k) returning id into o;
  insert into public.t2_foydalanuvchi (login, holat) values ('acc_xy_' || floor(random() * 1e9), 'faol') returning id into y;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, nom, tartib) values (o, k, 'rz', '_ACC_X_BOLIM_', 900201) returning id into rz;
  insert into public.t2_qator (obyekt_id, kompaniya_id, ota_id, tur, nom, birlik, hajm, tartib) values (o, k, rz, 'bl', '_ACC_X_ISH_', 'm2', 10, 900202) returning id into bl;
  insert into public.t2_akt (kompaniya_id, obyekt_id, tur, holat, oy, raqam) values (k, o, 'f2', 'qoralama', date '2031-07-01', 'ACC-X') returning id into akt;
  insert into public.t2_akt_qator (akt_id, qator_id, obyekt_id, kompaniya_id, hajm) values (akt, bl, o, k, 4);
  insert into public.t2_nashr (token, kompaniya_id, obyekt_id, turi, atama, mazmun_xesh, chiqargan_id) values (tok, k, o, 'f2', 'ACC', repeat('9', 64), a) returning id into ns;
  perform public.t2_f2_tekshiruv_bog_v1(a, tok, akt); perform public.t2_f2_tekshiruv_kod_ber_v1(a, tok, kx, 'T', 24); perform public.t2_f2_tekshiruv_kod_ol_v1(y, tok, kx);

  -- 1. xabarnoma: tekshiruvchi holat qo'ydi -> PTO kompaniyasiga hodisa; PTO qaror qo'ydi -> tekshiruvchiga; F-2 versiyasi oshdi -> tekshiruvchiga
  select count(*) into c0 from public.t2_outbox where mavzu like 'tekshiruv.%';
  perform public.t2_f2_tekshiruv_saqla_v1(y, tok, bl, 'hajm_notogri', 'mos emas', 1, null, null, false);
  perform public.t2_f2_tekshiruv_holat_v1(y, tok, 'qaytarildi', 'hajm');
  if not exists (select 1 from public.t2_outbox where mavzu = 'tekshiruv.yuborildi' and actor_id = y and k = any (qabul_kompaniya_idlar)) then raise exception 'ACC1 yuborildi hodisasi yoq'; end if;
  select id into tk from public.t2_f2_tekshiruv_taklif order by id desc limit 1;
  perform public.t2_f2_tekshiruv_qaror_v1(a, tk, 'qabul', null);
  if not exists (select 1 from public.t2_outbox where mavzu = 'tekshiruv.qaror' and y = any (foydalanuvchi_idlar) and (payload->>'token') = tok) then raise exception 'ACC1 qaror hodisasi yoq'; end if;
  update public.t2_akt set versiya = versiya + 1 where id = akt;
  if not exists (select 1 from public.t2_outbox where mavzu = 'tekshiruv.akt_yangilandi' and y = any (foydalanuvchi_idlar)) then raise exception 'ACC1 f2_yangilandi hodisasi yoq'; end if;

  -- 2. Excel import: faqat PTO; F-2 da yo'q qator va noto'g'ri qator o'tkazib yuboriladi; qaror qo'yilgan taklif qayta yozilmaydi
  if (public.t2_f2_tekshiruv_excel_import_v1(y, k, akt, '[{"qator_id":1,"izoh":"x"}]'::jsonb, 'f.xlsx')->>'code') <> 'RUXSAT_YOQ' then raise exception 'ACC2 begona import'; end if;
  if (public.t2_f2_tekshiruv_excel_import_v1(a, k, akt, '[]'::jsonb, 'f.xlsx')->>'code') <> 'TALAB_NOTOGRI' then raise exception 'ACC2 bosh'; end if;
  n := public.t2_f2_tekshiruv_excel_import_v1(a, k, akt, jsonb_build_array(jsonb_build_object('qator_id', bl, 'bayroq', 'hajm_notogri', 'taklif_hajm', 2, 'izoh', 'excel'), jsonb_build_object('qator_id', -1, 'izoh', 'yoq'), jsonb_build_object('qator_id', bl, 'bayroq', 'yomon')), 'ACC.xlsx');
  if n->>'ok' <> 'true' or (n->>'qoshildi')::int <> 1 or (n->>'otkazildi')::int <> 2 then raise exception 'ACC2 import %', n; end if;
  if (public.t2_f2_tekshiruv_excel_import_v1(a, k, akt, jsonb_build_array(jsonb_build_object('qator_id', bl, 'izoh', 'qayta')), 'ACC.xlsx')->>'qoshildi')::int <> 1 then raise exception 'ACC2 qayta import (kutilmoqda) yangilanishi kerak'; end if;
  update public.t2_f2_tekshiruv_taklif set qaror = 'qabul' where tekshiruv_id = (select id from public.t2_f2_tekshiruv where tekshiruvchi_id = a order by id desc limit 1);
  if (public.t2_f2_tekshiruv_excel_import_v1(a, k, akt, jsonb_build_array(jsonb_build_object('qator_id', bl, 'izoh', 'yana')), 'ACC.xlsx')->>'otkazildi')::int <> 1 then raise exception 'ACC2 qaror qoyilgan taklif qayta yozildi'; end if;
  if jsonb_array_length(public.t2_f2_tekshiruv_akt_takliflari_v1(a, k, akt)->'takliflar') < 2 then raise exception 'ACC2 muharrir royxatida yoq'; end if;
  raise notice 'ACC OK: t2_f2_tekshiruv_xabar';
end $$;